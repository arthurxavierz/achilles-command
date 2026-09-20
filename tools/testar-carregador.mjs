/* ==========================================================================
   Teste do carregador da base de CNPJ — `node tools/testar-carregador.mjs`

   Exercita o caminho `--carregar` inteiro sem tocar num Supabase real: finge
   o PostgREST e confere o que seria gravado — formato das linhas, upsert em
   vez de insert, nova tentativa depois de um erro, e se algum campo escapou
   do schema.

   Precisa dos ZIPs da competência numa pasta local, porque baixar 5 GB a
   cada teste não faz sentido. Baixe uma vez:

     Municipios.zip, Estabelecimentos1.zip, Empresas1.zip e Socios1.zip
     de https://arquivos.receitafederal.gov.br/public.php/webdav/2026-09/

   Os arquivos que faltarem viram aviso, não falha: o teste segue com o que
   houver. Quanto mais arquivos, mais caminhos ele cobre.

   e rode com a pasta:

     node tools/testar-carregador.mjs C:/caminho/da/pasta

   Sem a pasta, o teste avisa e sai sem falhar.
   ========================================================================== */
process.env.SUPABASE_URL = 'https://projeto.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-de-teste';

const recebido = { estab: [], empresas: [], cargas: [], headers: {}, tentativas: 0 };
let falharProxima = 1;

globalThis.fetch = async (url, options = {}) => {
  const href = String(url);
  if (href.includes('receitafederal')) throw new Error('nao deveria baixar: usamos --local');
  recebido.tentativas++;
  const tabela = href.split('/rest/v1/')[1]?.split('?')[0] || '?';
  recebido.headers[tabela] = options.headers;
  if (falharProxima-- > 0) return new Response('{"message":"timeout"}', { status: 503 });
  const corpo = JSON.parse(options.body);
  if (href.includes('cnpj_estabelecimentos')) recebido.estab.push(...corpo);
  else if (href.includes('cnpj_empresas')) recebido.empresas.push(...corpo);
  else if (href.includes('cnpj_base_cargas')) recebido.cargas.push(corpo);
  return new Response('', { status: 201 });
};

import { existsSync } from 'node:fs';
import { join } from 'node:path';

const pasta = process.argv[2] || process.cwd();
if (!existsSync(join(pasta, 'Estabelecimentos1.zip')) || !existsSync(join(pasta, 'Municipios.zip'))) {
  console.log(`Sem os ZIPs da Receita em ${pasta}. Veja o cabeçalho deste arquivo.`);
  process.exit(0);
}

// DF é o menor recorte possível: valida o caminho todo em poucos minutos.
process.argv = ['node', 'x', '--carregar', '--arquivos', '1', '--ufs', 'DF',
                '--local', pasta, '--lote', '500'];
await import(new URL('./carregar-base-cnpj.mjs', import.meta.url));

let falhas = 0;
const check = (n, c, e = '') => { console.log(`${c ? 'OK  ' : 'FALHA'} ${n}${e ? ' :: ' + e : ''}`); if (!c) falhas++; };

console.log('\n--- escrita ---');
check('gravou estabelecimentos', recebido.estab.length > 1000, `${recebido.estab.length} linhas`);
check('repetiu o lote apos erro 503', recebido.tentativas > recebido.estab.length / 500);
check('usa a service role', recebido.headers.cnpj_estabelecimentos?.apikey === 'service-de-teste');
check('pede upsert em vez de insert nos estabelecimentos',
  /merge-duplicates/.test(recebido.headers.cnpj_estabelecimentos?.Prefer || ''), recebido.headers.cnpj_estabelecimentos?.Prefer);
check('pede upsert tambem nas empresas',
  !recebido.empresas.length || /merge-duplicates/.test(recebido.headers.cnpj_empresas?.Prefer || ''), recebido.headers.cnpj_empresas?.Prefer);
check('gravou razoes sociais', recebido.empresas.length > 0, `${recebido.empresas.length}`);
// Duas formas convivem: a linha completa da passada de Empresas e a
// atualizacao enxuta da passada de Socios, que so leva o responsavel.
check('toda linha de empresa tem a chave',
  recebido.empresas.every(e => Number.isInteger(e.cnpj_basico)));
check('linha completa traz razao social',
  recebido.empresas.filter(e => 'razao_social' in e).every(e => typeof e.razao_social === 'string' && e.razao_social.length > 1));
check('registrou a carga', recebido.cargas.length === 1, JSON.stringify(recebido.cargas[0]).slice(0, 160));

const r = recebido.estab[0];
console.log('\nexemplo de linha gravada:', JSON.stringify(r));
// bigint nao guarda zero a esquerda; quem repoe e o padStart(14) do mapRow.
check('cnpj cabe em 14 digitos e e inteiro seguro',
  recebido.estab.every(x => Number.isSafeInteger(x.cnpj) && String(x.cnpj).length <= 14), String(r.cnpj));
check('cnpj formatado de volta tem 14 digitos',
  String(r.cnpj).padStart(14, '0').length === 14, String(r.cnpj).padStart(14, '0'));
check('cnpj_basico bate com os 8 primeiros do cnpj',
  recebido.estab.every(x => Number(String(x.cnpj).padStart(14,'0').slice(0,8)) === x.cnpj_basico));
check('tem cnpj_basico', Number.isInteger(r.cnpj_basico));
check('situacao ativa virou 2', recebido.estab.every(x => x.situacao === 2));
check('so UF pedida', recebido.estab.every(x => x.uf === 'DF'));
check('municipio preenchido', recebido.estab.every(x => x.municipio));
check('telefone_tipo respeita o CHECK do banco',
  recebido.estab.every(x => ['mobile_provavel', 'landline'].includes(x.telefone_tipo)));
check('so provavel celular (padrao)', recebido.estab.every(x => x.telefone_tipo === 'mobile_provavel'));
check('cnae_secundarios e array de numeros',
  recebido.estab.every(x => Array.isArray(x.cnae_secundarios) && x.cnae_secundarios.every(Number.isInteger)));
check('data_inicio em ISO ou nula',
  recebido.estab.every(x => x.data_inicio === null || /^\d{4}-\d{2}-\d{2}$/.test(x.data_inicio)));
check('competencia gravada', recebido.estab.every(x => x.competencia === '2026-09'));
check('sem campo fora do schema',
  recebido.estab.every(x => Object.keys(x).every(k => ['cnpj','cnpj_basico','nome_fantasia','cnae','cnae_secundarios','uf','municipio','bairro','logradouro','cep','situacao','data_inicio','telefone','telefone_tipo','email','competencia'].includes(k))),
  Object.keys(r).join(','));


console.log('');
console.log('--- responsavel ---');
const comResp = recebido.empresas.filter(e => e.responsavel);
const soResp = recebido.empresas.filter(e => e.responsavel && !('razao_social' in e));
const porEI = recebido.empresas.filter(e => e.responsavel && 'razao_social' in e);
check('alguma empresa recebeu responsavel', comResp.length > 0, `${comResp.length} de ${recebido.empresas.length}`);
check('responsavel nunca vem vazio', comResp.every(e => String(e.responsavel).trim().length > 2));
check('Empresario Individual usa a propria razao social',
  porEI.every(e => e.responsavel === e.razao_social), `${porEI.length} casos`);
check('atualizacao vinda de Socios manda so a chave e o nome',
  soResp.every(e => Object.keys(e).sort().join(',') === 'cnpj_basico,responsavel'),
  soResp.length ? Object.keys(soResp[0]).join(',') : '(nenhuma)');
check('nenhuma empresa recebe dado extra da pessoa',
  recebido.empresas.every(e => !('cpf' in e) && !('socio_cpf' in e) && !('idade' in e)));
console.log('exemplos:', comResp.slice(0, 4).map(e => e.responsavel).join(' | '));

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTudo passou');
process.exitCode = falhas ? 1 : 0;
