/* ==========================================================================
   Achilles Command, nomes vindos do cadastro da Receita

   A Receita entrega tudo em caixa alta e sem acento: "RESTAURANTE SABOR
   MINEIRO LTDA", "MARIA DA CONCEICAO SILVA". Jogar isso direto no card e,
   pior, no meio de uma mensagem de WhatsApp, entrega na hora que o contato
   saiu de um banco de dados, e é o tipo de detalhe que faz a abordagem
   parecer disparo automático.

   Aqui o nome vira algo que uma pessoa escreveria. O acento não tem como
   voltar (a fonte não tem), mas caixa e sufixo jurídico sim.
   ========================================================================== */

/* Preposições e artigos ficam em minúscula no meio do nome, como se escreve
   de verdade: "Casa do Pão", não "Casa Do Pão". */
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'a', 'o', 'as', 'os', 'ao', 'aos', 'com', 'para', 'por', 'sob', 'sem']);

/* Siglas que ficariam ridículas em caixa baixa. */
const SIGLAS = new Set(['ME', 'EPP', 'MEI', 'LTDA', 'EIRELI', 'S/A', 'SA', 'CIA', 'TI', 'IT', 'RH', 'PJ', 'CNPJ', 'BR', 'AR', 'VR', 'JJ', 'MM', 'AA']);

export function tituloCase(valor = '') {
  const bruto = String(valor).trim();
  if (!bruto) return '';
  // Só reformata o que veio gritando. Texto já com caixa mista foi escrito
  // por alguém e deve ser respeitado.
  if (bruto !== bruto.toUpperCase()) return bruto;

  return bruto
    .toLocaleLowerCase('pt-BR')
    .split(/\s+/)
    .map((palavra, i) => {
      const original = bruto.split(/\s+/)[i] || '';
      if (SIGLAS.has(original)) return original;
      if (i > 0 && MINUSCULAS.has(palavra)) return palavra;
      // Números e códigos ficam como estão ("24H", "3D").
      if (/\d/.test(palavra)) return original;
      return palavra.replace(/^([a-zà-ú])/, c => c.toLocaleUpperCase('pt-BR'));
    })
    .join(' ');
}

/* Sufixos societários no fim da razão social. Saem porque ninguém fala
   "a Padaria Central Ltda" numa conversa. */
const SUFIXOS = /\s*[-,]?\s*(ltda\.?|me|mei|epp|eireli|s\/?a\.?|s\.a\.?|sociedade\s+simples|soc\.?\s+simples|ss|& cia\.?|cia\.?\s+ltda\.?|cia\.?|em\s+recupera[çc][ãa]o\s+judicial)\s*$/i;

export function nomeApresentavel(valor = '') {
  let nome = String(valor).trim();
  if (!nome) return '';

  /* Empresário individual costuma ter o documento grudado no nome da pessoa,
     e ele aparece dos dois lados: "JOAO DA SILVA 12345678900" e também
     "00.540.815 MIDIA MEDEIROS". Nenhum dos dois é parte do nome. */
  nome = nome
    .replace(/\s+[\d.\-\/]{6,}\s*$/, '')
    .replace(/^[\d.\-\/]{6,}\s+/, '')
    .trim();

  // Repete enquanto houver sufixo: "PADARIA X LTDA ME" tem dois.
  for (let i = 0; i < 3; i++) {
    const cortado = nome.replace(SUFIXOS, '').trim();
    if (cortado === nome) break;
    // Nunca deixar o nome vazio: se o sufixo era tudo, fica o original.
    if (!cortado) break;
    nome = cortado;
  }

  return tituloCase(nome);
}

/* Primeiro nome do responsável, para abrir a conversa. Inicial solta ("J
   SILVA") e partícula não servem como tratamento; nome curto de verdade,
   como "Li" ou "Ana", serve. */
export function primeiroNome(valor = '') {
  const nome = tituloCase(String(valor).trim());
  if (!nome) return '';
  const primeiro = nome.split(/\s+/)[0] || '';
  if (primeiro.length < 2) return '';
  if (MINUSCULAS.has(primeiro.toLocaleLowerCase('pt-BR'))) return '';
  return primeiro;
}
