# Recorte dos preços do Tesouro Direto

`treasury-prices.csv` contém linhas preservadas do [CSV oficial do Tesouro Transparente](https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv), baixado em 03/10/2026.

O recorte inclui as datas-base de 01/10/2026 e 02/10/2026, vírgulas decimais, dois títulos na data-base mais recente e o Tesouro Prefixado com vencimento em 01/01/2008. Inclui também uma linha histórica com PU de venda zero, que não deve invalidar a lista atual. O PU de venda difere do PU de compra para conferir qual preço é traduzido.
