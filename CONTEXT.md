# Orçamento Doméstico

Orçamento doméstico pessoal de um único usuário, organizado pelo método dos 6 potes. A pergunta
que este contexto existe para responder é: _neste mês, quanto cada pote recebeu, qual era o seu
limite, e estourei — por quanto?_

## Language

### O orçamento

**Pote**:
Uma das seis divisões fixas do orçamento: Custos Fixos, Liberdade Financeira, Conforto, Metas,
Conhecimento e Prazeres. A lista é do app, não do usuário.
_Avoid_: Categoria, envelope, jarro, rubrica

**Receita do mês**:
Quanto entrou num mês: a soma das entradas daquele mês. Nunca é digitada — lançar, editar ou apagar
uma entrada move todos os limites daquele mês.
_Avoid_: Renda, salário, faturamento

**Percentual**:
A fatia da receita do mês que um pote reivindica. É o número que a pessoa edita.
_Avoid_: Alocação, proporção, fatia

**Limite**:
O valor em reais que um pote pode receber num mês, sempre derivado: `percentual × receita do mês`.
Nunca é digitado diretamente.
_Avoid_: Teto, valor orçado, budget

**Não alocado**:
A parte da receita do mês que nenhum pote reivindica — 100% menos a soma dos percentuais.

**Orçamento do mês**:
A fotografia de um mês: seus seis percentuais. Cada mês tem o seu, independente de todos os outros.
A receita não está na fotografia porque é derivada das entradas.
_Avoid_: Configuração, plano, snapshot

### As entradas

**Entrada**:
Um registro de dinheiro entrando, criado pela pessoa: data, descrição, fonte, tipo de pagamento e
valor. Não tem pote, não parcela e não se repete.
_Avoid_: Receita, provento, recebimento, crédito

**Fonte**:
A origem de uma entrada, escolhida de uma lista fixa de quatro: Salário, Freela, Rendimentos e
Outras Receitas. É para a entrada o que o pote é para o lançamento, sem limite nem veredito.
_Avoid_: Categoria de receita, origem, pote de entrada

### Os gastos

**Lançamento**:
Um registro de gasto criado pela pessoa: data, descrição, pote, tipo de pagamento e valor. É a
única coisa gravada — à vista, parcelado e recorrente são todos lançamentos. O valor é negativo
quando o lançamento é um reembolso.
_Avoid_: Transação, despesa, movimento, gasto

**Reembolso**:
Dinheiro voltando de um gasto já lançado, registrado como um lançamento de valor negativo no pote
de origem. Não é uma entrada e não move a receita do mês.
_Avoid_: Estorno, devolução, crédito

**Ocorrência**:
O impacto de um lançamento num mês específico. Um lançamento à vista tem uma; um parcelado em 12×
tem doze; um recorrente tem uma por mês, indefinidamente. Nunca é gravada, sempre derivada. Só
lançamento tem ocorrência: uma entrada impacta um mês só, o da sua própria data.
_Avoid_: Linha, item

**Parcela**:
A ocorrência de um lançamento parcelado, valendo o total dividido pelo número de parcelas.

**Recorrência**:
Um lançamento cujo valor se **repete** todo mês em vez de ser **dividido** entre meses.
_Avoid_: Assinatura, gasto fixo

**Tipo de pagamento**:
O meio pelo qual um lançamento foi pago, escolhido de uma lista fixa de sete. Só Cartão de Crédito
admite parcelamento. Uma entrada usa a mesma lista, restrita aos três que creditam: Dinheiro, PIX
e Transferência.
_Avoid_: Forma de pagamento, método de pagamento

**Estouro**:
O quanto a soma das ocorrências de um pote num mês excede o limite daquele pote.
_Avoid_: Excesso, furo, overflow
