/* ==========================================================================
   Teste dos roteiros da extensao Achilles Prospecta (1.6)
   `node tools/testar-roteiros.mjs`

   Sem instalacao e sem internet: carrega prospecta/lib/shared.js e
   prospecta/lib/roteiros.js com um chrome.storage de mentira.

   Cobre o que nao pode quebrar calado: a mensagem montada a partir do
   roteiro (variaveis, artigo, variacao, faxina quando falta dado), a
   distribuicao do teste A/B, e a deteccao de resposta, que separa a
   saudacao automatica do WhatsApp Business de gente respondendo.
   ========================================================================== */

import { readFileSync } from 'node:fs';

const mem = {};
const chrome = {
  storage: { local: {
    async get(k) { if (k == null) return { ...mem }; return k in mem ? { [k]: structuredClone(mem[k]) } : {}; },
    async set(o) { for (const [k, v] of Object.entries(o)) mem[k] = structuredClone(v); },
    async remove(k) { delete mem[k]; }
  } }
};
const win = {};
for (const f of ['shared.js', 'roteiros.js']) {
  new Function('window', 'chrome', readFileSync(new URL(`../prospecta/lib/${f}`, import.meta.url), 'utf8'))(win, chrome);
}
const AP = win.AP;

let falhas = 0;
const check = (n, c, e = '') => { console.log(`${c ? 'OK  ' : 'FALHA'} ${n}${e ? ' :: ' + e : ''}`); if (!c) falhas++; };

const lead = { name: 'Clínica Vida', contactFirstName: 'Mariana', city: 'Uberaba', state: 'MG', category: 'Odontologia', rating: 4.8, userRatingCount: 312, country: 'BR', wa: '5534999990000' };
const ctx = { consultor: 'Pedro', agencia: 'Agência X' };

console.log('--- variáveis ---');
const r1 = AP.render('{{saudacao}}, {{primeiro_nome}}! Aqui é o {{consultor}}, da {{agencia}}. Vi {{a_empresa}} em {{cidade}}/{{uf}}.', lead, ctx);
check('troca todas as variáveis', /^(Bom dia|Boa tarde|Boa noite), Mariana! Aqui é o Pedro, da Agência X\. Vi a Clínica Vida em Uberaba\/MG\.$/.test(r1), r1);
check('contração com artigo', AP.render('{{da_empresa}} {{na_empresa}} {{pela_empresa}}', { name: 'Restaurante Sabor' }) === 'do Restaurante Sabor no Restaurante Sabor pelo Restaurante Sabor');
check('sem artigo dedutível, nome puro', AP.render('{{a_empresa}}', { name: 'XYZ Ltda' }) === 'XYZ Ltda');
check('nota e avaliações formatadas', AP.render('{{nota}} e {{avaliacoes}}', { rating: 4.8, userRatingCount: 1312 }) === '4,8 e 1.312');
check('aceita acento e sinônimo', AP.render('{{saudação}} {{nome}}', { contactFirstName: 'Ana' }).endsWith(' Ana'));
check('variável desconhecida fica como está', AP.render('{{xyz}} ok', lead) === '{{xyz}} ok');
check('lista as desconhecidas', AP.desconhecidas('{{xyz}} {{empresa}} {{ abc }}').join() === 'xyz,abc');

console.log('\n--- dado faltando ---');
const semNome = AP.render('{{saudacao}}, {{primeiro_nome}}! Tudo bem?', { name: 'Loja' }, ctx);
check('vírgula some junto com o nome', /^(Bom dia|Boa tarde|Boa noite)! Tudo bem\?$/.test(semNome), semNome);
check('texto alternativo quando vazio', AP.render('Olá {{primeiro_nome|pessoal}}!', {}) === 'Olá pessoal!');
check('espaço antes de vírgula some', AP.render('Olá {{primeiro_nome}}, tudo certo', {}) === 'Olá, tudo certo');
check('faltando aponta o que o lead não tem', AP.faltando('{{primeiro_nome}} {{cidade}} {{empresa}} {{uf|x}}', { name: 'A' }).join() === 'primeiro_nome,cidade');

console.log('\n--- variações ---');
const tpl = '{Oi|Olá|E aí}, {{empresa}}! {Tudo bem?|Como vai?}';
const a = AP.render(tpl, { ...lead, wa: '1' }), b = AP.render(tpl, { ...lead, wa: '1' });
check('mesmo lead, mesma frase (prévia = envio)', a === b, a);
const frases = new Set(Array.from({ length: 60 }, (_, i) => AP.render(tpl, { ...lead, wa: String(i) })));
check('leads diferentes recebem frases diferentes', frases.size >= 4, String(frases.size));
check('nada de chave sobrando', [...frases].every(f => !/[{}|]/.test(f)));
check('aninhamento', /^(a|bc|bd)$/.test(AP.spin('{a|b{c|d}}')));
check('conta combinações', AP.contarVariacoes(tpl) === 6);
check('chave sem barra é texto literal', AP.render('{texto}', {}) === '{texto}');
check('sortear de novo muda a frase', new Set([0, 1, 2, 3, 4, 5].map(seed => AP.render(tpl, lead, { seed }))).size > 1);

console.log('\n--- abordagem do Command dentro do roteiro ---');
const pad = AP.render('{{abordagem_padrao}}\n\nP.S.: {{empresa}}', { name: 'Loja', commandMessage: '{{saudacao}}! Mensagem do sistema.' });
check('padrão do Command entra com a saudação resolvida', /^(Bom dia|Boa tarde|Boa noite)! Mensagem do sistema\.\n\nP\.S\.: Loja$/.test(pad), pad);
check('fila antiga (só message) continua igual ao resolveMessage',
  AP.render('{{saudacao}}! Oi {{empresa}}', { name: 'Loja' }) === AP.resolveMessage('{{saudacao}}! Oi {{empresa}}', { name: 'Loja' }));
check('lead de fora recebe saudação no idioma dele',
  /^Good|^Buen/.test(AP.render('{{saudacao}}!', { country: 'CA', language: 'en', longitude: -123 }) + AP.render('{{saudacao}}', { country: 'ES', language: 'es' })));

console.log('\n--- distribuição do teste A/B ---');
const d = AP.distribuir(7, ['A', 'B']);
check('alterna na ordem da lista', d.join('') === 'ABABABA');
check('três roteiros dividem por igual', ['A', 'B', 'C'].every(x => AP.distribuir(30, ['A', 'B', 'C']).filter(y => y === x).length === 10));

console.log('\n--- biblioteca ---');
const lista = await AP.roteiros.list();
check('nasce com roteiros de exemplo', lista.length === 2 && lista.every(r => r.id && r.text && r.color));
const novo = await AP.roteiros.save({ name: 'Teste', text: 'Oi {{empresa}}' });
check('salva roteiro novo com cor livre', novo.id && !lista.some(r => r.color === novo.color));
const meta = await AP.files.putData({ name: 'portfolio.pdf', type: 'application/pdf', size: 3, data: 'data:application/pdf;base64,AAAA' });
await AP.roteiros.save({ ...novo, attachments: [meta] });
const pacote = await AP.roteiros.exportar([novo.id]);
check('exporta com o anexo embutido', pacote.roteiros.length === 1 && pacote.anexos[meta.id] && pacote.anexos[meta.id].data);
const n = await AP.roteiros.importar(pacote);
const depois = await AP.roteiros.list();
check('importa sem sobrescrever (nome novo)', n === 1 && depois.some(r => r.name === 'Teste (importado)'));
await AP.roteiros.remove(novo.id);
check('excluir apaga anexo que ninguém mais usa', !(`file:${meta.id}` in mem));
const importado = depois.find(r => r.name === 'Teste (importado)');
check('cópia importada ficou com o próprio anexo', importado.attachments.length === 1 && `file:${importado.attachments[0].id}` in mem);

console.log('\n--- respostas ---');
const t0 = Date.UTC(2026, 9, 21, 12, 0);
mem.sendLog = [];
await AP.log.add({ wa: '5534991110001', name: 'A', scriptId: 'rA', at: t0 });
await AP.log.add({ wa: '5534991110002', name: 'B', scriptId: 'rB', at: t0 });
await AP.log.add({ wa: '5534991110003', name: 'C', scriptId: 'rA', at: t0 });
// o add usa Date.now(); corrige o horário para o teste
mem.sendLog.forEach(e => { e.at = t0; });

check('sem sinal, nada muda', (await AP.log.observar('5534991110001', { unread: 0 }, t0 + 600000)) === null);
let r = await AP.log.observar('+55 34 99111-0001', { unread: 2 }, t0 + 10 * 60000);
check('não lida depois de 10 min é resposta', r && r.entry.replied && !r.entry.quick);
check('não conta duas vezes', (await AP.log.observar('5534991110001', { unread: 3 }, t0 + 20 * 60000)) === null);
r = await AP.log.observar('5534991110002', { unread: 1 }, t0 + 30000);
check('em 30s é provável automática', r && r.entry.quick);
check('automática repetida não promove', (await AP.log.observar('5534991110002', { unread: 1 }, t0 + 5 * 60000)) === null);
await AP.log.observar('5534991110002', { unread: 0 }, t0 + 6 * 60000);   // você abriu e leu
r = await AP.log.observar('5534991110002', { unread: 1 }, t0 + 9 * 60000);
check('mensagem nova depois de lida vira resposta de verdade', r && !r.entry.quick);
r = await AP.log.observar('91110003', { incoming: 1 }, t0 + 40 * 60000);
check('conversa aberta com mensagem recebida conta, pelos 8 últimos dígitos', r && r.entry.replied);
check('envio de mais de 30 dias não é ligado', (await AP.log.observar('5534991110003', { unread: 1 }, t0 + 40 * 864e5)) === null);

const est = AP.estatisticas(mem.sendLog, [{ id: 'rA', name: 'Roteiro A', color: '#000' }, { id: 'rB', name: 'Roteiro B', color: '#111' }]);
check('placar por roteiro', est.rows.find(x => x.id === 'rA').replied === 2 && est.rows.find(x => x.id === 'rB').replied === 1);
const e = mem.sendLog.find(x => x.wa.endsWith('0002'));
await AP.log.toggle(e.id);
check('correção manual desmarca', !mem.sendLog.find(x => x.id === e.id).replied);

console.log('\n--- leitura do teste ---');
const mk = (id, sent, replied) => Array.from({ length: sent }, (_, i) => ({ scriptId: id, replied: i < replied, at: 1 }));
const pequeno = AP.estatisticas([...mk('a', 8, 3), ...mk('b', 8, 1)], []);
check('amostra pequena não declara vencedor', /Amostra pequena/.test(pequeno.veredito.texto), pequeno.veredito.texto);
const claro = AP.estatisticas([...mk('a', 120, 30), ...mk('b', 120, 10)], [{ id: 'a', name: 'Curto' }, { id: 'b', name: 'Longo' }]);
check('diferença grande e amostra boa declara vencedor', claro.veredito.confianca > 0.95 && /Curto responde mais/.test(claro.veredito.texto), claro.veredito.texto);
const empate = AP.estatisticas([...mk('a', 60, 9), ...mk('b', 60, 8)], []);
check('diferença pequena é empate técnico', /Empate/.test(empate.veredito.texto));

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
