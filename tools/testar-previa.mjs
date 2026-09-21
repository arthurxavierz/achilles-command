/* ==========================================================================
   Teste da prévia do extrator — `node tools/testar-previa.mjs`

   Precisa do jsdom uma única vez:  npm install jsdom

   A prévia do extrator usa o mesmo card da captação por Google Maps, e este
   arquivo garante que ela não é só uma lista para conferir: abordagem,
   WhatsApp e CRM funcionam ali, antes de importar. Foi assim que o extrator
   deixou de ter duas telas com dois comportamentos.

   Também cobre o que não pode sumir junto: a caixa de seleção que decide
   quem entra na lista, e o rótulo por extenso dizendo que o 9º dígito do
   celular foi reconstruído.
   ========================================================================== */

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
const ROOT = new URL('..', import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), 'utf8');
const catalogo = JSON.parse(read('assets/cnae.json'));

const emp = (i, q = 'mobile_guess') => ({
  id: `cnpj_1122233300010${i}`, source: 'Receita Federal (CNAE)', sourceId: `1122233300010${i}`,
  name: `Academia Impacto ${i}`, legalName: `ACADEMIA IMPACTO ${i} LTDA`, cnpj: `1122233300010${i}`,
  contact: 'Joao Batista de Souza', contactFirstName: 'Joao', segment: 'academia',
  category: 'Atividades de Condicionamento Físico', cnae: 'Atividades de Condicionamento Físico', cnaeCode: '9313100',
  address: 'Rua das Flores, 100 · Centro · Uberaba - MG', city: 'Uberaba', state: 'MG',
  phone: '+553491234567', whatsapp: q === 'mobile_guess' ? `553499123456${i}` : '',
  phoneQuality: q, phoneQualityLabel: q, email: 'a@b.com', website: '', foundedAt: '2023-04-15',
  statusText: 'Ativa', size: 'ME', score: 80 - i, band: 'Alta',
  reasons: ['CNAE 9313100 · Atividades de Condicionamento Físico'],
  siteScore: 84, digitalScore: 79, automationScore: 64,
  recommendedService: 'Site', rating: 0, userRatingCount: 0
});

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'https://app.achillesmedia.com.br/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.sessionStorage.setItem('achilles-command-session', '1');
window.ACHILLES_CONFIG = { demoMode: true };
window.structuredClone = v => JSON.parse(JSON.stringify(v));
let abriu = '';
window.open = u => { abriu = String(u); return { focus() {} }; };
window.fetch = async url => {
  const u = String(url);
  if (u.includes('cnae.json')) return { ok: true, json: async () => catalogo };
  if (u.includes('ibge')) return { ok: true, json: async () => [{ id: 3170206, nome: 'Uberaba' }] };
  if (u.includes('cnae-search')) return { ok: true, text: async () => JSON.stringify({
    count: 3, available: 3, base: { competencia: '2026-09', ufs: ['MG','GO','DF'], total: 1797165 }, avisos: [],
    results: [emp(1), emp(2), emp(3, 'landline')] }) };
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
clique(doc.querySelector('[data-prospect-mode="cnae"]'));
await espera(50);
const campo = doc.getElementById('cnae-term');
campo.value = '9313100';
campo.dispatchEvent(new window.Event('input', { bubbles: true }));
await espera(60);
doc.querySelector('#cnae-suggestions .suggest-item')?.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
await espera(40);
clique(doc.getElementById('extractor-run'));
await espera(150);

const cards = doc.querySelectorAll('.extractor-cards .prospect-card');
check('a prévia sai em cards, não em tabela', cards.length === 3 && !doc.querySelector('.extractor-table'), `${cards.length} cards`);
const c1 = cards[0];
check('card tem botão de Abordagem', !!c1.querySelector('[data-action="prospect-approach"]'));
check('card tem botão de WhatsApp', !!c1.querySelector('[data-action="prospect-whatsapp"]'));
check('card tem botão de CRM', !!c1.querySelector('[data-action="prospect-crm"]'));
check('card mostra o melhor encaixe', c1.textContent.includes('Melhor encaixe') && c1.textContent.includes('Site'));
check('card mostra os três scores', ['Site','Digital','IA'].every(t => c1.textContent.includes(t)));
check('card mostra o responsável', c1.textContent.includes('Joao Batista de Souza'));
check('card tem caixa de seleção', !!c1.querySelector('[data-extractor-pick]'));
check('celular já vem selecionado', c1.querySelector('[data-extractor-pick]').checked);
check('fixo não vem selecionado', !cards[2].querySelector('[data-extractor-pick]').checked);
check('fixo não ganha botão de WhatsApp', !cards[2].querySelector('[data-action="prospect-whatsapp"]'));

// WhatsApp direto da prévia, sem importar
clique(c1.querySelector('[data-action="prospect-whatsapp"]'));
await espera(60);
check('WhatsApp abre direto da prévia', abriu.includes('wa.me') || abriu.includes('whatsapp'), abriu.slice(0, 70));
check('mensagem vai preenchida e com a saudação resolvida',
  /Bom dia|Boa tarde|Boa noite/.test(decodeURIComponent(abriu)) && decodeURIComponent(abriu).includes('Joao'));

// Abordagem direto da prévia
clique(c1.querySelector('[data-action="prospect-approach"]'));
await espera(60);
check('modal de abordagem abre da prévia', !!doc.getElementById('prospect-approach-text'));
doc.querySelector('.modal-backdrop')?.remove();

// desmarcar continua controlando a importação
const cb = c1.querySelector('[data-extractor-pick]');
cb.checked = false;
cb.dispatchEvent(new window.Event('change', { bubbles: true }));
await espera(30);
check('desmarcar tira o destaque do card', !c1.classList.contains('picked'));
check('contador de selecionadas acompanha',
  doc.querySelectorAll('.prospect-metrics .metric-value')[1].textContent === '1');

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo passou');
process.exitCode = falhas ? 1 : 0;
