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

**Revisado contra o prior art.** Quase todo app de finanças materializa (Firefly III, GnuCash,
KMyMoney, Actual, YNAB, Organizze, openmonetis), no padrão híbrido: template guardado, futuro
derivado, ocorrência gravada quando "vira fato". Mas nesses apps o fato é sempre um evento externo
— conciliar com o extrato, confirmar o agendamento, fechar a fatura. Este app não concilia com
banco e não fecha mês, então não há evento nenhum; materializar exigiria inventar um gatilho
(escrita disparada por leitura). A derivação pura foi mantida. E quem materializa paga com a
recorrência indefinida: precisa saber quantas linhas gravar.

## Consequences

- Não existe onde pendurar exceção por ocorrência. "Antecipei a parcela de agosto" e "essa foi
  estornada" não cabem no modelo como está. Se um dia vierem, entram como **ajuste esparso** por
  (lançamento, mês) por cima da derivação — como o KMyMoney e o Actual fizeram — sem trocar de
  modelo.
- **Não há horizonte.** A pergunta é sempre "o que cai no mês M", respondida por lançamento com uma
  conta fechada (o mês está dentro da série?), nunca listando ocorrências. Um recorrente sem fim
  não custa nada.
- O parcelado guarda o **total**, não a parcela; a divisão acontece na leitura, com o centavo que
  sobra na primeira parcela, de modo que a soma das parcelas é sempre o total.
- Um recorrente muda de valor por **vigências** ligadas, não cortando a série em dois lançamentos
  soltos como faz o prior art: editar num mês vale dali até a próxima mudança, e apagar num mês
  precisa levar junto as vigências seguintes — por isso elas não podem ser independentes.
- De graça: um mês futuro já nasce sabendo o que tem comprometido, antes de qualquer lançamento
  manual, porque as ocorrências dele são calculadas a partir de lançamentos que já existem.
