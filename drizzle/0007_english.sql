ALTER TABLE `orcamento_do_mes` RENAME TO `month_budget`;--> statement-breakpoint
ALTER TABLE `month_budget` RENAME COLUMN `mes` TO `month`;--> statement-breakpoint
ALTER TABLE `month_budget` RENAME COLUMN `custos_fixos` TO `fixed_costs`;--> statement-breakpoint
ALTER TABLE `month_budget` RENAME COLUMN `liberdade_financeira` TO `financial_freedom`;--> statement-breakpoint
ALTER TABLE `month_budget` RENAME COLUMN `conforto` TO `comfort`;--> statement-breakpoint
ALTER TABLE `month_budget` RENAME COLUMN `metas` TO `goals`;--> statement-breakpoint
ALTER TABLE `month_budget` RENAME COLUMN `conhecimento` TO `knowledge`;--> statement-breakpoint
ALTER TABLE `month_budget` RENAME COLUMN `prazeres` TO `pleasures`;--> statement-breakpoint
ALTER TABLE `entrada` RENAME TO `income`;--> statement-breakpoint
ALTER TABLE `income` RENAME COLUMN `data` TO `date`;--> statement-breakpoint
ALTER TABLE `income` RENAME COLUMN `descricao` TO `description`;--> statement-breakpoint
ALTER TABLE `income` RENAME COLUMN `fonte` TO `source`;--> statement-breakpoint
ALTER TABLE `income` RENAME COLUMN `tipo_de_pagamento` TO `payment_method`;--> statement-breakpoint
ALTER TABLE `income` RENAME COLUMN `valor` TO `amount`;--> statement-breakpoint
ALTER TABLE `income` RENAME COLUMN `apagado_em` TO `deleted_at`;--> statement-breakpoint
ALTER TABLE `lancamento` RENAME TO `expense`;--> statement-breakpoint
ALTER TABLE `expense` RENAME COLUMN `data` TO `date`;--> statement-breakpoint
ALTER TABLE `expense` RENAME COLUMN `descricao` TO `description`;--> statement-breakpoint
ALTER TABLE `expense` RENAME COLUMN `pote` TO `jar`;--> statement-breakpoint
ALTER TABLE `expense` RENAME COLUMN `tipo_de_pagamento` TO `payment_method`;--> statement-breakpoint
ALTER TABLE `expense` RENAME COLUMN `valor` TO `amount`;--> statement-breakpoint
ALTER TABLE `expense` RENAME COLUMN `parcelas` TO `installments`;--> statement-breakpoint
ALTER TABLE `expense` RENAME COLUMN `apagado_em` TO `deleted_at`;--> statement-breakpoint
ALTER TABLE `antecipacao` RENAME TO `prepayment`;--> statement-breakpoint
ALTER TABLE `prepayment` RENAME COLUMN `lancamento` TO `expense`;--> statement-breakpoint
ALTER TABLE `prepayment` RENAME COLUMN `data` TO `date`;--> statement-breakpoint
ALTER TABLE `prepayment` RENAME COLUMN `parcelas` TO `installments`;--> statement-breakpoint
ALTER TABLE `prepayment` RENAME COLUMN `valor` TO `amount`;--> statement-breakpoint
ALTER TABLE `prepayment` RENAME COLUMN `apagado_em` TO `deleted_at`;--> statement-breakpoint
ALTER TABLE `recorrente` RENAME TO `recurring`;--> statement-breakpoint
ALTER TABLE `recurring` RENAME COLUMN `dia` TO `day`;--> statement-breakpoint
ALTER TABLE `recurring` RENAME COLUMN `encerrado_em` TO `ended_in`;--> statement-breakpoint
ALTER TABLE `recurring` RENAME COLUMN `apagado_em` TO `deleted_at`;--> statement-breakpoint
ALTER TABLE `vigencia` RENAME TO `period`;--> statement-breakpoint
ALTER TABLE `period` RENAME COLUMN `recorrente` TO `recurring`;--> statement-breakpoint
ALTER TABLE `period` RENAME COLUMN `desde` TO `since`;--> statement-breakpoint
ALTER TABLE `period` RENAME COLUMN `descricao` TO `description`;--> statement-breakpoint
ALTER TABLE `period` RENAME COLUMN `pote` TO `jar`;--> statement-breakpoint
ALTER TABLE `period` RENAME COLUMN `tipo_de_pagamento` TO `payment_method`;--> statement-breakpoint
ALTER TABLE `period` RENAME COLUMN `valor` TO `amount`;--> statement-breakpoint
UPDATE `income` SET `source` = CASE `source`
	WHEN 'salario' THEN 'salary'
	WHEN 'freela' THEN 'freelance'
	WHEN 'rendimentos' THEN 'investment-returns'
	WHEN 'outras-receitas' THEN 'other-income'
	ELSE `source` END;--> statement-breakpoint
UPDATE `income` SET `payment_method` = CASE `payment_method`
	WHEN 'dinheiro' THEN 'cash'
	WHEN 'cartao-de-credito' THEN 'credit-card'
	WHEN 'cartao-de-debito' THEN 'debit-card'
	WHEN 'transferencia' THEN 'transfer'
	WHEN 'debito-automatico' THEN 'direct-debit'
	ELSE `payment_method` END;--> statement-breakpoint
UPDATE `expense` SET `payment_method` = CASE `payment_method`
	WHEN 'dinheiro' THEN 'cash'
	WHEN 'cartao-de-credito' THEN 'credit-card'
	WHEN 'cartao-de-debito' THEN 'debit-card'
	WHEN 'transferencia' THEN 'transfer'
	WHEN 'debito-automatico' THEN 'direct-debit'
	ELSE `payment_method` END;--> statement-breakpoint
UPDATE `period` SET `payment_method` = CASE `payment_method`
	WHEN 'dinheiro' THEN 'cash'
	WHEN 'cartao-de-credito' THEN 'credit-card'
	WHEN 'cartao-de-debito' THEN 'debit-card'
	WHEN 'transferencia' THEN 'transfer'
	WHEN 'debito-automatico' THEN 'direct-debit'
	ELSE `payment_method` END;--> statement-breakpoint
UPDATE `expense` SET `jar` = CASE `jar`
	WHEN 'custos-fixos' THEN 'fixed-costs'
	WHEN 'liberdade-financeira' THEN 'financial-freedom'
	WHEN 'conforto' THEN 'comfort'
	WHEN 'metas' THEN 'goals'
	WHEN 'conhecimento' THEN 'knowledge'
	WHEN 'prazeres' THEN 'pleasures'
	ELSE `jar` END;--> statement-breakpoint
UPDATE `period` SET `jar` = CASE `jar`
	WHEN 'custos-fixos' THEN 'fixed-costs'
	WHEN 'liberdade-financeira' THEN 'financial-freedom'
	WHEN 'conforto' THEN 'comfort'
	WHEN 'metas' THEN 'goals'
	WHEN 'conhecimento' THEN 'knowledge'
	WHEN 'prazeres' THEN 'pleasures'
	ELSE `jar` END;
