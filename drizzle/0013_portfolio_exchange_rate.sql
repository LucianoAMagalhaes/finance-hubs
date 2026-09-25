CREATE TABLE `current_exchange_rate` (
	`id` integer PRIMARY KEY NOT NULL,
	`rate` integer NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `trade` ADD `exchange_rate` integer;