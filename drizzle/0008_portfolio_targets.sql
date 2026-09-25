CREATE TABLE `class_target` (
	`asset_class` text PRIMARY KEY NOT NULL,
	`target` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `class_target` (`asset_class`, `target`) VALUES
	('domestic-stocks', 25),
	('international-stocks', 15),
	('fixed-income', 45),
	('real-estate-funds', 10),
	('crypto', 5);
