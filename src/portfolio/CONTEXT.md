# Carteira de investimentos

Carteira de investimentos pessoal de um único usuário, separada do orçamento. A pergunta que este
contexto existe para responder é: _onde está o meu dinheiro investido agora, quanto cada classe está
longe do seu alvo, e onde ponho o próximo aporte?_

## Language

### As classes

**Classe**:
Uma das cinco divisões fixas da carteira: Ações Nacionais, Ações Internacionais, Renda Fixa, FIIs e
Cripto. A lista é do app, não do usuário.
_Code_: `AssetClass`; as cinco: `domestic-stocks`, `international-stocks`, `fixed-income`, `real-estate-funds`, `crypto`
_Avoid_: Categoria, tipo de ativo, pote

**Alvo**:
A fatia do valor total da carteira que a pessoa quer numa classe, um inteiro de 0 a 100. Os cinco
alvos somam sempre exatamente 100, e só vale o alvo atual: mudar um alvo não guarda o anterior.
_Code_: `target`
_Avoid_: Meta (é um pote do orçamento), Percentual, Alocação, Peso

### Os ativos e as operações

**Ativo**:
Algo em que a pessoa investe ou quer investir, cadastrado por ela com o seu código de negociação
(PETR4, AAPL, BTC, HGLG11) e a sua classe. O código é único na carteira. A classe é escolhida no
cadastro e nunca muda. A moeda vem da classe: dólar para Ações Internacionais, real para as outras.
O ativo existe antes da primeira compra: já tem nota e pode receber aporte com quantidade zero.
Só pode ser apagado enquanto não tem nenhuma operação nem provento.
_Code_: `Asset`; o código, `ticker`
_Avoid_: Papel, título, investimento, posição

**Operação**:
Um registro, feito pela pessoa, que muda a quantidade ou o custo de um ativo: uma compra ou uma
venda, com data, quantidade e preço unitário. A quantidade pode ser fracionária em qualquer classe.
Não existe campo de taxa ou corretagem: o preço é o que foi pago ou recebido. As operações valem em
ordem de data, e a quantidade nunca fica negativa em data nenhuma: uma venda sem quantidade
suficiente é recusada, e também a correção ou exclusão de uma compra que deixaria uma venda
posterior sem cobertura. Pode ser corrigida livremente, e apagar remove de vez, sem lixeira.
_Code_: `Trade`; os tipos, `buy` e `sell`
_Avoid_: Transação, lote, lançamento (é do orçamento), movimentação

**Provento**:
Dinheiro que um ativo pagou à pessoa: dividendo, JCP ou rendimento de FII. Registra o ativo, a data
de pagamento e o valor recebido em reais, já líquido. Não é uma operação: não muda a quantidade nem
o custo do ativo. O tipo é só informativo. Vem da fonte na data de pagamento, pela quantidade ao fim
da data-com, ou é lançado pela pessoa. Depois de gravado, é da pessoa: a fonte não o corrige nem o
recria. Pode ser corrigido livremente, e apagar remove de vez.
_Code_: `Payout`
_Avoid_: Dividendo (é só um dos tipos), Rendimento (é uma fonte do orçamento), Renda

### A cotação

**Cotação**:
O preço de uma unidade de um ativo num momento, na moeda do ativo, trazido de uma fonte externa com
a hora em que foi obtido. Só vale a última cotação de cada ativo, e ela continua valendo quando a
fonte falha, com a sua data à vista. Um ativo pode nunca ter tido cotação.
_Code_: `Quote`
_Avoid_: Preço (sozinho: é o da operação ou o preço médio), valor de mercado

**Valor atual**:
Quanto a posição vale agora: `quantidade × última cotação`. O ativo que nunca teve cotação vale o
seu custo, e fica marcado como sem cotação.
_Code_: `currentValue`
_Avoid_: Saldo, patrimônio, valor de mercado

### A posição e o ganho

Tudo nesta seção é derivado das operações e dos proventos. Nada aqui é digitado.

**Posição**:
O que a pessoa tem de um ativo numa data: a quantidade, o preço médio e o custo, resultado de
aplicar as operações até aquela data. Um ativo pode ter posição zero.
_Code_: `Position`
_Avoid_: Ativo (o ativo existe sem posição), saldo, carteira

**Preço médio**:
Quanto custou, em média, cada unidade que a pessoa tem. A compra recalcula: `(custo + quantidade ×
preço) ÷ nova quantidade`. A venda reduz a quantidade e não muda o preço médio. Quando a quantidade
chega a zero, o preço médio deixa de existir, e a próxima compra começa do zero.
_Code_: `averagePrice`
_Avoid_: Preço de compra, custo médio

**Custo**:
Quanto a posição custou: `quantidade × preço médio`.
_Code_: `cost`
_Avoid_: Valor investido, valor aplicado, total pago

**Valorização**:
O ganho ainda não realizado da posição: `valor atual − custo`. Só existe enquanto há quantidade.
_Code_: `unrealizedGain`
_Avoid_: Ganho (sozinho), lucro, rentabilidade

**Resultado da venda**:
O ganho ou a perda realizados numa venda: `(preço de venda − preço médio) × quantidade vendida`,
fixado no dia da venda, com o preço médio daquele dia.
_Code_: `realizedGain`
_Avoid_: Lucro, ganho de capital

**Ganho total**:
Tudo o que um ativo já deu à pessoa: valorização + resultados das vendas + proventos recebidos.
Continua existindo depois que a posição é zerada.
_Code_: `totalGain`
_Avoid_: Rentabilidade, retorno, lucro
