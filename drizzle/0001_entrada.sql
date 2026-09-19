CREATE TABLE `entrada` (
	`id` integer PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`descricao` text NOT NULL,
	`fonte` text NOT NULL,
	`tipo_de_pagamento` text NOT NULL,
	`valor` integer NOT NULL
);
