CREATE TABLE `payout` (
	`id` integer PRIMARY KEY NOT NULL,
	`asset` integer NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	FOREIGN KEY (`asset`) REFERENCES `asset`(`id`) ON UPDATE no action ON DELETE no action
);
