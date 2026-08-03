-- Achilles Command | migração da abordagem de captação
-- Guarda a mensagem editada e a observação usada para gerar com o Claude,
-- para que o botão de WhatsApp abra sempre com o texto aprovado por você.

alter table public.prospects
  add column if not exists approach_message text,
  add column if not exists approach_note text;
