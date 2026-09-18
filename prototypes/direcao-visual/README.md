# PROTÓTIPO — Direção visual

Descartável. Responde a [#14](https://github.com/LucianoAMagalhaes/finance-hubs/issues/14). Abra
`index.html` no navegador. Tudo fica em memória, e "Recomeçar dados" volta ao início.

**Pergunta:** qual a direção visual do app (paleta, tipografia, como aparecem o veredito e o valor
negativo) e como a tela se reorganiza no celular?

É o app do [#13](../app-ponta-a-ponta) com três peles e três layouts de celular. O `Dominio` e os
formulários são os mesmos. Os ⚑ saíram porque os 16 buracos já viraram decisão.

## A barra flutuante

- **‹ ›** (ou as setas do teclado): troca a direção. A URL guarda `?variant=A|B|C`.
- **Tela larga / Celular**: "Celular" põe a tela numa moldura de 390px. O layout reage à largura
  da moldura, então o que se vê ali é o que um celular de verdade veria.
- **Ir para uma cena**: atalhos para os estados que põem a direção à prova: pote estourado, PIX
  negativo, tag só de reembolso, mês sem receita, os formulários.

## As três direções

| | A · Papel | B · Sinal | C · Régua |
|---|---|---|---|
| **Tese** | Cor só para estouro. Todo o resto é tinta | A cor é o estado | O limite é uma marca fixa numa régua |
| **Tipografia** | Source Serif (números, títulos) + Source Sans | Inter, números grandes em negrito | IBM Plex Sans + Plex Mono nos números |
| **Veredito** | Texto: "estourou R$ x" em vermelho, "sobra R$ x" em cinza | Selo: vermelho cheio ▲, verde claro ✓, cinza — | Geometria: a barra passa da marca e fica laranja |
| **Negativo (reembolso)** | Só o sinal: `− R$`, na cor da tinta | Violeta com ↺, distinto de entrada (verde) e de estouro (vermelho) | Azul, e a barra fica azul |
| **Dois andares** | Faixa de extrato com fios, sem caixa × cartões | Faixa escura × cartões claros | Números soltos em mono × tabela |
| **Celular: grade** | Uma coluna de cartões | Grade 2×2 compacta | Linha em dois andares (nome e gasto, régua e veredito) |
| **Celular: mestre-detalhe** | O detalhe **substitui** a lista, com "‹ Todos os potes" | O detalhe **sobe numa folha** sobre a grade | O detalhe **abre embaixo da linha** tocada |
| **Celular: lançar** | Barra fixa embaixo com + Entrada e + Gasto | Botão + flutuante | Botões no topo |

Déficit (saldo abaixo de zero) é vermelho nas três, para não se confundir com reembolso.
