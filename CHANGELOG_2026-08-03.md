# Changelog 2026-08-03

- Substituído OpenStreetMap/Overpass como fonte comercial principal por Google Places API (New).
- Mantido OpenStreetMap apenas como mapa visual de apoio.
- Incluídos telefone, website, rating, volume de avaliações e status retornados pelo Google.
- Adicionados scores de Site, Posicionamento digital e Automação / IA.
- Adicionado campo de melhor encaixe comercial.
- Melhorado tratamento de erro quando uma Function retorna HTML em vez de JSON.
- Criada migration `migration_2026_08_03_google_places.sql`.
- Atualizados guia de implantação, arquitetura, custos e `.env.example`.
