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

## Rodada 2: Sinal escolhido, com cor por pote e tema escuro

Só a direção **B** ganhou isto. A e C ficam como estavam, como fonte.

- **Cor do pote = identidade, não veredito.** Um quadrado ao lado do nome (no cartão, no
  detalhe e nas linhas dos outros eixos), um filete no topo do cartão e a barra de gasto na cor
  do pote enquanto está dentro do limite. Ao estourar, o vermelho assume a barra, o filete, o selo e
  o fundo. O selo "Sobra" ficou neutro: o verde era veredito e agora competiria com as cores dos
  potes.
- **Paleta**: seis matizes sem vermelho (estouro), sem verde (entrada) e sem violeta (reembolso),
  cada um com um tom mais claro para o escuro. Todos passam 3:1 contra o cartão nos dois temas
  (Conforto no claro é o mais justo, com 3,16).

  | Pote | Claro | Escuro |
  |---|---|---|
  | Custos Fixos | `#2f6fd6` azul | `#6f9cf0` |
  | Liberdade Financeira | `#0b8f9c` petróleo | `#3cc4cf` |
  | Conforto | `#b98900` âmbar | `#e0b33a` |
  | Metas | `#5f8a1c` oliva | `#9cc653` |
  | Conhecimento | `#b0409c` magenta | `#e27ccf` |
  | Prazeres | `#8b6b4a` terra | `#c7a07a` |

- **O azul saiu do botão principal**, que ficou marinho (a cor da faixa dos agregados), para não
  disputar com Custos Fixos.
- **Tema escuro**: segue o sistema. O botão no topo passa por Sistema → Claro → Escuro, e a
  escolha fica lembrada no navegador. A faixa dos agregados clareia um pouco no escuro para
  continuar sendo "outra espécie".
