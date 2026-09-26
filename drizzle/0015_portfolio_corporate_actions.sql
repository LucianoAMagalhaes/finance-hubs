CREATE TABLE `corporate_action` (
	`id` integer PRIMARY KEY NOT NULL,
	`asset` integer NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`ratio_from` integer NOT NULL,
	`ratio_to` integer NOT NULL,
	FOREIGN KEY (`asset`) REFERENCES `asset`(`id`) ON UPDATE no action ON DELETE no action
);
