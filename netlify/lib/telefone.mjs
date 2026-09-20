/* --- o 9º dígito ----------------------------------------------------------
   O cadastro da Receita guarda só 8 dígitos de telefone. Conferido no arquivo
   de setembro/2026: 910.396 telefones de 8 dígitos e ZERO de 9. O nono dígito
   do celular não está na fonte — e trocar de fornecedor não resolve, porque
   as APIs pagas leem esta mesma base e devolvem o mesmo número truncado.

   Dá para inferir pelo primeiro dígito: na numeração antiga, celular começava
   com 6, 7, 8 ou 9 e fixo começava com 2, 3, 4 ou 5. Um número de 8 dígitos
   começando com 6-9 era celular, e hoje é o mesmo número com um 9 na frente.

   Isso acerta a maior parte das vezes, e erra em algumas: número reciclado,
   cadastro velho ou linha desativada continuam com cara de celular aqui. Por
   isso a qualidade se chama `mobile_guess` e o texto na tela fala em provável
   celular com 9º dígito reconstruído, nunca em WhatsApp confirmado. */

const MOBILE_PREFIXES = '6789';

export const QUALITY_LABEL = {
  mobile: 'Celular confirmado pelo formato',
  mobile_guess: 'Provável celular · 9º dígito reconstruído',
  landline: 'Fixo · não abre WhatsApp',
  partial: 'Telefone incompleto',
  none: 'Sem telefone'
};

/* Recebe os dígitos nacionais (DDD + número, sem o 55) e devolve como o resto
   do sistema deve tratar aquele contato. */
export function classifyPhone(nationalDigits = '') {
  const d = String(nationalDigits).replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length < 10 || d.length > 11) {
    return d ? { phone: `+55${d}`, whatsapp: '', quality: 'partial' } : { phone: '', whatsapp: '', quality: 'none' };
  }

  const ddd = d.slice(0, 2);
  const numero = d.slice(2);

  // 11 dígitos começando com 9: já veio completo, nada a reconstruir.
  if (numero.length === 9) {
    return numero[0] === '9'
      ? { phone: `+55${d}`, whatsapp: `55${d}`, quality: 'mobile' }
      : { phone: `+55${d}`, whatsapp: '', quality: 'landline' };
  }

  // 8 dígitos: é aqui que mora quase toda a base da Receita.
  if (MOBILE_PREFIXES.includes(numero[0])) {
    const reconstruido = `55${ddd}9${numero}`;
    return { phone: `+55${d}`, whatsapp: reconstruido, quality: 'mobile_guess' };
  }
  return { phone: `+55${d}`, whatsapp: '', quality: 'landline' };
}

export function phoneFromParts(area, number) {
  const d = `${String(area || '').replace(/\D/g, '')}${String(number || '').replace(/\D/g, '')}`;
  return classifyPhone(d);
}

/* Escolhe o melhor entre os telefones de um estabelecimento: quem abre
   conversa vem primeiro. */
export function bestPhone(candidatos = []) {
  const ordem = { mobile: 0, mobile_guess: 1, landline: 2, partial: 3, none: 4 };
  const avaliados = candidatos
    .map(c => classifyPhone(c))
    .filter(c => c.quality !== 'none')
    .sort((a, b) => ordem[a.quality] - ordem[b.quality]);
  const escolhido = avaliados[0] || { phone: '', whatsapp: '', quality: 'none' };
  return { ...escolhido, qualityLabel: QUALITY_LABEL[escolhido.quality] };
}
