CREATE TABLE `answer` (
	`asset` integer NOT NULL,
	`question` integer NOT NULL,
	`value` integer NOT NULL,
	PRIMARY KEY(`asset`, `question`),
	FOREIGN KEY (`asset`) REFERENCES `asset`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`question`) REFERENCES `question`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `question` (
	`id` integer PRIMARY KEY NOT NULL,
	`questionnaire` text NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`questionnaire`) REFERENCES `questionnaire`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `questionnaire` (
	`id` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `questionnaire_evaluation` (
	`asset` integer PRIMARY KEY NOT NULL,
	`evaluated_at` text NOT NULL,
	FOREIGN KEY (`asset`) REFERENCES `asset`(`id`) ON UPDATE no action ON DELETE no action
);

--> statement-breakpoint
INSERT INTO questionnaire (id) VALUES ('stocks'), ('real-estate-funds');
--> statement-breakpoint
INSERT INTO question (id, questionnaire, position, text) VALUES
(1, 'stocks', 0, 'ROE historicamente maior que 5%? (Considere anos anteriores).'),
(2, 'stocks', 1, 'Tem um crescimento de receitas (Ou lucro) superior a 5% nos últimos 5 anos?'),
(3, 'stocks', 2, 'A empresa tem um histórico de pagamento de dividendos?'),
(4, 'stocks', 3, 'A empresa investe amplamente em pesquisa e inovação? Setor Obsoleto = SEMPRE NÃO'),
(5, 'stocks', 4, 'Tem mais de 30 anos de mercado? (Fundação)'),
(6, 'stocks', 5, 'É líder nacional ou mundial no setor em que atua? (Só considera se for LÍDER, primeira colocada)'),
(7, 'stocks', 6, 'O setor em que a empresa atua tem mais de 100 anos?'),
(8, 'stocks', 7, 'A empresa é uma BLUE CHIP?'),
(9, 'stocks', 8, 'A empresa tem uma boa gestão? Histórico de corrupção = SEMPRE NÃO'),
(10, 'stocks', 9, 'É livre de controle ESTATAL ou concentração em cliente único?'),
(11, 'stocks', 10, 'Div. Líquida/EBITDA é menor que 2 nos últimos 5 anos?'),
(12, 'real-estate-funds', 0, 'Os imóveis desse Fundo Imobiliário estão localizados em regiões nobres?'),
(13, 'real-estate-funds', 1, 'As propriedades são novas e não consomem manutenção excessiva?'),
(14, 'real-estate-funds', 2, 'O fundo imobiliário está negociado abaixo do P/VP 1? (Acima de 1,5, eu descarto o investimento em qualquer hipótese)'),
(15, 'real-estate-funds', 3, 'Distribui dividendos a mais de 4 anos consistentemente?'),
(16, 'real-estate-funds', 4, 'Não é dependende de um único inquilino ou imóvel?'),
(17, 'real-estate-funds', 5, 'O Yield está dentro ou acima da média para fundos imobiliários do mesmo tipo?');
