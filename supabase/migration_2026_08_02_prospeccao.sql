-- Achilles Command | migração da captação nativa
-- Use este arquivo se o banco do Achilles Command JÁ EXISTE.

create table if not exists public.prospects (
  id text primary key,
  organization_id uuid not null default public.current_organization_id() references public.organizations(id) on delete cascade,
  source text not null default 'OpenStreetMap',
  source_id text,
  name text not null,
  category text,
  address text,
  phone text,
  whatsapp text,
  email text,
  website text,
  instagram text,
  facebook text,
  latitude double precision,
  longitude double precision,
  distance_km numeric(8,2),
  map_url text,
  google_url text,
  score integer not null default 50 check (score between 0 and 100),
  score_band text,
  score_reasons jsonb not null default '[]'::jsonb,
  crm_lead_id text references public.leads(id) on delete set null,
  last_enriched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.prospects enable row level security;

drop trigger if exists prospects_touch_updated_at on public.prospects;
create trigger prospects_touch_updated_at
before update on public.prospects
for each row execute function public.touch_updated_at();

drop policy if exists "org select" on public.prospects;
drop policy if exists "org insert" on public.prospects;
drop policy if exists "org update" on public.prospects;
drop policy if exists "org delete" on public.prospects;

create policy "org select" on public.prospects
for select using (public.is_org_member(organization_id));
create policy "org insert" on public.prospects
for insert with check (public.is_org_member(organization_id));
create policy "org update" on public.prospects
for update using (public.is_org_member(organization_id))
with check (public.is_org_member(organization_id));
create policy "org delete" on public.prospects
for delete using (public.is_org_member(organization_id));

create index if not exists prospects_org_score_idx on public.prospects(organization_id, score desc);
create index if not exists prospects_org_created_idx on public.prospects(organization_id, created_at desc);
