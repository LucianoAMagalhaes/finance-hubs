# Pesquisa: como o Google Finance registra a carteira

Responde ao ticket #62 (mapa #59). Fontes acessadas em 2026-09-23.

## Resumo

- O Google Finance **não tem um livro de operações**. Uma posição é uma lista de **lotes de compra**
  (quantidade, data, preço de compra). Não existe operação de venda, provento nem evento corporativo;
  para "vender", a pessoa edita ou apaga lotes.
- O ganho tem só duas leituras: **1 dia** e **total**. O total é *valor atual − custo informado*
  (a soma do que foi digitado como preço de compra). Não há ganho realizado, e **não há preço médio**
  documentado como coluna.
- **Proventos não são registrados** em lugar nenhum da carteira.
- **Moeda**: a carteira inteira tem uma moeda de exibição; trocá-la converte automaticamente valor
  da carteira e das posições. A documentação não diz qual câmbio nem de que data.
- O painel mostra valor da carteira em tempo real, gráfico do saldo no tempo, retorno "1 Day" e
  "Total", alocação ("Portfolio highlights") e comparação com índices por taxa de retorno ponderada
  no tempo. Na versão nova, com IA (2026), a carteira ganhou a aba *Insights* (alocação por setor,
  risco de concentração, heatmap de desempenho) e passou a ser editada conversando com o painel
  *Research*.
- **Contraste (Kinvo, Investidor10, Status Invest)**: o Investidor10 documenta **compra e venda**
  como lançamentos com **preço médio** automático; o Kinvo documenta **proventos e eventos
  corporativos derivados** da posição na data-com, e não um lançamento que a pessoa digita. Status
  Invest não pôde ser lido na fonte.

Consequência para o mapa: "operações do jeito que o Google Finance registra" só serve de modelo para
a **compra** (ativo, quantidade, data, preço). Venda, provento e evento corporativo **não têm modelo no
Google Finance** e precisam vir de outra referência, como os apps brasileiros.

## Duas versões do Google Finance

A página de ajuda oficial da carteira ([Google Search Help, 11330383][gs-atual]) foi reescrita em
2025/2026 para o "Google Finance com IA". A versão **clássica**, que descrevia os campos e os cálculos,
só está disponível hoje pelo Internet Archive ([cópia de 03/06/2025][gs-2025]; texto idêntico na
[cópia de 05/06/2023][gs-2023]). O blog do Google diz que as carteiras existentes "will be available
automatically" na versão nova ([Google Finance updates, 25/06/2026][blog-jun26]). Assim, o modelo de
dados descrito na versão clássica é o ponto de partida da nova; a página atual não descreve outro.

## 1. Tipos de operação e campos

### Versão clássica ([ajuda arquivada][gs-2025])

Só existe **uma** entrada de dados: adicionar investimento.

> Add shares of a stock, mutual fund, or cryptocurrency to your portfolio … Enter the:
> Number of shares · Date you purchased the shares · Purchase price of the investment at the time you
> purchased the shares. If you purchased shares of the stock on different dates, click
> **More purchases of [X]**.

| Ação | O que pede | Observação |
|---|---|---|
| Adicionar investimento (compra) | Ativo (ação, fundo mútuo ou cripto), **quantidade**, **data da compra**, **preço de compra** | Vários lotes do mesmo ativo via "More purchases of [X]" |
| Adicionar índice | Só o índice | "The index doesn't contribute to your portfolio returns" |
| Remover investimento | — | "Point to the line of the investment … More → Delete" |

Não há campo de corretagem/taxas, de moeda da compra, nem tipo "venda", "dividendo" ou "desdobramento"
na documentação oficial.

Também existem, no nível da carteira: carteira **playground** (simulação, "your investment isn't
included"), ver a carteira como watchlist e vice-versa, renomear, apagar e trocar a moeda.

### Versão com IA (atual, [ajuda atual][gs-atual])

A carteira é criada pelo menu *Portfolio*, pelo painel *Research*, **enviando um arquivo** (imagem ou
planilha) ou em linguagem natural. A edição é feita em *Edit → Edit investments*, dizendo ao painel
Research o que mudar. O exemplo oficial:

> "Remove 50 shares of SPY from my portfolio, add 50 shares of GOOG and adjust my purchase prices."

Ou seja, mesmo na versão nova a operação oficial é **remover cotas e ajustar preços de compra**, e não
registrar uma venda. O blog acrescenta o envio de CSV/PDF e de capturas de tela
([blog, 25/06/2026][blog-jun26]).

## 2. Proventos

**Não registra.** Nenhuma das duas versões da ajuda oficial menciona dividendos, JCP ou rendimentos na
carteira, nem como lançamento manual nem como coisa automática. O retorno "Total" é definido só como
*valor atual − custo* (ver §4), o que exclui proventos.

Fontes secundárias confirmam: o Google Finance mostra o *dividend yield* do ativo como dado, mas "does
not track the dividend income your holdings generate" ([Portfolio Genius][pg]). ⚠️ Fonte secundária;
a ausência é inferida da documentação oficial, que não afirma nada explicitamente.

## 3. Ativos em outra moeda e câmbio

O que a ajuda clássica diz ([ajuda arquivada][gs-2025]):

> You can change the currency your portfolio uses. For example, if you change your portfolio from US
> Dollars to EU Euros, the value of your portfolio and holdings will be automatically converted to EU
> Euros.

Portanto: **uma moeda por carteira**, e a conversão de valor da carteira e das posições é automática.

⚠️ **Não verificado em fonte primária:**
- em que moeda se digita o preço de compra de um ativo estrangeiro (a da bolsa do ativo ou a da
  carteira);
- se o custo é convertido pelo câmbio da **data da compra** ou pelo câmbio **atual** (isso decide se o
  ganho total inclui variação cambial);
- qual fonte de câmbio é usada.

A função `GOOGLEFINANCE` das Planilhas usa o par `"CURRENCY:USDBRL"` para câmbio
([Docs Editors Help][sheets]), mas ela é outro produto e não documenta a carteira.

## 4. Preço médio, ganho e rentabilidade depois de uma venda

O que a ajuda clássica diz ([ajuda arquivada][gs-2025]):

> Your returns are calculated over the previous trading day ("1 Day") and since inception ("Total").
> Total returns are calculated as the difference between current value and reported cost basis (the
> amount you enter in "purchase price" when adding investments).

> Portfolio comparisons use time-weighted rate of return. This adjusts for cash inflows and outflows
> to give you a more representative comparison against benchmarks.

Leitura:
- **Ganho do dia** = variação desde o fechamento do pregão anterior.
- **Ganho total** = valor de mercado atual − soma dos preços de compra informados. É ganho **não
  realizado**, só sobre o que está na carteira.
- **Rentabilidade para comparar com índices** = taxa de retorno ponderada no tempo (TWR), que neutraliza
  entradas e saídas de dinheiro.
- **Preço médio**: a documentação não o menciona. O custo é a soma dos lotes; um preço médio só existiria
  como custo ÷ quantidade, e nenhuma fonte oficial diz que ele é exibido.
- **Depois de uma venda**: como não existe venda, a pessoa **apaga ou reduz lotes**. O custo daqueles
  lotes some do "Total", e o lucro ou prejuízo da venda **não fica registrado em lugar nenhum**. Não há
  regra documentada de qual lote sai primeiro (PEPS, média), porque é a própria pessoa quem escolhe o
  lote que edita.

⚠️ **Não verificado em fonte primária:** o comportamento exato após apagar um lote (se o gráfico
histórico e o TWR são recalculados como se o lote nunca tivesse existido). Os tópicos da comunidade do
Google sobre como registrar venda ([136279292][thr-sell], [219992391][thr-sell2]) existem, mas o
conteúdo é carregado por JavaScript e não pôde ser lido.

## 5. Métricas e colunas do painel

Documentado oficialmente:

| Onde | O que mostra | Fonte |
|---|---|---|
| Topo da carteira | **Valor da carteira**, "calculated in realtime" | [clássica][gs-2025] |
| Gráfico | Saldo da carteira ao longo do tempo (1M, 6M, YTD…) | [clássica][gs-2025] |
| Portfolio highlights | Retorno **"1 Day"** e **"Total"**; **alocação** "across a variety of metrics" | [clássica][gs-2025] |
| Comparação | Carteira contra índices/ativos, por TWR | [clássica][gs-2025] |
| Notícias | "Your portfolio in the news" | [clássica][gs-2025] |
| Aba Insights (nova) | **Alocação** por setor e índice; **risco de concentração**; **heatmap** de ganhos/perdas por investimento | [atual][gs-atual] |

⚠️ **Não verificado em fonte primária:** as colunas da tabela de posições (por ativo). A documentação
só diz que se aponta "the line of the investment". Fontes secundárias falam em valor de mercado,
variação do dia e ganho/perda total por posição ([Portfolio Genius][pg]), mas nenhuma página do Google
lista as colunas.

## 6. Contraste com apps brasileiros

| Tema | Google Finance | Kinvo | Investidor10 | Status Invest |
|---|---|---|---|---|
| Venda como operação | Não (apaga/edita lote) | ⚠️ não verificado | **Sim**: "Compra/Venda", código, data, quantidade, preço ([suporte][i10-sup]) | Sim, aba "Transações" ⚠️ |
| Preço médio | Não documentado | Sim; bonificação entra "sempre sem custos, o que pode distorcer o preço médio" ([FAQ B3][kinvo-b3]) | "O lançamento anterior e o atual são somados", preço médio automático ([suporte][i10-sup]) | ⚠️ não verificado |
| Proventos | Não registra | **Automáticos**: identificados pela posição na data-com; aba "Meus Proventos" com total, média mensal e por ativo ([proventos][kinvo-prov], [FAQ B3][kinvo-b3]) | Acompanha dividendos, JCP e rendimentos "recebidos e a receber", com histórico ([gerenciador][i10-ger]) | Proventos e agenda futura ⚠️ |
| Eventos corporativos | Não existem | Desdobramento, grupamento e bonificação **não vêm da B3**; o Kinvo detecta pela data-com e aplica sozinho ([FAQ B3][kinvo-b3]) | ⚠️ não documentado | Carteira → Configurações → **Grupamento/Desdobramento**: a pessoa **aceita** os eventos pendentes ⚠️ |
| Moeda estrangeira | Uma moeda por carteira, conversão automática | ⚠️ não documentado | Aceita stocks dos EUA; câmbio ⚠️ não documentado | "Visualização em diferentes moedas" ⚠️ |

⚠️ Status Invest: as páginas do produto responderam 403 ao acesso automatizado, e a ajuda não pôde ser
lida. O que aparece na tabela vem de resumos de busca que citam o site, **não confirmados** na fonte.

Padrão comum dos apps brasileiros: **o provento e o evento corporativo são derivados** da posição na
data-com mais uma base de eventos, e a pessoa no máximo confirma. Não são digitados como operação.

## O que não foi possível verificar

1. Colunas da tabela de posições do Google Finance.
2. Câmbio usado para o custo de ativos estrangeiros (da data da compra ou atual) e a moeda em que se
   digita o preço.
3. Efeito de apagar um lote sobre o histórico e o TWR.
4. Se a versão com IA acrescentou venda, proventos ou preço médio que a ajuda atual não descreve.
5. Status Invest como um todo (acesso bloqueado); Investidor10 em eventos corporativos e câmbio; Kinvo em
   câmbio.

## Fontes

- `gs-atual`: Google Search Help, "Use AI-powered Google Finance in Search" (versão atual da página
  de carteiras). <https://support.google.com/websearch/answer/11330383?hl=en>
- `gs-2025`: mesma página, versão clássica "Create & manage portfolios with Google Finance", Internet
  Archive, 03/06/2025.
  <http://web.archive.org/web/20250603103909/https://support.google.com/websearch/answer/11330383>
- `gs-2023`: idem, 05/06/2023.
  <http://web.archive.org/web/20230605044058/https://support.google.com/websearch/answer/11330383>
- `blog-jun26`: Google Blog, "Google Finance updates: New app, portfolios", 25/06/2026.
  <https://blog.google/products-and-platforms/products/search/google-finance-updates-june-2026/>
- `sheets`: Google Docs Editors Help, GOOGLEFINANCE. <https://support.google.com/docs/answer/3093281?hl=en>
- `thr-sell`: Google Search Community, "How to record a 'SELL' transaction in Google Finance
  'Portfolio'?" (não lido).
  <https://support.google.com/websearch/thread/136279292/how-to-record-a-sell-transaction-in-google-finance-portfolio?hl=en>
- `thr-sell2`: Google Search Community, "How do I sell my stocks and cryptocurrency in Google finance"
  (não lido).
  <https://support.google.com/websearch/thread/219992391/how-do-i-sell-my-stocks-and-cryptocurrency-in-google-finance?hl=en>
- `pg`: Portfolio Genius, "Google Finance Portfolio & Watchlist: Free Guide (2026)" (secundária).
  <https://portfoliogenius.ai/blog/google-finance-portfolio-watchlist>
- `kinvo-prov`: Kinvo Suporte, "O que são proventos e como você pode acompanhar no Kinvo".
  <https://suporte.kinvo.com.br/articles/b70a4fe6-d7a0-4322-9e4e-c936246d1435>
- `kinvo-b3`: Kinvo Suporte, perguntas frequentes da conexão B3.
  <https://suporte.kinvo.com.br/articles/93dc3576-86a1-4f73-9011-3e34d2186a7e>
- `i10-sup`: Investidor10, "Tire suas dúvidas sobre a plataforma". <https://investidor10.com.br/suporte/>
- `i10-ger`: Investidor10, "Gerenciador de Carteira de Investimentos Investidor10: como funciona".
  <https://investidor10.com.br/conteudo/gerenciador-de-carteira-de-investimentos-investidor10-como-funciona-e-quais-recursos-oferece-121429/>
- Status Invest, página do produto Carteira (403 no acesso).
  <https://statusinvest.com.br/produtos/carteira-de-investimentos>

[gs-atual]: https://support.google.com/websearch/answer/11330383?hl=en
[gs-2025]: http://web.archive.org/web/20250603103909/https://support.google.com/websearch/answer/11330383
[gs-2023]: http://web.archive.org/web/20230605044058/https://support.google.com/websearch/answer/11330383
[blog-jun26]: https://blog.google/products-and-platforms/products/search/google-finance-updates-june-2026/
[sheets]: https://support.google.com/docs/answer/3093281?hl=en
[thr-sell]: https://support.google.com/websearch/thread/136279292/how-to-record-a-sell-transaction-in-google-finance-portfolio?hl=en
[thr-sell2]: https://support.google.com/websearch/thread/219992391/how-do-i-sell-my-stocks-and-cryptocurrency-in-google-finance?hl=en
[pg]: https://portfoliogenius.ai/blog/google-finance-portfolio-watchlist
[kinvo-prov]: https://suporte.kinvo.com.br/articles/b70a4fe6-d7a0-4322-9e4e-c936246d1435
[kinvo-b3]: https://suporte.kinvo.com.br/articles/93dc3576-86a1-4f73-9011-3e34d2186a7e
[i10-sup]: https://investidor10.com.br/suporte/
[i10-ger]: https://investidor10.com.br/conteudo/gerenciador-de-carteira-de-investimentos-investidor10-como-funciona-e-quais-recursos-oferece-121429/
