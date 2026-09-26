/* ==========================================================================
   Teste da fila da extensao Achilles Prospecta
   `node tools/testar-prospecta-fila.mjs`

   Sem instalacao e sem internet: carrega prospecta/lib/shared.js direto.

   Existe porque lead estrangeiro era descartado em silencio pela fila. A
   regra brasileira de telefone completava um numero canadense de 11 digitos
   com 55 e rejeitava logo depois, entao o contato nem aparecia, sem erro
   nenhum na tela. Estes testes seguram as duas pontas: quem entra na fila e
   em que idioma e horario a saudacao e resolvida.
   ========================================================================== */

import { readFileSync } from 'node:fs';

const win = { AP: null };
const codigo = readFileSync(new URL('../prospecta/lib/shared.js', import.meta.url), 'utf8');
new Function('window', codigo)(win);
const AP = win.AP;

let falhas = 0;
const check = (n, c, e = '') => { console.log(`${c ? 'OK  ' : 'FALHA'} ${n}${e ? ' :: ' + e : ''}`); if (!c) falhas++; };

console.log('--- telefone na fila ---');
check('celular brasileiro entra', AP.whatsappDigits({ phone: '+5534991234567', country: 'BR' }) === '5534991234567');
check('fixo brasileiro fica fora', AP.whatsappDigits({ phone: '+553433334444', country: 'BR' }) === '');
check('canadense entra inteiro', AP.whatsappDigits({ phone: '+16045551234', country: 'CA' }) === '16045551234',
  AP.whatsappDigits({ phone: '+16045551234', country: 'CA' }));
check('espanhol entra inteiro', AP.whatsappDigits({ phone: '+34600123456', country: 'ES' }) === '34600123456');
// Antes o padrao sem pais era sempre Brasil, e por isso um numero de fora
// era rejeitado calado. Agora o proprio numero decide.
check('sem país declarado, o número é que decide',
  AP.pareceBrasileiro({ phone: '+5534991234567' }) === true &&
  AP.pareceBrasileiro({ phone: '+16045551234' }) === false);
check('lista vazia é tratada como Brasil, o caso de sempre',
  AP.pareceBrasileiro({}) === true);

console.log('\n--- saudação na hora de preencher ---');
const manha = new Date(Date.UTC(2026, 8, 26, 17, 0)); // 17h UTC = 10h em Vancouver
const msg = '{{saudacao}}! How are you?';
check('lead no Canadá recebe saudação em inglês e no horário dele',
  AP.resolveMessage(msg, { country: 'CA', language: 'en', longitude: -123.12 }).startsWith('Good'),
  AP.resolveMessage(msg, { country: 'CA', language: 'en', longitude: -123.12 }).split('!')[0]);
check('lead na Espanha recebe em espanhol',
  /^Buen/.test(AP.resolveMessage(msg, { country: 'ES', language: 'es', longitude: -3.7 })));
check('lead no Brasil continua em português',
  /^(Bom dia|Boa tarde|Boa noite)/.test(AP.resolveMessage('{{saudacao}}! Tudo bem?', { country: 'BR' })));
check('hora local acompanha a longitude',
  AP.localHour(-123.12, manha) === 9 || AP.localHour(-123.12, manha) === 10,
  String(AP.localHour(-123.12, manha)));
check('sem longitude usa a hora de quem dispara',
  AP.localHour(null, manha) === manha.getHours());


console.log('');
console.log('--- ponte antiga, sem o campo de pais ---');
// A pagina do Command pode estar em cache com a versao que nao mandava pais.
check('numero canadense sem pais declarado ainda entra',
  AP.whatsappDigits({ phone: '+16045551234' }) === '16045551234',
  AP.whatsappDigits({ phone: '+16045551234' }));
check('numero espanhol sem pais declarado ainda entra',
  AP.whatsappDigits({ phone: '+34600123456' }) === '34600123456');
check('celular brasileiro sem pais declarado segue a regra do celular',
  AP.whatsappDigits({ phone: '+5534991234567' }) === '5534991234567');
check('fixo brasileiro sem pais declarado continua fora',
  AP.whatsappDigits({ phone: '+553433334444' }) === '');
check('mensagem de lead de fora nao sai em portugues',
  !/^Bom |^Boa /.test(AP.resolveMessage('{{saudacao}}! How are you?', { phone: '+16045551234', language: 'en', longitude: -123.12 })),
  AP.resolveMessage('{{saudacao}}! How are you?', { phone: '+16045551234', language: 'en', longitude: -123.12 }).split('!')[0]);

console.log('');
console.log('--- o item da fila carrega o que a mensagem precisa ---');
const fonteCmd = readFileSync(new URL('../prospecta/content-command.js', import.meta.url), 'utf8');
const bloco = fonteCmd.slice(fonteCmd.indexOf('prospectId: p.id'), fonteCmd.indexOf('sent: false'));
for (const campo of ['country', 'language', 'longitude']) {
  check('item da fila leva ' + campo, bloco.includes(campo + ':'),
    'sem isto o lead de fora recebe saudacao em portugues');
}

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo passou');
process.exitCode = falhas ? 1 : 0;
