/* ==========================================================================
   Teste do painel da fila na aba de Captacao
   `node tools/testar-fila-painel.mjs`   (precisa de: npm install jsdom)

   Existe por causa de um problema de descoberta, nao de codigo quebrado: a
   barra da fila e desenhada pela extensao, entao quem nao a tinha instalada
   via a aba sem barra nenhuma e sem nenhuma explicacao.

   Cobre as duas pontas: o painel que aparece no lugar da barra quando a
   extensao nao e detectada, e a previa do extrator alimentando a ponte, que
   antes publicava lista vazia e deixava a fila invisivel naquela aba.
   ========================================================================== */

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
const ROOT = new URL('..', import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), 'utf8');
const catalogo = JSON.parse(read('assets/cnae.json'));

const emp = (i, q = 'mobile_guess') => ({
  id: `cnpj_${i}`, source: 'Receita Federal (CNAE)', sourceId: `${i}`,
  name: `Academia ${i}`, legalName: `ACADEMIA ${i} LTDA`, cnpj: `1122233300010${i}`,
  contact: 'Joao Souza', contactFirstName: 'Joao', segment: 'academia',
  category: 'Condicionamento Físico', cnae: 'Condicionamento Físico', cnaeCode: '9313100',
  address: 'Rua X · Uberaba - MG', city: 'Uberaba', state: 'MG',
  phone: '+553491234567', whatsapp: q === 'mobile_guess' ? `553499123456${i}` : '',
  phoneQuality: q, phoneQualityLabel: q, email: '', website: '', foundedAt: '2023-04-15',
  statusText: 'Ativa', size: 'ME', score: 80, band: 'Alta', reasons: [],
  recommendedService: 'Soluções digitais', rating: 0, userRatingCount: 0
});

async function montar(comExtensao) {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'https://app.achillesmedia.com.br/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  if (comExtensao) window.document.documentElement.setAttribute('data-achilles-prospecta', '1.3.0');
  window.sessionStorage.setItem('achilles-command-session', '1');
  window.ACHILLES_CONFIG = { demoMode: true };
  window.structuredClone = v => JSON.parse(JSON.stringify(v));
  window.open = () => ({ focus() {} });
  window.L = undefined;
  window.fetch = async url => {
    const u = String(url);
    if (u.includes('cnae.json')) return { ok: true, json: async () => catalogo };
    if (u.includes('paises.json')) return { ok: true, json: async () => ({ paises: [] }) };
    if (u.includes('ibge')) return { ok: true, json: async () => [{ id: 3170206, nome: 'Uberaba' }] };
    if (u.includes('cnae-search')) return { ok: true, text: async () => JSON.stringify({
      count: 2, available: 2, base: { competencia: '2026-09', ufs: ['MG'], total: 1 }, avisos: [],
      results: [emp(1), emp(2, 'landline')] }) };
    throw new Error('fetch: ' + u);
  };
  window.eval(read('core.js'));
  window.eval(read('app.js'));
  return window;
}

let falhas = 0;
const check = (n, c, e = '') => { console.log(`${c ? 'OK  ' : 'FALHA'} ${n}${e ? ' :: ' + e : ''}`); if (!c) falhas++; };
const espera = ms => new Promise(r => setTimeout(r, ms));

// --- sem a extensão instalada ---
let w = await montar(false);
let d = w.document;
const clique = (win, el) => el?.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
clique(w, [...d.querySelectorAll('[data-route="prospecting"]')].at(-1));
await espera(60);
console.log('--- sem a extensão ---');
check('painel da fila aparece mesmo sem extensão', !!d.querySelector('.fila-painel'));
check('avisa que não foi detectada', d.querySelector('.fila-painel').textContent.includes('não foi detectada'));
check('ensina a instalar', d.querySelector('.fila-painel').textContent.includes('Carregar sem compactação')
   || d.querySelector('.fila-painel').textContent.includes('chrome://extensions'));

// --- com a extensão, na aba do extrator ---
w = await montar(true);
d = w.document;
clique(w, [...d.querySelectorAll('[data-route="prospecting"]')].at(-1));
clique(w, d.querySelector('[data-prospect-mode="cnae"]'));
await espera(60);
console.log('\n--- com a extensão, aba CNAE ---');
check('painel diz que a extensão está ativa', d.querySelector('.fila-painel')?.textContent.includes('1.3.0'));
check('sem busca, orienta a marcar contatos', d.querySelector('.fila-painel').textContent.includes('Marque contatos'));

const campo = d.getElementById('cnae-term');
campo.value = '9313100';
campo.dispatchEvent(new w.Event('input', { bubbles: true }));
await espera(60);
d.querySelector('#cnae-suggestions .suggest-item')?.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
await espera(40);
clique(w, d.getElementById('extractor-run'));
await espera(150);

const ponte = JSON.parse(d.getElementById('achilles-bridge').textContent.replace(/\u003c/g, '<'));
check('a prévia do extrator alimenta a ponte', ponte.prospects.length === 1, `${ponte.prospects.length} na fila`);
check('só o selecionado entra', ponte.prospects[0].id === 'cnpj_1');
check('a ponte leva o número do WhatsApp', !!ponte.prospects[0].whatsapp);
check('a ponte leva a mensagem pronta', /Tudo bem com voc/.test(ponte.prospects[0].message));
check('painel conta os prontos', /1 pronto/.test(d.querySelector('.fila-painel').textContent));
check('painel diz onde a barra está', d.querySelector('.fila-painel').textContent.includes('canto inferior direito'));

// desmarcar tira da fila
const cb = d.querySelector('[data-extractor-pick]');
cb.checked = false;
cb.dispatchEvent(new w.Event('change', { bubbles: true }));
await espera(40);
clique(w, d.querySelector('[data-prospect-mode="cnae"]'));
await espera(60);
const ponte2 = JSON.parse(d.getElementById('achilles-bridge').textContent.replace(/\u003c/g, '<'));
check('desmarcar tira o contato da fila', ponte2.prospects.length === 0, `${ponte2.prospects.length}`);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo passou');
process.exitCode = falhas ? 1 : 0;
