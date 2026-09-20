# Componentes de terceiros

## Google Places API (New)

A captação usa a Places API (New) no backend do Achilles Command, por meio da Netlify Function:

```text
netlify/functions/prospect-search.mjs
```

A chave fica somente no Netlify como `GOOGLE_PLACES_API_KEY`.

O sistema solicita apenas os campos necessários para a tela de prospecção, como nome, telefone publicado, site, endereço, nota e quantidade de avaliações. Consulte o guia de implantação antes de ativar a API e mantenha a atribuição `Google Maps` visível na interface quando dados do Places forem exibidos.

## CNPJá (extrator por CNAE)

O extrator por CNAE consulta o cadastro público de CNPJ pela API do CNPJá, por meio da Netlify Function:

```text
netlify/functions/cnae-search.mjs
```

O token fica somente no Netlify como `CNPJA_TOKEN`. A Function usa o endpoint de listagem de estabelecimentos, filtrando por CNAE, unidade federativa, município, situação cadastral, existência de telefone e período de abertura.

A cobrança do CNPJá é por registro lido, e não por registro importado: o campo "Limite" da tela é o controle de custo. Confira o plano contratado e os termos vigentes antes de aumentar o volume.

Telefone obtido dessa base é o número declarado pela empresa à Receita Federal. A base não informa se o número tem WhatsApp ativo, e a interface trata esse dado como candidato a WhatsApp, nunca como contato confirmado.

## IBGE — tabela CNAE e municípios

A lista de subclasses da CNAE 2.3 é baixada da API do IBGE por `tools/gerar-cnae.mjs` e versionada em `assets/cnae.json`, para a busca do extrator funcionar sem depender do IBGE em tempo real.

A lista de municípios é consultada na API de localidades do IBGE, usada para sugerir cidades na interface e para converter o nome da cidade no código usado pelo filtro.

## OpenStreetMap / Nominatim

O Nominatim é usado apenas como apoio para localizar aproximadamente o centro da cidade informada e aplicar o raio da busca. Se essa consulta falhar, a pesquisa continua usando cidade e UF diretamente no texto enviado ao Google Places.

## Leaflet / OpenStreetMap

A interface atual ainda possui Leaflet para recursos cartográficos gerais do Command. Não misture conteúdo do Google Places em um mapa não-Google caso altere a visualização geográfica; consulte as políticas atuais do Google Maps Platform antes de modificar essa parte.

## Observação

Serviços externos, limites e termos podem mudar. Antes de redistribuir o Command para terceiros ou aumentar o volume, confira a documentação e os termos vigentes dos provedores.
