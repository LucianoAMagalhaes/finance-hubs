# Como outros sistemas modelam recorrência e parcelamento

Levantamento de prior art para a issue [#2](https://github.com/LucianoAMagalhaes/finance-hubs/issues/2).
Pesquisa feita em 2026-09-07 lendo schema, migrations e código-fonte dos projetos — não resenhas de
terceiros. Links de código apontam para os branches padrão (`main`/`master`/`stable`) na data acima.

Isto é levantamento de fatos. Não decide nada; a decisão continua sendo do
[ADR-0002](../adr/0002-ocorrencias-derivadas-nao-gravadas.md).

---

## O que isso significa para nós

**O ADR-0002 sobrevive pela metade, e a metade que cai é a que ele tratava como resolvida.**

O ADR faz duas afirmações. Elas têm destinos opostos na evidência.

**1. "Parcelado e recorrente são a mesma máquina, diferindo em dividir vs repetir." — Confirmada,
com prior art literal.** O [openmonetis](#openmonetis-br) — projeto brasileiro, self-hosted, mesmo
vocabulário do nosso domínio (`lancamentos`, `parcela_atual`, `periodo`) — implementa exatamente
essa máquina: um único `buildTransactionRecords` onde o ramo `"Parcelado"` chama
`splitAmount(total, N)` e o ramo `"Recorrente"` repete o mesmo valor, com o resto do laço idêntico.
O Money Manager Ex vai além e guarda "12 vezes" e "para sempre" no **mesmo campo**
(`int m_num; // positive (> 0) or -1 (infinity)`). A unificação não é heresia.

**2. "Ocorrências são derivadas, nunca gravadas." — Contrariada por praticamente todo sistema que
serve de registro.** Firefly III, GnuCash, KMyMoney, Money Manager Ex, Actual Budget, YNAB,
Organizze e openmonetis **materializam**. Derivação pura só aparece onde o artefato é uma
*projeção*, não um *registro*: `ledger --budget`, `hledger --forecast`, o preview do Actual, e o
plugin experimental `forecast` do Beancount — que foi **removido no Beancount v3**.

**A distinção real não é derivado vs materializado. É passado vs futuro.** O padrão que se repete em
todos eles é o mesmo desenho de três peças:

1. um **template/série** guardado uma vez (`recurrences`, `schedxactions`, `schedules`,
   `BILLSDEPOSITS_V1`, `kmmSchedules`, `scheduled_transactions`);
2. o **futuro derivado** até um horizonte explícito, sem gravar nada
   (`computeSchedulePreviewTransactions` do Actual, `unroll(end_date, limit)` do MMEX,
   `--forecast` do hledger);
3. a ocorrência **materializada no instante em que vira fato**, com um ponteiro de volta para a
   série (`transactions.schedule` no Actual, `recurrence_id` no Firefly III, `series_id` no
   openmonetis).

O ADR-0002 colapsa (2) e (3) numa escolha só. Ele acerta em (2) e paga o preço em (3).

**A consequência que o ADR lista como aceitável é a que os praticantes se recusaram a aceitar.** O
ADR diz: _"Não existe onde pendurar exceção por ocorrência. 'Antecipei a parcela de agosto' e 'essa
foi estornada' não cabem neste modelo."_ Três projetos independentes construíram exatamente esse
cabide:

- KMyMoney criou a tabela `kmmSchedulePaymentHistory (schedId, payDate)` — um registro de quais
  ocorrências já aconteceram;
- Actual criou `schedule/skip-next-date` e a coluna `transactions.schedule`;
- openmonetis criou a tabela `antecipacoes_parcelas` inteira, mais as colunas `antecipado` e
  `antecipacao_id` em `lancamentos`, e até uma preferência de usuário
  `ocultar_parcelas_antecipadas`.

Antecipação de parcela não é caso de borda no Brasil. É funcionalidade de primeira linha.

**Três achados que mexem com a decisão, além disso:**

- **Ninguém guarda o total e divide na leitura.** Em todo sistema que encontrei a divisão acontece
  na **escrita** (`splitAmount` no openmonetis) ou nem existe (o usuário digita o valor da parcela).
  A metade "dividir" da nossa máquina unificada não tem prior art no campo derivado. Não achei
  contra-exemplo; se existe, não localizei.
- **Materializar mata a recorrência indefinida.** O openmonetis, que materializa, **não tem**
  recorrência sem fim: `recurrenceCount` é `.min(1).max(60)`. Quem grava linhas precisa saber
  quantas. Isso é um argumento *a favor* do ADR-0002, e provavelmente o mais forte dele.
- **YNAB e Organizze separam explicitamente as duas coisas.** No YNAB, repetir e dividir moram em
  entidades diferentes e em lugares diferentes do app: `scheduled_transactions` (repete, **sem**
  campo de fim nem de contagem) versus metas de categoria com `goal_type: "TBD"` (Target Category
  Balance **by Date**) + `goal_target_month` + `goal_months_to_budget` (divide um total por N meses).
  A Organizze aceita `recurrence_attributes` **ou** `installments_attributes` no mesmo `POST
  /transactions` — dois atributos aninhados distintos, dois mecanismos.

**O que observar antes de fechar o modelo de lançamento:**

- Se algum dia entrar importação de fatura (OFX, Open Finance, Pluggy), os dados chegam
  **materializados**: cada parcela é uma transação com `installmentNumber` / `totalInstallments`.
  O modelo derivado não tem linha contra a qual conciliar.
- "Alterar o aluguel a partir de julho" é resolvido por todo mundo **cortando a série**: encerra a
  antiga, começa outra. Nenhum sistema lido guarda versões de um mesmo template. Se o nosso modelo
  derivado permitir editar o valor de um lançamento existente, ele reescreve o passado — o defeito
  exato que o ADR atribui à materialização, só que invisível.

---

## Resumo por sistema

| Sistema | Nome da entidade | Derivado ou materializado | Parcelado e recorrente |
|---|---|---|---|
| Firefly III | `recurrences` (+ *subscriptions* para expectativa) | Materializado no disparo (cron) | Mesma estrutura (`repetitions` = contagem); parcelamento é pedido em aberto |
| Actual Budget | `schedules` (uma *rule*) | Híbrido: preview derivado, transação gravada ao postar | Mesma estrutura (`endMode: after_n_occurrences`) |
| GnuCash | Scheduled Transaction + *template account* | Materializado no "Since Last Run" | Mesma estrutura (`num_occur` / `rem_occur`); empréstimo tem assistente próprio |
| KMyMoney | `kmmSchedules` + `kmmSchedulePaymentHistory` | Materializado; histórico de ocorrências à parte | Mesma estrutura (`startDate`/`endDate`) |
| Money Manager Ex | `BILLSDEPOSITS_V1` | Materializado ao executar; `unroll()` deriva o preview | Mesma estrutura, **mesmo campo** (`m_num`: N ou -1) |
| YNAB | `scheduled_transactions` **e** metas `goal_type: TBD` | Materializado na data | **Separados**, em entidades e telas diferentes |
| Organizze (BR) | `recurrence_attributes` / `installments_attributes` | Materializado (cada ocorrência é uma movimentação) | **Separados** na API, unificados no registro |
| openmonetis (BR) | `lancamentos` + `series_id` | Materializado na criação | **Mesma máquina** (dividir vs repetir), sem série armazenada |
| Maybe Finance | — | Não existe | Não modela nenhum dos dois |
| ledger / hledger | *periodic transaction* (`~`) | **Derivado** em tempo de relatório | Só repetição; sem divisão de total |
| Beancount | plugin `forecast` (v2) | **Derivado** na carga | Só repetição; **removido no v3** |

---

## Achados por sistema

### Firefly III

**Nome.** `recurrences`, em quatro tabelas: `recurrences` (a série), `recurrences_transactions` (o
molde do valor/contas), `recurrences_repetitions` (a regra de repetição) e `recurrences_meta`
([migration `2018_06_08_200526_changes_for_v475.php`][ff-mig]).

A tabela `recurrences` guarda `first_date`, `repeat_until`, `latest_date` e
`smallInteger('repetitions')`; `recurrences_repetitions` guarda `repetition_type`,
`repetition_moment`, `repetition_skip` e `weekend`.

**Derivado ou materializado. Materializado, no disparo.** O job
[`CreateRecurringTransactions`][ff-job] roda por cron; `handleOccurrence()` monta o array e chama
`$this->groupRepository->store($array)`, criando um `TransactionGroup` real, e depois
`setLatestDate($recurrence, $date)`. A documentação oficial confirma sem rodeios: _"Firefly III
features the ability to automatically create transactions, so you don't have to."_ ([docs
recurring][ff-doc-rec]).

O limite de repetições **não** é um contador decrementado; é uma contagem das linhas já criadas:

```php
$journalCount = $this->repository->getJournalCount($recurrence);
if (0 !== $recurrence->repetitions && $journalCount >= $recurrence->repetitions && false === $this->force) {
```

Ou seja, a verdade sobre "quantas já saíram" mora nas transações materializadas, não na série.

**Editar série em curso.** Editar a `recurrence` só afeta o que ainda não foi criado — as
`transaction_journals` já geradas são objetos independentes, sem herança do template. Aumentar o
aluguel a partir de julho é mudar `recurrences_transactions.amount`; o histórico fica intacto por
construção. Não encontrei nenhum mecanismo de versionamento do template.

**Exceção pontual.** Edita-se a transação já criada, como qualquer outra. Não há entidade de
exceção. Para pular uma ocorrência futura, a documentação não descreve mecanismo; o caminho é
desativar (`active`) e reativar a série — não confirmei isso em código.

**Parcelamento vs recorrência.** Mesma estrutura, e é justamente aí que o modelo aperta: dá para
dizer "12 repetições de R$ 100", mas não "R$ 1.200 em 12×" — o Firefly III não relaciona as parcelas
à compra original nem divide o total. A issue [#10073 "Support for monthly installments on credit
card transactions"][ff-issue] segue **aberta**, marcada como feature request pelo mantenedor
("I will write it down, thanks!"). Sinal relevante: um sistema maduro, com recorrência completa,
ainda não considera parcelamento resolvido por ela.

**Bônus: a terceira modelagem.** O Firefly III tem *subscriptions* (antes *bills*), que é uma
entidade de **expectativa**, não de lançamento: _"Subscriptions also have some properties like a
basic repetition (every week, every 3 months) and a minimum and maximum amount. These properties
are used to predict how much you should expect to spend"_, e _"It's possible to connect a
subscription to a withdrawal more often than your repetition would predict"_
([docs subscriptions][ff-doc-sub]). O fato e a expectativa são objetos separados, ligados por
*matching*. Vale considerar: "aluguel todo mês" talvez seja mais uma expectativa do pote do que um
lançamento.

### Actual Budget

**Nome.** `schedules`. É a modelagem mais incomum do levantamento: uma schedule **é uma regra**.

```sql
CREATE TABLE schedules
  (id TEXT PRIMARY KEY,
   rule TEXT,
   active INTEGER DEFAULT 0,
   completed INTEGER DEFAULT 0,
   posts_transaction INTEGER DEFAULT 0,
   tombstone INTEGER DEFAULT 0);

CREATE TABLE schedules_next_date (...);
CREATE TABLE schedules_json_paths (...);

ALTER TABLE transactions ADD COLUMN schedule TEXT;
```

([migration `1618975177358_schedules.sql`][actual-mig])

Não há campos de valor ou data na schedule: eles vivem nas *conditions* da rule, e
`schedules_json_paths` diz onde encontrá-los. `schedules_next_date` é cache derivado.

**Derivado ou materializado. Os dois, separados por tempo — e este é o achado mais transferível
para nós.**

O futuro é derivado, em memória, com horizonte explícito:

```ts
const upcomingPeriodEnd = d.startOfDay(
  monthUtils.parseDate(
    monthUtils.addDays(today, getUpcomingDays(effectiveUpcomingLength)),
  ),
);
```

([`computeSchedulePreviewTransactions`][actual-preview-fn]). O hook
[`usePreviewTransactions`][actual-preview-hook] materializa isso apenas no estado do React,
prefixando ids com `'preview/'`. A documentação é explícita: _"The transaction is not posted to your
register. Instead, it becomes an upcoming scheduled transaction that posts automatically on its
scheduled date."_ ([docs Schedules][actual-doc]).

O passado é gravado. [`postTransactionForSchedule`][actual-app] insere uma transação real:

```ts
const transaction = {
  payee: schedule._payee,
  account: schedule._account,
  amount: getScheduledAmount(schedule._amount),
  date: today ? currentDay() : schedule.next_date,
  schedule: schedule.id,
  cleared: false,
};
```

O horizonte é configurável pelo usuário (`upcomingScheduledTransactionLength`, e
`custom_upcoming_length` por schedule) — a documentação chama de _"the number of days before the
scheduled date that a transaction will be displayed as upcoming"_. É exatamente a "consequência" que
o ADR-0002 antecipa; o Actual a transformou em preferência de usuário.

**Editar série em curso.** `updateSchedule` reescreve as conditions da rule. Transações já postadas
não são tocadas — elas são linhas independentes que apenas carregam `schedule = <id>`.

**Exceção pontual.** `skipNextDate({ id })`, que é literalmente `setNextDate({ id, advance: true })`:
avança `next_date` sem registrar nada sobre a ocorrência pulada. É destrutivo e só para frente — não
existe um registro de "agosto foi pulado". Para um mês com valor diferente, o caminho é postar a
transação (`schedule/post-transaction`) e editar a linha. O Actual também permite declarar a
variação **na própria schedule**, com um valor em faixa: `getScheduledAmount` aceita
`{ num1, num2 }` e usa a média para o preview. A documentação não trata de alterar o valor de uma
ocorrência específica sem postá-la.

**Parcelamento vs recorrência.** Mesma estrutura. `recurConfigToRSchedule` mapeia
`endMode: 'after_n_occurrences'` para `base.count = config.endOccurrences`. Mas, como no Firefly III,
o valor é por ocorrência: não há divisão de total, e não há conceito de parcelamento de cartão.

### GnuCash

**Nome.** *Scheduled Transaction* (SX), com **template transaction** guardada numa árvore de contas
oculta.

```c
gnc_sql_make_table_entry<CT_INT>("num_occur", 0, COL_NNUL, "num-occurance"),
gnc_sql_make_table_entry<CT_INT>("rem_occur", 0, COL_NNUL, "rem-occurance"),
gnc_sql_make_table_entry<CT_BOOLEAN>("auto_create", 0, COL_NNUL, "auto-create"),
gnc_sql_make_table_entry<CT_INT>("adv_creation", 0, COL_NNUL, "advance-creation-days"),
gnc_sql_make_table_entry<CT_ACCOUNTREF>("template_act_guid", 0, COL_NNUL, "template-account"),
```

(tabela `schedxactions`, [`gnc-schedxaction-sql.cpp`][gnc-sql]; a regra de repetição vai numa tabela
`recurrences` separada, com `recurrence_mult` etc.)

**Derivado ou materializado. Materializado**, e o cabeçalho do engine diz o mecanismo com todas as
letras:

> Template transactions are instantiated by:
>  . copying the fields of the template
>  . setting the date to the calculated "due" date.

([`SchedXaction.h`][gnc-h]). O assistente *Since Last Run* é quem instancia. O manual oferece
`Never End` / `End Date` / `Number of Occurrences` — _"Enter the number of times you wish the
scheduled transaction to be added to the register"_ ([manual §6.13][gnc-man]).

Detalhe importante: `num_occurances_total` **e** `num_occurances_remain` são ambos persistidos, com
o comentário `/* if num_occurances_total == 0, then no limit */`. O GnuCash guarda um contador
mutável — o estado da série vive na série, não nas linhas geradas (ao contrário do Firefly III).
Existe ainda `deferredList` de `SXTmpStateData { last_date, num_occur_rem, num_inst }`, para
instâncias adiadas.

**Editar série em curso.** Editar a template não retroage: as transações já instanciadas são cópias
independentes. Não achei mecanismo de versionamento.

**Exceção pontual — a solução mais sofisticada que encontrei.** O GnuCash permite **fórmulas com
variáveis** nos splits do template, e o assistente pergunta os valores a cada instanciação:

> Things that make sense to have in a template transaction:
>  ...
>  Funds In/Out... or an expr involving 'amt' [A, x, y, a?] for
>    variable expenses.

([`SchedXaction.h`][gnc-h]). Ou seja: a conta de luz é uma série cujo valor é uma **incógnita
preenchida por ocorrência**. É a resposta mais direta ao "esse mês veio diferente" que vi em
qualquer sistema, e ela só funciona porque a ocorrência é materializada — há um momento de
instanciação em que perguntar.

**Parcelamento vs recorrência.** Mesma estrutura (`num_occur`/`rem_occur`), mas o GnuCash tem um
assistente de empréstimo/hipoteca separado que gera uma SX com fórmulas de juros e principal.
Empréstimo, para eles, não é "dividir um total por N": é uma série cujo valor é calculado. Não
verifiquei o código desse assistente.

### KMyMoney

**Nome.** `kmmSchedules`, com uma segunda tabela que nenhum outro sistema do levantamento tem:

```cpp
void MyMoneyDbDef::Schedules()
{
    ...
    appendField(MyMoneyDbIntColumn("occurence", ...));
    appendField(MyMoneyDbIntColumn("occurenceMultiplier", ...));
    appendField(MyMoneyDbColumn("startDate", "date", false, NOTNULL));
    appendField(MyMoneyDbColumn("endDate", "date"));
    appendField(MyMoneyDbColumn("autoEnter", "char(1)", false, NOTNULL));
    appendField(MyMoneyDbColumn("lastPayment", "date"));
    appendField(MyMoneyDbColumn("nextPaymentDue", "date"));
    ...
}

void MyMoneyDbDef::SchedulePaymentHistory()
{
    appendField(MyMoneyDbColumn("schedId", "varchar(32)", PRIMARYKEY, NOTNULL));
    appendField(MyMoneyDbColumn("payDate", "date", PRIMARYKEY, NOTNULL));
    MyMoneyDbTable t("kmmSchedulePaymentHistory", fields);
}
```

([`mymoneydbdef.cpp`][kmm]).

**Derivado ou materializado. Materializado**, com `autoEnter` decidindo se entra sozinho.

**O achado relevante é `kmmSchedulePaymentHistory`.** É uma tabela cuja única razão de existir é
guardar **quais ocorrências já aconteceram** — `(schedId, payDate)`, chave composta, nada mais. É
precisamente a estrutura que o ADR-0002 diz não caber no modelo derivado. O KMyMoney a construiu
como tabela independente, sem materializar todas as ocorrências: você pode ter um template e um
conjunto esparso de fatos sobre ele. Esse é um meio-termo que o ADR não considerou.

**Editar série em curso / exceção pontual.** Não determinei em código como o KMyMoney trata edição
retroativa nem alteração de uma ocorrência específica. `type` inclui pagamento de empréstimo, com
amortização própria.

**Parcelamento vs recorrência.** Mesma estrutura, delimitada por `startDate`/`endDate` — não por
contagem. Não achei divisão de total.

### Money Manager Ex

**Nome.** `BILLSDEPOSITS_V1` ("Bills & Deposits"), template e agendamento na mesma linha:

```sql
CREATE TABLE BILLSDEPOSITS_V1(
BDID integer primary key
, ...
, TRANSAMOUNT numeric NOT NULL
, ...
, REPEATS integer
, NEXTOCCURRENCEDATE TEXT
, NUMOCCURRENCES integer
, COLOR integer DEFAULT -1
);
```

([`tables_en.sql`][mmex-sql]).

**Derivado ou materializado. Materializado ao executar**, mas com derivação para preview:
`SchedData` expõe `auto unroll(const mmDate& end_date, int limit = -1) const -> std::vector<mmDate>`
([`SchedData.h`][mmex-data]) — desenrola a série em datas até um fim ou um limite, sem gravar.
Mesmo padrão do Actual: template + horizonte derivado + materialização no fato.

**Parcelamento vs recorrência — o caso mais limpo de unificação que encontrei.** A struct `Repeat`
decodifica as duas colunas em quatro campos:

```cpp
struct Repeat
{
    RepeatMode m_mode;
    RepeatFreq m_freq;
    int        m_num;  // positive (> 0) or -1 (infinity)
    int        m_x;    // positive if freq is e_{in,every}_x_*; -1 (null) otherwise

    static Repeat from_row(int64 row_REPEATS, int64 row_NUMOCCURRENCES);
    ...
};
```

([`_Repeat.h`][mmex-repeat]). "12 vezes" e "para sempre" são **o mesmo campo**, `-1` significando
infinito. Isso é exatamente a unificação do ADR-0002 no nível do descritor de série — só que a
divisão do total continua não existindo: `TRANSAMOUNT` é o valor de **cada** ocorrência.

**Editar série / exceção pontual.** Não determinei em código.

### YNAB

**Nome.** `scheduled_transactions`, mais `scheduled_subtransactions` para splits.

Da [especificação OpenAPI oficial][ynab-spec], `ScheduledTransactionSummaryBase` exige
`date_first`, `date_next`, `frequency`, `amount`, `account_id`. O enum de `frequency`:

```yaml
enum:
  - never
  - daily
  - weekly
  - everyOtherWeek
  - twiceAMonth
  - every4Weeks
  - monthly
  - everyOtherMonth
  - every3Months
  - every4Months
  - twiceAYear
  - yearly
  - everyOtherYear
```

**Note o que não existe:** nenhum campo de data-fim, nenhuma contagem de ocorrências. A schedule do
YNAB é indefinida por construção. Não dá para dizer "12 vezes".

**Derivado ou materializado. Materializado na data.** A documentação de suporte descreve as
scheduled transactions aparecendo no registro e sendo lançadas automaticamente, com opção
"Enter Now" para antecipar uma ocorrência, e edição "individual ou de todas as futuras"
([guia][ynab-help], [edição][ynab-edit]). Não consegui, nas páginas públicas, uma frase explícita
sobre se editar afeta transações já lançadas — a documentação não trata disso. **Não determinado.**

**Parcelamento vs recorrência — separados, e é a contradição mais forte ao ADR-0002.** No YNAB,
"dividir um total por N meses" não é uma transação: é uma **meta de categoria**. O objeto `Category`
carrega:

- `goal_type`, com enum `TB` (Target Category Balance), `TBD` (Target Category Balance **by Date**),
  `MF` (Monthly Funding), `NEED` (Plan Your Spending), `DEBT`;
- `goal_target`, `goal_target_month`, `goal_months_to_budget`, `goal_under_funded`,
  `goal_overall_funded`, `goal_overall_left`.

([spec OpenAPI][ynab-spec]). `TBD` + `goal_target_month` **é** a máquina de dividir: total, prazo, e
o app calcula quanto o mês precisa receber. Mas ela mora no **orçamento**, não no lançamento, e não
compartilha nenhuma estrutura com `scheduled_transactions`.

Para nós isso é desconfortavelmente próximo: `goal_type: TBD` está mais perto do nosso *pote* + ADR-0001
do que do nosso *lançamento*. A leitura do YNAB é que **repetir é um fato agendado e dividir é uma
intenção orçamentária** — categorias diferentes de coisa, não dois modos da mesma.

### Organizze (BR)

App brasileiro de finanças pessoais, proprietário, mas com [documentação pública de API][organizze].

**Nome.** "movimentação recorrente (fixa)" e "movimentação recorrente (parcelada)". Duas seções
distintas da doc, dois payloads distintos no **mesmo** `POST /transactions`:

```json
// fixa
{ "description": "Despesa fixa", "date": "2015-09-16",
  "recurrence_attributes": {"periodicity": "monthly"} }

// parcelada
{ "description": "Despesa parcelada", "date": "2015-09-16",
  "installments_attributes": {"periodicity": "monthly", "total": 12} }
```

As respostas diferem nos mesmos campos: a fixa volta `"recurring": true, "total_installments": 1`;
a parcelada volta `"recurring": false, "total_installments": 12, "installment": 1`. Toda movimentação
do sistema — inclusive à vista e transferência — carrega `total_installments` e `installment`.

**Derivado ou materializado. Materializado.** A doc de atualização não deixa margem:

> No caso de movimentações fixas ou parceladas, para atualizar a movimentação e as próximas
> ocorrências envie o attributo `"update_future": true`; Caso queira atualizar todas as ocorrências,
> inclusive as anteriores, envie o attributo `"update_all": true`. Observe que este último pode
> alterar o saldo da conta caso as movimentações anteriores já estejam pagas/recebidas.

Ocorrências anteriores têm estado `paid` próprio e afetam saldo — são linhas.

**Editar série em curso.** Resolvido por escopo de propagação: sem flag = só esta ocorrência;
`update_future: true` = esta e as próximas; `update_all: true` = todas, com aviso explícito de que
reescreve o passado. O mesmo trio existe no delete. É o desenho de calendário (Google Calendar) —
e o default é **a ocorrência única**, não a série.

**Exceção pontual.** É o caso mais barato do modelo: editar uma movimentação sem flag nenhuma.

**Parcelamento vs recorrência.** Separados na entrada (`recurrence_attributes` vs
`installments_attributes`), unificados na saída (ambos viram movimentações com os mesmos campos).
**Não determinado:** se `amount_cents` numa criação parcelada é o total ou o valor da parcela — os
exemplos da doc usam `amount_cents: 0`.

### openmonetis (BR)

Self-hosted brasileiro, Next.js + Drizzle + Postgres, tabelas em português. É o sistema **mais
próximo do nosso domínio** que encontrei, e o contra-exemplo mais direto ao ADR-0002.

**Nome.** Não há entidade de série. Só `lancamentos`, com uma coluna `condicao` que vale
`"Parcelado"`, `"Recorrente"` ou à vista, e um `series_id uuid` **sem foreign key** — apenas uma tag
que agrupa linhas irmãs, com índice `lancamentos_series_id_idx`.

```ts
export const transactions = pgTable("lancamentos", {
  condition: text("condicao").notNull(),
  amount: numeric("valor", { precision: 12, scale: 2 }).notNull(),
  purchaseDate: date("data_compra", { mode: "date" }).notNull(),
  installmentCount: smallint("qtde_parcela"),
  period: text("periodo").notNull(),
  currentInstallment: smallint("parcela_atual"),
  recurrenceCount: integer("qtde_recorrencia"),
  isSettled: boolean("realizado").default(false),
  isAnticipated: boolean("antecipado").default(false),
  anticipationId: uuid("antecipacao_id").references(() => installmentAnticipations.id, ...),
  seriesId: uuid("series_id"),
  ...
});
```

([`src/db/schema.ts`][om-schema]).

**Derivado ou materializado. Materializado na criação — todas as linhas de uma vez.** E o laço que
faz isso é literalmente a máquina do ADR-0002, com a decisão de armazenamento invertida:

```ts
if (data.condition === "Parcelado") {
  const installmentTotal = data.installmentCount ?? 0;
  const amountsByShare = shares.map((share) =>
    splitAmount(share.amountCents, installmentTotal),   // <- DIVIDE
  );
  for (let index = 0; index <= installmentTotal - startInstallment; index += 1) {
    const installmentPeriod = addMonthsToPeriod(period, index);
    ...
    records.push({ ...basePayload, installmentCount: installmentTotal, currentInstallment, ... });
  }
  return records;
}

if (data.condition === "Recorrente") {
  const recurrenceTotal = data.recurrenceCount ?? 0;
  for (let index = 0; index < recurrenceTotal; index += 1) {
    const recurrencePeriod = addMonthsToPeriod(period, index);
    ...
    records.push({ ...basePayload, amount: centsToDecimalString(share.amountCents * amountSign), ... });
                                            // <- REPETE
  }
  return records;
}
```

([`actions/core.ts`, `buildTransactionRecords`][om-core]).

Mesma abstração que a nossa, mesmo vocabulário, conclusão oposta sobre onde o resultado vive.

**O preço que eles pagaram: não existe recorrência indefinida.** O schema de validação é
`recurrenceCount: z.coerce.number().int().min(1, ...).max(60, ...)` — no máximo 60 meses, sempre
finito. Quem materializa precisa saber quantas linhas escrever. Este é o argumento mais forte a
favor do ADR-0002 que a pesquisa produziu, e ele veio de quem escolheu o outro lado.

**Nota de design que confirma o ADR-0001:** a coluna quente é `periodo` (texto do mês). Os índices
compostos principais são `(user_id, periodo)` e `(user_id, periodo, tipo_transacao)`. A tela do mês
é um `WHERE periodo = ?`, não uma projeção. Materializar é, em grande parte, uma decisão de leitura.

**Exceção pontual — construíram exatamente o que o ADR diz não caber.** Existe uma tabela inteira
para antecipação de parcelas:

```ts
export const installmentAnticipations = pgTable("antecipacoes_parcelas", {
  seriesId: uuid("series_id").notNull(),
  anticipationPeriod: text("periodo_antecipacao").notNull(),
  anticipationDate: date("data_antecipacao", { mode: "date" }).notNull(),
  anticipatedInstallmentIds: jsonb("parcelas_antecipadas").notNull().$type<string[]>(),
  totalAmount: numeric("valor_total", { precision: 12, scale: 2 }).notNull(),
  installmentCount: smallint("qtde_parcelas").notNull(),
  discount: numeric("desconto", { precision: 12, scale: 2 }).notNull().default("0"),
  transactionId: uuid("lancamento_id").notNull().references(() => transactions.id, ...),
  ...
});
```

O fluxo ([`actions/anticipation.ts`][om-antec]): busca parcelas elegíveis
(`condicao = "Parcelado"`, não pagas, `antecipado = false`, período futuro), valida o desconto
contra o total, marca as escolhidas como antecipadas e cria um lançamento consolidado no período de
antecipação. Há até uma preferência de usuário `ocultar_parcelas_antecipadas` para o mês não contar
duas vezes.

Note que `parcelas_antecipadas` é um array de **ids de parcelas**. A funcionalidade depende de as
parcelas terem identidade. Num modelo derivado, não há id para pôr nesse array.

**Editar série em curso.** Não determinei o comportamento de propagação de edição (existe
`bulk-actions.ts` e `single-actions.ts`; não li).

**Parcelamento importado.** Existe `installment-detection.ts` e `startInstallment` no schema
("comprei em 12× e já estou na 5ª") — o caso de série que começa no meio, que qualquer modelo
precisa cobrir.

### Maybe Finance

**Nome. Nenhum.** Não existe entidade de recorrência ou agendamento no schema. A busca por
`recurring` no repositório não retorna nada em código de aplicação, e o [`db/schema.rb`][maybe]
tem `entries`, `transactions`, `budgets`, `budget_categories`, `rules`, `transfers` — e nada de
scheduled/recurring. A tabela `subscriptions` é a cobrança Stripe do próprio produto (`stripe_id`,
`trial_ends_at`), não recorrência do usuário.

**Vale como dado.** Um app de finanças pessoais moderno, com investimento e tração, chegou ao seu
modelo de dados **sem modelar recorrência**, priorizando importação bancária e categorização. Se as
transações chegam do banco, você não precisa gerá-las. Também é o único aqui cujo orçamento é
snapshot por período (`budgets` com `start_date`/`end_date` únicos por família), o que corrobora o
ADR-0001.

### ledger-cli e hledger

**Nome.** *Periodic transaction*, sintaxe `~ <expressão de período>`.

```
~ Monthly
    Expenses:Rent               $500.00
    Expenses:Food               $450.00
    ...
    Assets
```

**Derivado ou materializado. Derivado, e explicitamente não é um registro.** O manual do ledger é
categórico:

> Periodic transactions are used for budgeting and forecasting only, they have no effect without
> the `--budget` option specified.

([`ledger3.texi`, §Periodic Transactions][ledger]). No hledger, a flag `--forecast[=PERIOD]`
_"Generate extra transactions from periodic rules ("~"), from after the latest ordinary transaction
until 6 months from now"_ ([manual][hledger]) — repare no horizonte default de 6 meses e no ponto de
partida "depois da última transação real": exatamente o desenho de "o passado é fato, o futuro é
projeção".

**Editar série em curso.** Você edita a regra no arquivo. Como as ocorrências nunca existiram,
mudar a regra hoje muda também a projeção retroativa — e é justamente por isso que o `--forecast`
só gera **a partir da última transação real**. O passado está protegido porque é feito de
transações comuns, não de projeções.

**Exceção pontual.** Não existe. Se um mês veio diferente, você lança a transação real; ela substitui
a projeção porque a projeção só cobre o depois.

**Parcelamento vs recorrência.** Só recorrência. Não há divisão de total, não há contagem de
parcelas, não há relação com uma compra original. Este é o campo que mais apoia "derivado", e é
exatamente o campo onde a metade "dividir" da nossa máquina **não existe**.

### Beancount

O plugin [`beancount.plugins.forecast`][beancount-v2] gerava transações a partir de uma convenção na
narração:

```
2014-03-08 # "Electricity bill [MONTHLY REPEAT 10 TIMES]"
  Expenses:Electricity   50.10 USD
  Assets:Checking       -50.10 USD
```

Derivado na carga do arquivo (é um *entry filter plugin*; nada é escrito). Suporta `UNTIL <data>`,
`REPEAT n TIMES` e `SKIP n TIMES`.

**Mas o próprio arquivo se desqualifica:** _"It serves mostly as an example of how you can experiment
by creating and installing a local filter, and not so much as a serious forecasting feature"_. E o
plugin **não existe mais no Beancount v3** — a [pasta de plugins do master][beancount-v3] não o
contém.

Isto é evidência contra a derivação como base para um sistema de registro: no ecossistema mais
purista de contabilidade em texto plano, a única implementação de recorrência era experimental e foi
retirada.

### Dados de entrada brasileiros (Pluggy / Open Finance)

Fora do escopo original, mas decisivo se importação entrar no roadmap. A [documentação de
transações da Pluggy][pluggy] — agregador usado por boa parte do mercado brasileiro — descreve os
metadados de cartão de crédito:

- `installmentNumber`: _"The installment number associated with the transaction."_
- `totalInstallments`: _"The total of installments associated with the transaction."_
- `totalAmount`: _"The total amount (sum of all installments). Only available when the purchase was
  made in installments."_
- `purchaseDate`: _"Original date of the purchase, for transactions made with installments."_

Ou seja: **o banco já entrega materializado**. Cada parcela é uma transação, carregando índice,
total de parcelas, valor total e data da compra original — uma denormalização da série dentro de
cada ocorrência. Um modelo derivado recebe N linhas materializadas e não tem contra o que conciliá-las.

---

## Citações

**Firefly III**
- [ff-mig] Migration das tabelas de recorrência: <https://github.com/firefly-iii/firefly-iii/blob/main/database/migrations/2018_06_08_200526_changes_for_v475.php>
- [ff-job] `CreateRecurringTransactions`: <https://github.com/firefly-iii/firefly-iii/blob/main/app/Jobs/CreateRecurringTransactions.php>
- [ff-doc-rec] Docs, Recurring transactions: <https://github.com/firefly-iii/docs/blob/main/docs/docs/explanation/financial-concepts/recurring.md>
- [ff-doc-sub] Docs, Subscriptions: <https://github.com/firefly-iii/docs/blob/main/docs/docs/explanation/financial-concepts/subscriptions.md>
- [ff-issue] Issue #10073, "Support for monthly installments on credit card transactions" (aberta): <https://github.com/firefly-iii/firefly-iii/issues/10073>

**Actual Budget**
- [actual-mig] Migration `schedules`: <https://github.com/actualbudget/actual/blob/master/packages/loot-core/migrations/1618975177358_schedules.sql>
- [actual-preview-fn] `computeSchedulePreviewTransactions` e `recurConfigToRSchedule`: <https://github.com/actualbudget/actual/blob/master/packages/loot-core/src/shared/schedules.ts>
- [actual-preview-hook] `usePreviewTransactions`: <https://github.com/actualbudget/actual/blob/master/packages/desktop-client/src/hooks/usePreviewTransactions.ts>
- [actual-app] `postTransactionForSchedule`, `skipNextDate`, `updateSchedule`: <https://github.com/actualbudget/actual/blob/master/packages/loot-core/src/server/schedules/app.ts>
- [actual-doc] Documentação, Schedules: <https://actualbudget.org/docs/schedules/>

**GnuCash**
- [gnc-sql] Tabela `schedxactions`: <https://github.com/Gnucash/gnucash/blob/stable/libgnucash/backend/sql/gnc-schedxaction-sql.cpp>
- [gnc-h] `SchedXaction.h` (template, `num_occurances_total`/`remain`, fórmulas com `amt`): <https://github.com/Gnucash/gnucash/blob/stable/libgnucash/engine/SchedXaction.h>
- [gnc-man] Manual v5 §6.13, Scheduling Transactions: <https://www.gnucash.org/docs/v5/C/gnucash-manual/trans-sched.html>

**KMyMoney**
- [kmm] `mymoneydbdef.cpp` (`kmmSchedules`, `kmmSchedulePaymentHistory`): <https://github.com/KDE/kmymoney/blob/master/kmymoney/plugins/sql/mymoneydbdef.cpp>

**Money Manager Ex**
- [mmex-sql] `BILLSDEPOSITS_V1`: <https://github.com/moneymanagerex/moneymanagerex/blob/master/src/table/tables_en.sql>
- [mmex-data] `SchedData.h` (`unroll`): <https://github.com/moneymanagerex/moneymanagerex/blob/master/src/data/SchedData.h>
- [mmex-repeat] `_Repeat.h` (`m_num`: N ou -1): <https://github.com/moneymanagerex/moneymanagerex/blob/master/src/data/_Repeat.h>

**YNAB**
- [ynab-spec] Especificação OpenAPI oficial (`ScheduledTransactionSummaryBase`, `Category.goal_*`): <https://api.ynab.com/papi/open_api_spec.yaml> — referência navegável em <https://api.ynab.com/v1>
- [ynab-help] Scheduled Transactions in YNAB: A Guide: <https://support.ynab.com/en_us/scheduled-transactions-a-guide-BygrAIFA9>
- [ynab-edit] Editing and Deleting Scheduled Transactions: <https://support.ynab.com/en_us/editing-and-deleting-scheduled-transactions-a-guide-Skru9yNJo>

**Organizze (BR)**
- [organizze] Documentação oficial da API: <https://github.com/organizze/api-doc/blob/master/README.md>

**openmonetis (BR)**
- [om-schema] `src/db/schema.ts` (`lancamentos`, `antecipacoes_parcelas`): <https://github.com/felipegcoutinho/openmonetis/blob/main/src/db/schema.ts>
- [om-core] `buildTransactionRecords` e validações: <https://github.com/felipegcoutinho/openmonetis/blob/main/src/features/transactions/actions/core.ts>
- [om-antec] Fluxo de antecipação de parcelas: <https://github.com/felipegcoutinho/openmonetis/blob/main/src/features/transactions/actions/anticipation.ts>

**Maybe Finance**
- [maybe] `db/schema.rb`: <https://github.com/maybe-finance/maybe/blob/main/db/schema.rb>

**ledger-cli / hledger**
- [ledger] `ledger3.texi`, §Periodic Transactions e §Budgeting: <https://github.com/ledger/ledger/blob/master/doc/ledger3.texi> — publicado em <https://ledger-cli.org/doc/ledger3.html#Periodic-Transactions>
- [hledger] Manual, Periodic transactions e Forecasting: <https://hledger.org/hledger.html#periodic-transactions> e <https://hledger.org/hledger.html#forecasting>

**Beancount**
- [beancount-v2] Plugin `forecast` (v2): <https://github.com/beancount/beancount/blob/v2/beancount/plugins/forecast.py>
- [beancount-v3] Plugins do v3 (sem `forecast.py`): <https://github.com/beancount/beancount/tree/master/beancount/plugins>

**Dados brasileiros**
- [pluggy] Pluggy, Transactions (metadados de cartão de crédito): <https://docs.pluggy.ai/docs/transactions>

---

## O que não consegui determinar

Registrado aqui em vez de adivinhado:

- **Organizze:** se `amount_cents` numa criação parcelada é o total da compra ou o valor de cada
  parcela. Os exemplos da doc usam `0`.
- **Organizze:** se existe entidade de série persistida (`Recurrence`/`Installment` como tabelas) ou
  se as ocorrências só se conhecem por um agrupamento. O código é fechado.
- **YNAB:** se editar uma scheduled transaction altera transações já lançadas no registro. A
  documentação pública não diz.
- **KMyMoney:** o comportamento de edição de série em curso e de exceção por ocorrência, além da
  existência de `kmmSchedulePaymentHistory`.
- **Money Manager Ex:** edição de série e exceção por ocorrência; e o significado exato de cada
  `RepeatMode` (não li `_DataEnum.h`).
- **openmonetis:** a propagação de edição sobre uma série já materializada (`bulk-actions.ts` /
  `single-actions.ts` não lidos).
- **GnuCash:** o código do assistente de empréstimo/hipoteca, citado aqui a partir do manual e do
  cabeçalho do engine.
- **Nenhum sistema encontrado** guarda um valor total e o divide em tempo de leitura. Isso é
  ausência de evidência, não evidência de ausência: pode existir e eu não ter achado.
