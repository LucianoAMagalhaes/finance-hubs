# Pesquisa: APIs gratuitas de cotação, proventos e câmbio

Ticket: #60 (mapa #59). Fontes acessadas em **23/09/2026**. Onde a página oficial não confirmou um
número, o texto marca **[incerto]**.

## Resposta curta

Nenhuma API gratuita cobre sozinha as cinco classes com proventos e eventos corporativos. A
combinação mínima que cobre tudo sem pagar é:

| Necessidade | Fonte recomendada | Chave | Limite gratuito |
|---|---|---|---|
| Cotação de ações da B3 e FIIs | Endpoints públicos do site da B3 (`cotacao.b3.com.br`) | não | não publicado; uso pessoal permitido pelos termos |
| Proventos e eventos corporativos da B3 (ações e FIIs) | Endpoints públicos do site da B3 (`sistemaswebb3-listados.b3.com.br`) | não | idem |
| Cotação, dividendos e desdobramentos de ações americanas | Alpha Vantage | sim (grátis) | 25 requisições/dia |
| Cripto em BRL e USD | CoinGecko (sem chave ou chave Demo) | opcional | Demo: 10 mil créditos/mês, 100/min |
| Câmbio USD/BRL | BCB PTAX (Olinda) | não | sem limite publicado; licença ODbL |
| Índices para Renda Fixa (CDI, Selic, IPCA) | BCB SGS | não | sem limite publicado |

Ou seja: **B3 (site) + Alpha Vantage + CoinGecko + Banco Central**. Só a Alpha Vantage exige
cadastro. A brapi.dev seria a alternativa "documentada" para a B3, mas o plano gratuito **não traz
proventos** nem cripto/moedas; proventos começam no Startup (R$ 99,99/mês).

Riscos principais:

- Os endpoints da B3 **não são uma API documentada**: são o JSON que o próprio site da B3 consome.
  Podem mudar sem aviso. Os termos de uso da B3 permitem uso **exclusivamente pessoal** e proíbem uso
  comercial, o que casa com um app de usuário único, mas não há contrato de estabilidade.
- 25 requisições/dia na Alpha Vantage exigem cache: cotação americana uma vez por dia por ativo e
  proventos/desdobramentos com frequência bem menor (ex.: semanal).

## Candidatas, uma a uma

### Site da B3 (endpoints públicos, não documentados)

- **Cobre**: cotação de qualquer ativo negociado na B3 (ações, FIIs, ETFs, BDRs) e, por empresa ou
  fundo, a lista de **proventos em dinheiro** e **eventos em ações**.
- **Chave**: não. Testado sem autenticação em 23/09/2026.
- **Limites**: não publicados.
- **Termos**: "Os visitantes deste website podem utilizar os dados disponíveis nessas páginas para uso
  exclusivamente pessoal" e "É vedada a utilização dos dados contidos neste website para fins
  comerciais salvo mediante autorização prévia e por escrito da B3". Os termos não falam de acesso
  automatizado. [1]
- **Formato** (verificado por requisição direta):
  - Cotação: `GET https://cotacao.b3.com.br/mds/api/v1/instrumentQuotation/MXRF11` devolve
    `Trad[0].scty.SctyQtn.curPrc` (preço atual), `opngPric`, `minPric`, `maxPric`, `prcFlcn` (variação
    %). Funcionou para PETR4 e MXRF11. O atraso da cotação não está documentado **[incerto]** (o site
    da B3 costuma exibir com atraso de ~15 min).
  - Proventos de empresa: `GET https://sistemaswebb3-listados.b3.com.br/listedCompaniesProxy/CompanyCall/GetListedSupplementCompany/{base64}`,
    onde `{base64}` é o JSON `{"issuingCompany":"PETR","language":"pt-br"}` codificado em Base64.
    Devolve `cashDividends[]` com `label` (`DIVIDENDO`, `JRS CAP PROPRIO`, `RENDIMENTO`),
    `rate` (valor por ação, string com vírgula decimal), `lastDatePrior` (**data-com**),
    `paymentDate` (**data de pagamento**), `approvedOn`, `isinCode` (distingue ON de PN) e
    `relatedTo`; e `stockDividends[]` com `label` (`DESDOBRAMENTO`, `GRUPAMENTO`, `BONIFICACAO`),
    `factor`, `lastDatePrior` e `approvedOn`.
  - Proventos de FII: `GET https://sistemaswebb3-listados.b3.com.br/fundsProxy/fundsCall/GetListedSupplementFunds/{base64}`
    com `{"cnpj":"0","identifierFund":"MXRF","typeFund":7}`. Mesmo formato de `cashDividends[]`, com
    `label` `RENDIMENTO`.
  - Datas vêm como `dd/mm/aaaa` e números como `"0,10000000000"`.
- **Atenção ao `factor`** **[incerto]**: no MGLU3 vieram `DESDOBRAMENTO` 300 (o desdobramento de 2020
  foi 1→4, ou seja, +300%), `GRUPAMENTO` 0,1 (10→1) e `BONIFICACAO` 5 (5%). Tudo indica que
  desdobramento e bonificação vêm em **percentual** e grupamento em **multiplicador**. Confirmar com
  mais casos antes de automatizar.
- Os proventos são indexados pelo código do emissor (`PETR`, `MXRF`), não pelo ticker; o ISIN de
  cada linha diz a qual classe de ação ele pertence.
- A brapi devolve exatamente os mesmos campos (`lastDatePrior`, `paymentDate`, `label`, `rate`),
  o que sugere que ela usa esta mesma fonte.

### brapi.dev

- **Cobre**: ações, FIIs, ETFs, BDRs, cripto e moedas nos planos pagos; Tesouro Direto só no Pro. [2]
- **Chave**: sim, exceto um sandbox com quatro ativos (PETR4, VALE3, MGLU3, ITUB4), limitado a 20
  requisições/min por IP. [2][3]
- **Plano Gratuito** [4][5]: 15.000 requisições/mês, 1 requisição simultânea, **1 ticker por
  chamada**, atraso de ~30 min, histórico de até 3 meses, **sem dividendos**. Cripto exige Startup ou
  Pro [6]. Se o plano gratuito cota FIIs pelo endpoint de cotação não ficou claro na documentação
  **[incerto]**; testado sem token, `MXRF11` devolveu `MISSING_TOKEN`.
- **Pagos** [2][5]: Startup R$ 99,99/mês (150 mil req., 10 tickers/chamada, ~15 min, dividendos e
  desdobramentos de até 1 ano); Pro R$ 116,66/mês no anual (500 mil req., histórico completo).
- **Formato**: `GET https://brapi.dev/api/quote/PETR4?dividends=true`, token por
  `Authorization: Bearer` ou query. Resposta `results[]` com `regularMarketPrice` e
  `dividendsData.cashDividends[]` / `stockDividends[]` (mesmos campos da B3, datas em ISO). [3][7]
- **Veredito**: cobre tudo e é documentada, mas só pagando. É o plano B se os endpoints da B3
  quebrarem.

### Yahoo Finance (endpoints não oficiais)

- **Cobre**: tudo — B3 com sufixo `.SA` (ações e FIIs), EUA, cripto (`BTC-USD`) e câmbio
  (`BRL=X`). O endpoint `query1.finance.yahoo.com/v8/finance/chart/{ticker}?events=div,split`
  devolveu, sem chave, preço atual, dividendos de MXRF11 e os desdobramentos de MGLU3.
- **Limites**: não publicados; não há API oficial.
- **Lacunas**: o dividendo vem só com **data ex** e valor — sem data de pagamento, sem separar JCP de
  dividendo, e não há grupamento/bonificação como tipo próprio.
- **Termos**: os termos da Yahoo proíbem acessar ou coletar dados "by automated means … for any
  purpose" sem permissão prévia. [8][9]
- **Veredito**: não recomendada — viola os termos e não traz data de pagamento nem tipo de provento.

### Alpha Vantage

- **Cobre**: ações globais (`GLOBAL_QUOTE`), `DIVIDENDS`, `SPLITS`, câmbio e cripto. [10]
- **Chave**: sim, gratuita.
- **Limites**: "25 API requests per day" no plano gratuito. [11]
- **Formato** (verificado com a chave `demo` para IBM): `DIVIDENDS` devolve `data[]` com
  `ex_dividend_date`, `declaration_date`, `record_date`, `payment_date`, `amount`; `SPLITS` devolve
  `effective_date` e `split_factor`.
- **Incertezas**: a documentação não marca `DIVIDENDS`/`SPLITS` como premium, mas não testei com uma
  chave gratuita real **[incerto]**. A cobertura de tickers da B3 (sufixo `.SAO`) não aparece nos
  exemplos da documentação **[incerto]** — irrelevante para a recomendação, que usa a B3 para isso.
  Os termos de uso vêm em PDF que não consegui ler [12] **[incerto]**.
- **Veredito**: a opção gratuita para ações americanas com proventos e desdobramentos. O limite
  diário obriga a guardar cotações em cache.

### Finnhub

- **Cobre**: `/quote` é "real-time quote data for US stocks"; mercados internacionais só para
  clientes Enterprise. [13]
- **Chave**: sim (sem chave: `{"error":"Please use an API key."}`).
- **Limites**: 30 chamadas/segundo em qualquer plano [14]; o limite por minuto do plano gratuito
  (comumente citado como 60/min) não foi confirmado na página oficial, que é renderizada por JS
  **[incerto]**.
- **Proventos**: `/stock/dividend` é premium, segundo a busca no site oficial [13] **[incerto]**.
- **Veredito**: útil só como fonte extra de cotação americana, se as 25/dia da Alpha Vantage
  apertarem. Não entra na combinação mínima.

### CoinGecko

- **Cobre**: cripto com preço direto em BRL e USD (`vs_currencies=brl,usd`).
- **Chave**: opcional. Funciona sem chave (testado); a chave Demo vai no header
  `x-cg-demo-api-key`. [15]
- **Limites** do plano Demo (grátis): "10k call credits/mo", "100 rate limit/min", atribuição
  obrigatória ("Data provided by CoinGecko") e **sem uso comercial**. [16] O preço é atualizado a cada
  60 s no Demo/sem chave. [15]
- **Formato**: `GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl,usd`
  → `{"bitcoin":{"usd":84301,"brl":434982}}`. Usa ids (`bitcoin`), não símbolos, por padrão.
- **Veredito**: recomendada para Cripto.

### AwesomeAPI (economia.awesomeapi.com.br)

- **Cobre**: mais de 150 pares de moedas, incluindo USD-BRL, e também BTC-BRL. [17]
- **Chave**: opcional. Sem chave, cache de 1 minuto; com cadastro, até 100 mil requisições/mês. [17]
- **Formato**: `GET https://economia.awesomeapi.com.br/json/last/USD-BRL` →
  `{"USDBRL":{"bid":"5.1572","ask":"5.1575","create_date":"2026-09-23 14:47:45",…}}` (números como
  string).
- **Termos**: não encontrei termos de uso publicados **[incerto]**.
- **Veredito**: boa para câmbio intradiário. Alternativa à PTAX se a "fotografia de agora" pedir o
  dólar do momento, não o do boletim.

### Banco Central — PTAX (Olinda)

- **Cobre**: cotação oficial de compra e venda do dólar, diária, com boletins intermediários. [18]
- **Chave**: não. **Licença**: ODbL. [18]
- **Formato**: `GET https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='09-22-2026'&$format=json`
  → `value[0].cotacaoCompra`, `cotacaoVenda`, `dataHoraCotacao`. Data no formato `MM-DD-AAAA`.
  Em dia sem pregão a lista vem vazia (é preciso recuar até o último dia útil).
- **Veredito**: recomendada para USD/BRL — oficial, estável e sem chave. A taxa é a do fechamento do
  dia útil anterior (ou do boletim do dia), não a do minuto.

### Banco Central — SGS (índices para Renda Fixa)

Fora da pergunta, mas necessário para "Renda Fixa é calculada" (premissa do mapa):
`GET https://api.bcb.gov.br/dados/serie/bcdata.sgs.{código}/dados/ultimos/{n}?formato=json`, sem
chave. Testado: série 12 (CDI diário) e 433 (IPCA mensal). Selic diária é a série 11. [19]

## Lacunas e decisões para o mapa

- **Proventos de ações americanas**: a Alpha Vantage dá valor, data ex e data de pagamento, mas não
  retenção de imposto (30% nos EUA) — o valor líquido teria de ser calculado ou lançado.
- **Troca de ticker** não aparece como evento em nenhuma fonte gratuita testada; fica para lançamento
  manual.
- **Estabilidade da B3**: vale isolar a leitura da B3 atrás de uma porta própria, para trocar pela
  brapi paga sem mexer no domínio se os endpoints mudarem.

## Fontes

1. B3 — Termos de Uso. https://www.b3.com.br/pt_br/termos-de-uso-e-protecao-de-dados/termos-de-uso/ (acesso em 23/09/2026)
2. brapi — Planos. https://brapi.dev/pricing (acesso em 23/09/2026)
3. brapi — Documentação. https://brapi.dev/docs (acesso em 23/09/2026)
4. brapi — FAQ: A API é grátis mesmo? https://brapi.dev/faq/api-e-gratis-mesmo (acesso em 23/09/2026)
5. brapi — FAQ: Quais as limitações. https://brapi.dev/faq/quais-as-limitacoes (acesso em 23/09/2026)
6. brapi — Criptomoedas. https://brapi.dev/docs/criptomoedas (acesso em 23/09/2026)
7. brapi — Ações. https://brapi.dev/docs/acoes (acesso em 23/09/2026)
8. Yahoo Terms of Service. https://guce.yahoo.com/terms?locale=en-US (acesso em 23/09/2026)
9. Yahoo API Terms and Conditions. https://legal.yahoo.com/us/en/yahoo/terms/product-atos/apitnc/index.html (acesso em 23/09/2026)
10. Alpha Vantage — Documentation. https://www.alphavantage.co/documentation/ (acesso em 23/09/2026)
11. Alpha Vantage — Support. https://www.alphavantage.co/support/ (acesso em 23/09/2026)
12. Alpha Vantage — Terms of Service. https://www.alphavantage.co/terms_of_service/ (acesso em 23/09/2026)
13. Finnhub — API spec. https://finnhub.io/static/swagger.json e https://finnhub.io/docs/api (acesso em 23/09/2026)
14. Finnhub — Rate limit. https://finnhub.io/docs/api/rate-limit (acesso em 23/09/2026)
15. CoinGecko — Simple Price. https://docs.coingecko.com/v3.0.1/reference/simple-price (acesso em 23/09/2026)
16. CoinGecko — API Pricing. https://www.coingecko.com/en/api/pricing (acesso em 23/09/2026)
17. AwesomeAPI — API de Moedas. https://docs.awesomeapi.com.br/api-de-moedas (acesso em 23/09/2026)
18. BCB — Dados abertos, Dólar (PTAX). https://dadosabertos.bcb.gov.br/dataset/dolar-americano-usd-todos-os-boletins-diarios (acesso em 23/09/2026)
19. BCB — API SGS. https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/2?formato=json (acesso em 23/09/2026)

Os formatos de resposta da B3, brapi (sandbox), Yahoo, Alpha Vantage (`demo`), CoinGecko,
AwesomeAPI, PTAX e SGS foram conferidos por requisição direta em 23/09/2026.
