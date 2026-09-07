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
O valor único de entrada atribuído a um mês. Pode ser revisada a qualquer momento, e revisá-la
move todos os limites daquele mês.
_Avoid_: Renda, salário, entrada, faturamento

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
A fotografia de um mês: sua receita e seus seis percentuais. Cada mês tem o seu, independente de
todos os outros.
_Avoid_: Configuração, plano, snapshot

### Os gastos

**Lançamento**:
Um registro de gasto criado pela pessoa: data, descrição, pote, tipo de pagamento e valor. É a
única coisa gravada — à vista, parcelado e recorrente são todos lançamentos.
_Avoid_: Transação, despesa, movimento, gasto

**Ocorrência**:
O impacto de um lançamento num mês específico. Um lançamento à vista tem uma; um parcelado em 12×
tem doze; um recorrente tem uma por mês, indefinidamente. Nunca é gravada, sempre derivada.
_Avoid_: Linha, entrada, item

**Parcela**:
A ocorrência de um lançamento parcelado, valendo o total dividido pelo número de parcelas.

**Recorrência**:
Um lançamento cujo valor se **repete** todo mês em vez de ser **dividido** entre meses.
_Avoid_: Assinatura, gasto fixo

**Tipo de pagamento**:
O meio pelo qual um lançamento foi pago, escolhido de uma lista fixa de sete. Só Cartão de Crédito
admite parcelamento.
_Avoid_: Forma de pagamento, método de pagamento

**Estouro**:
O quanto a soma das ocorrências de um pote num mês excede o limite daquele pote.
_Avoid_: Excesso, furo, overflow
