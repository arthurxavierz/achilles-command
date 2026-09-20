/* ==========================================================================
   Carrega a base própria de CNPJ no Supabase

   Lê os arquivos públicos de Estabelecimentos da Receita Federal, filtra o
   recorte que você usa para prospectar e grava no seu Supabase. Depois disso
   o extrator por CNAE busca na sua própria base, sem custo por consulta.

   Os arquivos somam cerca de 5 GB compactados. Este script NÃO salva os ZIPs
   em disco: ele lê e descomprime em memória, linha a linha, e só guarda o que
   passa no filtro. Você precisa de banda, não de espaço.

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
     --local C:/pasta    lê os ZIPs já baixados dessa pasta, em vez da internet

   Precisa de duas variáveis de ambiente (as mesmas do Netlify):
     SUPABASE_URL
     SUPABASE_SERVICE_ROLE_KEY   <- chave de servidor, nunca vai para o navegador

   No Windows (PowerShell):
     $env:SUPABASE_URL="https://xxxx.supabase.co"
     $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
   ========================================================================== */

import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { createReadStream, readFileSync } from 'node:fs';
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
  const cfg = { ...AJUSTES, modo: null, limparAntigas: false, local: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const proximo = () => argv[++i];
    if (a === '--contar') cfg.modo = 'contar';
    else if (a === '--carregar') cfg.modo = 'carregar';
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
    else if (a === '--lote') cfg.lote = Math.max(100, Math.min(5000, Number(proximo()) || 1000));
    else { console.error(`Opção desconhecida: ${a}`); process.exit(1); }
  }
  if (!cfg.modo) {
    console.error('Diga o que fazer: --contar (só mede) ou --carregar (grava no Supabase).');
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

/* --- leitura dos ZIPs da Receita ------------------------------------------
   Cada ZIP tem um CSV só. Lemos o cabeçalho local para achar onde começam os
   dados e jogamos o resto direto no inflate, sem gravar nada em disco. */
async function* linhasDoZip(origemDescricao, caminhoLocal = '') {
  let origem;
  if (caminhoLocal) {
    origem = createReadStream(caminhoLocal);
  } else {
    const res = await fetch(origemDescricao, { headers: { Authorization: AUTH } });
    if (!res.ok) throw new Error(`${origemDescricao} respondeu ${res.status}`);
    origem = Readable.fromWeb(res.body);
  }

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

async function baixarMunicipios(competencia, local = '') {
  let buf;
  if (local) {
    buf = readFileSync(path.join(local, 'Municipios.zip'));
  } else {
    const res = await fetch(`${BASE}/${competencia}/Municipios.zip`, { headers: { Authorization: AUTH } });
    if (!res.ok) throw new Error(`Municipios.zip respondeu ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
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

/* --- execução ------------------------------------------------------------- */

const cfg = lerArgumentos(process.argv.slice(2));
const gravando = cfg.modo === 'carregar';

const supabaseUrl = gravando ? env('SUPABASE_URL') : '';
const chave = gravando ? env('SUPABASE_SERVICE_ROLE_KEY') : '';

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
console.log(`Modo ................. ${gravando ? 'CARREGAR no Supabase' : 'apenas contar (nada é gravado)'}`);
console.log('');

console.log('Baixando a tabela de municípios...');
const municipios = await baixarMunicipios(cfg.competencia, cfg.local);
console.log(`${num(municipios.size)} municípios.\n`);

let lidas = 0;
let aceitas = 0;
let bytesEstimados = 0;
const porUf = new Map();
let lote = [];
const basicosNecessarios = new Set();
const inicio = Date.now();

for (const indice of cfg.arquivos) {
  const arquivo = `Estabelecimentos${indice}.zip`;
  console.log(`--- ${arquivo} ---`);
  const antes = aceitas;

  const origem = cfg.local ? path.join(cfg.local, arquivo) : '';
  for await (const linha of linhasDoZip(`${BASE}/${cfg.competencia}/${arquivo}`, origem)) {
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
if (gravando && basicosNecessarios.size) {
  console.log(`--- razão social de ${num(basicosNecessarios.size)} empresas ---`);
  // Sempre os 10 arquivos: a Receita distribui as empresas por um critério
  // diferente do dos estabelecimentos, então a empresa de um estabelecimento
  // do arquivo 1 pode estar em qualquer um dos dez.
  for (const indice of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    const arquivo = `Empresas${indice}.zip`;
    const origemEmpresa = cfg.local ? path.join(cfg.local, arquivo) : '';
    try {
      for await (const linha of linhasDoZip(`${BASE}/${cfg.competencia}/${arquivo}`, origemEmpresa)) {
        const c = separarCampos(linha);
        if (c.length < 6) continue;
        const basico = Number(String(c[0]).replace(/\D/g, ''));
        if (!basico || !basicosNecessarios.has(basico)) continue;
        const razao = limpar(c[1]);
        if (!razao) continue;
        empresas++;
        lote.push({ cnpj_basico: basico, razao_social: razao, porte: Number(String(c[5] || '0').replace(/\D/g, '')) || null });
        if (lote.length >= cfg.lote) { await enviarLote(lote, supabaseUrl, chave, 'cnpj_empresas'); lote = []; }
      }
    } catch (erro) {
      console.warn(`  ${arquivo}: ${erro.message}`);
    }
    console.log(`  ${arquivo}: ${num(empresas)} razões sociais até aqui`);
  }
  if (lote.length) await enviarLote(lote, supabaseUrl, chave, 'cnpj_empresas');
} else if (basicosNecessarios.size) {
  console.log(`(No modo --contar a razão social não é buscada. Seriam ${num(basicosNecessarios.size)} empresas,`);
  console.log(' lidas dos arquivos Empresas*.zip, que somam 1,3 GB.)');
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
const parcial = cfg.arquivos.length < 10;

console.log('========================================');
console.log(`Linhas lidas ......... ${num(lidas)}`);
console.log(`Empresas aceitas ..... ${num(aceitas)}`);
if (gravando) console.log(`Razões sociais ....... ${num(empresas)}`);
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
  /* Os dez arquivos não têm o mesmo tamanho: o 0 sozinho é 2,1 GB e os outros
     nove têm ~325 MB cada. Por isso a projeção usa a proporção de bytes, e não
     a contagem de arquivos — extrapolar "1 de 10" daria um número muito baixo. */
  const MB_POR_ARQUIVO = [2139, 326, 321, 351, 325, 320, 352, 323, 325, 350];
  const total = MB_POR_ARQUIVO.reduce((a, b) => a + b, 0);
  const lidosMb = cfg.arquivos.reduce((soma, i) => soma + MB_POR_ARQUIVO[i], 0);
  const fator = total / lidosMb;
  console.log('');
  console.log(`Você leu ${cfg.arquivos.length} de 10 arquivos (${lidosMb} MB de ${total} MB).`);
  console.log(`PROJEÇÃO para a base inteira (fator ${fator.toFixed(1)}x):`);
  console.log(`  empresas .......... ~${num(Math.round(aceitas * fator))}`);
  console.log(`  espaço no banco ... ~${(bytesEstimados * fator / 1073741824 * 1.6).toFixed(1)} GB`);
  console.log('');
  console.log('A projeção assume que os estados e CNAEs estão distribuídos por igual');
  console.log('entre os arquivos. Serve para decidir o plano, não como número exato.');
}

console.log('========================================');
if (!gravando) console.log('\nNada foi gravado. Rode de novo com --carregar quando o número estiver bom.');
