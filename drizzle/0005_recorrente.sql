CREATE TABLE `recorrente` (
	`id` integer PRIMARY KEY NOT NULL,
	`dia` integer NOT NULL,
	`encerrado_em` text,
	`apagado_em` text
);
--> statement-breakpoint
CREATE TABLE `vigencia` (
	`recorrente` integer NOT NULL,
	`desde` text NOT NULL,
	`descricao` text NOT NULL,
	`pote` text NOT NULL,
	`tipo_de_pagamento` text NOT NULL,
	`valor` integer NOT NULL,
	`tag` text,
	PRIMARY KEY(`recorrente`, `desde`),
	FOREIGN KEY (`recorrente`) REFERENCES `recorrente`(`id`) ON UPDATE no action ON DELETE no action
);
