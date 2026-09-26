/* ==========================================================================
   Fila de um lead do Google Places fora do Brasil, de ponta a ponta
   `node tools/testar-fila-exterior.mjs`   (precisa de: npm install jsdom)

   Segue um lead de Vancouver pelas quatro etapas: o card no Command, o JSON
   da ponte, a leitura pela extensao e a URL final do WhatsApp.

   Cada etapa ja quebrou uma vez de um jeito silencioso: a ponte sem o pais,
   a extensao rejeitando o numero pela regra brasileira, o item da fila
   perdendo o idioma no caminho, e o 55 grudado na frente do numero. Em
   nenhum desses casos aparecia erro; a barra so nao surgia, ou a mensagem
   saia em portugues.
   ========================================================================== */

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
const R = new URL('..', import.meta.url);
const read = f => readFileSync(new URL(f, R), 'utf8');
const paises = JSON.parse(read('assets/paises.json'));

const lead = {
  id: 'gplace_abc', source: 'Google Places', sourceId: 'abc',
  country: 'CA', countryName: 'Canadá', language: 'en',
  name: 'Vancouver Dental Clinic', category: 'Dental clinic',
  address: '123 Main St, Vancouver, BC', phone: '+16045551234', whatsapp: '',
  email: '', website: '', instagram: '', facebook: '',
  latitude: 49.28, longitude: -123.12, distanceKm: 2,
  mapUrl: '', googleUrl: 'https://maps.google.com/?q=x',
  rating: 4.6, userRatingCount: 88, businessStatus: 'OPERATIONAL',
  score: 82, band: 'Alta', reasons: ['sem site identificado'],
  siteScore: 90, digitalScore: 70, automationScore: 60, recommendedService: 'Site'
};

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'https://app.achillesmedia.com.br/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.document.documentElement.setAttribute('data-achilles-prospecta', '1.4.0');
window.sessionStorage.setItem('achilles-command-session', '1');
window.ACHILLES_CONFIG = { demoMode: true };
window.structuredClone = v => JSON.parse(JSON.stringify(v));
window.open = () => ({ focus() {} });
window.L = undefined;
window.fetch = async url => {
  const u = String(url);
  if (u.includes('paises.json')) return { ok: true, json: async () => paises };
  if (u.includes('cnae.json')) return { ok: true, json: async () => ({ subclasses: [] }) };
  if (u.includes('prospect-search')) return { ok: true, text: async () => JSON.stringify({ results: [lead], origin: null, country: 'CA' }) };
  throw new Error('fetch: ' + u);
};
window.eval(read('core.js'));
window.eval(read('app.js'));

const doc = window.document;
const espera = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0;
const check = (n, c, e = '') => { console.log(`${c ? 'OK  ' : 'FALHA'} ${n}${e ? ' :: ' + e : ''}`); if (!c) falhas++; };

doc.querySelectorAll('[data-route="prospecting"]').forEach(b => b.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
await espera(80);
doc.querySelector('select[name="country"]').value = 'CA';
doc.querySelector('[name="query"]').value = 'clinical';
doc.querySelector('[name="city"]').value = 'Vancouver';
doc.getElementById('prospect-search-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await espera(200);

console.log('--- 1. Command ---');
check('card aparece', !!doc.querySelector('.prospect-card'));
const painel = doc.querySelector('.fila-painel');
check('painel da fila existe', !!painel);
check('painel conta 1 pronto', /1 pronto/.test(painel?.textContent || ''), painel?.textContent.replace(/\s+/g,' ').slice(0,110));

console.log('\n--- 2. ponte ---');
const ponte = JSON.parse(doc.getElementById('achilles-bridge').textContent.replace(/\u003c/g, '<'));
check('lead entrou na ponte', ponte.prospects.length === 1, `${ponte.prospects.length}`);
const p = ponte.prospects[0] || {};
check('leva country', p.country === 'CA', p.country);
check('leva language', p.language === 'en', p.language);
check('leva longitude', p.longitude === -123.12, String(p.longitude));
check('leva o telefone', p.phone === '+16045551234', p.phone);
check('mensagem em ingles', /How are you/.test(p.message || ''), (p.message||'').slice(0,40));

console.log('\n--- 3. extensao ---');
const win2 = { AP: null };
new Function('window', read('prospecta/lib/shared.js'))(win2);
const AP = win2.AP;
const wa = AP.whatsappDigits(p);
check('extensao aceita o numero', wa === '16045551234', JSON.stringify(wa));
check('entra na contagem de prontos', !!(wa && !p.contactedAt));
const resolvida = AP.resolveMessage(p.message, p);
check('saudacao resolvida em ingles', /^Good (morning|afternoon|evening)!/.test(resolvida), resolvida.split('\n')[0]);

console.log('\n--- 4. URL do WhatsApp ---');
const url = `https://web.whatsapp.com/send?phone=${wa}&text=${encodeURIComponent(resolvida)}`;
check('URL sem 55 grudado', url.includes('phone=16045551234'), url.split('&')[0]);
check('URL bate com o padrao que a extensao le', /[?&]phone=(\d+)/.test(url));

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo passou');
process.exitCode = falhas ? 1 : 0;
