# Resumo da atualização 03/08/2026

## Captação comercial

- motor principal alterado de OpenStreetMap/Overpass para Google Places API (New);
- busca por segmento, cidade, UF, raio e até 60 resultados por consulta;
- telefone, site, endereço, avaliação e volume de avaliações quando publicados;
- score geral Achilles e scores separados para Site, Posicionamento Digital e Automação/IA;
- indicação automática do melhor encaixe comercial;
- enriquecimento adicional pelo site público da empresa;
- editor de abordagem e geração com Claude continuam preparados;
- abertura manual do WhatsApp continua sendo o padrão;
- tratamento melhorado quando uma Function retorna HTML ou erro de configuração.

## Supabase

Para banco que já estava configurado, execute apenas:

```text
supabase/migration_2026_08_03_google_places.sql
```

Não é necessário recriar o banco.

## Netlify

Nova variável obrigatória para a captação:

```text
GOOGLE_PLACES_API_KEY
```

A chave deve ficar somente no Netlify e nunca no `config.js`.

## Preservado nesta atualização

- `config.js` atual;
- `.gitignore` atual;
- `supabase/seed.sql` atual;
- histórico `.git` do projeto;
- Supabase já configurado;
- CRM, propostas, projetos, conversas e demais módulos existentes.

## Próximas etapas

1. configurar e validar Google Places;
2. configurar Claude API;
3. manter WhatsApp manual inicialmente e ativar Cloud API apenas se necessário.
