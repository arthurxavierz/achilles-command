/* ==========================================================================
   Teste da aba de Captação com o extrator por CNAE.

   Precisa do jsdom uma única vez:  npm install jsdom
   Depois:                          node tools/testar-extrator-ui.mjs

   Roda o app.js de verdade num DOM simulado e percorre o caminho inteiro:
   trocar de origem, buscar CNAE pelo nome popular, escolher estado e cidade,
   extrair, revisar a prévia, nomear e importar. As chamadas de rede (catálogo
   de CNAE, IBGE e a Function de extração) são simuladas.

   O que mais importa aqui são os três testes de segurança no fim: importar
   não pode criar lead no CRM, não pode marcar ninguém como abordado e
   reimportar a mesma busca não pode duplicar contato.
   ========================================================================== */

import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const read = f => readFileSync(new URL(f, ROOT), 'utf8');

const cnaeCatalog = JSON.parse(read('assets/cnae.json'));

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
  url: 'https://app.achillesmedia.com.br/',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const { window } = dom;

// Sessão já autenticada e sem Supabase: queremos exercitar a interface, não a rede.
window.sessionStorage.setItem('achilles-command-session', '1');
window.ACHILLES_CONFIG = { appName: 'Achilles Command', demoMode: true };

const fetched = [];
window.fetch = async url => {
  fetched.push(String(url));
  if (String(url).includes('/assets/cnae.json')) {
    return { ok: true, json: async () => cnaeCatalog };
  }
  if (String(url).includes('servicodados.ibge.gov.br')) {
    return { ok: true, json: async () => [{ id: 3170206, nome: 'Uberaba' }, { id: 3148004, nome: 'Patrocínio' }] };
  }
  if (String(url).includes('cnae-search')) {
    return { ok: true, text: async () => JSON.stringify(extractorResponse) };
  }
  throw new Error('fetch inesperado: ' + url);
};

const empresa = (i, quality) => ({
  id: `cnpj_1122233300010${i}`, source: 'Receita Federal (CNAE)', sourceId: `1122233300010${i}`,
  name: `Clínica ${i}`, legalName: `EMPRESA ${i} LTDA`, cnpj: `1122233300010${i}`,
  contact: 'Joao Batista de Souza', contactFirstName: 'Joao', segment: 'clínica',
  category: 'Atividade médica ambulatorial', cnae: 'Atividade médica ambulatorial', cnaeCode: '8630503',
  address: 'Rua das Flores, 100 · Centro · Uberaba - MG', city: 'Uberaba', state: 'MG',
  phone: quality === 'none' ? '' : '+5534991234560',
  whatsapp: quality === 'mobile_guess' ? `553499123456${i}` : '',
  phoneQuality: quality, phoneQualityLabel: quality,
  email: '', website: '', foundedAt: '2023-04-15', statusText: 'Ativa', size: 'ME',
  score: 70 + i, band: 'Alta', reasons: ['CNAE 8630503'],
  // Sem siteScore/digitalScore/automationScore: o extrator deixou de deduzir
  // encaixe de serviço a partir do CNAE, e a tela não pode voltar a mostrar.
  recommendedService: 'Soluções digitais', rating: 0, userRatingCount: 0
});

// 'mobile_guess' é o caso real: o cadastro da Receita tem 8 dígitos, então o
// celular é sempre reconstruído. 'mobile' quase nunca acontece.
const extractorResponse = {
  count: 4, available: 412,
  base: { competencia: '2026-09', ufs: ['MG', 'GO', 'DF'], total: 832029 },
  avisos: [],
  results: [empresa(1, 'mobile_guess'), empresa(2, 'mobile_guess'), empresa(3, 'landline'), empresa(4, 'none')]
};
window.L = undefined;
window.structuredClone = v => JSON.parse(JSON.stringify(v)); // jsdom 30 nao expoe no contexto
window.CustomEvent = window.CustomEvent || dom.window.CustomEvent;

const errors = [];
window.addEventListener('error', e => errors.push(String(e.error || e.message)));

window.eval(read('core.js'));
window.eval(read('app.js'));

const fails = [];
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FALHA'} ${name}${extra ? ' :: ' + extra : ''}`);
  if (!cond) fails.push(name);
};

const doc = window.document;
const app = doc.getElementById('app');
const wait = ms => new Promise(r => setTimeout(r, ms));

check('app renderizou', app.innerHTML.length > 500, `${app.innerHTML.length} chars`);
check('sem erro de script no boot', errors.length === 0, errors.join(' | '));

// --- navegar até Captação ---------------------------------------------------
const goCaptacao = () => {
  const btn = [...doc.querySelectorAll('[data-route="prospecting"]')].at(-1);
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
};
goCaptacao();
check('aba Captação abre', !!doc.querySelector('.prospecting-layout'));
check('seletor de origem aparece', doc.querySelectorAll('[data-prospect-mode]').length === 2);
check('modo padrão continua o Google Maps', !!doc.getElementById('prospect-search-form'));

// --- trocar para CNAE -------------------------------------------------------
doc.querySelector('[data-prospect-mode="cnae"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
check('extrator renderiza', !!doc.querySelector('.extractor-panel'));
check('campo de CNAE existe', !!doc.getElementById('cnae-term'));
check('MG já vem selecionado', doc.getElementById('uf-chips').textContent.includes('MG'));
check('busca começa desabilitada sem CNAE', doc.getElementById('extractor-run').disabled);
check('estado vazio orienta o primeiro passo', app.textContent.includes('Escolha um CNAE e um estado'));
check('sem erro de script ao trocar de modo', errors.length === 0, errors.join(' | '));

// --- autocomplete de CNAE ---------------------------------------------------
const input = doc.getElementById('cnae-term');
input.value = 'clinica';
input.dispatchEvent(new window.Event('input', { bubbles: true }));
await wait(60);
const box = doc.getElementById('cnae-suggestions');
check('catálogo de CNAE foi carregado', fetched.some(u => u.includes('cnae.json')));
check('sugestões aparecem para "clinica"', !box.hidden && box.querySelectorAll('.suggest-item').length > 0,
  `${box.querySelectorAll('.suggest-item').length} sugestões`);
check('sugestão traz código e descrição', /\d{7} · /.test(box.querySelector('.suggest-item').textContent),
  box.querySelector('.suggest-item')?.textContent.trim());

// os termos que as pessoas realmente digitam precisam achar alguma coisa
for (const termo of ['pet shop', 'clinica', 'restaurante', 'oficina', 'academia', 'dentista',
                     'advogado', 'contabilidade', 'imobiliaria', 'salao de beleza', 'autoescola',
                     'barbearia', 'padaria', 'transportadora', 'oficina moto']) {
  input.value = termo;
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  await wait(40);
  const n = doc.getElementById('cnae-suggestions').querySelectorAll('.suggest-item').length;
  check(`termo "${termo}" traz sugestão`, n > 0, `${n} resultados`);
}

// escolher uma sugestão
input.value = '8630503';
input.dispatchEvent(new window.Event('input', { bubbles: true }));
await wait(60);
const first = doc.getElementById('cnae-suggestions').querySelector('.suggest-item');
check('código exato sugere a subclasse', first?.textContent.startsWith('8630503'), first?.textContent.trim());
first.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
await wait(30);
check('CNAE vira chip', doc.getElementById('cnae-chips').textContent.includes('8630503'));
check('janela de sugestões fecha depois de escolher', doc.getElementById('cnae-suggestions').hidden);
check('campo de busca esvazia', doc.getElementById('cnae-term').value === '');
check('botão buscar libera com CNAE + UF', !doc.getElementById('extractor-run').disabled);

// --- cidade -----------------------------------------------------------------
const city = doc.getElementById('city-term');
check('cidade habilitada com UF escolhida', !city.disabled);
city.value = 'uber';
city.dispatchEvent(new window.Event('input', { bubbles: true }));
await wait(60);
const cityBox = doc.getElementById('city-suggestions');
check('cidade sugere pelo IBGE', cityBox.querySelectorAll('.suggest-item').length > 0);
cityBox.querySelector('.suggest-item').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
await wait(30);
check('cidade vira chip', doc.getElementById('city-chips').textContent.includes('Uberaba'));

// --- remover UF limpa cidade -------------------------------------------------
doc.querySelector('[data-chip-remove="uf"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
check('sem UF a busca trava de novo', doc.getElementById('extractor-run').disabled);
check('sem UF a cidade some junto', doc.getElementById('city-chips').textContent.trim() === '');
check('sem UF o campo de cidade desabilita', doc.getElementById('city-term').disabled);

// --- extração, prévia e importação ------------------------------------------
// devolve a UF e roda a busca
const uf = doc.getElementById('uf-term');
uf.value = 'MG';
uf.dispatchEvent(new window.Event('input', { bubbles: true }));
await wait(40);
doc.getElementById('uf-suggestions').querySelector('.suggest-item')
  .dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
await wait(30);

doc.getElementById('extractor-run').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(120);

check('prévia aparece', !!doc.querySelector('.extractor-preview'));
check('todas as empresas listadas', doc.querySelectorAll('[data-extractor-pick]').length === 4,
  `${doc.querySelectorAll('[data-extractor-pick]').length} linhas`);
check('total disponível é mostrado', app.textContent.includes('412'));
check('só os prováveis celulares vêm pré-marcados',
  [...doc.querySelectorAll('[data-extractor-pick]')].filter(c => c.checked).length === 2);
check('a tela mostra o recorte carregado na base',
  app.textContent.includes('MG, GO, DF') && app.textContent.includes('832.029'));
check('a tela diz que o 9º dígito foi reconstruído',
  app.textContent.includes('9º dígito reconstruído'));
check('a tela não promete WhatsApp confirmado',
  !/WhatsApp confirmado/i.test(app.textContent));
check('o fixo é marcado como fixo', app.textContent.includes('Fixo · não abre WhatsApp'));
check('CNPJ formatado na tabela', app.textContent.includes('11.222.333/0001-01'));
check('botão importar liberado', !doc.querySelector('[data-action="extractor-import"]').disabled);
check('aviso de que nada é enviado', app.textContent.includes('importar não envia mensagem nenhuma'));

// aviso de estado fora da carga precisa aparecer para o usuário
extractorResponse.avisos = ['SP não está na base carregada (hoje ela tem MG, GO, DF), então esses estados vieram vazios.'];
doc.getElementById('extractor-run').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(120);
check('aviso da base aparece na tela', !!doc.querySelector('.extractor-aviso'));
check('aviso explica o motivo', app.textContent.includes('não está na base carregada'));
extractorResponse.avisos = [];

// desmarcar tudo trava a importação
doc.getElementById('extractor-select-all').checked = true;
doc.getElementById('extractor-select-all').dispatchEvent(new window.Event('change', { bubbles: true }));
await wait(20);
check('selecionar todas marca as 4', [...doc.querySelectorAll('[data-extractor-pick]')].every(c => c.checked));
doc.getElementById('extractor-select-all').checked = false;
doc.getElementById('extractor-select-all').dispatchEvent(new window.Event('change', { bubbles: true }));
await wait(20);
check('sem seleção o importar trava', doc.querySelector('[data-action="extractor-import"]').disabled);

// volta para só quem tem celular
doc.querySelector('[data-action="extractor-select-phone"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(20);

// nomear e importar
doc.getElementById('extractor-list-name').value = 'Clínicas Uberaba · teste';
doc.getElementById('extractor-list-name').dispatchEvent(new window.Event('input', { bubbles: true }));
doc.querySelector('[data-action="extractor-import"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(80);

const store = JSON.parse(window.localStorage.getItem('achilles-command-demo-v1'));
check('lista foi gravada', store.prospectLists?.length === 1, JSON.stringify(store.prospectLists?.map(l => l.name)));
check('lista guarda o nome escolhido', store.prospectLists[0].name === 'Clínicas Uberaba · teste');
check('só os selecionados viraram prospect', store.prospects.length === 2, `${store.prospects.length}`);
check('prospect guarda a lista de origem', store.prospects.every(p => p.listId === store.prospectLists[0].id));
check('importar NÃO cria lead no CRM', store.leads.filter(l => l.source === 'Captação Achilles').length === 0);
check('importar NÃO marca ninguém como abordado', store.prospects.every(p => !p.contactedAt));
check('volta para a lista de captação', !!doc.querySelector('.prospect-card'));
check('card mostra o WhatsApp disponível', !!doc.querySelector('[data-action="prospect-whatsapp"]'));
check('card não afirma ausência de site', !app.textContent.includes('Sem site identificado'));
check('card avisa que o site não foi verificado', app.textContent.includes('Site não verificado'));
// Escopo no card: o JSON da ponte para a extensão guarda o número cru de
// propósito, e ele também conta como texto da página.
const cardTexto = doc.querySelector('.prospect-card').textContent;
check('card mostra o responsável', cardTexto.includes('Joao Batista de Souza'));
check('card mostra o telefone formatado', /\(34\)\s?9\d{4}-\d{4}/.test(cardTexto), cardTexto.match(/\(34\)[^·]*/)?.[0]);
check('card não mostra o telefone cru', !cardTexto.includes('+5534'));
check('card diz por inteiro que o 9º dígito foi reconstruído',
  cardTexto.includes('Provável celular · 9º dígito reconstruído'));

// --- a mensagem que cai no WhatsApp -----------------------------------------
doc.querySelector('[data-action="prospect-approach"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(60);
const mensagem = doc.getElementById('prospect-approach-text')?.value || '';
check('modal de abordagem abre', mensagem.length > 50);
check('mensagem cumprimenta pelo primeiro nome', mensagem.includes('{{saudacao}}, Joao!'), mensagem.slice(0, 60));
check('mensagem diz que analisou', /Analisei/.test(mensagem));
check('mensagem oferece o leque, sem escolher um serviço',
  /site, presença digital e automação/i.test(mensagem));
check('mensagem não afirma necessidade que ninguém verificou',
  !/(vi que|percebi que|identifiquei) (vocês )?(precisam|não t)/i.test(mensagem));
check('card não mostra encaixe deduzido',
  !doc.querySelector('.prospect-card .prospect-service-scores'));
check('filtro por encaixe some quando não há encaixe',
  !app.textContent.includes('Melhor encaixe'));
check('mensagem cita a cidade', mensagem.includes('Uberaba'));
check('mensagem contrai a preposição com o artigo',
  !/por o|por a|de o|em o/.test(mensagem), mensagem.match(/por [oa] \S+/)?.[0]);
check('mensagem não afirma que a empresa não tem site',
  !/n[ãa]o (encontrei|tem) (um )?site/i.test(mensagem));
check('mensagem termina com pergunta', mensagem.trim().endsWith('?'));
check('a saudação continua como variável, resolvida só no envio',
  mensagem.includes('{{saudacao}}'));
doc.querySelector('.modal-backdrop')?.remove();

// a lista aparece no extrator e pode ser reaberta
doc.querySelector('[data-prospect-mode="cnae"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(30);
check('lista importada aparece no extrator', app.textContent.includes('Clínicas Uberaba · teste'));
check('lista mostra a contagem', !!doc.querySelector('.list-row-stats'));
check('lista tem ação de abrir e de excluir',
  !!doc.querySelector('[data-action="open-list"]') && !!doc.querySelector('[data-action="delete-list"]'));

doc.querySelector('[data-action="open-list"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(30);
check('abrir lista volta para a captação com os contatos', doc.querySelectorAll('.prospect-card').length === 2);

// reimportar a mesma busca não duplica
doc.querySelector('[data-prospect-mode="cnae"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(30);
doc.getElementById('extractor-run').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(120);
doc.querySelector('[data-action="extractor-import"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await wait(60);
const store2 = JSON.parse(window.localStorage.getItem('achilles-command-demo-v1'));
check('reimportar não duplica contatos', store2.prospects.length === 2, `${store2.prospects.length}`);

check('sem erros de script no fim', errors.length === 0, errors.join(' | '));
console.log(fails.length ? `\n${fails.length} FALHA(S)` : '\nTudo passou');
process.exitCode = fails.length ? 1 : 0;
