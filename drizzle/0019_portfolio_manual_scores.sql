CREATE TABLE `manual_score` (
	`asset` integer PRIMARY KEY NOT NULL,
	`score` integer NOT NULL,
	`evaluated_at` text NOT NULL,
	FOREIGN KEY (`asset`) REFERENCES `asset`(`id`) ON UPDATE no action ON DELETE no action
);
