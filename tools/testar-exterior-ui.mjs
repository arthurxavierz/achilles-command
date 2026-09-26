/* ==========================================================================
   Teste da prospeccao fora do Brasil na interface
   `node tools/testar-exterior-ui.mjs`   (precisa de: npm install jsdom)

   Roda o app.js num DOM simulado e cobre o caminho inteiro de um lead
   estrangeiro: seletor de pais, telefone internacional valendo como
   candidato, mensagem no idioma do pais com o angulo de site e prototipo, e
   saudacao resolvida pela hora local de quem recebe.

   Fecha tambem com a verificacao de que o Brasil nao mudou.
   ========================================================================== */

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
const ROOT = new URL('..', import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), 'utf8');
const paises = JSON.parse(read('assets/paises.json'));

const lead = (extra = {}) => ({
  id: 'gplace_abc', source: 'Google Places', sourceId: 'abc',
  country: 'CA', countryName: 'Canadá', language: 'en',
  name: 'Vancouver Dental Clinic', category: 'Dental clinic',
  address: '123 Main St, Vancouver, BC', phone: '+16045551234', whatsapp: '',
  email: '', website: '', instagram: '', facebook: '',
  latitude: 49.28, longitude: -123.12, distanceKm: 2,
  mapUrl: '', googleUrl: 'https://maps.google.com/?q=x',
  rating: 4.6, userRatingCount: 88, businessStatus: 'OPERATIONAL',
  score: 82, band: 'Alta', reasons: ['sem site identificado'],
  siteScore: 90, digitalScore: 70, automationScore: 60,
  recommendedService: 'Site', ...extra
});

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'https://app.achillesmedia.com.br/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.sessionStorage.setItem('achilles-command-session', '1');
window.ACHILLES_CONFIG = { demoMode: true };
window.structuredClone = v => JSON.parse(JSON.stringify(v));
let abriu = '';
window.open = u => { abriu = String(u); return { focus() {} }; };
window.L = undefined;
let resposta = { results: [lead()], origin: null, country: 'CA', countryName: 'Canadá', language: 'en' };
window.fetch = async url => {
  const u = String(url);
  if (u.includes('paises.json')) return { ok: true, json: async () => paises };
  if (u.includes('cnae.json')) return { ok: true, json: async () => ({ subclasses: [] }) };
  if (u.includes('prospect-search')) return { ok: true, text: async () => JSON.stringify(resposta) };
  throw new Error('fetch: ' + u);
};
window.eval(read('core.js'));
window.eval(read('app.js'));

const doc = window.document;
const clique = el => el?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const espera = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0;
const check = (n, c, e = '') => { console.log(`${c ? 'OK  ' : 'FALHA'} ${n}${e ? ' :: ' + e : ''}`); if (!c) falhas++; };

clique([...doc.querySelectorAll('[data-route="prospecting"]')].at(-1));
await espera(80);

const seletor = doc.querySelector('select[name="country"]');
check('seletor de país aparece no formulário', !!seletor);
check('tem Canadá na lista', !!seletor?.querySelector('option[value="CA"]'));
check('Brasil vem selecionado por padrão', seletor?.value === 'BR');

// busca no Canadá
seletor.value = 'CA';
doc.querySelector('[name="query"]').value = 'clinical';
doc.querySelector('[name="city"]').value = 'Vancouver';
doc.getElementById('prospect-search-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await espera(150);

const card = doc.querySelector('.prospect-card');
check('card do lead estrangeiro renderiza', !!card, card?.textContent.slice(0, 40));
check('card tem botão de WhatsApp', !!card?.querySelector('[data-action="prospect-whatsapp"]'),
  'telefone internacional precisa valer como candidato');
check('aviso explica que WhatsApp não está confirmado',
  doc.querySelector('.prospect-help')?.textContent.includes('não diz se é celular'));
check('aviso diz o idioma da abordagem',
  doc.querySelector('.prospect-help')?.textContent.includes('inglês'));

clique(card.querySelector('[data-action="prospect-approach"]'));
await espera(60);
const msg = doc.getElementById('prospect-approach-text')?.value || '';
console.log('\n--- MENSAGEM ---\n' + msg + '\n');
check('mensagem sai em inglês', /How are you\?/.test(msg));
check('fala de site e landing page', /websites and landing pages/.test(msg));
check('oferece o protótipo', /prototype/.test(msg));
check('pede para apresentar', /Could I show it to you/.test(msg));
check('saudação continua como variável', msg.includes('{{saudacao}}'));
check('não vaza português', !/Tudo bem|Sou o .*, da .*\. Criamos/.test(msg));
doc.querySelector('.modal-backdrop')?.remove();

clique(card.querySelector('[data-action="prospect-whatsapp"]'));
await espera(60);
const texto = decodeURIComponent(abriu.split('text=')[1] || '');
console.log('--- NO WHATSAPP ---\n' + texto + '\n');
// Exato de propósito: includes() deixou passar wa.me/5516045551234, com o
// 55 do Brasil grudado na frente do número canadense.
check('link usa exatamente o número internacional',
  abriu.split('?')[0] === 'https://wa.me/16045551234', abriu.split('?')[0]);
check('saudação resolvida em inglês', /Good (morning|afternoon|evening)!/.test(texto), texto.split('\n')[0]);

// Brasil não pode ter mudado
resposta = { results: [lead({ id: 'gplace_br', country: 'BR', countryName: 'Brasil', language: 'pt',
  name: 'Clínica Aurora', phone: '+5534991234567', latitude: -19.7, longitude: -47.9 })], origin: null, country: 'BR' };
doc.querySelector('select[name="country"]').value = 'BR';
doc.querySelector('[name="city"]').value = 'Uberaba';
doc.getElementById('prospect-search-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
await espera(150);
clique(doc.querySelector('.prospect-card [data-action="prospect-approach"]'));
await espera(60);
const msgBr = doc.getElementById('prospect-approach-text')?.value || '';
check('Brasil continua em português', /Tudo bem\?/.test(msgBr) && !/How are you/.test(msgBr), msgBr.slice(0, 50));
check('Brasil mantém o ângulo de site com protótipo', /prot\u00f3tipo/.test(msgBr));

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo passou');
process.exitCode = falhas ? 1 : 0;
