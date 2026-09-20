-- Achilles Command | base própria de CNPJ para o extrator por CNAE
--
-- Guarda no seu Supabase um recorte do cadastro público da Receita Federal,
-- para o extrator buscar empresas sem depender de API paga e sem custo por
-- consulta. Quem carrega os dados é tools/carregar-base-cnpj.mjs.
--
-- Esta tabela é um espelho de dado público. Ela NÃO é multi-organização:
-- CNPJ da Receita é o mesmo para todo mundo, e duplicar por organização só
-- gastaria espaço. Por isso ela fica fora do padrão das outras tabelas:
-- leitura liberada para qualquer usuário autenticado, escrita só pela
-- service role (o carregador).
--
-- Rode este arquivo no SQL Editor do Supabase.

-- Tipos numéricos onde dá, porque o volume aqui é alto e cada byte por linha
-- vira centenas de MB no total.
-- Razão social mora aqui, e não junto do estabelecimento, porque ela é da
-- empresa: uma matriz com 12 filiais repetiria o mesmo texto 13 vezes. Além
-- disso, o nome fantasia vem preenchido em apenas 30% dos estabelecimentos
-- (medido no arquivo de setembro/2026), então sem a razão social a maioria
-- dos contatos chegaria sem nome na tela.
create table if not exists public.cnpj_empresas (
  cnpj_basico integer primary key,
  razao_social text not null,
  -- 01 = ME, 03 = EPP, 05 = Demais. 00 = não informado.
  porte smallint
);

create table if not exists public.cnpj_estabelecimentos (
  -- CNPJ completo, 14 dígitos, como número. Ocupa 8 bytes no lugar de 15.
  cnpj bigint primary key,
  -- Os 8 primeiros dígitos, que ligam o estabelecimento à empresa.
  cnpj_basico integer not null,
  nome_fantasia text,
  cnae integer not null,
  -- CNAEs secundários, para o filtro "incluir CNAE secundário" da tela.
  cnae_secundarios integer[] not null default '{}',
  uf char(2) not null,
  -- Nome do município já em maiúsculas e sem acento, como a Receita entrega.
  -- Guardamos o nome, e não o código: o da Receita não é o código do IBGE, e
  -- a tela manda o nome que a pessoa escolheu.
  municipio text not null,
  bairro text,
  logradouro text,
  cep text,
  -- 02 = Ativa. Guardado para o filtro "somente ativas" continuar existindo
  -- mesmo que um dia o carregador traga empresas baixadas.
  situacao smallint not null,
  data_inicio date,
  -- Telefone em 55 + DDD + número, exatamente como está no cadastro.
  -- ATENÇÃO: a Receita guarda só 8 dígitos. O 9º dígito do celular não existe
  -- nesta base (conferido: 910 mil telefones de 8 dígitos, zero de 9), e as
  -- APIs pagas leem a mesma base, então devolvem o mesmo número truncado.
  telefone bigint,
  -- Na numeração antiga, celular começava com 6-9 e fixo com 2-5. Por isso
  -- 'mobile_provavel': é inferência pelo primeiro dígito, não confirmação.
  -- A reconstrução do 9º dígito acontece na hora de abrir a conversa.
  telefone_tipo text check (telefone_tipo in ('mobile_provavel','landline')),
  email text,
  -- Competência do arquivo da Receita que gerou a linha (ex.: '2026-09').
  -- Serve para você saber a idade do dado e para o carregador substituir a
  -- carga anterior sem apagar tudo antes.
  competencia text not null
);

-- O extrator sempre filtra por UF + CNAE. Município e data entram como
-- refinamento, então vêm depois na ordem do índice.
create index if not exists cnpj_estab_busca_idx
  on public.cnpj_estabelecimentos(uf, cnae, municipio, data_inicio);

-- Para o filtro "incluir CNAE secundário": GIN é o índice que resolve
-- "algum destes códigos está no array".
create index if not exists cnpj_estab_cnae_sec_idx
  on public.cnpj_estabelecimentos using gin(cnae_secundarios);

create index if not exists cnpj_estab_competencia_idx
  on public.cnpj_estabelecimentos(competencia);

create index if not exists cnpj_estab_basico_idx
  on public.cnpj_estabelecimentos(cnpj_basico);

-- O extrator lê esta visão, não as tabelas. Assim a junção com a razão social
-- fica resolvida no banco e a Function continua fazendo uma consulta só.
create or replace view public.cnpj_busca as
  select
    e.cnpj,
    coalesce(nullif(e.nome_fantasia, ''), emp.razao_social) as nome,
    emp.razao_social,
    e.nome_fantasia,
    emp.porte,
    e.cnae,
    e.cnae_secundarios,
    e.uf,
    e.municipio,
    e.bairro,
    e.logradouro,
    e.cep,
    e.situacao,
    e.data_inicio,
    e.telefone,
    e.telefone_tipo,
    e.email,
    e.competencia
  from public.cnpj_estabelecimentos e
  left join public.cnpj_empresas emp on emp.cnpj_basico = e.cnpj_basico;

-- Sem isto a visão rodaria com os privilégios de quem a criou e passaria por
-- cima do RLS das tabelas de baixo.
alter view public.cnpj_busca set (security_invoker = on);

alter table public.cnpj_estabelecimentos enable row level security;
alter table public.cnpj_empresas enable row level security;

-- Leitura para qualquer usuário logado no Command; escrita só pela service
-- role, que ignora RLS e é usada apenas pelo carregador, nunca pelo navegador.
drop policy if exists "leitura autenticada" on public.cnpj_estabelecimentos;
create policy "leitura autenticada" on public.cnpj_estabelecimentos
  for select to authenticated using (true);

drop policy if exists "leitura autenticada" on public.cnpj_empresas;
create policy "leitura autenticada" on public.cnpj_empresas
  for select to authenticated using (true);

-- Registro de cada carga: o que foi importado, quando e com quais filtros.
-- É o que a tela usa para avisar a idade da base.
create table if not exists public.cnpj_base_cargas (
  id bigserial primary key,
  competencia text not null,
  ufs text[] not null,
  -- CNAEs carregados. Vazio significa "todos". A Function usa esta lista para
  -- avisar quando você pedir algo que não está na base.
  cnaes integer[] not null default '{}',
  somente_celular boolean not null default true,
  somente_ativas boolean not null default true,
  total_linhas bigint not null default 0,
  iniciada_em timestamptz not null default now(),
  concluida_em timestamptz
);

alter table public.cnpj_base_cargas enable row level security;

drop policy if exists "leitura autenticada" on public.cnpj_base_cargas;
create policy "leitura autenticada" on public.cnpj_base_cargas
  for select to authenticated using (true);
