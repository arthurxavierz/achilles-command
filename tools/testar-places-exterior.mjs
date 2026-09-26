/* ==========================================================================
   Teste da busca por Google Places fora do Brasil
   `node tools/testar-places-exterior.mjs`

   Sem instalacao e sem internet: Google Places e Nominatim sao simulados.
   Garante que o pais escolhido chega no regionCode, no idioma e na
   geocodificacao, que o telefone internacional sobrevive inteiro, e que
   Brasil continua sendo o padrao quando nada e informado.
   ========================================================================== */

process.env.INTERNAL_AUTH_DISABLED = 'true';
process.env.GOOGLE_PLACES_API_KEY = 'chave-de-teste';

const ROOT = new URL('..', import.meta.url).href;
const { readFileSync } = await import('node:fs');
const paises = JSON.parse(readFileSync(new URL('../assets/paises.json', import.meta.url), 'utf8'));

const chamadas = [];
globalThis.fetch = async (url, options = {}) => {
  const href = String(url);
  chamadas.push(href);
  if (href.includes('/assets/paises.json')) return new Response(JSON.stringify(paises), { status: 200 });
  if (href.includes('nominatim')) return new Response(JSON.stringify([{ lat: '49.2827', lon: '-123.1207', display_name: 'Vancouver, BC, Canada' }]), { status: 200 });
  if (href.includes('places.googleapis.com')) {
    return new Response(JSON.stringify({ places: [{
      id: 'abc', displayName: { text: 'Vancouver Dental Clinic' },
      formattedAddress: '123 Main St, Vancouver, BC', location: { latitude: 49.28, longitude: -123.12 },
      primaryTypeDisplayName: { text: 'Dental clinic' }, types: ['dentist'],
      internationalPhoneNumber: '+1 604-555-1234', nationalPhoneNumber: '(604) 555-1234',
      websiteUri: '', rating: 4.6, userRatingCount: 88, businessStatus: 'OPERATIONAL'
    }] }), { status: 200 });
  }
  throw new Error('inesperado: ' + href);
};

const { default: handler } = await import(ROOT + 'netlify/functions/prospect-search.mjs');
const post = b => handler(new Request('https://app.achillesmedia.com.br/.netlify/functions/prospect-search', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }));

let falhas = 0;
const check = (n, c, e = '') => { console.log(`${c ? 'OK  ' : 'FALHA'} ${n}${e ? ' :: ' + e : ''}`); if (!c) falhas++; };
const ultima = f => chamadas.filter(c => c.includes(f)).at(-1);

let res = await post({ query: 'clinical', city: 'Vancouver', state: 'BC', country: 'CA', limit: 10 });
let d = await res.json();
check('busca no Canadá responde 200', res.status === 200, JSON.stringify(d).slice(0, 120));
check('devolve o lead', d.results.length === 1, `${d.results.length}`);
check('resposta identifica o país', d.country === 'CA' && d.countryName === 'Canadá' && d.language === 'en');
check('prospect carrega o país', d.results[0].country === 'CA' && d.results[0].language === 'en');
check('telefone internacional preservado', d.results[0].phone === '+16045551234', d.results[0].phone);
check('geocodifica no país certo', ultima('nominatim').includes('countrycodes=ca'), decodeURIComponent(ultima('nominatim')).slice(-70));
check('aviso diz que WhatsApp não está confirmado', /n\u00e3o est\u00e1 confirmado/.test(d.note));

// Brasil segue igual
res = await post({ query: 'clinicas', city: 'Uberaba', state: 'MG', limit: 10 });
d = await res.json();
check('sem país informado continua Brasil', d.country === 'BR' && d.language === 'pt');
check('geocodifica no Brasil', ultima('nominatim').includes('countrycodes=br'));

res = await post({ query: 'x', city: 'y', country: 'XX' });
d = await res.json();
check('país desconhecido cai no Brasil, não quebra', d.country === 'BR');

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo passou');
process.exitCode = falhas ? 1 : 0;
