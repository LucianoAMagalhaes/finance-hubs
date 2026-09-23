# Pesquisa: índices públicos para calcular Renda Fixa

Ticket: #61 · Mapa: #59 · Acesso às fontes: 23/09/2026

**Pergunta.** Como calcular o valor atual de um título de Renda Fixa a partir do indexador cadastrado,
usando só fontes públicas e gratuitas? Onde buscar CDI, Selic e IPCA, com que frequência e atraso;
quais as fórmulas de mercado (pós-fixado, IPCA + x%, prefixado; dias úteis, base 252, feriados);
existe fonte gratuita do preço de mercado do Tesouro Direto, e qual valor as pessoas acompanham?

## Resposta curta

- **CDI, Selic e IPCA saem de graça da API do SGS do Banco Central**, sem chave:
  `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{código}/dados?formato=json&dataInicial=dd/mm/aaaa&dataFinal=dd/mm/aaaa`.
  CDI diário = série **12**, Selic diária = **11**, IPCA mensal = **433**. O número-índice do IPCA vem
  do IBGE (SIDRA, tabela 1737).
- **Atraso**: CDI e Selic do dia D aparecem no SGS até o dia útil seguinte, o que basta, porque o
  valor de hoje só usa taxas até ontem. O IPCA de um mês sai por volta do dia 10 do mês seguinte.
- **Fórmulas**: tudo em dias úteis, base 252, com o calendário de feriados nacionais da ANBIMA
  (planilha gratuita até 2099). Pós-fixado = produto dos fatores diários `(1 + p·CDI_dia)`;
  prefixado = `(1 + taxa)^(du/252)`; IPCA + x% = número-índice do IPCA (com pro rata no mês
  corrente) × `(1 + x)^(du/252)`.
- **Tesouro Direto tem preço de mercado gratuito**: o CSV "Taxas dos Títulos Ofertados pelo Tesouro
  Direto" no Tesouro Transparente, com PU diário por título, atualizado no dia útil seguinte. O
  antigo JSON do site do Tesouro Direto devolve **410 Gone**.
- **Recomendação**: calcular tudo **na curva** (valor que o título terá se levado ao vencimento),
  e para Tesouro Direto mostrar o **valor de mercado** a partir do CSV, porque é o que o extrato do
  Tesouro Direto e a corretora mostram. Detalhes na última seção.

## 1. Fontes dos índices

### 1.1 API do SGS (Banco Central)

Formato: `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{código}/dados?formato=json&dataInicial=dd/mm/aaaa&dataFinal=dd/mm/aaaa`,
ou `.../dados/ultimos/{n}?formato=json` para os últimos _n_ valores. Resposta:
`[{"data":"22/09/2026","valor":"0.050788"}, ...]` (data em `dd/mm/aaaa`, valor como texto com ponto
decimal). Sem autenticação. [1][2]

**Limite desde 26/03/2025**: séries diárias exigem `dataInicial`/`dataFinal` e aceitam no máximo
**10 anos por consulta**; sem filtro, a API responde erro ("O sistema aceita uma janela de consulta
de, no máximo, 10 anos em séries de periodicidade diária"). Verificado em 23/09/2026. [1][2]

| Série | Código SGS | Unidade | Periodicidade | Uso |
|---|---|---|---|---|
| CDI (Taxa DI) | **12** | % ao dia | dias úteis | pós-fixado % do CDI (CDB, LCI, LCA, debênture DI) |
| CDI anualizada base 252 | 4389 | % ao ano | dias úteis | exibição ("CDI hoje: 13,65% a.a.") |
| Selic over | **11** | % ao dia | dias úteis | Tesouro Selic (LFT) |
| Selic anualizada base 252 | 1178 | % ao ano | dias úteis | exibição |
| Meta Selic (Copom) | 432 | % ao ano | diária, preenchida adiante | **não serve para cálculo** (a API devolve datas futuras, ex.: 04/11/2026) |
| IPCA variação mensal | **433** | % no mês | mensal (data = dia 1 do mês de referência) | IPCA + x% |

Observações conferidas na API em 23/09/2026:

- As séries diárias só têm dias úteis (07/09/2026 não aparece), então a própria série serve de
  conferência do calendário.
- A série 12 traz a taxa diária com 6 casas em percentual, isto é, **8 casas como fração**, que é a
  precisão que a B3 usa para `TDI_k` [4]. Ex.: 22/09/2026 = 0,050788% a.d. ≈ 13,65% a.a. (confere:
  `1,1365^(1/252) − 1 ≈ 0,00050788`).
- Nas datas consultadas (jan/2024 e set/2026) CDI (12) e Selic (11) tiveram o mesmo valor diário.
  Não assumir que sempre são iguais: são séries distintas e historicamente o CDI ficou alguns
  centésimos abaixo da Selic. Usar cada uma para o seu indexador.
- ⚠ Os nomes e unidades das séries 12 e 4389 foram confirmados pelos valores devolvidos, não pela
  página de metadados (a página do SGS não rendeu o conteúdo). As séries 11, 1178 e 432 foram
  confirmadas pelo catálogo de dados abertos do BCB [2].

### 1.2 Atraso de publicação

- **CDI**: a B3 apura a Taxa DI com base nas operações do próprio dia e a divulga ao fim do dia; a
  metodologia prevê usar a Selic over do dia útil anterior se esta não sair até as 21h [5]. No SGS,
  às 14h50 de 23/09/2026 o último valor era o de 22/09/2026, ou seja, **D+1 útil**.
- **Selic over**: mesmo comportamento observado (último valor 22/09/2026 em 23/09/2026).
- **IPCA**: o IBGE divulga o índice do mês por volta do dia 10 do mês seguinte. Calendário oficial
  consultado: set/2026 sai em 09/10/2026, out/2026 em 12/11/2026, nov/2026 em 11/12/2026 [6]. A
  série 433 em 23/09/2026 ia até agosto/2026 (−0,32%).
- **Tesouro Direto (CSV)**: em 23/09/2026 o arquivo, modificado em 21/09/2026, tinha como última
  data-base 18/09/2026 — atraso de ~1 dia útil, podendo chegar a 2–3 dias corridos [7]. ⚠ Uma
  amostra só; a frequência de atualização não está documentada na página.

### 1.3 IPCA: número-índice e projeção

- **Número-índice** (base dez/1993 = 100), que é o que a metodologia usa em vez de encadear
  variações arredondadas: SIDRA, tabela 1737, variável 2266 —
  `https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/2266/p/last%203?formato=json`
  (ago/2026 = 7633,23) [8].
- **Projeção para o mês ainda não divulgado**: a ANBIMA usa a projeção do seu Grupo Consultivo
  Macroeconômico [3], que não tem API aberta. Alternativa gratuita: a mediana do Focus para o IPCA
  mensal, na API Olinda do BCB —
  `https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativaMercadoMensais?$filter=Indicador eq 'IPCA'&$orderby=Data desc&$format=json`
  [9]. ⚠ Usar o Focus faz o valor diferir levemente do da ANBIMA/Tesouro até o IPCA oficial sair;
  para um painel pessoal a diferença é de centavos.

### 1.4 Calendário de feriados

- A ANBIMA publica os **feriados nacionais bancários até 2099** numa planilha única:
  `https://www.anbima.com.br/feriados/arqs/feriados_nacionais.xls` (baixada em 23/09/2026, 111 KB)
  [10]. Não inclui feriados municipais, que não afetam a contagem de dias úteis do mercado.
- O endereço citado na página (`http://www.anbima.com.br/arqs/feriados_nacionais.xls`) responde
  404; o válido é o de cima.
- Sugestão: gerar uma tabela estática no código a partir da planilha (só datas até, digamos, 2060)
  e conferir contra as datas presentes na série 12 do SGS.

## 2. Fórmulas

Convenções gerais (metodologia ANBIMA de títulos públicos [3], metodologia B3 do DI acumulado [4]):

- **du** = dias úteis entre a data inicial (**inclusive**) e a data final (**exclusive**).
- Taxa anual → diária: `(1 + taxa_aa)^(1/252) − 1`. Base **252 dias úteis**.
- A taxa do dia _k_ remunera o dia _k_; o valor de hoje usa as taxas de todos os dias úteis desde a
  aplicação até **ontem**. Por isso o atraso D+1 do SGS não atrapalha.

### 2.1 Pós-fixado (% do CDI) — CDB, LCI, LCA, debêntures DI

Fórmula da B3 para o DI acumulado [4]:

```
C = ∏ (1 + p · TDI_k)      para k da data de aplicação (inclusive) até a data de cálculo (exclusive)
valor_atual = valor_aplicado × C
```

- `p` = percentual contratado (ex.: 110% → 1,10), com 4 casas decimais.
- `TDI_k` = Taxa DI do dia _k_ **ao dia**, 8 casas com arredondamento = série SGS 12 ÷ 100.
- Cada fator diário com 16 casas sem arredondamento; o produto é truncado em 16 casas a cada passo;
  `C` final com 8 casas arredondado.
- **CDI + spread** (ex.: CDI + 1% a.a.), menos comum: `∏(1 + TDI_k) × (1 + spread)^(du/252)`.
  ⚠ Convenção não coberta pelas fontes lidas; conferir na lâmina do produto.

**Tesouro Selic (LFT)**: `VNA = 1000 × ∏(1 + Selic_k)` desde a data-base (inclusive; ⚠ 01/07/2000 segundo
a literatura, não confirmado nas fontes lidas) até a data (exclusive), com a Selic diária da série 11; fator acumulado arredondado em 16 casas, VNA
truncado em 6 [3]. O preço de mercado é `PU = VNA × cotação`, onde a cotação sai da taxa de
mercado; na curva, para quem comprou com ágio/deságio, ver 2.4.

### 2.2 Prefixado — CDB prefixado, LTN (Tesouro Prefixado)

```
valor_na_curva = valor_aplicado × (1 + taxa_aa)^(du/252)       du = aplicação (incl.) → hoje (excl.)
```

LTN (Tesouro Prefixado) a preço de mercado, com a taxa do dia [3]:

```
PU = 1000 / (1 + taxa_aa)^(du/252)       du = liquidação (incl.) → vencimento (excl.)
```

Truncamentos da ANBIMA: taxa 4 casas, exponencial de dias 14 casas, PU 6 casas, valor financeiro
2 casas [3].

### 2.3 Híbrido (IPCA + x%) — NTN-B (Tesouro IPCA+), CDB/LCI/debênture IPCA+

**VNA da NTN-B** (valor nominal atualizado pelo IPCA; R$ 1.000 na data-base; ⚠ 15/07/2000 segundo a literatura, não confirmado nas fontes
lidas) [3]:

- **No dia 15** (ou no dia útil seguinte, se não for útil): `VNA = 1000 × IPCA_(t−1) / IPCA_0` com
  números-índice do IBGE (mês anterior ao de referência e mês anterior à data-base).
- **Entre o dia 15 e a divulgação do IPCA do mês**: usa a projeção do IPCA do mês, pro rata:
  `VNA = VNA_mês × (1 + proj_IPCA)^(du1/du2)`, `du1` = dias úteis do dia 15 do mês (incl.) até a data
  (excl.), `du2` = dias úteis do dia 15 do mês até o dia 15 do mês seguinte.
- **Entre a divulgação do IPCA e o dia 15**: troca a projeção pelo IPCA oficial do mês:
  `VNA = VNA_(t−1) × (IPCA_(t−1)/IPCA_(t−2))^(du1/du2)`.
- Casas: VNA truncado em 6, fator pro rata truncado em 14, variação do mês oficial truncada em 16,
  projeção arredondada em 2 [3].

**Valor na curva de uma aplicação IPCA + x%**:

```
valor_na_curva = valor_aplicado × (VNA_hoje / VNA_na_aplicação) × (1 + x)^(du/252)
```

Para títulos privados (CDB/LCI/debênture IPCA+), a mecânica é a mesma, mas **a data de aniversário e
a defasagem do IPCA vêm da escritura/lâmina** e variam entre emissores (há quem use aniversário no
dia da aplicação e IPCA com dois meses de defasagem). ⚠ Não há padrão público único; usar a
convenção da NTN-B (dia 15) como padrão e aceitar a divergência de centavos.

Cupons semestrais (Tesouro IPCA+ com Juros Semestrais, NTN-F): o PU é a soma dos fluxos
descontados pela taxa [3]. Para um painel "na curva", basta tratar o cupom recebido como um
Provento em dinheiro e continuar a curva sobre o principal.

### 2.4 Na curva × a mercado

- **Na curva**: o valor cresce pela taxa contratada (a da compra). É o que um título vale se for
  levado ao vencimento; é como bancos mostram CDB/LCI.
- **A mercado**: o preço que se recebe vendendo hoje; muda com a taxa de mercado. Juros de mercado
  subindo derrubam o preço, e vice-versa. O Tesouro Direto afirma que quem leva ao vencimento recebe
  a rentabilidade contratada "independentemente das variações de preço", e que na venda antecipada
  o Tesouro recompra "pelo valor de mercado" [11].
- Para títulos privados sem mercado secundário líquido não há preço de mercado público: só a curva.

## 3. Preço de mercado do Tesouro Direto

- **Fonte gratuita, oficial**: conjunto "Taxas dos Títulos Ofertados pelo Tesouro Direto" no
  Tesouro Transparente (licença ODbL) [7]. CSV único com todo o histórico:
  `https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv`
  Colunas: `Tipo Titulo;Data Vencimento;Data Base;Taxa Compra Manha;Taxa Venda Manha;PU Compra Manha;PU Venda Manha;PU Base Manha`
  (separador `;`, decimal com vírgula, datas `dd/mm/aaaa`). Ex.: `Tesouro Selic;01/03/2031;18/09/2026;0,07;0,08;19851,50;19832,55;19832,55`.
  O valor de mercado de uma posição = quantidade de títulos × **PU Venda Manhã** da data mais
  recente. O metadado do conjunto pode ser lido por
  `https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=taxas-dos-titulos-ofertados-pelo-tesouro-direto`
  (útil para descobrir a URL caso o recurso mude).
- ⚠ O arquivo é grande (histórico desde 2002, vários MB). Baixar uma vez ao dia no servidor e
  guardar só os títulos da carteira.
- ⚠ O JSON que muitos projetos usavam
  (`https://www.tesourodireto.com.br/json/br/com/b3/tesourodireto/service/api/treasurybondsinfo.json`)
  respondeu **HTTP 410 Gone** em 23/09/2026. Não usar.
- O site do Tesouro Direto bloqueia acesso automatizado (HTTP 403 ao WebFetch em 23/09/2026).

## 4. Qual valor as pessoas acompanham

- O **extrato do Tesouro Direto e as corretoras mostram o valor a mercado** (o "valor líquido" de
  venda antecipada), e o próprio Tesouro orienta acompanhar a evolução dos preços na página de
  rentabilidade dos títulos [11]. ⚠ Afirmação sobre o que corretoras mostram vem do uso comum, não
  de uma fonte primária única.
- **CDB, LCI, LCA** aparecem **na curva** nos bancos e corretoras, porque não há preço de mercado
  público.

## Recomendação para a carteira (#59)

1. **Índices**: um job diário no servidor busca no SGS as séries 12 (CDI) e 11 (Selic) desde a
   última data guardada, a 433 e o número-índice do IPCA (SIDRA 1737/2266) uma vez por mês, e guarda
   tudo no SQLite. Nada de chamada à API na hora de renderizar o painel. Respeitar a janela de 10
   anos por consulta ao preencher o histórico.
2. **Calendário**: tabela estática de feriados nacionais gerada da planilha da ANBIMA.
3. **Valor atual de Renda Fixa privada (CDB/LCI/LCA/debênture)**: sempre **na curva**, pelas
   fórmulas 2.1–2.3, com o indexador cadastrado (% do CDI, IPCA + x%, prefixado x%).
4. **Tesouro Direto**: mostrar o **valor a mercado** pelo CSV do Tesouro Transparente, que é o que o
   extrato oficial mostra e o que se recebe vendendo. Opcionalmente exibir também o valor na curva,
   mas a decisão de qual entra na comparação classe × meta cabe à sessão de grilling. ⚠ Questão
   aberta para o mapa.
5. **Projeção do IPCA**: usar a mediana mensal do Focus (API Olinda) para o pro rata antes do IPCA
   oficial sair; aceitar a divergência de centavos em relação ao Tesouro.
6. **Precisão**: seguir as casas e truncamentos da B3/ANBIMA acima; usar aritmética decimal (não
   `number` de ponto flutuante) se o valor precisar bater com o extrato ao centavo.

## Fontes (acesso em 23/09/2026)

1. Banco Central — API SGS, consultas diretas a `https://api.bcb.gov.br/dados/serie/bcdata.sgs.{12,4389,11,1178,432,433}/dados`.
2. Banco Central — Portal de Dados Abertos, conjuntos "Taxa de juros - Selic" (11), "Selic anualizada
   base 252" (1178), "Meta Selic definida pelo Copom" (432), com a nota do limite de 10 anos:
   https://dadosabertos.bcb.gov.br/api/3/action/package_show?id=11-taxa-de-juros---selic
3. ANBIMA — Metodologia ANBIMA de Precificação de Títulos Públicos Federais (seções 6–7: casas
   decimais, LTN, NTN-F, NTN-B, NTN-C, LFT):
   https://www.anbima.com.br/data/files/A0/02/CC/70/8FEFC8104606BDC8B82BA2A8/Metodologias%20ANBIMA%20de%20Precificacao%20Titulos%20Publicos.pdf
4. B3 — Metodologia de Cálculo Acumulado de DI:
   https://www.b3.com.br/pt_br/market-data-e-indices/indices/indices-de-segmentos-e-setoriais/di/metodologia-de-calcudo-acumulado-de-di/
5. B3 — Metodologia de Apuração da Taxa DI:
   https://www.b3.com.br/pt_br/market-data-e-indices/indices/indices-de-segmentos-e-setoriais/di/metodologia-de-apuracao-da-taxa/
6. IBGE — Calendário de divulgações do IPCA (API):
   https://servicodados.ibge.gov.br/api/v3/calendario/9256
7. Tesouro Transparente — "Taxas dos Títulos Ofertados pelo Tesouro Direto":
   https://www.tesourotransparente.gov.br/ckan/dataset/taxas-dos-titulos-ofertados-pelo-tesouro-direto
8. IBGE — SIDRA, tabela 1737 (IPCA, número-índice):
   https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/2266/p/last%203?formato=json
9. Banco Central — Expectativas de Mercado (Focus), API Olinda:
   https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativaMercadoMensais
10. ANBIMA — Feriados nacionais: https://www.anbima.com.br/feriados/feriados.asp
    (planilha: https://www.anbima.com.br/feriados/arqs/feriados_nacionais.xls)
11. Tesouro Direto — páginas de títulos e rentabilidade (marcação a mercado, venda antecipada):
    https://www.tesourodireto.com.br/en/produtos/titulos/prefixado ,
    https://www.tesourodireto.com.br/en/produtos/dados-sobre-titulos/rendimento-dos-titulos
    (conteúdo lido via resultados de busca; o site respondeu 403 à leitura direta).
