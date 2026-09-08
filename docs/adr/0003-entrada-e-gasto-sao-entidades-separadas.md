# Entrada e gasto são entidades separadas

A receita do mês virou a soma das entradas, então o app passou a gravar dinheiro entrando e dinheiro
saindo. Gravamos os dois em **entidades separadas** — `Entrada` e `Lançamento` — em vez de uma
tabela de movimentos com um campo de direção, porque as duas compartilham quatro campos (data,
descrição, valor, tipo de pagamento) e divergem em quatro: entrada tem fonte, lançamento tem pote,
parcelamento e recorrência.

O corte mais fundo não é a contagem de campos: é que **entrada não tem ocorrência**. Entrada não
parcela e não se repete, então impacta exatamente um mês, o da sua própria data. A máquina inteira
do ADR-0002 — derivar ocorrências, projetar num horizonte, parcela, recorrência — só existe para
lançamento. Duas coisas que não compartilham o mecanismo central do app não são a mesma coisa com
uma flag.

## Considered Options

**Uma tabela com campo `direção`.** Rejeitada. Cinco colunas passariam a existir para ficar vazias
metade do tempo, e a regra de quais podem ser preenchidas viveria no código, repetida em cada lugar
que escreve. Nada no banco impediria uma linha com `direção=entrada, pote=Conforto, 12 parcelas`:
só o código impediria, e no dia em que um caminho esquecesse — um formulário, uma correção às
pressas — apareceria um salário parcelado em doze vezes dentro de um pote, e o mês ficaria errado
**em silêncio**. Com duas entidades essa linha não tem onde existir. Num app cujo produto é o
histórico, dado errado silencioso é pior que trabalho repetido visível.

**Sinal no valor** (positivo é entrada, negativo é gasto). Rejeitada por um segundo motivo, além do
primeiro: reembolso é gravado como um lançamento de valor **negativo** no pote de origem, e a partir
daí o sinal não pode mais significar direção.

## Consequences

- O feed do mês une duas listas para exibir tudo em ordem de data, e qualquer consulta que atravesse
  os dois lados — uma busca por texto, um extrato único — é costurada em vez de direta.
- Ocorrência, Parcela e Recorrência passam a ser conceitos exclusivos de `Lançamento`. O drill-down
  do mês é uma vista sobre lançamentos; `Fonte` classifica entradas e fica de fora dele.
- Se um dia a entrada precisar de recorrência (o salário virar fixo), a máquina do ADR-0002 é
  duplicada, não reusada. O custo é conhecido e foi aceito: hoje o salário é variável e digitado
  na mão.
