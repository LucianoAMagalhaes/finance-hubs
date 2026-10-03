# Respostas do BCB para os testes de IPCA

`bcb-focus-ipca-september-2026.json` contém a resposta real do serviço
`ExpectativaMercadoMensais`, obtida para IPCA de setembro de 2026, com
`baseCalculo = 0`, ordenação por `Data desc` e as seis últimas observações.
O teste usa a mediana mais recente, 0,56%, em vez da média de 0,5768%.

`bcb-sgs-433-2023-07-to-2024-08.json` contém o corpo original de uma resposta
real da API SGS 433, preservado sem reformatação. São 14 observações de julho
de 2023 a agosto de 2024, incluindo a deflação de -0,02% do último mês.

Origem: [API SGS 433 do BCB](https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/14?formato=json).
A resposta foi arquivada pelo Internet Archive em 11/09/2024 às 09:05:21 UTC
e recuperada em 03/10/2026 pela
[URL do corpo original](https://web.archive.org/web/20240911090521id_/https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/14?formato=json).
O modificador `id_` retorna o conteúdo arquivado sem a interface do Wayback.
O SHA-1 em Base32 do arquivo (`UPQVABZ7IEKKJZFK6DIYNFRGDK2DGRML`) foi
conferido com o digest do [índice CDX do arquivo](https://web.archive.org/cdx/search/cdx?url=api.bcb.gov.br/dados/serie/bcdata.sgs.433/*&output=json&filter=statuscode:200&collapse=urlkey&limit=10).

Essa captura histórica resolveu a pendência de resposta real gravada da #94,
apesar da falha de DNS do endpoint ao tentar baixá-la diretamente. O teste
reproduz o corpo da resposta em uma consulta pelo mesmo intervalo de meses;
a suíte nunca acessa a rede. A variação nula permanece em um teste separado
com JSON sintético, identificado pelo próprio caso de teste.
