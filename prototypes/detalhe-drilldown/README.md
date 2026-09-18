# PROTÓTIPO — Detalhe do drill-down

Descartável. Responde a [#12](https://github.com/LucianoAMagalhaes/finance-hubs/issues/12). Abra
`index.html` no navegador.

Parte da tela composta vencedora de [#10](https://github.com/LucianoAMagalhaes/finance-hubs/issues/10)
(E — Dois andares). O modelo do detalhe já está fechado em
[#8](https://github.com/LucianoAMagalhaes/finance-hubs/issues/8); aqui só se decide a tela.

## Pergunta 1: uma tela só para os três eixos? (`?variant=`)

- **G — Um painel só.** O mesmo painel lateral para todo grupo; o pote ganha limite, barra e
  estouro no cabeçalho.
- **H — Pote tem página.** Pote abre uma página própria (barra com a marca do limite, a linha onde
  o limite foi cruzado, comprometido × manual). Tipo e tag abrem uma lista leve no lugar, abaixo
  da grade.
- **I — Mestre-detalhe.** Sem sobreposição: a grade vira uma coluna de grupos e o detalhe fica ao
  lado. Uniforme nos três eixos.

## Pergunta 2: Fonte ganha drill-down? (botão na faixa preta)

Desligado: as entradas são uma lista com a Fonte como coluna. Ligado: G e H ganham chips de Fonte
no card Receitas; I põe Fonte no seletor como "quase eixo", separado por um traço, com a coluna
somando a receita em vez das despesas.

## Dados

Receita R$ 10.000,00 (4 entradas), despesas R$ 7.841,80. Os três eixos somam R$ 7.841,80.
Conforto: limite R$ 1.500,00, gasto R$ 2.321,80, estouro R$ 821,80. `#farmácia` e PIX têm total
negativo (reembolsos).
