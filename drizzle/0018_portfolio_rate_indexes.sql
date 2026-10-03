CREATE TABLE `rate_index` (
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`rate` integer NOT NULL,
	PRIMARY KEY(`kind`, `date`)
);
