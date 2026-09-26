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
check('sem país declarado continua na regra brasileira',
  AP.whatsappDigits({ phone: '+16045551234' }) === '');

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

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo passou');
process.exitCode = falhas ? 1 : 0;
