# Respostas do BCB para os testes de IPCA

`bcb-focus-ipca-september-2026.json` contém a resposta real do serviço
`ExpectativaMercadoMensais`, obtida para IPCA de setembro de 2026, com
`baseCalculo = 0`, ordenação por `Data desc` e as seis últimas observações.
O teste usa a mediana mais recente, 0,56%, em vez da média de 0,5768%.

O teste da série SGS 433 usa JSON representativo. Os valores de julho de 2026
(0,07%) e agosto de 2026 (-0,32%) foram conferidos na resposta real do
[portal SGS do BCB](https://www3.bcb.gov.br/sgspub/consultarvalores/consultarValoresSeries.do?method=consultarValores&series=433).
O exemplo de setembro com zero é sintético, para testar variação nula.

Falta substituir esse exemplo por uma resposta JSON real gravada da série 433,
como pede a issue #94. O host `api.bcb.gov.br` retornou falha de DNS mesmo fora
do sandbox durante esta implementação. Portanto, os testes validam a tradução,
a deflação e as falhas de formato, mas a captura do formato real da série 433
continua pendente. A fixture do Focus foi capturada sem essa limitação.
