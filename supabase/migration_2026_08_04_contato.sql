-- Achilles Command | registro de abordagem enviada
-- Marca quando o prospect foi efetivamente abordado, para a fila da extensão
-- não repetir contato e para o card mostrar o histórico.

alter table public.prospects
  add column if not exists contacted_at timestamptz;

create index if not exists prospects_org_contacted_idx
  on public.prospects(organization_id, contacted_at);
