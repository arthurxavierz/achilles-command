/* ==========================================================================
   Achilles Command, extrator de empresas por CNAE

   Análogo ao prospect-search.mjs (Google Places), mas partindo do cadastro
   da Receita Federal em vez do mapa: você escolhe CNAE, UF, cidade e período
   de abertura, e recebe empresas já no mesmo formato de prospect que a aba
   de Captação usa, assim card, abordagem, CRM e a extensão Prospecta
   continuam funcionando sem mudança.

   Dois provedores, escolhidos por CNAE_PROVIDER:
   - `supabase` (padrão): a base própria, carregada dos arquivos públicos da
     Receita por tools/carregar-base-cnpj.mjs. Sem custo por consulta.
   - `cnpja`: a API paga, como reserva para um estado ou CNAE fora da carga.

   O que esta função NÃO faz, de propósito:
   - não dispara mensagem nenhuma;
   - não grava lead no banco;
   - não afirma que o telefone é WhatsApp.
   Ela devolve uma prévia. Quem importa, revisa e nomeia a lista é você,
   na interface. Ver docs/GUIA_EXTRATOR_CNAE.md.
   ========================================================================== */

import { requireInternalAuth, authError } from '../lib/auth.mjs';
import { bestPhone, classifyPhone, QUALITY_LABEL } from '../lib/telefone.mjs';
import { nomeApresentavel, tituloCase, primeiroNome } from '../lib/texto.mjs';

const CNPJA_ENDPOINT = 'https://api.cnpja.com/office';
const IBGE_MUNICIPIOS = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados';
const PAGE_SIZE = 100;          // teto da própria API do CNPJá
const MAX_PAGES = 10;           // trava de custo: no máximo 1.000 registros lidos
const REQUEST_TIMEOUT = 15000;

// Quem dá para chamar no WhatsApp: confirmado pelo formato ou reconstruído.
const ABORDAVEL = new Set(['mobile', 'mobile_guess']);

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store' }
});

const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || min));
const onlyDigits = (v = '') => String(v).replace(/\D/g, '');

/* Acentuação e caixa variam entre o que você digita e o que o IBGE devolve
   ("Sao Paulo" x "São Paulo"). A comparação é sempre feita sem acento. */
const fold = (v = '') => String(v)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim();

function env(name) {
  try { return Netlify.env.get(name); } catch { return process.env[name]; }
}

async function fetchJson(url, options = {}, timeout = REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const raw = await res.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/* --- municípios ----------------------------------------------------------
   O CNPJá filtra cidade por código IBGE, não por nome. A lista de uma UF tem
   poucos KB e não muda de mês para mês, então fica em memória enquanto a
   Function estiver quente, evita uma chamada ao IBGE por busca. */
const municipalityCache = new Map();

async function municipalitiesOf(uf) {
  const key = String(uf).toUpperCase();
  if (municipalityCache.has(key)) return municipalityCache.get(key);
  const { ok, data } = await fetchJson(`${IBGE_MUNICIPIOS}/${encodeURIComponent(key)}/municipios`);
  const list = ok && Array.isArray(data)
    ? data.map(m => ({ id: Number(m.id), name: String(m.nome || '') }))
    : [];
  if (list.length) municipalityCache.set(key, list);
  return list;
}

async function resolveMunicipalities(states, cities) {
  const found = [];
  const missing = [];
  for (const city of cities) {
    let hit = null;
    for (const uf of states) {
      const list = await municipalitiesOf(uf);
      hit = list.find(m => fold(m.name) === fold(city));
      if (hit) break;
    }
    if (hit) found.push(hit.id); else missing.push(city);
  }
  return { ids: [...new Set(found)], missing };
}

/* --- telefone ------------------------------------------------------------
   A regra mora em ../lib/telefone.mjs, compartilhada pelos dois provedores:
   o cadastro é o mesmo, então a leitura do número tem de ser a mesma. */
function phoneInfo(phones = []) {
  return bestPhone((phones || []).map(p => `${p?.area || ''}${p?.number || ''}`));
}

/* --- score ---------------------------------------------------------------
   Sem nota e sem avaliações do Google, os sinais disponíveis aqui são outros:
   porte, tempo de casa, canal de contato e o encaixe típico do CNAE. É uma
   estimativa comercial de encaixe, não um retrato da empresa. */
function yearsSince(isoDate) {
  const t = Date.parse(isoDate);
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / (365.25 * 24 * 3600 * 1000);
}

/* --- score ---------------------------------------------------------------
   Aqui não existe recomendação de serviço, e isso é proposital. A versão
   anterior dava nota para Site, Posicionamento e Automação a partir do
   prefixo do CNAE, da idade e do porte, ou seja, chutava o encaixe sem
   olhar nada da empresa. Um número com aparência de critério, sem critério
   por trás, é pior do que número nenhum: leva a decidir por ele.

   O que sobra é o que o cadastro realmente diz, e serve só para ordenar a
   lista: dá para falar com essa empresa hoje, e ela tem cara de negócio que
   a Achilles atende. Quem decide o serviço é a conversa. */
function scoreCompany(p) {
  let score = 50;
  const motivos = [];

  motivos.push(p.cnae ? `CNAE ${p.cnaeCode} · ${p.cnae}` : 'CNAE não informado');

  // Canal de contato é o que mais pesa: lead sem como falar não é lead.
  if (p.phoneQuality === 'mobile') score += 20;
  else if (p.phoneQuality === 'mobile_guess') score += 16;
  else if (p.phoneQuality === 'landline') score -= 10;
  else score -= 25;
  motivos.push(String(p.phoneQualityLabel || '').toLowerCase());

  if (p.email) { score += 6; motivos.push('e-mail no cadastro da Receita'); }

  const age = yearsSince(p.foundedAt);
  if (age != null) {
    // Empresa nova costuma estar montando presença agora, o que a torna uma
    // conversa mais fácil, não uma empresa melhor.
    if (age < 2) { score += 8; motivos.push('aberta há menos de 2 anos'); }
    else if (age < 6) { score += 4; motivos.push(`cerca de ${Math.floor(age)} anos de atividade`); }
    else motivos.push(`cerca de ${Math.floor(age)} anos de atividade`);
  }

  // ME e EPP são o porte que a Achilles atende; "Demais" costuma ter
  // fornecedor próprio e processo de compra mais longo.
  if (p.size === 'ME' || p.size === 'EPP' || p.mei) { score += 5; }
  else if (p.size === 'Demais') { score -= 5; }
  if (p.size) motivos.push(`porte ${p.size}`);

  if (p.statusText && p.statusText !== 'Ativa') score -= 30;

  score = clamp(Math.round(score), 0, 100);

  return {
    score,
    band: score >= 85 ? 'Muito alta' : score >= 70 ? 'Alta' : score >= 50 ? 'Média' : 'Baixa',
    reasons: motivos,
    // Sem encaixe sugerido: o que a empresa precisa sai da conversa, não do
    // CNAE. O CRM usa este rótulo genérico como serviço inicial do lead.
    recommendedService: 'Soluções digitais'
  };
}

/* Converte o registro do CNPJá no mesmo objeto que a aba de Captação já sabe
   desenhar. Os campos exclusivos do extrator (cnpj, cnae, abertura,
   qualidade do telefone) vêm junto e são ignorados por quem não os usa. */
function mapOffice(record) {
  const company = record?.company || {};
  const address = record?.address || {};
  const activity = record?.mainActivity || {};
  const name = String(record?.alias || company.name || '').trim();
  if (!name) return null;

  const contact = phoneInfo(record?.phones);
  const email = (record?.emails || []).find(e => e?.ownership !== 'ACCOUNTING')?.address
    || record?.emails?.[0]?.address || '';

  const taxId = onlyDigits(record?.taxId);
  const addressLine = [
    [address.street, address.number].filter(Boolean).join(', '),
    address.district,
    [address.city, address.state].filter(Boolean).join(' - ')
  ].filter(Boolean).join(' · ');

  const p = {
    id: `cnpj_${taxId}`,
    source: 'Receita Federal (CNAE)',
    sourceId: taxId,
    name,
    legalName: company.name || '',
    cnpj: taxId,
    category: activity.text || 'Empresa',
    cnae: activity.text || '',
    cnaeCode: activity.id ? String(activity.id).padStart(7, '0') : '',
    address: addressLine,
    city: address.city || '',
    state: address.state || '',
    phone: contact.phone,
    whatsapp: contact.whatsapp,
    phoneQuality: contact.quality,
    phoneQualityLabel: contact.qualityLabel,
    email,
    website: '',
    instagram: '',
    facebook: '',
    latitude: null,
    longitude: null,
    distanceKm: null,
    foundedAt: record?.founded || '',
    statusText: record?.status?.text || '',
    size: company?.size?.acronym || '',
    mei: !!company?.simei?.optant,
    head: !!record?.head,
    googleUrl: `https://www.google.com/search?q=${encodeURIComponent(`${name} ${address.city || ''} ${address.state || ''}`)}`,
    mapUrl: '',
    rating: 0,
    userRatingCount: 0,
    businessStatus: record?.status?.text === 'Ativa' ? 'OPERATIONAL' : 'CLOSED_TEMPORARILY'
  };

  return { ...p, ...scoreCompany(p) };
}

/* --- provedor: base própria no Supabase ------------------------------------
   Consulta a visão cnpj_busca, carregada por tools/carregar-base-cnpj.mjs a
   partir dos arquivos públicos da Receita. É o caminho padrão: uma vez
   carregada, a busca não tem custo por consulta.

   A leitura vai com o token de quem está logado, e não com a service role:
   assim a política de RLS da tabela continua valendo e o extrator não vira
   um atalho para ler o banco inteiro. */
function supabaseHeaders(request) {
  const anon = env('SUPABASE_ANON_KEY');
  const autorizacao = request.headers.get('authorization') || '';
  if (anon && autorizacao.toLowerCase().startsWith('bearer ')) {
    return { apikey: anon, Authorization: autorizacao, Accept: 'application/json' };
  }
  // Sem sessão só acontece em desenvolvimento, com INTERNAL_AUTH_DISABLED.
  const service = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!service) return null;
  return { apikey: service, Authorization: `Bearer ${service}`, Accept: 'application/json' };
}

/* PostgREST quer os valores de um `in` entre parênteses, e texto com vírgula
   ou espaço precisa de aspas, nome de município tem os dois. */
const listaPostgrest = valores => `(${valores.map(v => `"${String(v).replace(/"/g, '')}"`).join(',')})`;

/* O município no banco veio da Receita: maiúsculo e sem acento. O que a
   pessoa escolhe na tela vem do IBGE, acentuado. Normalizamos para comparar. */
const municipioReceita = v => String(v || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().trim();

/* O que foi realmente carregado. Sem isso, pedir um CNAE fora do recorte
   devolveria "nenhum resultado", que parece filtro ruim, mas é base
   incompleta. São coisas diferentes e o aviso precisa dizer qual é. */
async function escopoDaBase(base, headers) {
  const url = `${base}/rest/v1/cnpj_base_cargas?select=competencia,ufs,cnaes,total_linhas,concluida_em`
    + `&concluida_em=not.is.null&order=concluida_em.desc&limit=1`;
  const { ok, data } = await fetchJson(url, { headers });
  if (!ok || !Array.isArray(data) || !data.length) return null;
  const carga = data[0];
  return {
    competencia: carga.competencia || '',
    ufs: Array.isArray(carga.ufs) ? carga.ufs : [],
    cnaes: Array.isArray(carga.cnaes) ? carga.cnaes.map(Number) : [],
    total: Number(carga.total_linhas || 0),
    atualizadaEm: carga.concluida_em || ''
  };
}

async function searchSupabase({ request, cnaes, states, cities, onlyActive, includeSide, foundedFrom, foundedTo, limit }) {
  const base = String(env('SUPABASE_URL') || '').replace(/\/$/, '');
  const headers = supabaseHeaders(request);
  if (!base || !headers) {
    throw new Error('Base própria não configurada no servidor. Confira SUPABASE_URL e SUPABASE_ANON_KEY no Netlify.');
  }

  const escopo = await escopoDaBase(base, headers);
  const avisos = [];
  if (!escopo) {
    throw new Error('A base de CNPJ ainda não foi carregada. Rode tools/carregar-base-cnpj.mjs --carregar. Veja docs/GUIA_EXTRATOR_CNAE.md.');
  }
  const ufsForaDaBase = states.filter(uf => !escopo.ufs.includes(uf));
  if (ufsForaDaBase.length === states.length) {
    throw new Error(`A base carregada cobre ${escopo.ufs.join(', ')}. Para buscar em ${states.join(', ')}, rode o carregador com --ufs ${states.join(',')}.`);
  }
  if (ufsForaDaBase.length) {
    avisos.push(`${ufsForaDaBase.join(', ')} não está na base carregada (hoje ela tem ${escopo.ufs.join(', ')}), então esses estados vieram vazios.`);
  }
  if (escopo.cnaes.length) {
    const fora = cnaes.filter(c => !escopo.cnaes.includes(Number(c)));
    if (fora.length === cnaes.length) {
      throw new Error(`Nenhum dos CNAEs escolhidos está na base carregada. Ela foi carregada com ${escopo.cnaes.length} CNAEs de negócio local; para incluir outros, rode o carregador com --cnaes ${cnaes.join(',')} ou --todos-cnaes.`);
    }
    if (fora.length) avisos.push(`${fora.length} dos CNAEs escolhidos não estão na base carregada e vieram vazios.`);
  }

  const url = new URL(`${base}/rest/v1/cnpj_busca`);
  url.searchParams.set('select', 'cnpj,nome,razao_social,nome_fantasia,responsavel,porte,cnae,uf,municipio,bairro,logradouro,cep,situacao,data_inicio,telefone,telefone_tipo,email,competencia');
  url.searchParams.set('uf', `in.(${states.join(',')})`);

  if (includeSide) {
    // ov = "tem algum destes", que é o que o índice GIN resolve rápido.
    url.searchParams.set('or', `(cnae.in.(${cnaes.join(',')}),cnae_secundarios.ov.{${cnaes.join(',')}})`);
  } else {
    url.searchParams.set('cnae', `in.(${cnaes.join(',')})`);
  }

  if (cities.length) url.searchParams.set('municipio', `in.${listaPostgrest(cities.map(municipioReceita))}`);
  if (onlyActive) url.searchParams.set('situacao', 'eq.2');
  if (foundedFrom) url.searchParams.append('data_inicio', `gte.${foundedFrom}`);
  if (foundedTo) url.searchParams.append('data_inicio', `lte.${foundedTo}`);

  // Empresa mais nova primeiro: é a que tende a ainda não ter resolvido
  // presença digital, e é o recorte que o extrator existe para achar.
  url.searchParams.set('order', 'data_inicio.desc.nullslast');
  url.searchParams.set('limit', String(limit));

  const { ok, status, data } = await fetchJson(url, { headers }, 20000);
  if (!ok) {
    const detalhe = data?.message || data?.hint || `Supabase respondeu ${status}`;
    throw new Error(`Falha ao ler a base de CNPJ: ${detalhe}`);
  }

  return { registros: Array.isArray(data) ? data : [], escopo, avisos };
}

/* Mesma saída do mapOffice: a tela não sabe (nem precisa saber) de qual
   provedor veio o contato. */
function mapRow(row) {
  const contato = classifyPhone(String(row.telefone || '').replace(/^55/, ''));
  const qualidade = { ...contato, qualityLabel: QUALITY_LABEL[contato.quality] };
  const cnpj = String(row.cnpj || '').padStart(14, '0');
  const bruto = String(row.nome || row.razao_social || '').trim();
  if (!bruto) return null;

  // A Receita entrega tudo em caixa alta e com o sufixo societário colado.
  // Isso vai para o card e para dentro da mensagem, então precisa parecer
  // escrito por gente: "Restaurante Sabor Mineiro", não "RESTAURANTE SABOR
  // MINEIRO LTDA".
  const nome = nomeApresentavel(bruto) || bruto;

  const cnaeCode = String(row.cnae || '').padStart(7, '0');
  const cidade = tituloCase(row.municipio || '');
  const endereco = [tituloCase(row.logradouro || ''), tituloCase(row.bairro || ''), [cidade, row.uf].filter(Boolean).join(' - ')]
    .filter(Boolean).join(' · ');
  // nomeApresentavel e nao tituloCase: o Empresario Individual vem com o
  // documento colado no nome ("00.540.815 MIDIA MEDEIROS").
  const responsavel = nomeApresentavel(row.responsavel || '');

  const p = {
    id: `cnpj_${cnpj}`,
    source: 'Receita Federal (CNAE)',
    sourceId: cnpj,
    name: nome,
    legalName: row.razao_social || '',
    // Quem assina pela empresa no cadastro. Costuma ser quem atende o
    // telefone num negócio pequeno, mas é uma aposta, não um fato.
    contact: responsavel,
    contactFirstName: primeiroNome(responsavel),
    cnpj,
    category: CNAE_TEXTO.get(cnaeCode) || `CNAE ${cnaeCode}`,
    cnae: CNAE_TEXTO.get(cnaeCode) || '',
    cnaeCode,
    // Como as pessoas chamam o negócio, para a mensagem soar falada.
    segment: CNAE_SEGMENTO.get(cnaeCode) || '',
    address: endereco,
    city: cidade,
    state: row.uf || '',
    phone: qualidade.phone,
    whatsapp: qualidade.whatsapp,
    phoneQuality: qualidade.quality,
    phoneQualityLabel: qualidade.qualityLabel,
    email: row.email || '',
    website: '',
    instagram: '',
    facebook: '',
    latitude: null,
    longitude: null,
    distanceKm: null,
    foundedAt: row.data_inicio || '',
    statusText: Number(row.situacao) === 2 ? 'Ativa' : 'Não ativa',
    size: PORTE[Number(row.porte)] || '',
    mei: false,
    head: cnpj.slice(8, 12) === '0001',
    googleUrl: `https://www.google.com/search?q=${encodeURIComponent(`${nome} ${cidade} ${row.uf || ''}`)}`,
    mapUrl: '',
    rating: 0,
    userRatingCount: 0,
    businessStatus: Number(row.situacao) === 2 ? 'OPERATIONAL' : 'CLOSED_TEMPORARILY'
  };

  return { ...p, ...scoreCompany(p) };
}

const PORTE = { 1: 'ME', 3: 'EPP', 5: 'Demais' };

/* A base guarda o código do CNAE, não a descrição, repetir o texto em cada
   uma das centenas de milhares de linhas seria desperdício. A descrição vem
   do mesmo assets/cnae.json que a tela usa para sugerir. */
const CNAE_TEXTO = new Map();
/* Como as pessoas chamam o negócio: "restaurante", "salão de beleza",
   "oficina mecânica". A descrição oficial é jurídica demais para entrar numa
   mensagem, ninguém escreve "quem procura restaurantes e similares". */
const CNAE_SEGMENTO = new Map();
let catalogoCarregado = false;

async function carregarCatalogoCnae(request) {
  if (catalogoCarregado) return;
  catalogoCarregado = true;
  try {
    const origem = new URL(request.url).origin;
    const { ok, data } = await fetchJson(`${origem}/assets/cnae.json`, {}, 8000);
    if (ok && Array.isArray(data?.subclasses)) {
      for (const linha of data.subclasses) {
        CNAE_TEXTO.set(linha.id, linha.d);
        if (linha.r) CNAE_SEGMENTO.set(linha.id, linha.r);
      }
    }
  } catch {
    // Sem o catálogo a busca continua: o card mostra "CNAE 8630503".
  }
}

/* --- provedor alternativo: CNPJá -----------------------------------------
   Fica como reserva para buscar um estado ou um CNAE que ainda não foi
   carregado na base própria. Cobra por registro lido, então só entra quando
   CNAE_PROVIDER=cnpja.

   Vale saber: o telefone que ele devolve é o mesmo do cadastro da Receita,
   com os mesmos 8 dígitos. Pagar não traz o 9º dígito. */
async function searchCnpja({ cnaes, states, municipalities, onlyActive, onlyWithPhone, includeSide, foundedFrom, foundedTo, limit, token }) {
  const records = [];
  let next = '';
  let count = null;
  let calls = 0;

  for (let page = 0; page < MAX_PAGES && records.length < limit; page++) {
    const url = new URL(CNPJA_ENDPOINT);
    if (next) {
      // O token de paginação é exclusivo: mandar filtro junto é erro 400.
      url.searchParams.set('token', next);
    } else {
      url.searchParams.set('limit', String(Math.min(PAGE_SIZE, Math.max(limit, 20))));
      const activityKey = includeSide ? 'activities.id.in' : 'mainActivity.id.in';
      url.searchParams.set(activityKey, cnaes.join(','));
      if (states.length) url.searchParams.set('address.state.in', states.join(','));
      if (municipalities.length) url.searchParams.set('address.municipality.in', municipalities.join(','));
      if (onlyActive) url.searchParams.set('status.id.in', '2'); // 2 = Ativa
      if (onlyWithPhone) url.searchParams.set('phones.ex', 'true');
      if (foundedFrom) url.searchParams.set('founded.gte', foundedFrom);
      if (foundedTo) url.searchParams.set('founded.lte', foundedTo);
    }

    const { ok, status, data } = await fetchJson(url, { headers: { Authorization: token, Accept: 'application/json' } });
    calls++;

    if (!ok) {
      const detail = data?.message || `CNPJá respondeu ${status}`;
      if (status === 401 || status === 403) throw new Error(`CNPJá recusou a credencial: ${detail}`);
      if (status === 429) throw new Error('Limite de consultas do CNPJá atingido. Tente de novo em alguns minutos.');
      throw new Error(detail);
    }

    if (count == null) count = Number(data?.count ?? 0);
    const page_records = Array.isArray(data?.records) ? data.records : [];
    records.push(...page_records);
    next = data?.next || '';
    if (!next || !page_records.length) break;
  }

  return { records: records.slice(0, limit), available: count ?? records.length, calls };
}

export default async (request) => {
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  const auth = await requireInternalAuth(request);
  if (!auth.ok) return authError(auth);

  try {
    // Padrão é a base própria. O CNPJá continua disponível para buscar um
    // estado ou CNAE que ainda não foi carregado.
    const provedor = String(env('CNAE_PROVIDER') || 'supabase').toLowerCase() === 'cnpja' ? 'cnpja' : 'supabase';

    const body = await request.json();

    const cnaes = [...new Set((body.cnaes || [])
      .map(c => onlyDigits(c))
      .filter(c => c.length === 7))].slice(0, 20);
    const states = [...new Set((body.states || [])
      .map(s => String(s).trim().toUpperCase())
      .filter(s => /^[A-Z]{2}$/.test(s)))].slice(0, 27);
    const cities = (body.cities || []).map(c => String(c).trim()).filter(Boolean).slice(0, 20);

    if (!cnaes.length) return json({ error: 'Selecione pelo menos um CNAE.' }, 400);
    if (!states.length) return json({ error: 'Selecione pelo menos um estado.' }, 400);

    const onlyActive = body.onlyActive !== false;
    const onlyWithPhone = body.onlyWithPhone !== false;
    const onlyMobile = body.onlyMobile === true;
    const includeSide = body.includeSide === true;
    const limit = clamp(body.limit || 100, 10, 500);
    const isoDate = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
    const foundedFrom = isoDate(body.foundedFrom);
    const foundedTo = isoDate(body.foundedTo);

    let results = [];
    let available = 0;
    let calls = 0;
    let base = null;
    let avisos = [];

    if (provedor === 'supabase') {
      await carregarCatalogoCnae(request);
      const busca = await searchSupabase({
        request, cnaes, states, cities, onlyActive, includeSide, foundedFrom, foundedTo, limit
      });
      results = busca.registros.map(mapRow).filter(Boolean);
      available = results.length;
      base = busca.escopo;
      avisos = busca.avisos;
    } else {
      const token = env('CNPJA_TOKEN');
      if (!token) return json({
        error: 'CNAE_PROVIDER está em "cnpja", mas falta o CNPJA_TOKEN no Netlify. Use a base própria ou cadastre o token. Veja docs/GUIA_EXTRATOR_CNAE.md.'
      }, 503);

      // O CNPJá filtra cidade por código do IBGE, não por nome.
      const { ids: municipalities, missing } = cities.length
        ? await resolveMunicipalities(states, cities)
        : { ids: [], missing: [] };
      if (cities.length && !municipalities.length) {
        return json({ error: `Não encontrei ${missing.join(', ')} nos estados escolhidos. Confira a grafia ou remova a cidade para buscar o estado inteiro.` }, 400);
      }

      const retorno = await searchCnpja({
        cnaes, states, municipalities, onlyActive, onlyWithPhone, includeSide,
        foundedFrom, foundedTo, limit, token
      });
      results = retorno.records.map(mapOffice).filter(Boolean);
      available = retorno.available;
      calls = retorno.calls;
    }

    const seen = new Set();
    results = results.filter(p => {
      if (seen.has(p.cnpj)) return false;
      seen.add(p.cnpj);
      return true;
    });

    // Fixo e sem telefone só dá para separar depois de ler o registro: nem a
    // base nem a API distinguem celular no próprio filtro.
    if (onlyWithPhone) results = results.filter(p => p.phoneQuality !== 'none');
    if (onlyMobile) results = results.filter(p => ABORDAVEL.has(p.phoneQuality));

    results.sort((a, b) =>
      Number(b.score || 0) - Number(a.score || 0)
      || ABORDAVEL.has(b.phoneQuality) - ABORDAVEL.has(a.phoneQuality)
      || String(a.name).localeCompare(String(b.name), 'pt-BR'));

    return json({
      engine: provedor === 'supabase' ? 'base-propria' : 'cnpja-office',
      filters: { cnaes, states, cities, onlyActive, onlyWithPhone, onlyMobile, includeSide, limit },
      count: results.length,
      available: Math.max(available, results.length),
      apiCalls: calls,
      base,
      avisos,
      results,
      note: provedor === 'supabase'
        ? `Cadastro público da Receita Federal, competência ${base?.competencia || 'não informado'}, na sua própria base. Telefone de 8 dígitos começando com 6 a 9 é tratado como provável celular, com o 9º dígito reconstruído, é inferência, não confirmação de WhatsApp. Revise antes de importar: nada é disparado por esta busca.`
        : 'Cadastro público da Receita Federal via CNPJá. O telefone vem com os mesmos 8 dígitos da base oficial. Revise antes de importar, nada é disparado por esta busca.'
    });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'A consulta ao cadastro de CNPJ demorou demais. Reduza o limite ou filtre por cidade.'
      : (error?.message || 'Falha na extração por CNAE');
    return json({ error: message }, 502);
  }
};
