# Antecipação é evento do parcelado, não ajuste por ocorrência

O ADR-0002 deixou prevista uma porta para as exceções por ocorrência: um **ajuste esparso por
(lançamento, mês)** por cima da derivação. Quando os três casos chegaram (antecipar parcela,
estornar uma parcela, pular um mês de recorrente), nenhum deles pediu esse mecanismo. A antecipação
virou um **evento do parcelado** com três dados: data, quantas parcelas e valor pago. Ela leva as
**últimas** N parcelas que ainda sobram e põe o valor pago no mês da antecipação. O estorno de uma
parcela é um reembolso, e pular um mês de recorrente não tem gesto: quem pausa encerra e lança de
novo.

O que decidiu foi o gesto real. No cartão brasileiro, ninguém escolhe "a parcela de agosto": num
mês, antecipam-se as últimas N por um valor com desconto. Modelar exatamente isso cabe na derivação
como "a série acaba antes e ganha uma ocorrência extra", e não deixa existir um estado que o banco
não produz, como a 5/10 antecipada com a 10/10 ainda em aberto.

## Considered Options

**Ajuste esparso por (lançamento, mês)**, como o KMyMoney e o Actual. Rejeitado. Ele permite mover e
revalorar qualquer parcela, e isso é generalidade que ninguém usa. Além disso, o desconto de uma
antecipação de três parcelas precisaria ser dividido entre três ajustes.

**Ignorar a antecipação** e lançar o desconto como reembolso. Rejeitado. O app espalha o parcelado
porque é assim que o dinheiro sai. Se a antecipação não movesse o dinheiro, os meses de onde as
parcelas saíram mostrariam compromisso já pago, e a pessoa veria estouro fantasma.

**Mês pulado como fato da recorrência.** Rejeitado. Pausar uma assinatura é raro, e "encerrar e
lançar de novo" já resolve, ao custo de redigitar.

## Consequences

- Só se antecipam parcelas de meses **posteriores** ao da antecipação. O mesmo parcelado aceita
  várias antecipações, e cada uma corta a série pelo fim.
- A antecipação não tem pote, tipo de pagamento nem tag: herda os do parcelado e os acompanha
  quando mudam. Assim, "quanto custou essa compra" continua tendo resposta num lugar só.
- Enquanto houver antecipação, **data, total, número de parcelas e forma** do parcelado ficam
  travados. Corrigir esses campos exige desfazer a antecipação antes.
- Uma antecipação desfeita vai para a lixeira. Restaurá-la revalida contra o parcelado como ele
  está, e recusa se as parcelas não couberem mais.
- Continua não existindo lugar para exceção arbitrária por ocorrência. Se um dia aparecer um caso
  que nem reembolso nem antecipação resolvem, a porta do ajuste esparso continua aberta.
