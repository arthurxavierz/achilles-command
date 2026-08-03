-- Execute depois de criar seu usuário em Authentication > Users.
-- Substitua o e-mail e rode no SQL Editor.

do $$
declare
  target_user uuid;
  org uuid;
begin
  select id into target_user from auth.users where email = 'arthur@achillesmedia.com.br' limit 1;
  if target_user is null then
    raise exception 'Crie o usuário no Supabase Auth antes de executar este script.';
  end if;

  insert into public.organizations(name, slug)
  values ('Achilles Media', 'achilles-media')
  on conflict (slug) do update set name = excluded.name
  returning id into org;

  insert into public.organization_members(organization_id, user_id, role)
  values (org, target_user, 'admin')
  on conflict (organization_id, user_id) do update set role = 'admin';
end $$;
