/* ==========================================================================
   Teste do extrator por CNAE — `node tools/testar-cnae-search.mjs`

   Não precisa de instalação nem de internet: as respostas do Supabase, do
   CNPJá e do IBGE são simuladas aqui.

   O que este arquivo garante:
   - a base própria é consultada com os filtros certos;
   - telefone de 8 dígitos é lido como a Receita realmente entrega, e o 9º
     dígito reconstruído nunca é apresentado como confirmação;
   - pedir um estado ou CNAE fora da carga dá uma explicação, não uma lista
     vazia;
   - o provedor pago continua funcionando como reserva.

   A interface tem um teste próprio: tools/testar-extrator-ui.mjs.
   ========================================================================== */

process.env.INTERNAL_AUTH_DISABLED = 'true';
process.env.SUPABASE_URL = 'https://projeto.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-de-teste';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-de-teste';
process.env.CNPJA_TOKEN = 'token-de-teste';

const { classifyPhone, bestPhone } = await import(new URL('../netlify/lib/telefone.mjs', import.meta.url));

let falhas = 0;
function check(nome, cond, extra = '') {
  console.log(`${cond ? 'OK  ' : 'FALHA'} ${nome}${extra ? ' :: ' + extra : ''}`);
  if (!cond) falhas++;
}

/* --- 1. leitura do telefone ---------------------------------------------- */

console.log('\n--- telefone ---');
check('fixo de 8 dígitos não vira WhatsApp',
  classifyPhone('3433334444').quality === 'landline' && classifyPhone('3433334444').whatsapp === '');
check('8 dígitos começando com 9 é provável celular',
  classifyPhone('3491234567').quality === 'mobile_guess');
check('8 dígitos começando com 6,7,8 também',
  ['6', '7', '8'].every(d => classifyPhone(`34${d}1234567`).quality === 'mobile_guess'));
check('o 9º dígito é reconstruído na frente do número',
  classifyPhone('3491234567').whatsapp === '5534991234567', classifyPhone('3491234567').whatsapp);
check('9 dígitos já completos ficam como confirmados pelo formato',
  classifyPhone('34991234567').quality === 'mobile');
check('número curto é marcado como incompleto',
  classifyPhone('349123').quality === 'partial');
check('sem número é "sem telefone"', classifyPhone('').quality === 'none');
check('entre fixo e provável celular, o celular ganha',
  bestPhone(['3433334444', '3491234567']).quality === 'mobile_guess');
check('o rótulo diz que o 9º dígito foi reconstruído',
  /reconstru/i.test(bestPhone(['3491234567']).qualityLabel), bestPhone(['3491234567']).qualityLabel);
check('o rótulo do fixo avisa que não abre WhatsApp',
  /não abre/i.test(bestPhone(['3433334444']).qualityLabel));

/* --- 2. simulação de rede ------------------------------------------------- */

const chamadas = [];
let linhasDaBase = [];
let cargaDaBase = {
  competencia: '2026-09',
  ufs: ['MG', 'GO', 'DF'],
  cnaes: [8630503, 5611201],
  total_linhas: 832029,
  concluida_em: '2026-09-20T10:00:00Z'
};

const linha = (i, extra = {}) => ({
  cnpj: 11222333000100 + i,
  nome: `Clínica ${i}`,
  razao_social: `EMPRESA ${i} LTDA`,
  nome_fantasia: `Clínica ${i}`,
  porte: 1,
  cnae: 8630503,
  uf: 'MG',
  municipio: 'UBERABA',
  bairro: 'CENTRO',
  logradouro: 'RUA DAS FLORES 100',
  cep: '38000000',
  situacao: 2,
  data_inicio: '2023-04-15',
  telefone: 553491234560 + i,
  telefone_tipo: 'mobile_provavel',
  email: `contato${i}@exemplo.com.br`,
  competencia: '2026-09',
  ...extra
});

globalThis.fetch = async (url, options = {}) => {
  const href = String(url);
  chamadas.push(href);
  if (href.includes('/assets/cnae.json')) {
    return new Response(JSON.stringify({ subclasses: [{ id: '8630503', d: 'Atividade Médica Ambulatorial' }] }), { status: 200 });
  }
  if (href.includes('cnpj_base_cargas')) {
    return new Response(JSON.stringify(cargaDaBase ? [cargaDaBase] : []), { status: 200 });
  }
  if (href.includes('cnpj_busca')) {
    return new Response(JSON.stringify(linhasDaBase), { status: 200 });
  }
  if (href.includes('servicodados.ibge.gov.br')) {
    return new Response(JSON.stringify([{ id: 3170206, nome: 'Uberaba' }]), { status: 200 });
  }
  if (href.startsWith('https://api.cnpja.com/office')) {
    return new Response(JSON.stringify({
      next: '', limit: 100, count: 412,
      records: [{
        taxId: '11222333000199', company: { name: 'EMPRESA CNPJA LTDA', size: { acronym: 'ME' }, simei: {} },
        alias: 'Clínica do CNPJá', founded: '2023-04-15', head: true,
        status: { id: 2, text: 'Ativa' },
        address: { street: 'Rua A', number: '1', district: 'Centro', city: 'Uberaba', state: 'MG' },
        phones: [{ type: 'LANDLINE', area: '34', number: '91234567' }],
        emails: [{ ownership: 'CORPORATE', address: 'a@b.com' }],
        mainActivity: { id: 8630503, text: 'Atividade médica' }, sideActivities: []
      }]
    }), { status: 200 });
  }
  throw new Error('URL inesperada: ' + href);
};

const { default: handler } = await import(new URL('../netlify/functions/cnae-search.mjs', import.meta.url));
const post = corpo => handler(new Request('https://app.achillesmedia.com.br/.netlify/functions/cnae-search', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo)
}));
const ultimaChamada = filtro => chamadas.filter(c => c.includes(filtro)).at(-1);

/* --- 3. validação de entrada ---------------------------------------------- */

console.log('\n--- entrada ---');
let res = await post({ cnaes: [], states: ['MG'] });
check('sem CNAE devolve 400', res.status === 400, (await res.json()).error);
res = await post({ cnaes: ['8630503'], states: [] });
check('sem estado devolve 400', res.status === 400, (await res.json()).error);

/* --- 4. base própria ------------------------------------------------------- */

console.log('\n--- base própria ---');
linhasDaBase = [
  linha(1),
  linha(2, { telefone: 553433334444, telefone_tipo: 'landline' }),
  linha(3, { telefone: null, telefone_tipo: null }),
  linha(4, { nome: '', razao_social: '', nome_fantasia: '' })
];

res = await post({ cnaes: ['8630503'], states: ['MG'], cities: ['Uberaba'], onlyWithPhone: true, limit: 50 });
let data = await res.json();
check('status 200', res.status === 200, JSON.stringify(data).slice(0, 160));
check('motor é a base própria', data.engine === 'base-propria', data.engine);
check('descarta quem não tem telefone e quem não tem nome', data.results.length === 2, `${data.results.length}`);
check('provável celular vira WhatsApp reconstruído',
  data.results.find(r => r.phoneQuality === 'mobile_guess')?.whatsapp === '5534991234561');
check('fixo não recebe WhatsApp',
  data.results.find(r => r.phoneQuality === 'landline')?.whatsapp === '');
check('CNPJ sai com 14 dígitos', data.results.every(r => /^\d{14}$/.test(r.cnpj)), data.results[0].cnpj);
check('descrição do CNAE vem do catálogo',
  data.results[0].cnae === 'Atividade Médica Ambulatorial', data.results[0].cnae);
check('a resposta informa a competência da base', data.base?.competencia === '2026-09');
check('o aviso não promete WhatsApp', /inferência, não confirmação/i.test(data.note));

const q = new URL(ultimaChamada('cnpj_busca')).searchParams;
check('filtra por UF', q.get('uf') === 'in.(MG)', q.get('uf'));
check('filtra por CNAE principal', q.get('cnae') === 'in.(8630503)');
check('filtra só ativas', q.get('situacao') === 'eq.2');
check('cidade vai sem acento e em maiúsculas', q.get('municipio') === 'in.("UBERABA")', q.get('municipio'));
check('não vaza a service role quando há sessão', !ultimaChamada('cnpj_busca').includes('service-de-teste'));

res = await post({ cnaes: ['8630503'], states: ['MG'], includeSide: true, foundedFrom: '2024-01-01', foundedTo: '2026-01-01' });
await res.json();
const q2 = new URL(ultimaChamada('cnpj_busca')).searchParams;
check('CNAE secundário usa o índice de array',
  q2.get('or') === '(cnae.in.(8630503),cnae_secundarios.ov.{8630503})', q2.get('or'));
check('período de abertura vira dois filtros de data',
  q2.getAll('data_inicio').join(' ') === 'gte.2024-01-01 lte.2026-01-01', q2.getAll('data_inicio').join(' '));

res = await post({ cnaes: ['8630503'], states: ['MG'], onlyMobile: true });
data = await res.json();
check('somente celular mantém o provável celular',
  data.results.length === 1 && data.results[0].phoneQuality === 'mobile_guess', `${data.results.length}`);

/* --- 5. quando a base não cobre o que foi pedido --------------------------- */

console.log('\n--- limites da carga ---');
res = await post({ cnaes: ['8630503'], states: ['SP'] });
data = await res.json();
check('estado fora da carga explica o motivo', /carregador com --ufs SP/.test(data.error || ''), data.error);

res = await post({ cnaes: ['4520001'], states: ['MG'] });
data = await res.json();
check('CNAE fora da carga explica o motivo', /--todos-cnaes|--cnaes/.test(data.error || ''), data.error);

linhasDaBase = [linha(1)];
res = await post({ cnaes: ['8630503', '4520001'], states: ['MG'] });
data = await res.json();
check('CNAE parcialmente fora vira aviso, não erro',
  res.status === 200 && data.avisos?.some(a => /não estão na base/.test(a)), JSON.stringify(data.avisos));

res = await post({ cnaes: ['8630503'], states: ['MG', 'SP'] });
data = await res.json();
check('estado parcialmente fora vira aviso, não erro',
  res.status === 200 && data.avisos?.some(a => /SP/.test(a)), JSON.stringify(data.avisos));

cargaDaBase = null;
res = await post({ cnaes: ['8630503'], states: ['MG'] });
data = await res.json();
check('base vazia manda rodar o carregador', /carregar-base-cnpj/.test(data.error || ''), data.error);
cargaDaBase = { competencia: '2026-09', ufs: ['MG', 'GO', 'DF'], cnaes: [8630503, 5611201], total_linhas: 1, concluida_em: 'x' };

/* --- 6. provedor de reserva ------------------------------------------------ */

console.log('\n--- CNPJá como reserva ---');
process.env.CNAE_PROVIDER = 'cnpja';
res = await post({ cnaes: ['8630503'], states: ['MG'], cities: ['Uberaba'] });
data = await res.json();
check('motor alterna para o CNPJá', data.engine === 'cnpja-office', data.engine);
check('CNPJá também devolve resultado', data.results.length === 1, `${data.results.length}`);
check('o 8 dígitos do CNPJá também é lido como provável celular',
  data.results[0].phoneQuality === 'mobile_guess', data.results[0].phoneQualityLabel);
const q3 = new URL(ultimaChamada('api.cnpja.com')).searchParams;
check('CNPJá recebe o CNAE', q3.get('mainActivity.id.in') === '8630503');
check('CNPJá recebe a cidade como código do IBGE', q3.get('address.municipality.in') === '3170206');

delete process.env.CNPJA_TOKEN;
res = await post({ cnaes: ['8630503'], states: ['MG'] });
check('sem token o CNPJá avisa em vez de quebrar', res.status === 503, (await res.json()).error);
delete process.env.CNAE_PROVIDER;

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo passou');
process.exitCode = falhas ? 1 : 0;
