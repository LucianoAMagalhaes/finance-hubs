# Ocorrências são derivadas, nunca gravadas

Um lançamento parcelado ou recorrente impacta vários meses. Gravamos **um único lançamento** e
calculamos as suas ocorrências mensais na hora de montar cada mês, em vez de materializar uma
linha por mês. Parcelado e recorrente compartilham a mesma máquina, diferindo apenas em o valor
ser **dividido** entre os meses ou **repetido** em cada um.

## Considered Options

A alternativa era **materializar as ocorrências**: gravar as doze linhas de R$ 100 no momento da
compra. Ela permite tratar cada parcela individualmente, e foi rejeitada porque doze cópias do
mesmo fato divergem — corrige-se o valor de uma e as outras onze passam a mentir, sem nada no
sistema sinalizando a contradição. Com a derivação, essa divergência é impossível por construção.

## Consequences

- Não existe onde pendurar exceção por ocorrência. "Antecipei a parcela de agosto" e "essa foi
  estornada" não cabem neste modelo sem transformá-lo no modelo materializado.
- Um recorrente não tem fim definido, então a derivação precisa de um horizonte explícito: até
  onde no futuro ela projeta.
- De graça: um mês futuro já nasce sabendo o que tem comprometido, antes de qualquer lançamento
  manual, porque as ocorrências dele são calculadas a partir de lançamentos que já existem.
