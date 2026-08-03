-- Achilles Command
-- Execute este arquivo no SQL Editor do Supabase.

create extension if not exists "pgcrypto";

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin','manager','member','viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id
  from public.organization_members
  where user_id = auth.uid()
  order by created_at asc
  limit 1;
$$;

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = org_id and user_id = auth.uid()
  );
$$;

create table if not exists public.leads (
  id text primary key,
  organization_id uuid not null default public.current_organization_id() references public.organizations(id) on delete cascade,
  company text not null,
  contact text not null,
  phone text,
  email text,
  service text,
  source text,
  stage text not null default 'new' check (stage in ('new','diagnosis','proposal','negotiation','won','lost')),
  score integer not null default 50 check (score between 0 and 100),
  value numeric(12,2) not null default 0,
  last_contact date,
  next_action text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


create table if not exists public.prospects (
  id text primary key,
  organization_id uuid not null default public.current_organization_id() references public.organizations(id) on delete cascade,
  source text not null default 'Google Places',
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
  rating numeric(3,2),
  user_rating_count integer not null default 0,
  business_status text,
  site_score integer check (site_score between 0 and 100),
  digital_score integer check (digital_score between 0 and 100),
  automation_score integer check (automation_score between 0 and 100),
  recommended_service text,
  score integer not null default 50 check (score between 0 and 100),
  score_band text,
  score_reasons jsonb not null default '[]'::jsonb,
  crm_lead_id text references public.leads(id) on delete set null,
  last_enriched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id text primary key,
  organization_id uuid not null default public.current_organization_id() references public.organizations(id) on delete cascade,
  lead_id text references public.leads(id) on delete set null,
  name text not null,
  company text,
  phone text,
  status text not null default 'human' check (status in ('bot','human','paused')),
  unread integer not null default 0,
  last_at text,
  summary text,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id text primary key,
  organization_id uuid not null default public.current_organization_id() references public.organizations(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft','ready','running','completed','paused')),
  audience text,
  message text not null,
  total integer not null default 0,
  sent integer not null default 0,
  replies integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.message_queue (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id() references public.organizations(id) on delete cascade,
  campaign_id text references public.campaigns(id) on delete set null,
  lead_id text references public.leads(id) on delete set null,
  channel text not null default 'manual_whatsapp' check (channel in ('manual_whatsapp','whatsapp_cloud','email','webchat')),
  destination text not null,
  message text not null,
  status text not null default 'pending' check (status in ('pending','approved','processing','sent','failed','cancelled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  external_id text,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id text primary key,
  organization_id uuid not null default public.current_organization_id() references public.organizations(id) on delete cascade,
  client text not null,
  name text not null,
  status text not null default 'planning' check (status in ('planning','active','review','waiting','completed','cancelled')),
  progress integer not null default 0 check (progress between 0 and 100),
  due date,
  value numeric(12,2) not null default 0,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proposals (
  id text primary key,
  organization_id uuid not null default public.current_organization_id() references public.organizations(id) on delete cascade,
  lead_id text references public.leads(id) on delete set null,
  client text not null,
  service text not null,
  value numeric(12,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','review','sent','accepted','rejected','expired')),
  valid_until date,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id text primary key,
  organization_id uuid not null default public.current_organization_id() references public.organizations(id) on delete cascade,
  title text not null,
  -- Vínculo real com o projeto. A coluna "project" continua como rótulo
  -- legível, mas o que liga de verdade é project_id: antes o vínculo era
  -- só uma string livre, o que impedia calcular progresso e órfã tarefas
  -- quando o projeto era renomeado.
  project_id text references public.projects(id) on delete set null,
  project text,
  -- Responsável pela tarefa. Sem esta coluna o sistema assumia um único
  -- operador e não havia como designar trabalho nem auditar quem fez o quê.
  assignee uuid references auth.users(id) on delete set null,
  due date,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_project_id_idx on public.tasks(project_id);
create index if not exists tasks_assignee_idx on public.tasks(assignee);

create table if not exists public.automations (
  id text primary key,
  organization_id uuid not null default public.current_organization_id() references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  executions integer not null default 0,
  success integer not null default 100,
  last_run text,
  webhook text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id text primary key,
  organization_id uuid not null default public.current_organization_id() references public.organizations(id) on delete cascade,
  name text not null,
  base_price numeric(12,2) not null default 0,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  organization_id uuid primary key default public.current_organization_id() references public.organizations(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id text primary key,
  organization_id uuid not null default public.current_organization_id() references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  time_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','prospects','conversations','campaigns','projects','proposals','tasks','automations']
  LOOP
    EXECUTE format('drop trigger if exists %I_touch_updated_at on public.%I', t, t);
    EXECUTE format('create trigger %I_touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  END LOOP;
END $$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.leads enable row level security;
alter table public.prospects enable row level security;
alter table public.conversations enable row level security;
alter table public.campaigns enable row level security;
alter table public.message_queue enable row level security;
alter table public.projects enable row level security;
alter table public.proposals enable row level security;
alter table public.tasks enable row level security;
alter table public.automations enable row level security;
alter table public.services enable row level security;
alter table public.app_settings enable row level security;
alter table public.activities enable row level security;

drop policy if exists "members read organizations" on public.organizations;
drop policy if exists "members read memberships" on public.organization_members;
create policy "members read organizations" on public.organizations for select using (public.is_org_member(id));
create policy "members read memberships" on public.organization_members for select using (user_id = auth.uid());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['leads','prospects','conversations','campaigns','message_queue','projects','proposals','tasks','automations','services','app_settings','activities']
  LOOP
    EXECUTE format('drop policy if exists "org select" on public.%I', t);
    EXECUTE format('drop policy if exists "org insert" on public.%I', t);
    EXECUTE format('drop policy if exists "org update" on public.%I', t);
    EXECUTE format('drop policy if exists "org delete" on public.%I', t);
    EXECUTE format('create policy "org select" on public.%I for select using (public.is_org_member(organization_id))', t);
    EXECUTE format('create policy "org insert" on public.%I for insert with check (public.is_org_member(organization_id))', t);
    EXECUTE format('create policy "org update" on public.%I for update using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id))', t);
    EXECUTE format('create policy "org delete" on public.%I for delete using (public.is_org_member(organization_id))', t);
  END LOOP;
END $$;

create index if not exists prospects_org_score_idx on public.prospects(organization_id, score desc);
create index if not exists prospects_org_created_idx on public.prospects(organization_id, created_at desc);
create index if not exists leads_org_stage_idx on public.leads(organization_id, stage);
create index if not exists leads_org_last_contact_idx on public.leads(organization_id, last_contact desc);
create index if not exists conversations_org_updated_idx on public.conversations(organization_id, updated_at desc);
create index if not exists queue_org_status_idx on public.message_queue(organization_id, status, scheduled_at);
create index if not exists projects_org_status_idx on public.projects(organization_id, status);
create index if not exists tasks_org_due_idx on public.tasks(organization_id, done, due);
