# Protótipo — Tela composta

**Código descartável.** Segunda rodada, branch `prototype/tela-composta`, fora da `main`.
Ticket: issue #10. A primeira rodada está em `prototype/tela-mes` (issue #3).

## A pergunta

A rodada anterior decidiu **painel ao vivo × tabela no servidor**, e o painel ganhou. Isso está
fechado: as três variantes aqui são **todas** painel ao vivo.

O que está em aberto é a **composição**. A reação ao primeiro protótipo tirou a receita do campo
no topo e colocou quatro cards agregados lá — e esses quatro **não têm limite nem veredito**,
enquanto os seis potes têm os dois. O veredito é o assunto do app. Então: os agregados são
contexto ou são conteúdo?

## Como rodar

Abrir `index.html`. Sem build, sem dependências.

## As três variantes

`?variant=D|E|F`, barra flutuante, ou setas `←` `→`.

| | Variante | Tese |
|---|---|---|
| **D** | Faixa de contexto | Agregados não são cards — são uma linha tipográfica acima de uma régua. "Card" fica reservado a quem tem veredito. |
| **E** | Dois andares | Agregados são cards de **outra espécie**: cinza, achatados, sem barra, sob um rótulo de seção. A diferença deve ser gritada, não sugerida. |
| **F** | Saldo em foco | Inverte a hierarquia de propósito: um agregado gigante, três satélites, potes rebaixados a grade compacta. Existe para testar se rebaixar o veredito é mesmo errado. |

## O que exercitar

- **"+ Entrada de R$ 1.000"** na faixa preta (ou "+ Nova entrada" no feed). A receita é a soma das
  entradas, então lançar uma move **os seis limites de uma vez**. É a pergunta "receita viva fica
  volátil demais?" em forma concreta. Remover todas leva ao estado sem limite nenhum.
- **Trocar o eixo** para Tipo de pagamento ou Tag. Os cards perdem barra e veredito, porque só pote
  tem percentual da receita. Ver essa degradação é o argumento de que os três eixos **não** são
  totalmente intercambiáveis.
- **Clicar em qualquer card** abre o mesmo painel de detalhe nos três eixos — um mecanismo, três
  eixos. No detalhe, uma parcela mostra o valor da ocorrência **e** o total da compra, para a
  escolha "detalhe mostra ocorrência ou lançamento?" ficar concreta.

## Invariante que o protótipo respeita

Somar os grupos dá **R$ 6.888,90** em qualquer um dos três eixos. Se um eixo não fechasse com os
outros, não seriam três vistas do mesmo mês.

## Dados

Setembro/2026. Receita R$ 8.500 derivada de **3 entradas** (salário 7.200 recorrente, freela 900,
reembolso 400). 16 gastos, R$ 6.888,90, dos quais R$ 1.302,60 no cartão de crédito — daí
Saldo do mês R$ 1.611,10 e Saldo em conta R$ 2.913,70, diferindo exatamente pelo cartão.

Tags foram escolhidas para **cruzar potes** de propósito: `#investimento` cai em Liberdade
Financeira e em Metas, `#transporte` cai em Conforto e em Custos Fixos. É esse cruzamento que
justifica tag existir ao lado de pote — se toda tag vivesse dentro de um pote só, seria
subcategoria, não tag.

## O que este protótipo NÃO decide

- **A deriva do Saldo em conta** (a fatura do mês passado sai da conta e não aparece) e o problema
  de estoque × fluxo continuam em issue #9. São perguntas de modelo, não de layout.
- **Se Lançamento é uma entidade com direção ou duas entidades** (issue #7). A entrada é desenhada
  como uma linha no feed, de propósito sem comprometer a resposta.
