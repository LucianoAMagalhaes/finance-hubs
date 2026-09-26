CREATE TABLE `payout_origin` (
	`id` integer PRIMARY KEY NOT NULL,
	`asset` integer NOT NULL,
	`kind` text NOT NULL,
	`record_date` text NOT NULL,
	`payment_date` text NOT NULL,
	FOREIGN KEY (`asset`) REFERENCES `asset`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `payout` ADD `origin` integer REFERENCES payout_origin(id);