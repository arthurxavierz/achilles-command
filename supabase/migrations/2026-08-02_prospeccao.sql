-- Achilles Command - módulo de Prospecção
-- Execute este arquivo no SQL Editor do Supabase se o banco já existia antes
-- da atualização de 02/08/2026. Para projeto novo, use ../schema.sql.

create table if not exists public.prospecting_runs (
  id text primary key,
  organization_id uuid not null default public.current_organization_id() references public.organizations(id) on delete cascade,
  search_term text not null,
  city text not null,
  status text not null default 'running' check (status in ('pending','running','completed','failed')),
  result_count integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.prospects (
  id text primary key,
  organization_id uuid not null default public.current_organization_id() references public.organizations(id) on delete cascade,
  run_id text references public.prospecting_runs(id) on delete set null,
  source_id text,
  company text not null,
  category text,
  phone text,
  emails jsonb not null default '[]'::jsonb,
  website text,
  address text,
  maps_url text,
  latitude double precision,
  longitude double precision,
  rating numeric(3,2) not null default 0,
  review_count integer not null default 0,
  score integer not null default 0 check (score between 0 and 100),
  score_reason text,
  status text not null default 'new' check (status in ('new','shortlisted','contacted','imported','ignored')),
  suggested_message text,
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists prospects_touch_updated_at on public.prospects;
create trigger prospects_touch_updated_at
before update on public.prospects
for each row execute function public.touch_updated_at();

alter table public.prospecting_runs enable row level security;
alter table public.prospects enable row level security;

do $$
declare t text;
begin
  foreach t in array array['prospecting_runs','prospects'] loop
    execute format('drop policy if exists "org select" on public.%I', t);
    execute format('drop policy if exists "org insert" on public.%I', t);
    execute format('drop policy if exists "org update" on public.%I', t);
    execute format('drop policy if exists "org delete" on public.%I', t);
    execute format('create policy "org select" on public.%I for select using (public.is_org_member(organization_id))', t);
    execute format('create policy "org insert" on public.%I for insert with check (public.is_org_member(organization_id))', t);
    execute format('create policy "org update" on public.%I for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id))', t);
    execute format('create policy "org delete" on public.%I for delete using (public.is_org_member(organization_id))', t);
  end loop;
end $$;

create index if not exists prospects_org_score_idx on public.prospects(organization_id, score desc);
create index if not exists prospects_org_status_idx on public.prospects(organization_id, status, created_at desc);
create index if not exists prospects_source_id_idx on public.prospects(organization_id, source_id);
create index if not exists prospecting_runs_org_created_idx on public.prospecting_runs(organization_id, created_at desc);
