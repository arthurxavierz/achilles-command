-- Achilles Command | migração do extrator por CNAE
-- Duas coisas novas:
--   1. prospect_lists: cada importação do extrator vira uma lista nomeada,
--      para você saber de onde veio cada contato e poder apagar tudo junto.
--   2. campos de cadastro nos prospects (CNPJ, CNAE, abertura, qualidade do
--      telefone), que o Google Places não tem e a Receita tem.
--
-- Rode este arquivo no SQL Editor do Supabase depois da migração de abordagem.

create table if not exists public.prospect_lists (
  id text primary key,
  organization_id uuid not null default public.current_organization_id() references public.organizations(id) on delete cascade,
  name text not null,
  source text not null default 'Extrator por CNAE',
  -- Guarda os filtros usados na extração para você repetir ou auditar a busca.
  filters jsonb not null default '{}'::jsonb,
  total integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prospect_lists_org_idx
  on public.prospect_lists(organization_id, created_at desc);

-- Mesmas políticas e mesmo gatilho das outras tabelas, para a nova não ficar
-- de fora do isolamento por organização.
alter table public.prospect_lists enable row level security;

drop policy if exists "org select" on public.prospect_lists;
drop policy if exists "org insert" on public.prospect_lists;
drop policy if exists "org update" on public.prospect_lists;
drop policy if exists "org delete" on public.prospect_lists;
create policy "org select" on public.prospect_lists for select using (public.is_org_member(organization_id));
create policy "org insert" on public.prospect_lists for insert with check (public.is_org_member(organization_id));
create policy "org update" on public.prospect_lists for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "org delete" on public.prospect_lists for delete using (public.is_org_member(organization_id));

drop trigger if exists prospect_lists_touch_updated_at on public.prospect_lists;
create trigger prospect_lists_touch_updated_at before update on public.prospect_lists
  for each row execute function public.touch_updated_at();

alter table public.prospects
  add column if not exists cnpj text,
  add column if not exists cnae text,
  add column if not exists cnae_code text,
  add column if not exists legal_name text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists founded_at date,
  -- mobile | landline | partial | none. Telefone do cadastro da Receita é
  -- candidato a WhatsApp, nunca WhatsApp confirmado.
  add column if not exists phone_quality text check (phone_quality in ('mobile','landline','partial','none')),
  add column if not exists list_id text references public.prospect_lists(id) on delete set null,
  add column if not exists list_name text;

-- Um CNPJ não pode virar dois contatos na mesma organização. O índice é
-- parcial porque prospect do Google Places não tem CNPJ.
create unique index if not exists prospects_org_cnpj_idx
  on public.prospects(organization_id, cnpj)
  where cnpj is not null and cnpj <> '';

create index if not exists prospects_list_idx
  on public.prospects(organization_id, list_id);

create index if not exists prospects_org_cnae_idx
  on public.prospects(organization_id, cnae_code, score desc);
