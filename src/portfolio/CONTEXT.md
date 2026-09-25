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
(PETR4, AAPL, BTC, HGLG11) e a sua classe. O código é único na carteira e pode ser corrigido quando
a empresa troca de código, sem perder o histórico. A classe é escolhida no
cadastro e nunca muda. A moeda vem da classe: dólar para Ações Internacionais, real para as outras.
O ativo existe antes da primeira compra: já tem nota e pode receber aporte com quantidade zero.
Só pode ser apagado enquanto não tem nenhuma operação nem provento. Não existe arquivar nem
esconder: um ativo com histórico fica na carteira para sempre, mesmo com posição zero.
Na Renda Fixa há dois jeitos de ativo. Um título do **Tesouro Direto** é um ativo como os outros,
escolhido numa lista de títulos ("Tesouro IPCA+ 2035"). Um **título privado** (CDB, LCI, LCA,
debênture) não tem código de negociação: tem um nome livre e único ("CDB Inter 2028") no lugar do
código, o tipo (só informativo), o indexador, a taxa e o vencimento. Uma aplicação com outra taxa é
outro ativo.
_Code_: `Asset`; o código, `ticker`; o título privado, `privateBond`; o tipo, `bondType`
_Avoid_: Papel, título (sozinho), investimento, posição

**Indexador**:
A regra pela qual um título privado rende: um percentual do CDI (110% do CDI), uma taxa prefixada
(12,5% ao ano) ou IPCA mais uma taxa (IPCA + 6%). É um só por ativo, junto com a taxa. Pode ser
corrigido, e a correção vale para o título inteiro desde a primeira aplicação.
_Code_: `indexer`; os três, `cdi-percentage`, `fixed-rate`, `ipca-plus`; a taxa, `rate`
_Avoid_: Índice (é o CDI, a Selic, o IPCA publicados), rentabilidade

**Índice**:
O CDI, a Selic ou o IPCA como publicados por fonte oficial, dos quais sai o preço na curva de um
título privado. É trazido de fora como uma cotação: continua valendo o último quando a fonte falha.
Antes de o IPCA do mês sair, vale a sua projeção.
_Code_: `rateIndex`
_Avoid_: Indexador (é a regra do título), taxa

**Vencimento**:
A data em que um título de Renda Fixa acaba. A partir dela o preço do título para de mudar, e o
ativo fica marcado como vencido até a pessoa registrar o resgate total. O app nunca registra o
resgate sozinho. Depois do resgate total, o título continua vencido, com posição zero. Nenhuma
compra ou aplicação é aceita com data igual ou posterior ao vencimento.
_Code_: `maturityDate`
_Avoid_: Prazo, liquidez

**Operação**:
Um registro, feito pela pessoa, que muda a quantidade ou o custo de um ativo: uma compra ou uma
venda, com data, quantidade e preço unitário na moeda do ativo. A operação de um ativo em dólar
também guarda o câmbio daquele dia. A quantidade pode ser fracionária em qualquer classe.
Não existe campo de taxa ou corretagem: o preço é o que foi pago ou recebido. A data pode ser
qualquer dia até hoje, nunca depois: a operação registra o que já aconteceu. As operações valem em
ordem de data, e a quantidade nunca fica negativa em data nenhuma: uma venda sem quantidade
suficiente é recusada, e também a correção ou exclusão de uma compra que deixaria uma venda
posterior sem cobertura. Pode ser corrigida livremente, e apagar remove de vez, sem lixeira.
No título privado, a compra é uma **aplicação** e a venda um **resgate**, ambos gravados em reais:
as cotas são sempre derivadas do valor e do preço na curva do dia. O resgate parcial sai pelo preço
na curva. O resgate total vende todas as cotas pelo valor que a pessoa recebeu de fato, e a
diferença para a curva vai para o resultado da venda.
_Code_: `Trade`; os tipos, `buy` e `sell`
_Avoid_: Transação, lote, lançamento (é do orçamento), movimentação

**Evento corporativo**:
Uma mudança que a empresa ou o fundo faz no número de unidades de um ativo: um desdobramento, um
grupamento ou uma bonificação. Registra o ativo, a data e a **proporção** ("1 para 4", "10 para 1",
"1 nova para cada 10"). Não é uma operação, mas vale em ordem de data junto com elas: multiplica a
quantidade pela proporção e mantém o custo, de modo que o preço médio se ajusta sozinho. O tipo é
só informativo, e a bonificação não tem custo atribuído. Uma fração que sobra fica na quantidade
até a pessoa lançar a sua venda. Só existe em Ações Nacionais, Ações Internacionais e FIIs.
A fonte **propõe** todo evento de uma data em que a posição era maior que zero, e ele fica
**pendente** até a pessoa confirmar ou descartar. Enquanto houver um pendente, o ativo não recebe
aporte. O confirmado é da pessoa, e o descartado não volta. Também pode ser lançado pela pessoa.
Pode ser corrigido e apagado com a mesma trava das operações. Apagado, o que veio da fonte volta a
ser proposto. Troca de código não é evento: é a correção do código do ativo. Incorporação e cisão
são uma venda do ativo antigo e uma compra do novo.
_Code_: `CorporateAction`; os tipos, `split`, `reverse-split` e `bonus`; a proporção, `ratio`
_Avoid_: Operação (é compra ou venda), split, desdobramento (é só um dos tipos)

**Provento**:
Dinheiro que um ativo pagou à pessoa: dividendo, JCP, rendimento de FII ou os juros semestrais de
um título do Tesouro. Registra o ativo, a data
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
fonte falha, com a sua data à vista. Um ativo pode nunca ter tido cotação. Uma cotação com mais de
5 dias úteis é uma **cotação antiga**: continua valendo para o valor atual, mas o ativo não recebe
aporte, como um ativo deslistado cuja venda a pessoa ainda não lançou.
O título do Tesouro Direto tem cotação como qualquer ativo: o preço de venda do dia, a mercado. O
título privado não tem cotação de fonte nenhuma: o seu preço é **calculado na curva**, uma cota que
vale R$ 1,00 no dia da primeira aplicação e cresce pelo indexador. A pessoa aplica e resgata em
reais, e o app converte em cotas, de modo que o preço médio, o custo e o ganho seguem as mesmas
regras dos outros ativos.
_Code_: `Quote`; o preço calculado na curva, `accruedPrice`; a cotação antiga, `staleQuote`
_Avoid_: Preço (sozinho: é o da operação ou o preço médio), valor de mercado

**Câmbio**:
Quantos reais vale um dólar. Existe em dois lugares. O **câmbio da operação** é gravado em cada
compra ou venda de um ativo em dólar e diz quanto aquela operação valeu em reais. Vem sugerido
pela taxa oficial do dia, e a pessoa pode corrigir para a taxa que pagou de fato. O **câmbio
atual** é trazido de uma fonte externa como uma cotação: só vale o último, e ele continua valendo
quando a fonte falha. Com mais de 5 dias úteis, é um **câmbio antigo**: continua valendo para o
valor atual, mas nenhum ativo em dólar recebe aporte.
_Code_: `exchangeRate`
_Avoid_: Dólar (sozinho), PTAX (é só a fonte da sugestão), conversão

**Valor atual**:
Quanto a posição vale agora: `quantidade × última cotação`. O ativo em dólar vale, em reais,
`quantidade × última cotação × câmbio atual`. O ativo que nunca teve cotação vale o seu custo, e
fica marcado como sem cotação. Enquanto nunca houve câmbio atual, o ativo em dólar vale o seu custo
em reais, e fica marcado como sem câmbio. O valor é sempre bruto: nenhum imposto é descontado,
nem o retido no resgate da Renda Fixa.
_Code_: `currentValue`
_Avoid_: Saldo, patrimônio, valor de mercado

### A posição e o ganho

Tudo nesta seção é derivado das operações e dos proventos. Nada aqui é digitado.

O ativo em dólar tem a posição nas duas moedas, calculadas em paralelo pelas mesmas regras: em
dólar pelo preço da operação, em reais pelo `preço × câmbio da operação`. O que se soma entre
ativos, classes e carteira é sempre em reais. Os números em dólar são só para mostrar.

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
fixado no dia da venda, com o preço médio daquele dia. No ativo em dólar, o resultado em reais usa
o preço de venda vezes o câmbio da venda contra o preço médio em reais.
_Code_: `realizedGain`
_Avoid_: Lucro, ganho de capital

**Ganho total**:
Tudo o que um ativo já deu à pessoa: valorização + resultados das vendas + proventos recebidos,
sempre em reais. Continua existindo depois que a posição é zerada. O ganho total de uma classe é a
soma do ganho total de todos os seus ativos, com ou sem posição, e o da carteira é a soma das
classes: zerar uma posição nunca tira o que ela já deu.
_Code_: `totalGain`
_Avoid_: Rentabilidade, retorno, lucro

### A nota

A nota segue o método do Diagrama do Cerrado: cada ativo é avaliado por perguntas de sim ou não, e
a nota decide quanto do aporte da classe ele recebe.

**Questionário**:
O conjunto de perguntas com que a pessoa avalia os ativos de uma classe. São dois: um compartilhado
por Ações Nacionais e Ações Internacionais, e um de FIIs. Ambos começam com as perguntas padrão do
Cerrado, e a pessoa pode acrescentar, reescrever, remover e reordenar perguntas, desde que sobre
pelo menos uma. Cripto e Renda Fixa não têm questionário.
_Code_: `Questionnaire`
_Avoid_: Diagrama (é o nome do método), checklist, critérios

**Pergunta**:
Uma questão de sim ou não de um questionário. Reescrever uma pergunta mantém as respostas já dadas.
Remover uma pergunta apaga as suas respostas. Acrescentar uma pergunta deixa todos os ativos da
classe sem nota até ela ser respondida em cada um.
_Code_: `Question`
_Avoid_: Critério, item

**Resposta**:
O sim ou o não de um ativo para uma pergunta. Vale só a resposta atual: mudar não guarda a
anterior.
_Code_: `Answer`
_Avoid_: Avaliação (é o conjunto das respostas)

**Nota**:
Quanto a pessoa confia num ativo, dentro da sua classe. Nas classes com questionário, é `sim − não`
sobre todas as perguntas, de −N a +N, e só existe quando todas as perguntas foram respondidas. Na
Cripto e na Renda Fixa, é digitada, um inteiro de 0 a 10. Um ativo pode estar **sem nota**, que é
diferente de nota zero. Sem nota ou com nota zero ou negativa, o ativo não recebe aporte e não entra
na divisão da classe, mas continua na carteira, contando no valor da classe, e nada manda vendê-lo.
Só vale a nota atual, com a data da última avaliação à vista: a data muda quando a pessoa responde
perguntas ou digita a nota do ativo, não quando o questionário muda.
_Code_: `score`; a data, `evaluatedAt`
_Avoid_: Peso (é derivado da nota), pontuação, rating

### O aporte

**Aporte**:
O valor em reais, maior que zero, que a pessoa diz que vai investir agora.
_Code_: `contribution`
_Avoid_: Investimento, depósito, Liberdade Financeira (é um pote do orçamento)

**Sugestão de aporte**:
Para onde o app manda um aporte: quanto vai para cada classe e, dentro dela, quanto e quantas
unidades de cada ativo. Primeiro, entre as classes, na proporção da falta de cada uma. Depois,
dentro da classe, na proporção da falta de cada ativo. É recalculada a cada pedido e nunca gravada.
Nunca manda vender. Um ativo só recebe se tiver nota positiva e cotação que não seja antiga (e
câmbio atual que não seja antigo, se for em dólar), não estiver vencido e não tiver evento corporativo pendente. Uma classe só recebe se tiver alvo acima de zero e algum ativo que
possa receber. Os que não recebem continuam contando no valor da classe e da carteira.
Aceitar a sugestão abre as compras sugeridas para a pessoa revisar antes de gravar. O que se grava
são operações comuns, todas ou nenhuma.
_Code_: `ContributionSuggestion`
_Avoid_: Recomendação, rebalanceamento, plano

**Peso ideal**:
A fatia de um ativo dentro da sua classe numa sugestão de aporte: a nota dele ÷ a soma das notas dos
ativos da classe que podem receber. Nunca é digitado.
_Code_: `idealWeight`
_Avoid_: Alvo (é só da classe), peso manual, percentual

**Falta**:
Quanto uma classe ou um ativo está abaixo do seu valor ideal depois do aporte, ou zero se já está
acima. O valor ideal da classe é o alvo × (valor da carteira + aporte). O do ativo é o peso ideal ×
(valor dos ativos da classe que podem receber + a parcela da classe).
_Code_: `shortfall`
_Avoid_: Déficit, gap, diferença

**Sem destino**:
A parte de um aporte que a sugestão não manda para nenhum ativo, mostrada à parte com o motivo. Vem
de uma classe com alvo acima de zero e nenhum ativo que possa receber (o dinheiro não vai para as
outras classes) ou do que sobra depois de arredondar para unidades compráveis.
_Code_: `unallocated`
_Avoid_: Sobra (sozinho), troco, resto
