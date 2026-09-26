PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_trade` (
	`id` integer PRIMARY KEY NOT NULL,
	`asset` integer NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`quantity` integer,
	`unit_price` integer,
	`exchange_rate` integer,
	`amount` integer,
	`redeems_all` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`asset`) REFERENCES `asset`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_trade`("id", "asset", "kind", "date", "quantity", "unit_price", "exchange_rate") SELECT "id", "asset", "kind", "date", "quantity", "unit_price", "exchange_rate" FROM `trade`;--> statement-breakpoint
DROP TABLE `trade`;--> statement-breakpoint
ALTER TABLE `__new_trade` RENAME TO `trade`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `asset` ADD `bond_kind` text;--> statement-breakpoint
ALTER TABLE `asset` ADD `bond_type` text;--> statement-breakpoint
ALTER TABLE `asset` ADD `indexer` text;--> statement-breakpoint
ALTER TABLE `asset` ADD `rate` integer;--> statement-breakpoint
ALTER TABLE `asset` ADD `maturity_date` text;