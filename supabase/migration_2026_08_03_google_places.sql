-- Achilles Command | migração Google Places + scoring comercial
-- Execute este arquivo se você já rodou a migração de prospecção anterior.

alter table public.prospects
  alter column source set default 'Google Places';

alter table public.prospects
  add column if not exists rating numeric(3,2),
  add column if not exists user_rating_count integer not null default 0,
  add column if not exists business_status text,
  add column if not exists site_score integer check (site_score between 0 and 100),
  add column if not exists digital_score integer check (digital_score between 0 and 100),
  add column if not exists automation_score integer check (automation_score between 0 and 100),
  add column if not exists recommended_service text;

create index if not exists prospects_org_service_idx
  on public.prospects(organization_id, recommended_service, score desc);
