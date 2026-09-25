CREATE TABLE `asset` (
	`id` integer PRIMARY KEY NOT NULL,
	`ticker` text NOT NULL,
	`asset_class` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_ticker_unique` ON `asset` (`ticker`);--> statement-breakpoint
CREATE TABLE `trade` (
	`id` integer PRIMARY KEY NOT NULL,
	`asset` integer NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` integer NOT NULL,
	FOREIGN KEY (`asset`) REFERENCES `asset`(`id`) ON UPDATE no action ON DELETE no action
);
