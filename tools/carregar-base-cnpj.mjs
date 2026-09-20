/* ==========================================================================
   Carrega a base própria de CNPJ no Supabase

   Lê os arquivos públicos de Estabelecimentos da Receita Federal, filtra o
   recorte que você usa para prospectar e grava no seu Supabase. Depois disso
   o extrator por CNAE busca na sua própria base, sem custo por consulta.

   Os arquivos somam cerca de 5 GB compactados. Cada um é baixado para uma
   pasta de cache, lido, e apagado em seguida — então o pico de disco é o
   tamanho do maior arquivo, 2,1 GB, e não a soma.

   O download é retomável. Se a conexão cair no meio (e numa baixada dessas
   ela cai), a tentativa seguinte continua de onde parou em vez de recomeçar.
   Rodar o comando de novo depois de um erro também é barato: o que já estiver
   inteiro no cache não é baixado outra vez.

   Uso:

     # 1. Mede quanto seria importado, sem gravar nada. Rode isto primeiro.
     node tools/carregar-base-cnpj.mjs --contar

     # 2. Carrega de verdade.
     node tools/carregar-base-cnpj.mjs --carregar

     # Um arquivo só, para testar rápido (são 10, de 0 a 9):
     node tools/carregar-base-cnpj.mjs --contar --arquivos 1

   Opções:
     --ufs MG,SP,GO      estados a importar (padrão: o AJUSTES abaixo)
     --competencia 2026-09   mês do arquivo na Receita
     --celular           só provável celular (padrão)
     --com-telefone      celular e fixo
     --todas-situacoes   inclui baixadas, suspensas e inaptas
     --cnaes 8630503,... só estes CNAEs
     --todos-cnaes       carrega todos os CNAEs (triplica o volume)
     --arquivos 0,1,2    só estes arquivos da Receita
     --lote 1000         linhas por requisição ao Supabase
     --limpar-antigas    ao final, apaga as linhas de competências anteriores
     --apenas-responsaveis  não refaz a carga: só preenche o responsável das
                            empresas já no banco, lendo Empresas e Sócios
     --local C:/pasta    usa os ZIPs já baixados dessa pasta, sem baixar nada
     --cache C:/pasta    onde guardar o download (padrão: .cache-receita)
     --manter            não apaga os ZIPs depois de processar

   Precisa de duas variáveis de ambiente (as mesmas do Netlify):
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY   <- chave de servidor, nunca vai para o navegador

   No Windows (PowerShell):
     $env:SUPABASE_URL="https://xxxx.supabase.co"
     $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
   ========================================================================== */

import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

/* --- ajustes ------------------------------------------------------------- */

const AJUSTES = {
  competencia: '2026-09',
  // Começamos pela região da Achilles. Ampliar depois é rodar de novo com
  // --ufs: o carregador faz upsert, então nada é duplicado nem apagado.
  ufs: ['MG', 'GO', 'DF'],
  somenteCelular: true,
  somenteAtivas: true,
  cnaes: [],            // vazio = usa a lista de negócio local (ver abaixo)
  cnaesLocais: true,    // --todos-cnaes desliga
  arquivos: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  lote: 1000
};

/* Os CNAEs que a Achilles realmente vende: os de negócio local, que são
   exatamente as subclasses com apelido popular em assets/cnae.json. Cortar
   por aqui tira agro, indústria e fabricação, que nunca seriam prospectados,
   e reduz a base a um terço do tamanho.

   Consequência: um CNAE fora desta lista não terá empresas na base. A
   Function avisa quando isso acontece, em vez de devolver lista vazia sem
   explicação. */
function cnaesDeNegocioLocal() {
  const caminho = new URL('../assets/cnae.json', import.meta.url);
  const catalogo = JSON.parse(readFileSync(caminho, 'utf8'));
  return catalogo.subclasses.filter(r => r.a).map(r => Number(r.id));
}

const BASE = 'https://arquivos.receitafederal.gov.br/public.php/webdav';
const TOKEN_PUBLICO = 'YggdBLfdninEJX9'; // link público do repositório da Receita
const AUTH = 'Basic ' + Buffer.from(`${TOKEN_PUBLICO}:`).toString('base64');

/* --- linha de comando ---------------------------------------------------- */

function lerArgumentos(argv) {
  const cfg = { ...AJUSTES, modo: null, limparAntigas: false, local: '', cache: '.cache-receita', manter: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const proximo = () => argv[++i];
    if (a === '--contar') cfg.modo = 'contar';
    else if (a === '--carregar') cfg.modo = 'carregar';
    else if (a === '--apenas-responsaveis') cfg.modo = 'responsaveis';
    else if (a === '--celular') cfg.somenteCelular = true;
    else if (a === '--com-telefone') cfg.somenteCelular = false;
    else if (a === '--todas-situacoes') cfg.somenteAtivas = false;
    else if (a === '--todos-cnaes') { cfg.cnaesLocais = false; cfg.cnaes = []; }
    else if (a === '--limpar-antigas') cfg.limparAntigas = true;
    else if (a === '--ufs') cfg.ufs = proximo().split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    else if (a === '--competencia') cfg.competencia = proximo().trim();
    else if (a === '--cnaes') { cfg.cnaes = proximo().split(',').map(s => Number(String(s).replace(/\D/g, ''))).filter(Boolean); cfg.cnaesLocais = false; }
    else if (a === '--arquivos') cfg.arquivos = proximo().split(',').map(Number).filter(n => n >= 0 && n <= 9);
    else if (a === '--local') cfg.local = proximo();
    else if (a === '--cache') cfg.cache = proximo();
    else if (a === '--manter') cfg.manter = true;
    else if (a === '--lote') cfg.lote = Math.max(100, Math.min(5000, Number(proximo()) || 1000));
    else { console.error(`Opção desconhecida: ${a}`); process.exit(1); }
  }
  if (!cfg.modo) {
    console.error('Diga o que fazer: --contar (só mede), --carregar (grava no Supabase)');
    console.error('ou --apenas-responsaveis (preenche só o nome do responsável).');
    process.exit(1);
  }
  return cfg;
}

/* --- utilidades ---------------------------------------------------------- */

const mb = n => (n / 1048576).toFixed(0);
const num = n => Number(n).toLocaleString('pt-BR');

function env(nome) {
  const v = process.env[nome];
  if (!v) {
    console.error(`Falta a variável de ambiente ${nome}.`);
    process.exit(1);
  }
  return v;
}

/* A Receita entrega CSV com ; entre campos e " em volta de cada valor. Um
   split simples quebraria em endereço com ponto e vírgula, que existe. */
function separarCampos(linha) {
  const out = [];
  let atual = '';
  let dentroDeAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') { dentroDeAspas = !dentroDeAspas; continue; }
    if (c === ';' && !dentroDeAspas) { out.push(atual); atual = ''; continue; }
    atual += c;
  }
  out.push(atual);
  return out;
}

/* --- o problema do 9º dígito ---------------------------------------------
   O campo de telefone da Receita tem 8 dígitos e ponto final. Medindo o
   arquivo de setembro/2026: 910.396 telefones de 8 dígitos e ZERO de 9. O
   nono dígito dos celulares simplesmente não está na base — e não adianta
   trocar de fornecedor, porque as APIs pagas leem esta mesma base e devolvem
   os mesmos 8 dígitos.

   O que dá para fazer é reconstruir. Na numeração antiga, celular começava
   com 6, 7, 8 ou 9 e fixo começava com 2, 3, 4 ou 5. Então um número de 8
   dígitos começando com 6-9 era celular, e hoje ele é o mesmo número com um
   9 na frente.

   Isso é uma inferência com margem de erro, não um fato: número reciclado,
   cadastro desatualizado ou linha desativada continuam parecendo celular
   aqui. Por isso o tipo se chama `mobile_provavel` e a interface nunca
   promete WhatsApp — promete candidato. */
function montarTelefone(ddd, numero) {
  const d = String(ddd || '').replace(/\D/g, '');
  const n = String(numero || '').replace(/\D/g, '');
  if (d.length !== 2) return null;

  // 9 dígitos começando com 9 já vem pronto (não aparece na base da Receita,
  // mas pode aparecer se um dia a origem mudar ou você importar de outra).
  if (n.length === 9 && n[0] === '9') return { numero: Number(`55${d}${n}`), tipo: 'mobile_provavel' };
  if (n.length !== 8) return null;

  const tipo = '6789'.includes(n[0]) ? 'mobile_provavel' : 'landline';
  // Guardamos o número como está no cadastro. A reconstrução do 9º dígito
  // acontece na hora de abrir a conversa, onde fica visível para você.
  return { numero: Number(`55${d}${n}`), tipo };
}

function melhorTelefone(campos) {
  const a = montarTelefone(campos[21], campos[22]);
  const b = montarTelefone(campos[23], campos[24]);
  if (a?.tipo === 'mobile_provavel') return a;
  if (b?.tipo === 'mobile_provavel') return b;
  return a || b;
}

function dataISO(v) {
  const s = String(v || '').trim();
  if (!/^\d{8}$/.test(s) || s.startsWith('0000')) return null;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

const limpar = v => {
  const s = String(v || '').trim();
  return s && s !== '0' ? s : null;
};

/* --- download com retomada -------------------------------------------------
   Antes o arquivo era lido direto da rede para o descompressor, sem tocar no
   disco. Elegante, e errado para o tamanho do problema: o Estabelecimentos0
   tem 2,1 GB e uma conexão doméstica cai. Quando caía, o processo morria com
   ECONNRESET e a carga toda recomeçava do zero.

   Agora cada arquivo é baixado para uma pasta de cache, e uma queda custa só
   o que faltava: a requisição seguinte pede `Range: bytes=<o que já tenho>-`
   e continua de onde parou. Se o arquivo já estiver inteiro no cache, nem
   baixa de novo — o que torna barato repetir a carga depois de um erro.

   Por padrão cada arquivo é apagado assim que é processado, então o pico de
   disco é o tamanho do maior deles. Com --manter o cache fica para a próxima
   competência. */
async function tamanhoRemoto(url) {
  const res = await fetch(url, { method: 'HEAD', headers: { Authorization: AUTH } });
  if (!res.ok) throw new Error(`${url} respondeu ${res.status}`);
  return Number(res.headers.get('content-length') || 0);
}

async function garantirArquivo(url, destino, rotulo) {
  const total = await tamanhoRemoto(url);
  let baixado = existsSync(destino) ? statSync(destino).size : 0;

  if (total && baixado === total) {
    console.log(`  ${rotulo}: já está no cache (${mb(total)} MB)`);
    return destino;
  }
  // Maior que o remoto significa cache de outra competência: recomeça.
  if (baixado > total) { rmSync(destino, { force: true }); baixado = 0; }

  for (let tentativa = 1; tentativa <= 8; tentativa++) {
    try {
      const headers = { Authorization: AUTH };
      if (baixado > 0) headers.Range = `bytes=${baixado}-`;

      const res = await fetch(url, { headers });
      if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`);
      // Servidor ignorou o Range e mandou tudo: recomeça o arquivo.
      if (baixado > 0 && res.status === 200) { rmSync(destino, { force: true }); baixado = 0; }

      const saida = createWriteStream(destino, { flags: baixado > 0 ? 'a' : 'w' });
      let ultimoAviso = Date.now();

      await pipeline(
        Readable.fromWeb(res.body),
        async function* (origem) {
          for await (const pedaco of origem) {
            baixado += pedaco.length;
            if (Date.now() - ultimoAviso > 3000) {
              ultimoAviso = Date.now();
              const pct = total ? ` (${(baixado / total * 100).toFixed(0)}%)` : '';
              process.stdout.write(`\r  ${rotulo}: ${mb(baixado)} de ${mb(total)} MB${pct}     `);
            }
            yield pedaco;
          }
        },
        saida
      );

      process.stdout.write(`\r  ${rotulo}: ${mb(baixado)} MB baixados              \n`);
      return destino;
    } catch (erro) {
      baixado = existsSync(destino) ? statSync(destino).size : 0;
      if (tentativa === 8) {
        throw new Error(`não consegui baixar ${rotulo} depois de 8 tentativas: ${erro.message}`);
      }
      const espera = Math.min(30, tentativa * 5);
      process.stdout.write(`\r  ${rotulo}: conexão caiu em ${mb(baixado)} MB. Retomando em ${espera}s (tentativa ${tentativa + 1}/8)...\n`);
      await new Promise(r => setTimeout(r, espera * 1000));
    }
  }
}

/* --- leitura dos ZIPs da Receita ------------------------------------------
   Cada ZIP tem um CSV só. Lemos o cabeçalho local para achar onde começam os
   dados e jogamos o resto direto no inflate, sem gravar nada em disco. */
async function* linhasDoZip(caminhoLocal) {
  const origem = createReadStream(caminhoLocal);
  const inflate = zlib.createInflateRaw();

  let cabecalhoLido = false;
  let sobra = Buffer.alloc(0);

  origem.on('data', pedaco => {
    if (cabecalhoLido) { inflate.write(pedaco); return; }
    sobra = Buffer.concat([sobra, pedaco]);
    if (sobra.length < 30) return;
    const nomeLen = sobra.readUInt16LE(26);
    const extraLen = sobra.readUInt16LE(28);
    const inicio = 30 + nomeLen + extraLen;
    if (sobra.length < inicio) return;
    cabecalhoLido = true;
    inflate.write(sobra.subarray(inicio));
    sobra = null;
  });
  origem.on('end', () => inflate.end());
  origem.on('error', e => inflate.destroy(e));

  let resto = '';
  // latin1 é byte a byte, então cortar no meio de um pedaço não corrompe
  // caractere acentuado — o que aconteceria com utf8.
  for await (const bloco of inflate) {
    const texto = resto + bloco.toString('latin1');
    const linhas = texto.split('\n');
    resto = linhas.pop();
    for (const linha of linhas) if (linha.trim()) yield linha;
  }
  if (resto.trim()) yield resto;
}

async function baixarMunicipios(cfg) {
  const caminho = await arquivoDaReceita(cfg, 'Municipios.zip');
  const buf = readFileSync(caminho);
  const inicio = 30 + buf.readUInt16LE(26) + buf.readUInt16LE(28);
  const texto = zlib.inflateRawSync(buf.subarray(inicio)).toString('latin1');
  const mapa = new Map();
  for (const linha of texto.split(/\r?\n/)) {
    if (!linha.trim()) continue;
    const [codigo, nome] = separarCampos(linha);
    if (codigo) mapa.set(codigo.trim(), (nome || '').trim());
  }
  return mapa;
}

/* --- gravação no Supabase -------------------------------------------------
   PostgREST com a service role. merge-duplicates faz UPSERT pela chave
   primária, então rodar de novo corrige em vez de duplicar. */
async function enviarLote(linhas, supabaseUrl, chave, tabela = 'cnpj_estabelecimentos') {
  if (!linhas.length) return;
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${tabela}`;
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: chave,
        Authorization: `Bearer ${chave}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(linhas)
    });
    if (res.ok) return;
    const detalhe = await res.text().catch(() => '');
    if (tentativa === 4) throw new Error(`Supabase recusou o lote (${res.status}): ${detalhe.slice(0, 300)}`);
    // Erro momentâneo acontece em carga longa; espera crescente antes de repetir.
    await new Promise(r => setTimeout(r, tentativa * 2000));
  }
}

/* Devolve o caminho de um arquivo da Receita: o que já está em --local, ou
   um download retomável para a pasta de cache. */
async function arquivoDaReceita(cfg, nome) {
  if (cfg.local) return path.join(cfg.local, nome);
  mkdirSync(cfg.cache, { recursive: true });
  const destino = path.join(cfg.cache, `${cfg.competencia}-${nome}`);
  await garantirArquivo(`${BASE}/${cfg.competencia}/${nome}`, destino, nome);
  return destino;
}

function descartar(cfg, caminho) {
  if (cfg.local || cfg.manter) return;
  try { rmSync(caminho, { force: true }); } catch { /* arquivo em uso: some na próxima */ }
}

/* --- terceira passada: responsável ----------------------------------------
   A mensagem de abordagem abre com uma saudação. Sem nome ela fica impessoal
   ("Bom dia! Tudo bem?") e soa como disparo; com o nome de quem assina pela
   empresa, soa como alguém que olhou antes de escrever.

   Empresário Individual já foi resolvido na passada anterior: nesse caso a
   razão social é a própria pessoa. Aqui ficam os demais, que saem do arquivo
   de Sócios.

   Isto é uma aposta, não um fato: o sócio-administrador pode não ser quem
   atende o WhatsApp, e o cadastro pode estar velho. Por isso guardamos só o
   nome — nenhum outro dado da pessoa entra no banco — e a interface nunca
   afirma nada sobre ele. */

/* Qualificação do sócio na Receita. Quanto menor o número aqui, mais provável
   que seja quem decide e quem atende. */
const QUALIFICACAO = { 49: 1, 5: 2, 16: 3, 65: 4, 10: 5, 22: 6, 8: 7 };

async function passarSocios(cfg, alvos, resolvidos, supabaseUrl, chave) {
  const pendentes = [...alvos].filter(b => !resolvidos.has(b));
  if (!pendentes.length) return 0;

  const faltando = new Set(pendentes);
  console.log(`--- responsável de ${num(faltando.size)} empresas ---`);
  console.log('    Os Empresários Individuais já foram resolvidos pela razão social.');
  console.log('    Estes saem do arquivo de Sócios, mais 0,7 GB.\n');

  let encontrados = 0;
  let lote = [];

  for (const indice of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const arquivo = `Socios${indice}.zip`;
    // Todos os sócios de uma empresa ficam no mesmo arquivo, porque a Receita
    // divide pela mesma chave. Por isso dá para fechar o mapa ao fim de cada
    // arquivo em vez de segurar 1,8 milhão de nomes na memória de uma vez.
    const melhor = new Map();
    let caminho;
    let lidas = 0;

    try {
      caminho = await arquivoDaReceita(cfg, arquivo);
      for await (const linha of linhasDoZip(caminho)) {
        if (++lidas % 500000 === 0) {
          process.stdout.write(`\r  ${arquivo}: ${num(lidas)} lidas · ${num(encontrados + melhor.size)} encontrados   `);
        }
        const c = separarCampos(linha);
        if (c.length < 5) continue;

        const basico = Number(String(c[0]).replace(/\D/g, ''));
        if (!basico || !faltando.has(basico)) continue;

        // 2 = pessoa física. Sócio pessoa jurídica não serve para saudação.
        if (String(c[1] || '').trim() !== '2') continue;

        const nome = limpar(c[2]);
        if (!nome) continue;

        const prioridade = QUALIFICACAO[Number(String(c[4] || '').replace(/\D/g, ''))] || 99;
        const atual = melhor.get(basico);
        if (!atual || prioridade < atual.prioridade) melhor.set(basico, { nome, prioridade });
      }
    } catch (erro) {
      process.stdout.write('\r');
      console.warn(`  ${arquivo}: ${erro.message}`);
      if (caminho) descartar(cfg, caminho);
      continue;
    }

    for (const [basico, { nome }] of melhor) {
      encontrados++;
      faltando.delete(basico);
      lote.push({ cnpj_basico: basico, responsavel: nome });
      if (lote.length >= cfg.lote) { await enviarLote(lote, supabaseUrl, chave, 'cnpj_empresas'); lote = []; }
    }

    descartar(cfg, caminho);
    process.stdout.write(`\r  ${arquivo}: ${num(encontrados)} responsáveis no total            \n`);
  }

  if (lote.length) await enviarLote(lote, supabaseUrl, chave, 'cnpj_empresas');
  console.log(`  ${num(faltando.size)} empresas ficaram sem responsável (sociedade só de PJ, ou sem sócio no cadastro).\n`);
  return encontrados;
}

/* Para o modo --apenas-responsaveis: quais empresas já estão no banco. Só o
   número do CNPJ básico vem, em páginas, então são alguns MB e não 1,8 milhão
   de linhas inteiras. */
async function basicosDoBanco(supabaseUrl, chave) {
  const base = supabaseUrl.replace(/\/$/, '');
  const conjunto = new Set();
  const porPagina = 50000;

  for (let inicio = 0; ; inicio += porPagina) {
    const url = `${base}/rest/v1/cnpj_empresas?select=cnpj_basico&order=cnpj_basico.asc`;
    const res = await fetch(url, {
      headers: {
        apikey: chave,
        Authorization: `Bearer ${chave}`,
        Accept: 'application/json',
        Range: `${inicio}-${inicio + porPagina - 1}`
      }
    });
    if (!res.ok) throw new Error(`Não consegui ler as empresas já carregadas (${res.status}).`);
    const linhas = await res.json();
    for (const l of linhas) conjunto.add(Number(l.cnpj_basico));
    process.stdout.write(`\r  ${num(conjunto.size)} empresas já na base...`);
    if (linhas.length < porPagina) break;
  }
  process.stdout.write('\n');
  return conjunto;
}

/* --- execução ------------------------------------------------------------- */

const cfg = lerArgumentos(process.argv.slice(2));
const gravando = cfg.modo === 'carregar';
const soResponsaveis = cfg.modo === 'responsaveis';

const precisaDoBanco = gravando || soResponsaveis;
const supabaseUrl = precisaDoBanco ? env('SUPABASE_URL') : '';
const chave = precisaDoBanco ? env('SUPABASE_SERVICE_ROLE_KEY') : '';

const ufsAceitas = new Set(cfg.ufs);
if (cfg.cnaesLocais && !cfg.cnaes.length) cfg.cnaes = cnaesDeNegocioLocal();
const cnaesAceitos = cfg.cnaes.length ? new Set(cfg.cnaes) : null;

console.log('');
console.log(`Competência .......... ${cfg.competencia}`);
console.log(`Estados .............. ${cfg.ufs.join(', ')}`);
console.log(`Telefone ............. ${cfg.somenteCelular ? 'somente provável celular' : 'provável celular ou fixo'}`);
console.log(`Situação ............. ${cfg.somenteAtivas ? 'somente ativas' : 'todas'}`);
console.log(`CNAEs ................ ${cnaesAceitos ? `${cfg.cnaes.length} selecionados${cfg.cnaesLocais ? ' (negócio local)' : ''}` : 'todos'}`);
console.log(`Arquivos ............. ${cfg.arquivos.join(', ')}`);
console.log(`Origem ............... ${cfg.local || 'download direto da Receita'}`);
console.log(`Modo ................. ${gravando ? 'CARREGAR no Supabase' : soResponsaveis ? 'APENAS RESPONSÁVEIS (não refaz a carga)' : 'apenas contar (nada é gravado)'}`);
console.log('');

console.log('Baixando a tabela de municípios...');
const municipios = await baixarMunicipios(cfg);
console.log(`${num(municipios.size)} municípios.\n`);

let lidas = 0;
let aceitas = 0;
let bytesEstimados = 0;
const porUf = new Map();
let lote = [];
const basicosNecessarios = new Set();
const inicio = Date.now();

if (soResponsaveis) {
  // Não refaz a carga: as empresas já estão no banco, falta só o nome.
  console.log('Lendo as empresas já carregadas...');
  for (const b of await basicosDoBanco(supabaseUrl, chave)) basicosNecessarios.add(b);
  console.log('');
}

for (const indice of (soResponsaveis ? [] : cfg.arquivos)) {
  const arquivo = `Estabelecimentos${indice}.zip`;
  console.log(`--- ${arquivo} ---`);
  const antes = aceitas;

  const caminho = await arquivoDaReceita(cfg, arquivo);
  for await (const linha of linhasDoZip(caminho)) {
    lidas++;
    if (lidas % 1000000 === 0) {
      const min = ((Date.now() - inicio) / 60000).toFixed(1);
      console.log(`  ${num(lidas)} lidas · ${num(aceitas)} aceitas · ${min} min`);
    }

    const c = separarCampos(linha);
    if (c.length < 28) continue;

    const uf = (c[19] || '').trim().toUpperCase();
    if (!ufsAceitas.has(uf)) continue;

    if (cfg.somenteAtivas && (c[5] || '').trim() !== '02') continue;

    const cnae = Number(String(c[11] || '').replace(/\D/g, ''));
    if (!cnae) continue;
    if (cnaesAceitos && !cnaesAceitos.has(cnae)) continue;

    const telefone = melhorTelefone(c);
    if (!telefone) continue;
    if (cfg.somenteCelular && telefone.tipo !== 'mobile_provavel') continue;

    const basico = Number(String(c[0]).replace(/\D/g, ''));
    const cnpj = Number(`${String(c[0]).padStart(8, '0')}${String(c[1]).padStart(4, '0')}${String(c[2]).padStart(2, '0')}`);
    if (!basico || !Number.isSafeInteger(cnpj)) continue;

    const secundarios = String(c[12] || '')
      .split(',')
      .map(v => Number(v.replace(/\D/g, '')))
      .filter(v => v > 0);

    const registro = {
      cnpj,
      cnpj_basico: basico,
      nome_fantasia: limpar(c[4]),
      cnae,
      cnae_secundarios: secundarios,
      uf,
      municipio: municipios.get((c[20] || '').trim()) || '',
      bairro: limpar(c[17]),
      logradouro: [limpar(c[13]), limpar(c[14]), limpar(c[15])].filter(Boolean).join(' '),
      cep: limpar(c[18]),
      situacao: Number((c[5] || '0').trim()),
      data_inicio: dataISO(c[10]),
      telefone: telefone.numero,
      telefone_tipo: telefone.tipo,
      email: limpar(c[27]),
      competencia: cfg.competencia
    };

    if (!registro.municipio) continue;

    aceitas++;
    bytesEstimados += JSON.stringify(registro).length;
    // Guardamos quais empresas precisam de razão social. É só o número do
    // CNPJ básico, então o conjunto cabe na memória mesmo com milhões.
    basicosNecessarios.add(basico);

    porUf.set(uf, (porUf.get(uf) || 0) + 1);

    if (gravando) {
      lote.push(registro);
      if (lote.length >= cfg.lote) {
        await enviarLote(lote, supabaseUrl, chave);
        lote = [];
      }
    }
  }

  // Apagado assim que é lido: o pico de disco fica sendo o maior arquivo,
  // 2,1 GB, em vez dos 5 GB somados. Com --manter, o cache é preservado.
  descartar(cfg, caminho);
  console.log(`  ${arquivo}: +${num(aceitas - antes)} empresas aceitas\n`);
}

if (gravando && lote.length) await enviarLote(lote, supabaseUrl, chave);
lote = [];

/* --- segunda passada: razão social ---------------------------------------
   O nome fantasia vem preenchido em só 30% dos estabelecimentos, então sem
   isto a maioria dos contatos apareceria sem nome. Os arquivos Empresas são
   bem menores (1,3 GB no total) e só guardamos as empresas que sobreviveram
   ao filtro da primeira passada. */
let empresas = 0;
// Quem ja tem responsavel e nao precisa passar pelo arquivo de Socios.
const resolvidos = new Set();
if (precisaDoBanco && basicosNecessarios.size) {
  console.log(`--- razão social e Empresário Individual: ${num(basicosNecessarios.size)} empresas ---`);
  // Sempre os 10 arquivos: a Receita distribui as empresas por um critério
  // diferente do dos estabelecimentos, então a empresa de um estabelecimento
  // do arquivo 1 pode estar em qualquer um dos dez.
  for (const indice of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const arquivo = `Empresas${indice}.zip`;
    let caminhoEmpresa;
    try {
      caminhoEmpresa = await arquivoDaReceita(cfg, arquivo);
      for await (const linha of linhasDoZip(caminhoEmpresa)) {
        const c = separarCampos(linha);
        if (c.length < 6) continue;
        const basico = Number(String(c[0]).replace(/\D/g, ''));
        if (!basico || !basicosNecessarios.has(basico)) continue;
        const razao = limpar(c[1]);
        if (!razao) continue;
        empresas++;

        /* Natureza 2135 e Empresario Individual: a razao social ja e o nome
           da pessoa ("JOAO DA SILVA 12345678900"). Esses nao precisam do
           arquivo de Socios, que nem os lista. */
        const natureza = Number(String(c[2] || '').replace(/\D/g, ''));
        const responsavel = natureza === 2135 ? razao : null;
        if (responsavel) resolvidos.add(basico);

        lote.push({
          cnpj_basico: basico,
          razao_social: razao,
          porte: Number(String(c[5] || '0').replace(/\D/g, '')) || null,
          responsavel
        });
        if (lote.length >= cfg.lote) { await enviarLote(lote, supabaseUrl, chave, 'cnpj_empresas'); lote = []; }
      }
    } catch (erro) {
      console.warn(`  ${arquivo}: ${erro.message}`);
    }
    if (caminhoEmpresa) descartar(cfg, caminhoEmpresa);
    console.log(`  ${arquivo}: ${num(empresas)} razões sociais até aqui`);
  }
  if (lote.length) await enviarLote(lote, supabaseUrl, chave, 'cnpj_empresas');
  lote = [];
} else if (basicosNecessarios.size) {
  console.log(`(No modo --contar a razão social não é buscada. Seriam ${num(basicosNecessarios.size)} empresas,`);
  console.log(' lidas dos arquivos Empresas*.zip, que somam 1,3 GB.)');
}

let responsaveis = 0;
if (precisaDoBanco && basicosNecessarios.size) {
  responsaveis = resolvidos.size + await passarSocios(cfg, basicosNecessarios, resolvidos, supabaseUrl, chave);
}

if (gravando && cfg.limparAntigas) {
  console.log('Apagando linhas de competências anteriores...');
  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/cnpj_estabelecimentos?competencia=neq.${encodeURIComponent(cfg.competencia)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, Prefer: 'return=minimal' }
  });
  console.log(res.ok ? 'Pronto.' : `Falhou (${res.status}).`);
}

if (gravando) {
  const registro = {
    competencia: cfg.competencia,
    ufs: cfg.ufs,
    // A Function lê isto para avisar quando você pedir um CNAE ou um estado
    // que não foi carregado, em vez de devolver "nenhum resultado".
    cnaes: cfg.cnaes,
    somente_celular: cfg.somenteCelular,
    somente_ativas: cfg.somenteAtivas,
    total_linhas: aceitas,
    concluida_em: new Date().toISOString()
  };
  await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/cnpj_base_cargas`, {
    method: 'POST',
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(registro)
  }).catch(() => {});
}

const minutos = ((Date.now() - inicio) / 60000).toFixed(1);
const parcial = !soResponsaveis && cfg.arquivos.length < 10;

if (soResponsaveis) {
  console.log('========================================');
  console.log(`Empresas na base ..... ${num(basicosNecessarios.size)}`);
  console.log(`Com responsável ...... ${num(responsaveis)} (${num(resolvidos.size)} por serem Empresário Individual)`);
  console.log(`Tempo ................ ${minutos} min`);
  console.log('========================================');
  process.exit(0);
}

console.log('========================================');
console.log(`Linhas lidas ......... ${num(lidas)}`);
console.log(`Empresas aceitas ..... ${num(aceitas)}`);
if (gravando) console.log(`Razões sociais ....... ${num(empresas)}`);
if (gravando) console.log(`Com responsável ...... ${num(responsaveis)}`);
console.log(`Tempo ................ ${minutos} min`);
console.log('');
console.log('Por estado:');
[...porUf].sort((a, b) => b[1] - a[1]).forEach(([uf, n]) => console.log(`  ${uf}  ${num(n)}`));
console.log('');

// Estimativa de espaço: JSON é maior que o armazenamento real do Postgres,
// mas o índice compensa. Serve para saber se cabe no plano do Supabase.
const mbDados = bytesEstimados / 1048576;
console.log(`Espaço estimado no banco: ~${mb(bytesEstimados)} MB de dados + índices (~${(mbDados * 1.6).toFixed(0)} MB no total)`);

if (parcial) {
  /* Projetar daqui é traiçoeiro, e o jeito antigo errou feio: a proporção de
     bytes dizia 830 mil para MG/GO/DF, e a carga real deu 1,8 milhão — mais
     que o dobro.

     O motivo é o arquivo 0. Ele não é só maior em bytes, é muito mais denso
     em empresas que passam no filtro: sozinho respondeu por 44% de tudo que
     foi aceito (790 mil de 1,8 milhão), contra 50 a 150 mil de cada um dos
     outros nove. Quem projeta a partir de um arquivo qualquer que não seja o
     0 subestima; quem projeta a partir do 0 superestima.

     Então aqui não se finge precisão: a proporção observada na carga real de
     setembro/2026 vira uma faixa, com o aviso de que só o --contar completo
     responde de verdade. */
  /* Fatia do resultado que cada arquivo respondeu numa carga real (MG, GO,
     DF, ativas, provável celular, CNAEs de negócio local, competência
     2026-09). Não é palpite: são as 1.797.165 empresas daquela carga,
     divididas por arquivo.

     A variação entre arquivos é enorme — o 1 trouxe 52 mil e o 8 trouxe 148
     mil — e é isso que torna traiçoeiro projetar de um arquivo só. */
  const FATIA = [0.440, 0.029, 0.074, 0.081, 0.040, 0.078, 0.069, 0.047, 0.083, 0.059];
  const fatia = cfg.arquivos.reduce((soma, i) => soma + FATIA[i], 0);
  const estimado = aceitas / fatia;

  console.log('');
  console.log(`Você leu ${cfg.arquivos.length} de 10 arquivos, que numa carga real valeram ${(fatia * 100).toFixed(0)}% do resultado.`);
  console.log('ORDEM DE GRANDEZA para a base inteira:');
  console.log(`  empresas .......... ~${num(Math.round(estimado))}`);
  console.log(`  espaço no banco ... ~${(bytesEstimados / fatia / 1073741824 * 1.6).toFixed(1)} GB`);
  console.log('');
  console.log('A proporção vem de uma carga medida, mas com outro recorte de estados ou');
  console.log('CNAEs ela muda. Para um número confiável, rode o --contar sem --arquivos.');
  console.log('E confira o espaço livre do seu plano no Supabase antes de carregar:');
  console.log('estourar o limite trava a gravação no meio.');
}

console.log('========================================');
if (!gravando) console.log('\nNada foi gravado. Rode de novo com --carregar quando o número estiver bom.');
