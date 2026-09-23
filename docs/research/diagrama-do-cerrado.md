# Pesquisa: as regras do Diagrama do Cerrado

Responde ao ticket #63 (mapa #59). Acesso às fontes em 23/09/2026.

## Resumo

- A nota de um ativo é **`2 × (respostas sim) − N`**, com N = número de perguntas do diagrama da
  classe. É o mesmo que +1 por sim e −1 por não. Com as 11 perguntas padrão de ações, a nota vai de
  −11 a +11.
- **Ações nacionais e internacionais** usam o mesmo questionário de 11 perguntas. **FIIs** (e REITs)
  usam outro, de 6 perguntas. **Cripto e Renda Fixa não têm questionário**: a nota é digitada à mão.
- **Nota ≤ 0 não recebe aporte.** Nota negativa nunca recebe. Nota zero é tratada como fora do
  cálculo no diagrama.
- **Peso ideal do ativo** = nota ÷ soma das notas elegíveis da classe × valor da classe.
- **Aporte em 3 etapas**: (1) entre as classes, na proporção do quanto falta para cada classe
  chegar à meta, sem passar da meta; (2) dentro da classe, na proporção do quanto falta para cada
  ativo chegar ao seu peso ideal; (3) arredondamento: ação e FII brasileiros em cotas inteiras,
  arredondando para baixo; o resto é fracionado.
- **Nunca manda vender.** Ativo ou classe acima do alvo só deixa de receber.

## Grau de confiança das fontes

O método é de Raul Sena (Investidor Sardinha) e a ferramenta oficial fica dentro da área paga da
AUVP (`ferramentas.auvp.com.br/carteira`). **Não achei nenhum material aberto do autor que
descreva a regra.** O que segue vem de três camadas, da mais à menos confiável:

1. **Dados da ferramenta oficial capturados por terceiros** (alta). O repositório
   `LuisForasteiro/diagrama_pantaneiro` guarda, como fixtures de teste, a resposta real de
   `GET /auth/me` e de `POST https://ferramentas-backend.auvp.com.br/users/suggestions` (aportes de
   R$ 500, R$ 1.000 e R$ 10.000) de uma conta anonimizada. São saídas do sistema oficial, não
   interpretações. Refiz as contas em cima delas (ver "Verificação").
2. **Engenharia reversa desse repositório** (média). O autor diz que portou o algoritmo "para
   bater com a saída do backend da AUVP" e que depois mudou algumas regras de propósito. Separo
   abaixo o que é da AUVP e o que é mudança dele.
3. **Fórum da AUVP** (`comunidade.auvp.com.br`) (baixa, só trechos). O fórum é fechado para
   alunos: toda página devolve **403** sem login. Só consegui ler os trechos que o buscador mostra.
   Os tópicos "Qual o algoritmo utilizado no diagrama do cerrado?" e "Pergunta para DEVs / Equipe
   AUVP" existem, mas **não consegui ler as respostas**.

## 1. As perguntas de cada classe

### Ações (nacionais e internacionais): "diagrama-do-cerrado", 11 perguntas

Texto exato gravado na conta oficial (fonte 1). Todas são sim/não.

| # | Critério | Pergunta |
|---|---|---|
| 1 | ROE | ROE historicamente maior que 5%? (Considere anos anteriores). |
| 2 | CAGR | Tem um crescimento de receitas (Ou lucro) superior a 5% nos últimos 5 anos? |
| 3 | DIVIDENDOS | A empresa tem um histórico de pagamento de dividendos? |
| 4 | TECNOLOGIA E PESQUISA | A empresa investe amplamente em pesquisa e inovação? Setor Obsoleto = SEMPRE NÃO |
| 5 | TEMPO DE MERCADO | Tem mais de 30 anos de mercado? (Fundação) |
| 6 | VANTAGENS COMPETITIVAS | É líder nacional ou mundial no setor em que atua? (Só considera se for LÍDER, primeira colocada) |
| 7 | PERENIDADE | O setor em que a empresa atua tem mais de 100 anos? |
| 8 | TAMANHO | A empresa é uma BLUE CHIP? |
| 9 | GOVERNANÇA | A empresa tem uma boa gestão? Histórico de corrupção = SEMPRE NÃO |
| 10 | INDEPENDÊNCIA | É livre de controle ESTATAL ou concentração em cliente único? |
| 11 | POUCO ENDIVIDADA | Div. Líquida/EBITDA é menor que 2 nos últimos 5 anos? |

Na conta capturada, os ativos de `acoes_internacionais` (QQQ, VTI, VUG, INTC, VNQ) respondem a
esse mesmo questionário. Não há um questionário próprio para ações de fora.

**Incerteza**: trechos do fórum citam "ROE historicamente maior que **15%**", e o texto oficial
capturado diz **5%**. Pode ser que a pergunta tenha mudado com o tempo ou que a pessoa tenha
editado a própria pergunta. O texto de 2025 capturado da conta oficial diz 5%.

### FIIs: "investimentos-imobiliarios", 6 perguntas

Texto exato da conta oficial (fonte 1). Os critérios vêm em branco no original.

1. Os imóveis desse Fundo Imobiliário estão localizados em regiões nobres?
2. As propriedades são novas e não consomem manutenção excessiva?
3. O fundo imobiliário está negociado abaixo do P/VP 1? (Acima de 1,5, eu descarto o investimento
   em qualquer hipótese)
4. Distribui dividendos a mais de 4 anos consistentemente?
5. Não é dependende de um único inquilino ou imóvel?
6. O Yield está dentro ou acima da média para fundos imobiliários do mesmo tipo?

A ferramenta oficial também tem uma classe `reits`. No repositório de terceiros, REITs usam o
questionário de FIIs. Na conta capturada a meta de REITs é 0 e não há REIT, então **não dá para
confirmar** qual questionário a AUVP usa para REITs.

### Cripto e Renda Fixa: sem questionário, nota digitada

Na conta oficial, BTC tem nota 10 e os títulos de Renda Fixa têm 8 e 9, sem nenhuma resposta
gravada. A nota é digitada pela pessoa. Trechos do fórum dizem que "quanto mais seguro, maior a
nota" e que o Tesouro Direto leva a nota mais alta. **Não achei a faixa permitida** (0–10 é o que
os dados sugerem, mas não é confirmado). **Resposta ao ticket: sim, a Renda Fixa tem nota**, mas
ela não sai de perguntas.

### As perguntas são por pessoa, não fixas

As perguntas ficam gravadas na conta de cada pessoa (`diagramQuestions`, cada uma com `_id`
próprio). O fórum tem tópicos como "Diagrama do cerrado: Perguntas Extras" e "Muitas perguntas no
diagrama", sinal de que dá para acrescentar ou mudar perguntas. Como a nota usa N, **mudar o número
de perguntas muda a escala de todas as notas daquele diagrama.**

## 2. Da nota para o peso

**Fórmula** (fonte 1, verificada): `nota = 2 × sim − N`. Na conta capturada, com N = 11: 11 sim → 11
(WEGE3), 10 → 9, 9 → 7, 4 → −3 (INTC), 0 respostas → −11 (TAEE4). Todos os casos batem.

**Peso ideal dentro da classe** (confirmado pelos números da fonte 1 e dito também por fontes de
terceiros):

```
peso ideal do ativo = nota do ativo / soma das notas dos ativos elegíveis da classe
% ideal do ativo na carteira = peso ideal × % meta da classe
```

**Nota zero ou negativa**:

- **Negativa**: nunca recebe aporte. Na saída oficial, TAEE4 (−11) e INTC (−3) nunca aparecem.
- **Zero**: um trecho do fórum diz que "apenas ativos com nota maior que 0 serão considerados no
  cálculo do diagrama". Não há ativo com nota zero na captura para confirmar, então fica como
  **provável**.
- O ativo com nota ≤ 0 **continua contando** no valor atual da classe. Ele só não entra na
  divisão. A saída oficial trata a classe inteira pelo valor total, incluindo TAEE4.
- **Nota negativa não manda vender**: o método só decide para onde vai o dinheiro novo.

## 3. Como o aporte é distribuído

Regras extraídas da saída oficial e checadas na seção "Verificação". Chame o aporte de `A`, o valor
atual da carteira de `V` e o valor depois do aporte de `V' = V + A`.

### Etapa 1: entre as classes

1. Uma classe entra se tiver meta > 0 e pelo menos um ativo com nota > 0.
2. Falta da classe = `max(0, meta% × V' − valor atual da classe)`.
3. Se a soma das faltas for ≥ A, cada classe recebe `A × falta ÷ soma das faltas`. Nenhuma classe
   passa da meta.
4. Classe acima da meta não recebe nada. Na conta capturada, ações internacionais (meta 5%) já
   estavam acima e não receberam nada em nenhum dos três aportes.

O caso em que o aporte é maior que a soma das faltas **não aparece nas capturas**. Ver "Variações".

### Etapa 2: dentro da classe

1. Valor da classe depois = valor dos ativos elegíveis + parcela da classe.
2. Alvo de cada ativo = `nota ÷ soma das notas × valor da classe depois`.
3. Falta do ativo = `max(0, alvo − valor atual)`.
4. Cada ativo recebe `parcela da classe × falta ÷ soma das faltas`.

Por isso um ativo com nota alta mas já acima do seu alvo não recebe nada nesse aporte. Na captura,
VALE3 e BBAS3 (nota 7, posições grandes) não receberam. É a divisão **proporcional à falta**, não
"encher o mais atrasado primeiro". Quando a parcela da classe cobre todas as faltas, todos terminam
exatamente no alvo. Na Renda Fixa com R$ 10.000, os dois títulos de nota 9 terminaram com 6,74% da
carteira e o de nota 8 com 5,99% (= 6,74 × 8/9).

### Etapa 3: arredondamento

Visto na saída oficial:

- **Ações brasileiras**: cotas inteiras, **arredondando para baixo**
  (`floor(valor ÷ preço)`). O valor sugerido passa a ser cotas × preço. Todas as 7 ações da captura
  de R$ 10.000 batem com o floor.
- **Cripto**: quantidade com **4 casas decimais** (BTC 0,0129). O valor sugerido **não** é
  recalculado a partir da quantidade arredondada.
- **Renda Fixa sem preço** (LCI, CDB): quantidade 1, valor livre em reais.
- **FIIs**: sem captura. Pelo mesmo motivo das ações (B3, cota inteira) é quase certo que seja
  floor. O repositório de terceiros faz assim.
- **Ações internacionais**: sem captura com valor sugerido. O repositório de terceiros usa 4 casas
  (corretoras americanas vendem fração).

**Sobra do arredondamento**: no aporte de R$ 10.000, o floor das ações deixou R$ 82,76 sem uso.
Desse valor, R$ 62,33 foram parar em cripto e Renda Fixa (que aceitam qualquer valor) e **R$ 20,42
ficaram sem alocar** (total sugerido R$ 9.979,58). Nos aportes de R$ 500 e R$ 1.000 só cripto e
Renda Fixa receberam, e o total fechou exato. **A regra exata de redistribuir a sobra não ficou
clara**: não é proporcional ao valor nem à nota. É o ponto mais incerto desta pesquisa.

## 4. Verificação

Refiz as etapas 1 e 2 em Python sobre `auth_me.json` (metas: ações nacionais 55%, internacionais
5%, cripto 20%, Renda Fixa 20%, FIIs/REITs 0%) com aporte de R$ 10.000:

- Etapa 1: ações nacionais R$ 1.556,80, cripto R$ 4.805,07, Renda Fixa R$ 3.638,13.
- Etapa 2 + floor nas ações: SANB3 29, SAPR3 10, HYPE3 12, TAEE3 10, B3SA3 10, CXSE3 5, WEGE3 4
  cotas. **Igual à saída oficial.**
- Cripto e Renda Fixa: diferença de +R$ 8 a +R$ 35 por ativo em relação à conta crua, que é a
  sobra das ações (seção 3).

## 5. Variações comuns nas implementações de terceiros

Nenhuma destas é regra do autor do método.

**`LuisForasteiro/diagrama_pantaneiro`** (FastAPI + SvelteKit; mudanças que o próprio autor
declara no código):

- Quando o aporte passa da soma das faltas: fecha todas as faltas e reparte o excedente pela meta de
  cada classe (antes ele passava da meta).
- Cripto e Renda Fixa com nota 0 continuam recebendo ("0 = ainda não avaliei"). Nas classes com
  questionário, 0 continua excluído.
- Dentro de uma classe sem nenhuma nota > 0: reparte pelo valor atual e, se tudo for zero, em
  partes iguais.
- Sobra do arredondamento vai inteira para **um** ativo que aceita fração (cripto ou Renda Fixa
  sem preço), o de maior nota.
- Acrescenta perguntas: FIIs vão de 6 para 12 (liquidez, patrimônio, gestão, vacância, qualidade,
  alavancagem), e cria um questionário para ETFs (11 perguntas).
- Mais classes (ETFs nacionais e internacionais, Renda Fixa internacional) e Tesouro com preço
  (fração de 2 casas).

**`HigorJSilva/diagrama_pantaneiro`**: mesma fórmula `2 × sim − N` e `peso = max(0, nota)`, as
mesmas 3 etapas, FII/ações BR em cotas inteiras para baixo, fração até 4 casas no resto.

**Planilhas e o fórum** (só trechos): perguntas extras, como "deu lucro nos últimos 3 anos",
"margem líquida média > 5%", "setor não cíclico", "prejuízo relevante nos últimos 5 anos". Existem
planilhas do grupo VIP do Investidor Sardinha e modelos no Scribd, mas o conteúdo não estava
acessível.

**`sardinha.net`** ("Fundamentus para o Diagrama do Cerrado"): screener de terceiros com critérios
próprios (a "Metodologia do Cardume", 15 critérios para ações, 6 para FIIs). Sem vínculo oficial
confirmado. Não é o questionário do Cerrado.

## O que ficou em aberto

- A regra exata para redistribuir a sobra do arredondamento na ferramenta oficial.
- O caso oficial em que o aporte passa da soma das faltas das classes.
- A faixa permitida para a nota digitada de cripto e Renda Fixa.
- Se nota exatamente zero é excluída (provável, só por trecho do fórum).
- Qual questionário a ferramenta oficial aplica a REITs.
- Nenhuma fala do Raul Sena (vídeo, aula) foi lida diretamente. O vídeo "AUVP11 - A metodologia
  DIAGRAMA DO CERRADO…" é de terceiro (Geraldo Búrigo, CNPI).

## Fontes

Todas acessadas em 23/09/2026.

- Fixtures da ferramenta oficial AUVP, capturadas em `LuisForasteiro/diagrama_pantaneiro`:
  - https://github.com/LuisForasteiro/diagrama_pantaneiro/blob/main/backend/tests/fixtures/auth_me.json
  - https://github.com/LuisForasteiro/diagrama_pantaneiro/blob/main/backend/tests/fixtures/suggestions_500.json
  - https://github.com/LuisForasteiro/diagrama_pantaneiro/blob/main/backend/tests/fixtures/suggestions_1000.json
  - https://github.com/LuisForasteiro/diagrama_pantaneiro/blob/main/backend/tests/fixtures/suggestions_10000.json
- Engenharia reversa e variações (terceiro):
  - https://github.com/LuisForasteiro/diagrama_pantaneiro/blob/main/backend/app/services/algorithm.py
  - https://github.com/LuisForasteiro/diagrama_pantaneiro/blob/main/backend/app/services/strength.py
  - https://github.com/LuisForasteiro/diagrama_pantaneiro/blob/main/backend/app/services/default_diagram_questions.py
  - https://github.com/HigorJSilva/diagrama_pantaneiro
- Ferramenta oficial (área paga): https://ferramentas.auvp.com.br/carteira
- Fórum da AUVP (403 sem login; só trechos de busca):
  - https://comunidade.auvp.com.br/topic/36719-qual-o-algoritmo-utilizado-no-diagrama-do-cerrado/
  - https://comunidade.auvp.com.br/topic/41584-pergunta-para-devs-equipe-auvp-diagrama-do-cerrado/
  - https://comunidade.auvp.com.br/topic/21403-empresa-com-nota-negativa-no-diagrama-do-cerrado/
  - https://comunidade.auvp.com.br/topic/28766-diagrama-do-cerrado-perguntas-extras/
  - https://comunidade.auvp.com.br/topic/21831-perguntas-diagrama-do-cerrado-a%C3%A7%C3%B5es/
  - https://comunidade.auvp.com.br/topic/17906-diagrama-do-cerrado-onde-localizar/
- Outros de terceiros: https://fundamentus.sardinha.net/ ·
  https://www.youtube.com/watch?v=_ZyyQ0aGPCU ·
  https://www.scribd.com/document/710767335/Modelo-4-Diagrama-do-Cerrado ·
  https://diagramadocerrado.com.br/ (sem DNS no dia do acesso)
