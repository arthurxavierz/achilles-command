-- Achilles Command | responsável pela empresa na base de CNPJ
--
-- Motivo: a mensagem de abordagem abre com uma saudação, e sem nome ela fica
-- impessoal ("Bom dia! Tudo bem?"). O cadastro da Receita traz quem assina
-- pela empresa, e num negócio pequeno costuma ser quem atende o telefone.
--
-- É uma aposta, não um fato: o sócio-administrador pode não ser quem atende,
-- e o cadastro pode estar velho. Por isso o nome só abre a conversa — nada é
-- afirmado sobre a pessoa, e nenhum outro dado dela é guardado.
--
-- De onde vem:
--   - Empresário Individual (natureza 2135): a razão social JÁ É a pessoa.
--   - Demais: o sócio-administrador no arquivo de Sócios da Receita.
--
-- Rode este arquivo no SQL Editor do Supabase, depois carregue com:
--   node tools/carregar-base-cnpj.mjs --apenas-responsaveis
--
-- Esse comando não refaz a carga inteira: lê só os arquivos de Empresas e de
-- Sócios (cerca de 2 GB) e preenche o campo novo nas empresas já existentes.

alter table public.cnpj_empresas
  add column if not exists responsavel text;

-- Passa a aceitar nulo porque a segunda etapa grava o responsável por cima de
-- uma empresa que pode ainda não ter razão social registrada.
alter table public.cnpj_empresas
  alter column razao_social drop not null;

-- A visão precisa ser recriada para expor a coluna nova.
drop view if exists public.cnpj_busca;

create view public.cnpj_busca as
  select
    e.cnpj,
    coalesce(nullif(e.nome_fantasia, ''), emp.razao_social) as nome,
    emp.razao_social,
    e.nome_fantasia,
    emp.responsavel,
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
