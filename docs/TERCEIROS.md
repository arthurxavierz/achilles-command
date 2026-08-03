# Componentes de terceiros

## Google Places API (New)

A captação usa a Places API (New) no backend do Achilles Command, por meio da Netlify Function:

```text
netlify/functions/prospect-search.mjs
```

A chave fica somente no Netlify como `GOOGLE_PLACES_API_KEY`.

O sistema solicita apenas os campos necessários para a tela de prospecção, como nome, telefone publicado, site, endereço, nota e quantidade de avaliações. Consulte o guia de implantação antes de ativar a API e mantenha a atribuição `Google Maps` visível na interface quando dados do Places forem exibidos.

## OpenStreetMap / Nominatim

O Nominatim é usado apenas como apoio para localizar aproximadamente o centro da cidade informada e aplicar o raio da busca. Se essa consulta falhar, a pesquisa continua usando cidade e UF diretamente no texto enviado ao Google Places.

## Leaflet / OpenStreetMap

A interface atual ainda possui Leaflet para recursos cartográficos gerais do Command. Não misture conteúdo do Google Places em um mapa não-Google caso altere a visualização geográfica; consulte as políticas atuais do Google Maps Platform antes de modificar essa parte.

## Observação

Serviços externos, limites e termos podem mudar. Antes de redistribuir o Command para terceiros ou aumentar o volume, confira a documentação e os termos vigentes dos provedores.
