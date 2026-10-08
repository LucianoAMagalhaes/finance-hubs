-- Compare only stocks: fund questions and their answers may already be customized.
CREATE TEMP TABLE expected_stock_question (id integer, position integer, text text);
--> statement-breakpoint
INSERT INTO expected_stock_question (id, position, text) VALUES
(1, 0, 'ROE historicamente maior que 5%? (Considere anos anteriores).'),
(2, 1, 'Tem um crescimento de receitas (Ou lucro) superior a 5% nos últimos 5 anos?'),
(3, 2, 'A empresa tem um histórico de pagamento de dividendos?'),
(4, 3, 'A empresa investe amplamente em pesquisa e inovação? Setor Obsoleto = SEMPRE NÃO'),
(5, 4, 'Tem mais de 30 anos de mercado? (Fundação)'),
(6, 5, 'É líder nacional ou mundial no setor em que atua? (Só considera se for LÍDER, primeira colocada)'),
(7, 6, 'O setor em que a empresa atua tem mais de 100 anos?'),
(8, 7, 'A empresa é uma BLUE CHIP?'),
(9, 8, 'A empresa tem uma boa gestão? Histórico de corrupção = SEMPRE NÃO'),
(10, 9, 'É livre de controle ESTATAL ou concentração em cliente único?'),
(11, 10, 'Div. Líquida/EBITDA é menor que 2 nos últimos 5 anos?');
--> statement-breakpoint
CREATE TEMP TABLE stock_questionnaire_migration_guard (checked integer);
--> statement-breakpoint
CREATE TEMP TRIGGER guard_stock_questionnaire_update
BEFORE INSERT ON stock_questionnaire_migration_guard
WHEN EXISTS (
  SELECT id, position, text FROM question WHERE questionnaire = 'stocks'
  EXCEPT SELECT id, position, text FROM expected_stock_question
) OR EXISTS (
  SELECT id, position, text FROM expected_stock_question
  EXCEPT SELECT id, position, text FROM question WHERE questionnaire = 'stocks'
) OR EXISTS (
  SELECT 1 FROM answer
  LEFT JOIN question ON question.id = answer.question
  LEFT JOIN asset ON asset.id = answer.asset
  WHERE question.questionnaire = 'stocks'
     OR asset.asset_class IN ('domestic-stocks', 'international-stocks')
) OR EXISTS (
  SELECT 1 FROM questionnaire_evaluation
  JOIN asset ON asset.id = questionnaire_evaluation.asset
  WHERE asset.asset_class IN ('domestic-stocks', 'international-stocks')
)
BEGIN
  SELECT RAISE(ABORT, 'Não foi possível atualizar o questionário de ações: há respostas ou personalizações. Revise a base antes de substituir as perguntas.');
END;
--> statement-breakpoint
INSERT INTO stock_questionnaire_migration_guard VALUES (1);
--> statement-breakpoint
UPDATE question SET text = 'Empresas: Dívida Líquida/EBITDA < 2,5x? Bancos: Índice de Basileia ≥ 14%? (Histórico de 5 anos)' WHERE questionnaire = 'stocks' AND position = 0;
--> statement-breakpoint
UPDATE question SET text = 'Empresas: Liquidez Corrente > 1? Bancos: Índice de Inadimplência acima de 90 dias < 3,5%? (Histórico de 5 anos)' WHERE questionnaire = 'stocks' AND position = 1;
--> statement-breakpoint
UPDATE question SET text = 'A empresa demonstra alta eficiência operacional, mantendo Margem Líquida > 10%? (Histórico de 5 anos)' WHERE questionnaire = 'stocks' AND position = 2;
--> statement-breakpoint
UPDATE question SET text = 'A ação possui liquidez média diária maior ou igual a R$ 50 milhões?' WHERE questionnaire = 'stocks' AND position = 3;
--> statement-breakpoint
UPDATE question SET text = 'Empresas: ROE e ROIC > 10%? Bancos: ROE > 10%? (Histórico de 5 anos)' WHERE questionnaire = 'stocks' AND position = 4;
--> statement-breakpoint
UPDATE question SET text = 'A empresa apresenta crescimento composto (CAGR) de receitas ou lucros > 5% ao ano? (Histórico de 5 anos)' WHERE questionnaire = 'stocks' AND position = 5;
--> statement-breakpoint
UPDATE question SET text = 'A empresa investe amplamente em pesquisa, inovação e tecnologia, atuando em um modelo de negócio livre do risco de obsolescência? (Histórico de 5 anos)' WHERE questionnaire = 'stocks' AND position = 6;
--> statement-breakpoint
UPDATE question SET text = 'A empresa possui mais de 30 anos de mercado desde a sua fundação?' WHERE questionnaire = 'stocks' AND position = 7;
--> statement-breakpoint
UPDATE question SET text = 'O setor em que a empresa atua possui mais de 100 anos de existência e continuará sendo demandado nas próximas décadas?' WHERE questionnaire = 'stocks' AND position = 8;
--> statement-breakpoint
UPDATE question SET text = 'A empresa tem uma boa gestão? Histórico de corrupção = SEMPRE NÃO.' WHERE questionnaire = 'stocks' AND position = 9;
--> statement-breakpoint
UPDATE question SET text = 'É uma Blue Chip, líder no seu segmento ou está entre as três maiores do setor?' WHERE questionnaire = 'stocks' AND position = 10;
--> statement-breakpoint
INSERT INTO question (id, questionnaire, position, text) SELECT COALESCE(MAX(id), 0) + 1, 'stocks', 11, 'Possui Tag Along de 100% ou está no Novo Mercado?' FROM question;
--> statement-breakpoint
INSERT INTO question (id, questionnaire, position, text) SELECT COALESCE(MAX(id), 0) + 1, 'stocks', 12, 'É livre de controle estatal ou possui base diversificada de clientes, sem dependência de cliente único?' FROM question;
--> statement-breakpoint
INSERT INTO question (id, questionnaire, position, text) SELECT COALESCE(MAX(id), 0) + 1, 'stocks', 13, 'Empresas: P/FCL e EV/FCL < 15? Bancos: P/L < 12x?' FROM question;
--> statement-breakpoint
DROP TRIGGER guard_stock_questionnaire_update;
--> statement-breakpoint
DROP TABLE stock_questionnaire_migration_guard;
--> statement-breakpoint
DROP TABLE expected_stock_question;
