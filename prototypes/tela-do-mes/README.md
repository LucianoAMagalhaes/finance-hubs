# Protótipo — Tela do mês

**Código descartável.** Existe para ser reagido, não mantido. Vive nesta branch
(`prototype/tela-do-mes`), fora da `main`. Ticket: issue #3.

## A pergunta

A tela do mês é uma **tabela renderizada no servidor**, ou precisa de interatividade o bastante
para justificar um **front-end de verdade**? A resposta desbloqueia a escolha de stack (issue #6).

## Como rodar

Abrir `index.html` no navegador. Sem build, sem dependências, sem servidor.

## As três variantes

Alternáveis pela barra flutuante embaixo, pelas setas `←` `→`, ou por `?variant=A|B|C`.
Foram construídas de propósito em pontos diferentes do eixo da pergunta.

| | Variante | Interatividade | O que ela argumenta |
|---|---|---|---|
| **A** | Planilha do mês | Nenhuma. Receita e percentuais são campos de um formulário; nada muda até apertar **Recalcular** (com round-trip simulado de 420 ms). | O caso do servidor. Se A não incomodar, um template renderizado no servidor resolve. |
| **B** | Painel ao vivo | Total. Recalcula a cada tecla e a cada arrasto de slider; barra de alocação e seis cartões respondem juntos. | O caso do cliente. Se a diferença para A for gritante, a interatividade se paga. |
| **C** | Extrato do mês | Média, e deslocada. O feed de ocorrências é o protagonista; os potes viram trilho lateral que também filtra. | Uma terceira hierarquia: e se a pergunta principal não for "quanto sobra" e sim "onde foi"? |

A e B discordam sobre **quando os números mudam**. C discorda de ambas sobre **o que é o assunto
da tela**.

## O que exercitar

- **Editar a receita.** É o gesto que separa A de B. Em A você digita, olha para números velhos e
  aperta um botão; em B os seis limites se movem enquanto você digita.
- **Mexer nos percentuais.** Em A são inputs numa coluna da tabela; em B são sliders com uma barra
  de alocação empilhada; em C ficam atrás de "ajustar %".
- **"Simular mês sem receita"** (botão na faixa preta). Sem receita não há limite nem veredito — as
  três variantes tratam esse vazio de formas diferentes.
- **Comprometido × manual.** Toda variante distingue o que já nasceu no mês (recorrentes e
  parcelas, derivados conforme o ADR-0002) do que foi lançado à mão. A e B separam por coluna;
  C separa por seção do feed.

## Dados

Setembro/2026, receita de R$ 8.500, percentuais 30/25/15/15/10/5, 16 ocorrências (8 derivadas,
8 à vista). Escolhidos para que dois potes estourem (Custos Fixos e Prazeres) e Liberdade
Financeira sobre muito — a consequência aceita de tratar todo pote como gasto.

Nada persiste; recarregar restaura os dados. As ocorrências já chegam derivadas: o protótipo não
implementa a máquina de parcela/recorrência, só desenha o resultado dela.
