/* ==========================================================================
   Teste do extrator por CNAE — `node tools/testar-cnae-search.mjs`

   Não precisa de instalação nem de internet: a resposta do CNPJá e a do IBGE
   são simuladas aqui. O que este arquivo garante é que a Function monte os
   filtros certos, trate telefone como candidato a WhatsApp, descarte quem não
   tem contato e recuse entrada incompleta.

   A interface tem um teste próprio, descrito em docs/GUIA_EXTRATOR_CNAE.md.
   ========================================================================== */

process.env.INTERNAL_AUTH_DISABLED = 'true';
process.env.CNPJA_TOKEN = 'token-de-teste';

const record = (i, opts = {}) => ({
  taxId: String(11222333000100 + i),
  updated: '2026-09-01',
  company: { id: 1, name: `EMPRESA ${i} LTDA`, equity: 0, size: { acronym: opts.size || 'ME' }, simei: { optant: !!opts.mei }, nature: {}, members: [] },
  alias: opts.alias === null ? '' : (opts.alias || `Clínica ${i}`),
  founded: opts.founded || '2023-04-15',
  head: true,
  statusDate: '2023-04-15',
  status: { id: 2, text: 'Ativa' },
  address: { municipality: 3170206, street: 'Rua das Flores', number: '100', district: 'Centro', city: 'Uberaba', state: 'MG' },
  phones: opts.phones !== undefined ? opts.phones : [{ type: 'MOBILE', area: '34', number: '991234567' }],
  emails: opts.emails !== undefined ? opts.emails : [{ ownership: 'CORPORATE', address: `contato${i}@exemplo.com.br`, domain: 'exemplo.com.br' }],
  mainActivity: { id: 8630503, text: 'Atividade médica ambulatorial restrita a consultas' },
  sideActivities: []
});

const calls = [];
globalThis.fetch = async (url, options = {}) => {
  const href = String(url);
  calls.push(href);
  if (href.includes('servicodados.ibge.gov.br')) {
    return new Response(JSON.stringify([
      { id: 3170206, nome: 'Uberaba' }, { id: 3106200, nome: 'Belo Horizonte' }, { id: 3148004, nome: 'Patrocínio' }
    ]), { status: 200 });
  }
  if (href.startsWith('https://api.cnpja.com/office')) {
    if (options.headers?.Authorization !== 'token-de-teste') return new Response(JSON.stringify({ message: 'missing authentication' }), { status: 401 });
    const u = new URL(href);
    if (u.searchParams.get('token')) return new Response(JSON.stringify({ next: '', limit: 100, count: 4, records: [] }), { status: 200 });
    return new Response(JSON.stringify({
      next: '',
      limit: 100,
      count: 412,
      records: [
        record(1),
        record(2, { phones: [{ type: 'LANDLINE', area: '34', number: '33334444' }] }),
        record(3, { phones: [] }),
        record(4, { alias: null, founded: '2010-02-02', size: 'DEMAIS', emails: [] })
      ]
    }), { status: 200 });
  }
  throw new Error('URL inesperada: ' + href);
};

const { default: handler } = await import(new URL('../netlify/functions/cnae-search.mjs', import.meta.url));

const post = body => handler(new Request('https://x/.netlify/functions/cnae-search', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
}));

function check(name, cond, extra = '') {
  console.log(`${cond ? 'OK  ' : 'FALHA'} ${name}${extra ? ' :: ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
}

// 1) validação de entrada
let res = await post({ cnaes: [], states: ['MG'] });
check('sem CNAE devolve 400', res.status === 400, (await res.clone().json()).error);

res = await post({ cnaes: ['8630503'], states: [] });
check('sem estado devolve 400', res.status === 400, (await res.clone().json()).error);

res = await post({ cnaes: ['8630503'], states: ['MG'], cities: ['Cidade Que Nao Existe'] });
check('cidade inválida devolve 400', res.status === 400, (await res.clone().json()).error);

// 2) busca completa
res = await post({ cnaes: ['8630503'], states: ['MG'], cities: ['Uberaba'], onlyWithPhone: true, limit: 50 });
let data = await res.json();
check('status 200', res.status === 200, JSON.stringify(data).slice(0, 200));
check('descarta empresa sem telefone', data.results.length === 3, `${data.results.length} resultados`);
check('total disponível vem da API', data.available === 412, String(data.available));

const mobile = data.results.find(r => r.phoneQuality === 'mobile');
check('celular vira candidato a WhatsApp', mobile && mobile.whatsapp === '5534991234567', mobile?.whatsapp);
check('fixo não vira WhatsApp', data.results.some(r => r.phoneQuality === 'landline' && r.whatsapp === ''));
check('CNPJ com 14 dígitos', data.results.every(r => /^\d{14}$/.test(r.cnpj)), data.results[0].cnpj);
check('id previsível por CNPJ', data.results[0].id === `cnpj_${data.results[0].cnpj}`);
check('CNAE com 7 dígitos', data.results.every(r => r.cnaeCode.length === 7), data.results[0].cnaeCode);
check('score entre 0 e 100', data.results.every(r => r.score >= 0 && r.score <= 100));
check('sempre tem melhor encaixe', data.results.every(r => !!r.recommendedService));
check('sem razão social usa o nome legal', data.results.some(r => r.name === 'EMPRESA 4 LTDA'));
check('endereço montado', data.results[0].address.includes('Uberaba - MG'), data.results[0].address);
check('source identifica a origem', data.results.every(r => r.source === 'Receita Federal (CNAE)'));
check('celular ordena na frente', data.results[0].phoneQuality === 'mobile');

// 3) filtro somente celular
res = await post({ cnaes: ['8630503'], states: ['MG'], onlyMobile: true });
data = await res.json();
check('somente celular corta fixo e sem telefone', data.results.length === 2 && data.results.every(r => r.phoneQuality === 'mobile'), `${data.results.length}`);

// 4) parâmetros enviados ao provedor
const last = calls.filter(c => c.startsWith('https://api.cnpja.com')).at(-1);
const q = new URL(last).searchParams;
check('filtra por CNAE principal', q.get('mainActivity.id.in') === '8630503', last);
check('filtra por UF', q.get('address.state.in') === 'MG');
check('filtra só ativas', q.get('status.id.in') === '2');
check('exige telefone', q.get('phones.ex') === 'true');

res = await post({ cnaes: ['8630503'], states: ['MG'], cities: ['Uberaba'], includeSide: true, foundedFrom: '2024-01-01', foundedTo: '2026-01-01' });
await res.json();
const q2 = new URL(calls.filter(c => c.startsWith('https://api.cnpja.com')).at(-1)).searchParams;
check('CNAE secundário usa activities.id.in', q2.get('activities.id.in') === '8630503' && !q2.get('mainActivity.id.in'));
check('cidade vira código IBGE', q2.get('address.municipality.in') === '3170206', q2.get('address.municipality.in'));
check('período de abertura enviado', q2.get('founded.gte') === '2024-01-01' && q2.get('founded.lte') === '2026-01-01');

// 5) sem token configurado
delete process.env.CNPJA_TOKEN;
res = await post({ cnaes: ['8630503'], states: ['MG'] });
check('sem token devolve 503', res.status === 503, (await res.json()).error);
