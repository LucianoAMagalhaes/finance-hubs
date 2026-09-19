CREATE TABLE `antecipacao` (
	`id` integer PRIMARY KEY NOT NULL,
	`lancamento` integer NOT NULL,
	`data` text NOT NULL,
	`parcelas` integer NOT NULL,
	`valor` integer NOT NULL,
	`apagado_em` text,
	FOREIGN KEY (`lancamento`) REFERENCES `lancamento`(`id`) ON UPDATE no action ON DELETE no action
);
