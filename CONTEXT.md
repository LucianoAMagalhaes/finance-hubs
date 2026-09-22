# Orçamento Doméstico

Orçamento doméstico pessoal de um único usuário, organizado pelo método dos 6 potes. A pergunta
que este contexto existe para responder é: _neste mês, quanto cada pote recebeu, qual era o seu
limite, e estourei — por quanto?_

## Language

### O orçamento

**Pote**:
Uma das seis divisões fixas do orçamento: Custos Fixos, Liberdade Financeira, Conforto, Metas,
Conhecimento e Prazeres. A lista é do app, não do usuário.
_Code_: `Jar`; os seis: `fixed-costs`, `financial-freedom`, `comfort`, `goals`, `knowledge`, `pleasures`
_Avoid_: Categoria, envelope, jarro, rubrica

**Receita do mês**:
Quanto entrou num mês: a soma das entradas daquele mês. Nunca é digitada — lançar, editar ou apagar
uma entrada move todos os limites daquele mês.
_Code_: `monthIncome`
_Avoid_: Renda, salário, faturamento

**Percentual**:
A fatia da receita do mês que um pote reivindica, um inteiro de 0 a 100. É o número que a pessoa
edita. Os seis percentuais de um mês somam no máximo 100.
_Code_: `percentage`
_Avoid_: Alocação, proporção, fatia

**Limite**:
O valor em reais que um pote pode receber num mês, sempre derivado: `percentual × receita do mês`.
Nunca é digitado diretamente.
_Code_: `limit`
_Avoid_: Teto, valor orçado, budget

**Não alocado**:
A parte da receita do mês que nenhum pote reivindica — 100% menos a soma dos percentuais. Nunca é
negativo.
_Code_: `unallocated`

**Orçamento do mês**:
A fotografia de um mês: seus seis percentuais. Cada mês tem o seu, independente de todos os outros.
A receita não está na fotografia porque é derivada das entradas. Nasce no primeiro registro do mês,
copiando o mês anterior mais recente que já tem o seu; antes disso, o mês só mostra o que herdaria.
_Code_: `MonthBudget`
_Avoid_: Configuração, plano, snapshot

### As entradas

**Entrada**:
Um registro de dinheiro entrando, criado pela pessoa: data, descrição, fonte, tipo de pagamento e
valor. Não tem pote, não parcela e não se repete.
_Code_: `Income`
_Avoid_: Receita, provento, recebimento, crédito

**Fonte**:
A origem de uma entrada, escolhida de uma lista fixa de quatro: Salário, Freela, Rendimentos e
Outras Receitas. É para a entrada o que o pote é para o lançamento, sem limite nem veredito.
_Code_: `IncomeSource`; as quatro: `salary`, `freelance`, `investment-returns`, `other-income`
_Avoid_: Categoria de receita, origem, pote de entrada

### Os gastos

**Lançamento**:
Um registro de gasto criado pela pessoa: data, descrição, pote, tipo de pagamento, valor e, se a
pessoa quiser, uma tag. É a
única coisa gravada — à vista, parcelado e recorrente são todos lançamentos. O valor é negativo
quando o lançamento é um reembolso.
_Code_: `Expense`; na forma de compra (à vista ou parcelado), `Purchase`; recorrente, `Recurring`
_Avoid_: Transação, despesa, movimento, gasto

**Reembolso**:
Dinheiro voltando de um gasto já lançado, registrado como um lançamento de valor negativo no pote
de origem. Não é uma entrada e não move a receita do mês. O estorno de uma parcela também é um
reembolso: a parcela continua no seu mês, e o dinheiro de volta entra no mês do estorno.
_Code_: `Refund`
_Avoid_: Estorno, devolução, crédito

**Ocorrência**:
O impacto de um lançamento num mês específico. Um lançamento à vista tem uma; um parcelado em 12×
tem doze; um recorrente tem uma por mês, indefinidamente. Nunca é gravada, sempre derivada. Só
lançamento tem ocorrência: uma entrada impacta um mês só, o da sua própria data.
_Code_: `Occurrence`
_Avoid_: Linha, item

**Parcela**:
A ocorrência de um lançamento parcelado, valendo o total dividido pelo número de parcelas; o
centavo que sobra da divisão cai na primeira. A primeira parcela cai no mês da data da compra. O
parcelado é uma compra só: corrigi-lo ou apagá-lo em qualquer mês vale para todas as parcelas.
_Code_: `Installment`

**Antecipação**:
O pagamento adiantado das **últimas** parcelas de um parcelado, feito num mês por um valor que a
pessoa informa, em geral com desconto. As parcelas antecipadas saem dos seus meses, e o valor pago
vira uma ocorrência no mês da antecipação, com o pote, o tipo de pagamento e a tag do parcelado.
Só se antecipam parcelas de meses posteriores ao da antecipação. Um parcelado aceita várias, e
cada uma leva as últimas que ainda sobram. Quitar é antecipar todas as que faltam. Enquanto houver
antecipação fora da lixeira, a data, o total e o número de parcelas do parcelado ficam travados — e
com eles a forma.
_Code_: `Prepayment`
_Avoid_: Adiantamento, quitação, ajuste

**Corte**:
As parcelas que uma antecipação levou — "da 8ª à 10ª" — e o pedaço da série que ela tirou do fim.
Nunca é gravado: sai de aplicar as antecipações em ordem de data sobre o parcelado. É o que diz
"Antecipação 8–10/10" no detalhe do mês.
_Code_: `Cut`
_Avoid_: Intervalo, faixa, range

**Recorrência**:
Um lançamento cujo valor se **repete** todo mês em vez de ser **dividido** entre meses, sem fim
até ser encerrado. Mudá-lo num mês vale dali para frente, até a próxima mudança; **encerrá-lo**
num mês apaga dali para frente — é assim que um recorrente termina —, e encerrar no mês de início
o manda inteiro para a lixeira. Não existe pular um mês só: quem pausa encerra e lança de novo.
Não vira compra (à vista ou parcelado), nem o contrário: apaga e lança de novo.
_Code_: `Recurring`; encerrar, `end`
_Avoid_: Assinatura, gasto fixo

**Vigência**:
Um trecho de uma recorrência em que valor, pote, tipo de pagamento, tag e descrição ficaram iguais. O
aluguel de R$ 1.500 que passou a R$ 1.650 em julho é uma recorrência com duas vigências, não dois
lançamentos.
_Code_: `Period`
_Avoid_: Versão, período, trecho

**Tipo de pagamento**:
O meio pelo qual um lançamento foi pago, escolhido de uma lista fixa de sete. Só Cartão de Crédito
admite parcelamento. Uma entrada usa a mesma lista, restrita aos três que creditam: Dinheiro, PIX
e Transferência.
_Code_: `PaymentMethod`; os sete: `cash`, `credit-card`, `debit-card`, `pix`, `transfer`, `boleto`, `direct-debit`
_Avoid_: Forma de pagamento, método de pagamento

**Tag**:
Um rótulo livre e opcional de um lançamento, digitado pela pessoa, que existe para cruzar potes: a
`#transporte` junta o combustível de Custos Fixos e o Uber de Conforto. Um lançamento tem no máximo
uma. Não tem percentual, limite nem veredito. Não é cadastrada: existe enquanto algum lançamento a
usa.
_Code_: `Tag`
_Avoid_: Categoria, etiqueta, marcador

**Fusão**:
O que sai de renomear uma tag para um nome que já existe: as duas viram uma só e nada mais diz de qual
nome cada ocorrência veio. Por isso o comando exige confirmação explícita, e a tela a pede. Renomear
sem fusão é só trocar o nome, nas compras e em todas as vigências, em todos os meses — inclusive no
que está na lixeira, senão restaurar ressuscitaria o nome antigo. Pela mesma razão, um nome que só
dorme na lixeira ainda funde: ele volta ao restaurar. Só não se renomeia a tag que nenhum lançamento
vivo usa, porque essa já não existe. A cor muda junto, porque sai do nome.
_Code_: `merge`
_Avoid_: Merge, junção, unificação

**Eixo**:
Uma dimensão pela qual as ocorrências de um mês são agrupadas: pote, tipo de pagamento ou tag. Toda
ocorrência cai em exatamente um grupo de cada eixo, então os três eixos somam o mesmo total.
_Code_: `Axis`
_Avoid_: Classificador, dimensão, filtro

**Grupo**:
Um valor de um eixo e as ocorrências do mês que caem nele: o grupo Conforto, o grupo Cartão de
Crédito, o grupo `#transporte`, o grupo "sem tag". O total de um grupo é a soma líquida das suas
ocorrências e pode ser negativo.
_Code_: `Group`
_Avoid_: Caixinha, bucket, categoria

**Estouro**:
O quanto a soma das ocorrências de um pote num mês excede o limite daquele pote.
_Code_: `overrun`
_Avoid_: Excesso, furo, overflow

### A lixeira

**Lixeira**:
Para onde vai uma entrada, um lançamento ou uma antecipação apagados. É uma marca no registro, com
o dia em que foi apagado, não uma remoção: o registro volta intacto ao ser restaurado. Na lixeira
ele não gera receita nem ocorrência, e não pode ser corrigido sem antes voltar. Apagar um parcelado
leva as suas antecipações junto, e elas voltam com ele; restaurar uma antecipação sozinha revalida
contra o parcelado como ele está, e é recusado se as parcelas não couberem mais. Apagar nunca leva
o orçamento do mês junto, e a lixeira não se esvazia: nada é destruído de vez. A única exceção são
as vigências que um encerramento descarta: elas somem de vez, sem passar pela lixeira.
_Code_: `Trash`; apagar, `delete`; restaurar, `restore`
_Avoid_: Excluídos, arquivo, histórico

### Os agregados do mês

**Despesas do mês**:
A soma líquida de todas as ocorrências de um mês, reembolsos incluídos. É o mesmo número que o total
de qualquer eixo, e portanto a soma dos seis potes.
_Code_: `monthExpenses`
_Avoid_: Gastos totais, saídas

**Saldo do mês**:
Receita do mês menos despesas do mês. Fluxo daquele mês, não quanto a pessoa tem.
_Code_: `monthBalance`
_Avoid_: Sobra, resultado, lucro

**Saldo em conta**:
Receita do mês menos as ocorrências do mês que não foram no Cartão de Crédito. Existe para ser
comparado com o saldo do banco, e não bate com ele por construção: é fluxo do mês (ignora o que
sobrou do mês anterior), a compra no cartão pesa no mês da compra e não no do pagamento, e Dinheiro
conta como qualquer outro tipo de pagamento. É referência aproximada, não conciliação.
_Code_: `accountBalance`
_Avoid_: Saldo bancário, saldo disponível, extrato
