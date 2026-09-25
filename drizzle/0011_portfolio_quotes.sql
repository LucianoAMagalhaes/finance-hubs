CREATE TABLE `last_fetch` (
	`kind` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `quote` (
	`asset` integer PRIMARY KEY NOT NULL,
	`price` integer NOT NULL,
	`at` text NOT NULL,
	FOREIGN KEY (`asset`) REFERENCES `asset`(`id`) ON UPDATE no action ON DELETE no action
);
