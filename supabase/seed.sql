-- Execute depois de schema.sql e bootstrap_user.sql.
do $$
declare
  org uuid;
begin
  select id into org from public.organizations where slug = 'achilles-media' limit 1;
  if org is null then
    raise exception 'Execute bootstrap_user.sql antes deste arquivo.';
  end if;

  insert into public.services(id, organization_id, name, base_price, description) values
    ('svc_1',org,'Landing page',1500,'Página com foco em conversão.'),
    ('svc_2',org,'Site profissional',2400,'Presença digital institucional.'),
    ('svc_3',org,'Chatbot',2800,'Atendimento e qualificação automatizados.'),
    ('svc_4',org,'Sistema de gestão',6500,'Sistema sob medida para operação.'),
    ('svc_5',org,'Automação de processo',3200,'Integrações e fluxos operacionais.')
  on conflict (id) do nothing;

  insert into public.automations(id, organization_id, name, description, active, executions, success, last_run, webhook) values
    ('auto_1',org,'Entrada de lead','Valida, registra e classifica novos contatos.',true,0,100,'Nunca','lead-intake'),
    ('auto_2',org,'Qualificação comercial','Analisa a necessidade e sugere a próxima pergunta.',true,0,100,'Nunca','lead-qualification'),
    ('auto_3',org,'Fila de mensagens','Prepara campanhas para envio manual ou oficial.',true,0,100,'Nunca','message-queue'),
    ('auto_4',org,'Follow-up programado','Cria tarefas quando uma proposta fica sem resposta.',true,0,100,'Nunca','follow-up'),
    ('auto_5',org,'Relatório gerencial','Consolida indicadores e pontos de atenção.',false,0,100,'Nunca','weekly-report')
  on conflict (id) do nothing;
end $$;

-- id organization 4f2a2655-6f56-42cc-8dc7-8675dadfdfa2