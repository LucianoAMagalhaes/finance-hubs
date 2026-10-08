-- Compare only funds: stock questions and their answers may already be customized.
CREATE TEMP TABLE expected_fund_question (id integer, position integer, text text);
--> statement-breakpoint
INSERT INTO expected_fund_question (id, position, text) VALUES
(12, 0, 'Os imóveis desse Fundo Imobiliário estão localizados em regiões nobres?'),
(13, 1, 'As propriedades são novas e não consomem manutenção excessiva?'),
(14, 2, 'O fundo imobiliário está negociado abaixo do P/VP 1? (Acima de 1,5, eu descarto o investimento em qualquer hipótese)'),
(15, 3, 'Distribui dividendos a mais de 4 anos consistentemente?'),
(16, 4, 'Não é dependende de um único inquilino ou imóvel?'),
(17, 5, 'O Yield está dentro ou acima da média para fundos imobiliários do mesmo tipo?');
--> statement-breakpoint
CREATE TEMP TABLE fund_questionnaire_migration_guard (checked integer);
--> statement-breakpoint
CREATE TEMP TRIGGER guard_fund_questionnaire_update
BEFORE INSERT ON fund_questionnaire_migration_guard
WHEN EXISTS (
  SELECT id, position, text FROM question WHERE questionnaire = 'real-estate-funds'
  EXCEPT SELECT id, position, text FROM expected_fund_question
) OR EXISTS (
  SELECT id, position, text FROM expected_fund_question
  EXCEPT SELECT id, position, text FROM question WHERE questionnaire = 'real-estate-funds'
) OR EXISTS (
  SELECT 1 FROM answer
  LEFT JOIN question ON question.id = answer.question
  LEFT JOIN asset ON asset.id = answer.asset
  WHERE question.questionnaire = 'real-estate-funds'
     OR asset.asset_class = 'real-estate-funds'
) OR EXISTS (
  SELECT 1 FROM questionnaire_evaluation
  JOIN asset ON asset.id = questionnaire_evaluation.asset
  WHERE asset.asset_class = 'real-estate-funds'
)
BEGIN
  SELECT RAISE(ABORT, 'Não foi possível atualizar o questionário de FIIs: há respostas ou personalizações. Revise a base antes de substituir as perguntas.');
END;
--> statement-breakpoint
INSERT INTO fund_questionnaire_migration_guard VALUES (1);
--> statement-breakpoint
UPDATE question SET text = 'Os imóveis desse Fundo Imobiliário estão localizados em regiões nobres?' WHERE questionnaire = 'real-estate-funds' AND position = 0;
--> statement-breakpoint
UPDATE question SET text = 'As propriedades são novas e não consomem manutenção excessiva?' WHERE questionnaire = 'real-estate-funds' AND position = 1;
--> statement-breakpoint
UPDATE question SET text = 'O fundo imobiliário está negociado abaixo do P/VP 1? (Acima de 1,5, eu descarto o investimento em qualquer hipótese.)' WHERE questionnaire = 'real-estate-funds' AND position = 2;
--> statement-breakpoint
UPDATE question SET text = 'Distribui dividendos há mais de 10 anos consistentemente? (Histórico de 10 anos)' WHERE questionnaire = 'real-estate-funds' AND position = 3;
--> statement-breakpoint
UPDATE question SET text = 'Não é dependente de um único inquilino ou imóvel?' WHERE questionnaire = 'real-estate-funds' AND position = 4;
--> statement-breakpoint
UPDATE question SET text = 'O Yield está dentro ou acima da média para fundos imobiliários do mesmo tipo e é superior a 7,5%?' WHERE questionnaire = 'real-estate-funds' AND position = 5;
--> statement-breakpoint
INSERT INTO question (id, questionnaire, position, text) SELECT COALESCE(MAX(id), 0) + 1, 'real-estate-funds', 6, 'A vacância física e a vacância financeira são ≤ 5%? (Histórico de 10 anos)' FROM question;
--> statement-breakpoint
INSERT INTO question (id, questionnaire, position, text) SELECT COALESCE(MAX(id), 0) + 1, 'real-estate-funds', 7, 'A maior parte dos contratos é do tipo atípico ou possui WAULT (prazo médio de vencimento dos contratos) superior a 5 anos?' FROM question;
--> statement-breakpoint
INSERT INTO question (id, questionnaire, position, text) SELECT COALESCE(MAX(id), 0) + 1, 'real-estate-funds', 8, 'A liquidez média diária do fundo é superior a R$ 5 milhões/dia?' FROM question;
--> statement-breakpoint
INSERT INTO question (id, questionnaire, position, text) SELECT COALESCE(MAX(id), 0) + 1, 'real-estate-funds', 9, 'A gestora tem bom histórico de mercado, com gestão ativa, e as taxas de administração/performance estão alinhadas com o setor e são < 2%?' FROM question;
--> statement-breakpoint
INSERT INTO question (id, questionnaire, position, text) SELECT COALESCE(MAX(id), 0) + 1, 'real-estate-funds', 10, 'A alavancagem financeira é ≤ 15%?' FROM question;
--> statement-breakpoint
INSERT INTO question (id, questionnaire, position, text) SELECT COALESCE(MAX(id), 0) + 1, 'real-estate-funds', 11, 'DY é maior que FFO, ou seja, o fundo distribui mais que gerou? (Histórico de 10 anos)' FROM question;
--> statement-breakpoint
DROP TRIGGER guard_fund_questionnaire_update;
--> statement-breakpoint
DROP TABLE fund_questionnaire_migration_guard;
--> statement-breakpoint
DROP TABLE expected_fund_question;
