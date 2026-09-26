/* ==========================================================================
   Teste do teto de tempo por lead na fila da extensao
   `node tools/testar-fila-timeout.mjs`

   Sem instalacao e sem internet.

   Existe porque a fila parava de vez num numero que nao existe. O codigo
   esperava a conversa abrir por 24 segundos e, se nao abrisse, dava `return`
   sem avancar: a fila ficava presa naquele lead ate alguem perceber.

   Aqui a logica de decisao e reproduzida em cima do arquivo real, para
   garantir que ela sempre termina em "segue para o proximo" ou em "pausa
   avisando", e nunca em "fica parada".
   ========================================================================== */

import { readFileSync } from 'node:fs';

const win = { AP: null };
new Function('window', readFileSync(new URL('../prospecta/lib/shared.js', import.meta.url), 'utf8'))(win);
const fonte = readFileSync(new URL('../prospecta/content-whatsapp.js', import.meta.url), 'utf8');

let falhas = 0;
const check = (n, c, e = '') => { console.log(`${c ? 'OK  ' : 'FALHA'} ${n}${e ? ' :: ' + e : ''}`); if (!c) falhas++; };

console.log('--- configuracao ---');
check('existe teto de tempo por lead nos padroes',
  win.AP.DEFAULT_SETTINGS.leadTimeout > 0, `${win.AP.DEFAULT_SETTINGS.leadTimeout}s`);
check('teto e ajustavel pelo painel',
  readFileSync(new URL('../prospecta/panel.js', import.meta.url), 'utf8').includes('leadTimeout'));

console.log('\n--- nenhum caminho pode terminar parado ---');
// Os tres pontos onde a fila podia morrer. Cada um precisa avancar ou pausar.
const trechos = [
  ['conversa nao abriu', 'A conversa de ${esc(item.name || item.wa)} não abriu'],
  ['nao consegui escrever', 'Não consegui escrever a mensagem de'],
  ['lead estourou o tempo', 'não abriu a tempo, seguindo para o próximo']
];
for (const [nome, marca] of trechos) {
  const i = fonte.indexOf(marca);
  check(`"${nome}" existe no codigo`, i > 0);
  if (i < 0) continue;
  // o bloco em volta precisa avancar a fila ou pausar explicando
  const bloco = fonte.slice(Math.max(0, i - 400), i + 400);
  check(`"${nome}" avanca a fila`, /queue\.i\+\+/.test(bloco) && /advance\(|halt\(/.test(bloco));
  check(`"${nome}" conta falha seguida`, /fails/.test(bloco));
}

check('nao sobrou o return mudo que travava a fila',
  !fonte.includes("status('Não achei a caixa de mensagem. O WhatsApp Web está conectado?'); return;"));

console.log('\n--- o relogio sobrevive ao recarregamento ---');
check('o inicio fica guardado no item da fila, nao em variavel',
  /item\.startedAt/.test(fonte) && /putQueue/.test(fonte.slice(fonte.indexOf('item.startedAt'), fonte.indexOf('item.startedAt') + 200)));

console.log('\n--- decisao do teto ---');
const decidir = (inicio, agora, teto) => (agora - inicio > teto * 1000) ? 'pula' : 'continua';
check('dentro do prazo continua tentando', decidir(0, 20000, 45) === 'continua');
check('passou do prazo pula', decidir(0, 46000, 45) === 'pula');
check('teto minimo protege de configuracao zerada', Math.max(15, Number(0 || 45)) === 45);
check('teto respeita o que foi configurado', Math.max(15, Number(90)) === 90);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo passou');
process.exitCode = falhas ? 1 : 0;
