/* ==========================================================================
   Achilles Command — extrator de empresas por CNAE

   Análogo ao prospect-search.mjs (Google Places), mas partindo do cadastro
   da Receita Federal em vez do mapa: você escolhe CNAE, UF, cidade e período
   de abertura, e recebe empresas já no mesmo formato de prospect que a aba
   de Captação usa — assim card, abordagem, CRM e a extensão Prospecta
   continuam funcionando sem mudança.

   O que esta função NÃO faz, de propósito:
   - não dispara mensagem nenhuma;
   - não grava lead no banco;
   - não afirma que o telefone é WhatsApp.
   Ela devolve uma prévia. Quem importa, revisa e nomeia a lista é você,
   na interface. Ver docs/GUIA_EXTRATOR_CNAE.md.
   ========================================================================== */

import { requireInternalAuth, authError } from '../lib/auth.mjs';

const CNPJA_ENDPOINT = 'https://api.cnpja.com/office';
const IBGE_MUNICIPIOS = 'https://servicodados.ibge.gov.br/api/v1/localidades/estados';
const PAGE_SIZE = 100;          // teto da própria API do CNPJá
const MAX_PAGES = 10;           // trava de custo: no máximo 1.000 registros lidos
const REQUEST_TIMEOUT = 15000;

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
   Function estiver quente — evita uma chamada ao IBGE por busca. */
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
   A Receita entrega DDD e número separados e não diz se há WhatsApp. Celular
   brasileiro é 9 dígitos começando com 9; só ele é candidato a conversa.
   "Candidato" é literal: confirmar exige uma API de validação à parte. */
function phoneInfo(phones = []) {
  const normalized = (phones || [])
    .map(p => ({
      type: p?.type === 'MOBILE' ? 'MOBILE' : 'LANDLINE',
      digits: `${onlyDigits(p?.area)}${onlyDigits(p?.number)}`
    }))
    .filter(p => p.digits.length >= 10);

  const mobile = normalized.find(p => p.type === 'MOBILE' && p.digits.length === 11 && p.digits[2] === '9');
  const anyMobileShaped = normalized.find(p => p.digits.length === 11 && p.digits[2] === '9');
  const best = mobile || anyMobileShaped || normalized[0] || null;

  if (!best) return { phone: '', whatsapp: '', quality: 'none', qualityLabel: 'Sem telefone' };

  const candidate = mobile || anyMobileShaped;
  if (candidate) {
    return {
      phone: `+55${candidate.digits}`,
      whatsapp: `55${candidate.digits}`,
      quality: 'mobile',
      qualityLabel: 'Celular — candidato a WhatsApp'
    };
  }
  if (best.digits.length === 10) {
    return { phone: `+55${best.digits}`, whatsapp: '', quality: 'landline', qualityLabel: 'Possível fixo' };
  }
  return { phone: `+55${best.digits}`, whatsapp: '', quality: 'partial', qualityLabel: 'Telefone incompleto' };
}

/* --- score ---------------------------------------------------------------
   Sem nota e sem avaliações do Google, os sinais disponíveis aqui são outros:
   porte, tempo de casa, canal de contato e o encaixe típico do CNAE. É uma
   estimativa comercial de encaixe, não um retrato da empresa. */
const SERVICE_CNAE_HINTS = [
  { re: /^(86|87|75)/, site: 82, digital: 78, automation: 76 }, // saúde e veterinária
  { re: /^(56|55)/,    site: 78, digital: 82, automation: 66 }, // alimentação e hospedagem
  { re: /^(96|93)/,    site: 76, digital: 80, automation: 64 }, // beleza, estética, esporte
  { re: /^(45|95|43)/, site: 80, digital: 66, automation: 72 }, // oficinas, reparos, obras
  { re: /^(68|69|70|71|73|74)/, site: 74, digital: 70, automation: 80 }, // imobiliário e serviços profissionais
  { re: /^(85)/,       site: 76, digital: 74, automation: 70 }, // educação
  { re: /^(47|46)/,    site: 72, digital: 76, automation: 62 }  // comércio
];

function serviceBaseline(cnae = '') {
  const hit = SERVICE_CNAE_HINTS.find(h => h.re.test(String(cnae)));
  return hit ? { site: hit.site, digital: hit.digital, automation: hit.automation }
             : { site: 70, digital: 68, automation: 62 };
}

function yearsSince(isoDate) {
  const t = Date.parse(isoDate);
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / (365.25 * 24 * 3600 * 1000);
}

function scoreCompany(p) {
  const base = serviceBaseline(p.cnaeCode);
  let { site: siteScore, digital: digitalScore, automation: automationScore } = base;

  // Empresa nova ainda está montando presença; empresa consolidada tem
  // operação para organizar. Os dois casos interessam, por motivos diferentes.
  const age = yearsSince(p.foundedAt);
  if (age != null && age < 2) { siteScore += 8; digitalScore += 6; automationScore -= 6; }
  if (age != null && age >= 8) { automationScore += 8; siteScore -= 4; }

  if (p.size === 'Demais') automationScore += 8;
  if (p.size === 'ME' || p.mei) { automationScore -= 8; siteScore += 4; }
  if (p.email) digitalScore += 3;

  const cap = v => clamp(Math.round(v), 0, 100);
  siteScore = cap(siteScore); digitalScore = cap(digitalScore); automationScore = cap(automationScore);

  const services = [
    ['Site', siteScore],
    ['Posicionamento digital', digitalScore],
    ['Automação / IA', automationScore]
  ].sort((a, b) => b[1] - a[1]);

  let score = Math.round(services[0][1] * 0.62 + services[1][1] * 0.23 + services[2][1] * 0.15);
  if (p.phoneQuality === 'mobile') score += 6;
  else if (p.phoneQuality === 'landline') score -= 6;
  else score -= 14;
  if (p.statusText && p.statusText !== 'Ativa') score -= 20;
  score = clamp(score, 0, 100);

  const reasons = [];
  reasons.push(p.cnae ? `CNAE ${p.cnaeCode} · ${p.cnae}` : 'CNAE não informado');
  if (age != null) reasons.push(age < 2 ? 'empresa aberta há menos de 2 anos' : `cerca de ${Math.floor(age)} anos de atividade`);
  reasons.push(p.phoneQualityLabel.toLowerCase());
  if (p.email) reasons.push('e-mail no cadastro da Receita');
  if (p.size) reasons.push(`porte ${p.size}`);

  return {
    score,
    band: score >= 85 ? 'Muito alta' : score >= 70 ? 'Alta' : score >= 50 ? 'Média' : 'Baixa',
    reasons,
    siteScore,
    digitalScore,
    automationScore,
    recommendedService: services[0][0]
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

/* --- provedor ------------------------------------------------------------
   Hoje só o CNPJá está implementado: é o único cadastro nacional que devolve
   telefone junto com o filtro por CNAE em uma única chamada. O formato de
   saída é do Achilles, não do CNPJá — trocar de provedor depois é reescrever
   só esta função e o mapOffice. */
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
    const token = env('CNPJA_TOKEN');
    if (!token) return json({
      error: 'Extrator por CNAE ainda não configurado. Cadastre CNPJA_TOKEN no Netlify e faça um novo deploy. Veja docs/GUIA_EXTRATOR_CNAE.md.'
    }, 503);

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

    // Cidade é refinamento: sem cidade, a busca cobre o estado inteiro.
    const { ids: municipalities, missing } = cities.length
      ? await resolveMunicipalities(states, cities)
      : { ids: [], missing: [] };
    if (cities.length && !municipalities.length) {
      return json({ error: `Não encontrei ${missing.join(', ')} nos estados escolhidos. Confira a grafia ou remova a cidade para buscar o estado inteiro.` }, 400);
    }

    const onlyActive = body.onlyActive !== false;
    const onlyWithPhone = body.onlyWithPhone !== false;
    const onlyMobile = body.onlyMobile === true;
    const includeSide = body.includeSide === true;
    const limit = clamp(body.limit || 100, 10, 500);
    const isoDate = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');

    const { records, available, calls } = await searchCnpja({
      cnaes, states, municipalities, onlyActive, onlyWithPhone, includeSide,
      foundedFrom: isoDate(body.foundedFrom),
      foundedTo: isoDate(body.foundedTo),
      limit, token
    });

    const seen = new Set();
    let results = records
      .map(mapOffice)
      .filter(Boolean)
      .filter(p => {
        if (seen.has(p.cnpj)) return false;
        seen.add(p.cnpj);
        return true;
      });

    // A API filtra "tem telefone"; celular de verdade só dá para conferir
    // depois de ler o registro, então esse corte acontece aqui.
    if (onlyWithPhone) results = results.filter(p => p.phoneQuality !== 'none');
    if (onlyMobile) results = results.filter(p => p.phoneQuality === 'mobile');

    results.sort((a, b) =>
      Number(b.score || 0) - Number(a.score || 0)
      || (b.phoneQuality === 'mobile') - (a.phoneQuality === 'mobile')
      || String(a.name).localeCompare(String(b.name), 'pt-BR'));

    return json({
      engine: 'cnpja-office',
      filters: { cnaes, states, cities, municipalities, onlyActive, onlyWithPhone, onlyMobile, includeSide, limit },
      count: results.length,
      available,
      apiCalls: calls,
      results,
      note: 'Dados do cadastro público da Receita Federal via CNPJá. O telefone é candidato a WhatsApp: a Receita não informa se o número tem conta ativa. Revise a lista antes de importar — nada é disparado por esta busca.'
    });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'A consulta ao cadastro de CNPJ demorou demais. Reduza o limite ou filtre por cidade.'
      : (error?.message || 'Falha na extração por CNAE');
    return json({ error: message }, 502);
  }
};
