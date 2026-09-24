# Pesquisa: cotação e proventos de ativos americanos sem cadastro nem chave

Ticket: #66 (mapa #59). Complementa `docs/research/apis-de-cotacao.md` (branch
`research/apis-de-cotacao`), que recomendava a Alpha Vantage para ações americanas. A nova exigência
é: **totalmente grátis e sem cadastro nem chave de API de nenhum tipo**. Todas as requisições abaixo
foram feitas com `curl` em **24/09/2026** (manhã, pré-mercado nos EUA). Onde não deu para confirmar,
o texto marca **[incerto]**.

## Resposta curta

Nenhuma fonte atende ao mesmo tempo às três condições: **sem chave**, **termos de uso que não proíbem
acesso automatizado** e **cobertura de todas as ações/ETFs listados nos EUA** (Nasdaq, NYSE e NYSE
Arca). O quadro é este:

| Necessidade | Melhor fonte técnica | Termos permitem automação? | Alternativa "limpa" nos termos |
|---|---|---|---|
| Cotação EUA | API do site da Nasdaq (`api.nasdaq.com`) — cobre Nasdaq, NYSE e Arca | **Não** (mesma cláusula que tirou o Yahoo) | Página do Google Finance (raspagem de HTML, frágil) |
| Proventos EUA | API do site da Nasdaq — **só ativos listados na Nasdaq** | **Não** | Nenhuma encontrada |
| Desdobramentos EUA | Calendário de desdobramentos da Nasdaq (janela de ~6 meses, todas as bolsas) | **Não** | Nenhuma encontrada |

Decisão que fica para o usuário (não resolvida por esta pesquisa):

1. **Aceitar o risco de termos da Nasdaq** (o mesmo tipo de risco que descartou o Yahoo) e usar
   `api.nasdaq.com` para cotação e para proventos dos ativos listados na Nasdaq; ou
2. **Cotação pelo Google Finance** (termos permitem, técnica frágil) e **proventos americanos
   lançados à mão**; ou
3. **Relaxar a exigência** e voltar à Alpha Vantage (chave grátis, 25 req/dia).

Em qualquer caso, **proventos de KO, JNJ, VOO, SCHD** (NYSE/Arca) não têm fonte sem chave e com
termos limpos: ficam para lançamento manual ou para uma fonte com chave.

Lado B3 e cripto:

- **ISIN do ticker na B3: sim, dá.** O endpoint de cotação não traz ISIN, mas o
  `GetDetail` do site da B3 (sem chave) devolve `otherCodes: [{code: "PETR3", isin: "BRPETRACNOR9"},
  {code: "PETR4", isin: "BRPETRACNPR6"}]`, que casa direto com o `isinCode` das linhas de proventos.
- **CoinGecko sem chave: funciona hoje** (`/simple/price` e `/search`). O limite sem chave **não é
  publicado em número**; a documentação diz só "IP-based rate limiting". Na prática, o 429 veio depois
  de ~8 chamadas em menos de um minuto, com `retry-after: 34`.

## Fontes americanas, uma a uma

### Nasdaq — JSON do site (`api.nasdaq.com`)

- **Chave**: não. **Exige User-Agent de navegador**: sem ele a conexão fica pendurada até o timeout
  (testado: `curl` sem `-A` → código `000`). Usei também `Accept: application/json`.
- **Cotação** — `GET https://api.nasdaq.com/api/quote/{SYMBOL}/info?assetclass=stocks|etf`
  - Funcionou para AAPL (Nasdaq), KO (NYSE) e VOO (Arca, `exchange: "PSE"`).
  - `data.primaryData.lastSalePrice` (`"$336.1852"`, string com `$`), `netChange`,
    `percentageChange`, `lastTradeTimestamp` (`"Sep 24, 2026 6:15 AM ET"`), `isRealTime: true`
    (pré-mercado). `data.secondaryData.lastSalePrice` traz o fechamento anterior
    (`"Closed at Sep 23, 2026 4:00 PM ET"`).
  - `assetclass` errado muda a resposta: ETF precisa de `assetclass=etf`.
- **Histórico diário** — `GET .../quote/{SYMBOL}/historical?assetclass=stocks&fromdate=AAAA-MM-DD&todate=AAAA-MM-DD&limit=N`
  → `data.tradesTable.rows[]` com `date`, `close`, `open`, `high`, `low`, `volume` (funcionou para KO).
- **Proventos** — `GET .../quote/{SYMBOL}/dividends?assetclass=stocks|etf`
  - `data.dividends.rows[]`: `exOrEffDate` (data ex, `MM/DD/AAAA`), `type` (`"Cash"`), `amount`
    (`"$0.27"`), `declarationDate`, `recordDate`, `paymentDate`, `currency` (`"USD"`).
  - **Só para ativos listados na Nasdaq.** Para os demais vem `rows: null` e
    `message: "Dividend History for Non-Nasdaq symbols is not available"`. Testado:
    - com histórico: AAPL (83 linhas, desde 1988), MSFT (55), QQQ, VXUS (55), BND (200);
    - **sem histórico**: KO, JNJ (NYSE), VOO, SCHD (NYSE Arca).
  - Valores **como declarados, sem ajuste por desdobramento**: NVDA mostra US$ 0,04 em 03/2024 e
    US$ 0,01 depois do desdobramento 10:1 de 06/2024; US$ 0,16 antes do 4:1 de 2021.
  - Não traz desdobramentos (`type` só veio `Cash`).
- **Calendário de proventos** — `GET .../calendar/dividends?date=AAAA-MM-DD` → `data.calendar.rows[]`
  com `symbol`, `dividend_Ex_Date`, `payment_Date`, `record_Date`, `dividend_Rate`. Varri 16 dias
  úteis de setembro/2026 e **nenhum ativo NYSE/Arca apareceu** (KO tem data ex em 15/09/2026 e não
  estava lá). Parece restrito à Nasdaq também **[incerto]**.
- **Desdobramentos** — `GET .../calendar/splits` → `data.rows[]` com `symbol`, `ratio`
  (`"3 : 1"`, `"1 : 10"` para grupamento), `executionDate`. Cobre outras bolsas (ex.: DHY). O
  parâmetro `date` é ignorado: a janela devolvida foi sempre de ~6 meses para trás a ~2 semanas para
  frente (461 linhas, 24/03/2026 a 09/10/2026). Serve para detectar desdobramentos novos se consultado
  com frequência, não para histórico.
- **Limites**: não publicados. O `robots.txt` do `www.nasdaq.com` pede `Crawl-delay: 30`; o do
  `api.nasdaq.com` é `Disallow: /`.
- **Termos** [1] (atualizados em 11/05/2026): licença "solely for your personal, non-commercial use",
  mas também: "Not access or use the Service, or any process, whether automated or manual, to capture
  data or content from the Service [...] for any reason". **Proíbe captura automatizada**, no mesmo
  sentido dos termos do Yahoo.
- **Veredito**: a melhor fonte técnica sem chave (cotação de todas as bolsas, proventos com data ex e
  de pagamento para Nasdaq), mas **esbarra no mesmo critério que eliminou o Yahoo**.

### Google Finance (página HTML)

- **Chave**: não. `https://www.google.com/finance/quote/KO:NYSE?hl=en` redireciona (302) para
  `/finance/beta/quote/KO:NYSE`; a página tem ~1,2 MB.
- **Conteúdo**: o preço aparece no HTML (`<span>$88.09</span>` em classes ofuscadas como `N6SYTe`) e
  a série intradiária aparece em arrays JavaScript. Da parte de proventos, só **o último**:
  "Quarterly dividend $0.53" e "Ex-dividend date Sep 15, 2026". **Sem data de pagamento e sem
  histórico.** Não há API JSON documentada.
- **Termos** [2] (vigentes desde 30/07/2026): proíbe "using automated means to access content from any
  of our services in violation of the machine-readable instructions on our web pages (for example,
  robots.txt files...)". O `robots.txt` do `www.google.com` **não bloqueia `/finance`** (só `/m/`,
  com `Allow: /m/finance`). Logo, a leitura automatizada da página **não viola** esse item.
- **Veredito**: a única fonte de cotação americana, sem chave, cujos termos não proíbem automação.
  Custa uma raspagem de HTML com classes ofuscadas, que quebra a cada mudança de layout. Não resolve
  proventos.

### Cboe — cotação atrasada (`cdn.cboe.com`)

- **Chave**: não. `GET https://cdn.cboe.com/api/global/delayed_quotes/quotes/{SYMBOL}.json` →
  `data.current_price`, `close`, `prev_day_close`, `last_trade_time`, e `timestamp` do arquivo.
  Funcionou para AAPL, KO e VOO.
- **Atualidade** **[incerto]**: às 10:22 GMT de 24/09 o arquivo ainda era de 23/09 03:40 GMT
  (`last-modified`), com o fechamento de **22/09**. Ou seja, estava um pregão atrasado. Pode ser que
  atualize só durante o pregão; não confirmei.
- **Proventos**: não tem.
- **Termos** [3] (atualizados em 16/11/2022): não falam de automação, mas só permitem "view, print and
  download one copy of the Materials for your personal non-commercial use" e proíbem "store [...] in
  an electronic retrieval system". Guardar o preço no banco do app entra em zona cinzenta.
- **Veredito**: alternativa de reserva para cotação, com atualidade duvidosa.

### Stooq

- `https://stooq.com/q/l/?s=aapl.us&f=sd2t2ohlcv&h&e=csv` → **404** (o endpoint de cotação em CSV
  não existe mais).
- `https://stooq.com/q/d/l/?s=ko.us&i=d` (histórico) e as páginas de cotação → **desafio JavaScript
  de prova de trabalho** ("This site requires JavaScript to verify your browser"). Inviável com
  `fetch` simples.
- **Veredito**: fora.

### StockAnalysis.com (JSON interno)

- `GET https://stockanalysis.com/api/symbol/s/ko/dividend` (ações) e `.../api/symbol/e/voo/dividend`
  (ETFs) respondem sem chave e **cobrem NYSE e Arca**: `data.history[]` com `dt` (data ex), `amt`
  (`"$0.530"`), `record`, `pay`.
- Mas: valores **ajustados por desdobramento** (NVDA 03/2024 vem US$ 0,004), histórico de só ~5 anos
  (KO: 20 linhas, desde 2021), e os termos [4] (atualizados em 18/09/2026) dizem: "You may not use
  bots, scripts, scrapers [...] or any other automated or programmatic methods to access the platform,
  collect data from it". **Proibição explícita.**
- **Veredito**: fora pelos termos.

### SEC EDGAR

- **Chave**: não, mas exige `User-Agent` com identificação (sem ele: 403). Dados públicos, acesso
  automatizado permitido pela SEC.
- **Sem preços.** Proventos só indiretamente: o conceito XBRL `CommonStockDividendsPerShareDeclared`
  da KO parou em 2009 no endpoint `companyconcept`, e a busca textual
  (`efts.sec.gov/LATEST/search-index?q="quarterly dividend"&forms=8-K&ciks=0000021344`) achou só 2
  8-K da KO desde 2025 — ela não registra cada dividendo em 8-K. ETFs (VOO) não publicam
  distribuições assim.
- **Veredito**: fora.

### MarketWatch / WSJ

- `https://www.marketwatch.com/investing/stock/ko` e `https://www.wsj.com/market-data/quotes/KO` →
  **401** (bloqueio antirrobô). Fora.

### Precisam de chave (confirmado sem chave em 24/09/2026)

| Serviço | Requisição sem chave | Resposta |
|---|---|---|
| Twelve Data | `api.twelvedata.com/price?symbol=AAPL` | 401 "apikey parameter is incorrect or not specified" |
| Twelve Data, chave `demo` | `...&apikey=demo` | funciona só para AAPL; KO → 401 "The 'demo' API key is only used for initial familiarity" |
| Financial Modeling Prep | `financialmodelingprep.com/stable/quote?symbol=AAPL` | 401 "Invalid API KEY" |
| Polygon / Massive | `api.polygon.io/v2/aggs/ticker/AAPL/prev` (e `api.massive.com`) | 401 "API Key was not provided" |
| Finnhub | `finnhub.io/api/v1/quote?symbol=AAPL` | 401 "Please use an API key." |
| Tiingo | `api.tiingo.com/tiingo/daily/aapl/prices` | 403 "Please supply a token" |
| EODHD | `eodhd.com/api/real-time/AAPL.US` | 401; chave `demo` em `/div/KO.US` → "Forbidden" |
| marketstack | `api.marketstack.com/v2/eod/latest?symbols=AAPL` | sem resposta (timeout) **[incerto]** |
| IEX (API antiga, sucessora do IEX Cloud) | `api.iextrading.com/1.0/tops?symbols=AAPL` | 403 |

### Não testadas

Sites de gestoras de ETF (Vanguard, iShares, SPDR) publicam as distribuições de seus fundos, mas cada
uma num formato; a página da Vanguard (`investor.vanguard.com/.../voo/distribution`) é uma aplicação
JavaScript e não expôs JSON óbvio **[incerto]**. Investing.com e Morningstar não foram testados.

## B3: o ISIN de cada ticker

Pergunta: dá para casar uma linha de provento (indexada pelo código do emissor, com `isinCode`) com
PETR3 ou PETR4, sem chave?

- `GET https://cotacao.b3.com.br/mds/api/v1/instrumentQuotation/PETR4` **não traz ISIN**:
  `Trad[0].scty` só tem `symb` (`"PETR4"`), `desc` (`"PETROBRAS   PN      N2"`), `mkt.nm` e a cotação.
- **`GetDetail` traz** (testado): `GET https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetDetail/{base64}`
  com `{"codeCVM":"9512","language":"pt-br"}` em Base64 devolve:

  ```json
  "otherCodes": [
    { "code": "PETR3", "isin": "BRPETRACNOR9" },
    { "code": "PETR4", "isin": "BRPETRACNPR6" },
    { "code": "PETR-DEB62", "isin": "BRPETRDBS092" }
  ]
  ```

- O `codeCVM` vem no próprio `GetListedSupplementCompany` (o endpoint de proventos), campo
  `codeCVM: "9512"`. Fluxo: proventos por emissor → `codeCVM` → `GetDetail` → mapa ISIN→ticker →
  cada linha de `cashDividends[]` casa pelo `isinCode`. As linhas também têm `assetIssued`, igual ao
  `isinCode` nos casos vistos.
- Units também casam: SANB → `SANB3` `BRSANBACNOR8`, `SANB4` `BRSANBACNPR5`, `SANB11`
  `BRSANBCDAM13`, e os proventos da SANB vieram com esses três ISINs.
- FIIs: `GetListedSupplementFunds` (MXRF) traz `isinCode` `BRMXRFCTF008` nas linhas e
  `codeCVM: null`; o `GetDetailFundSIG` testado voltou vazio. Como o FII normalmente tem uma só classe
  de cota, o casamento pelo código (`MXRF` → `MXRF11`) basta **[incerto]** para fundos com mais de uma
  classe.

## CoinGecko sem chave

- `GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=brl,usd&include_last_updated_at=true`
  → 200, `{"bitcoin":{"brl":430016,"usd":83209,"last_updated_at":1790245720},...}`. Vários `ids` numa
  chamada só. Cabeçalho `cache-control: max-age=30, s-maxage=60`.
- `GET https://api.coingecko.com/api/v3/search?query=solana` → 200, `coins[]` com `id`, `symbol`,
  `name`, `market_cap_rank` (serve para achar o `id` a partir do símbolo).
- **Limite sem chave**: a documentação [5] diz apenas "Keyless (no API key): IP-based rate limiting —
  shared across all users on the same IP" (o plano Demo, com cadastro, é 100/min). Medido: depois de
  ~8 chamadas em menos de 1 minuto veio **429** com `retry-after: 34`. Tratar como **~5 a 10 por
  minuto [incerto]**; com uma chamada por atualização para todas as criptos, sobra folga.
- **Termos da API** [6]: pedem atribuição visível "Powered by CoinGecko".

## Riscos principais

- **Termos**: a única fonte técnica boa sem chave para ações americanas (Nasdaq) proíbe captura
  automatizada, igual ao Yahoo. Usá-la é uma escolha consciente de risco, não uma solução limpa.
- **Cobertura de proventos**: mesmo aceitando a Nasdaq, NYSE e Arca (KO, JNJ, VOO, SCHD) ficam sem
  histórico de proventos. Nenhuma fonte sem chave e com termos limpos cobre esses ativos.
- **Fragilidade**: Nasdaq, Google Finance, Cboe e B3 são JSON/HTML internos de sites, sem contrato.
  Mudam sem aviso; a leitura deve ficar atrás de uma porta própria, trocável.
- **Formatos**: Nasdaq devolve números como string com `$` e vírgula de milhar (`"$0.27"`,
  `"113,610.018157"`) e datas `MM/DD/AAAA`; B3 usa `dd/mm/aaaa` e vírgula decimal.
- **Desdobramentos EUA**: sem histórico sem chave; o calendário da Nasdaq só mostra ~6 meses.
- **CoinGecko**: limite sem chave não publicado e compartilhado por IP.

## Fontes

1. Nasdaq — Legal (termos de uso). https://www.nasdaq.com/legal (acesso em 24/09/2026)
2. Google — Terms of Service. https://policies.google.com/terms?hl=en-US e https://www.google.com/robots.txt (acesso em 24/09/2026)
3. Cboe — Terms and Conditions for Use of Cboe Websites. https://www.cboe.com/terms (acesso em 24/09/2026)
4. StockAnalysis — Terms of Use. https://stockanalysis.com/terms-of-use/ (acesso em 24/09/2026)
5. CoinGecko — Errors & Rate Limits. https://docs.coingecko.com/docs/common-errors-rate-limit (acesso em 24/09/2026)
6. CoinGecko — API Terms. https://www.coingecko.com/en/api_terms (acesso em 24/09/2026)

Formatos de resposta conferidos por requisição direta em 24/09/2026: Nasdaq (`info`, `historical`,
`dividends`, `calendar/dividends`, `calendar/splits`), Google Finance, Cboe, Stooq, StockAnalysis,
SEC EDGAR, MarketWatch/WSJ, os serviços com chave da tabela, B3 (`instrumentQuotation`,
`GetListedSupplementCompany`, `GetDetail`, `GetListedSupplementFunds`) e CoinGecko.
