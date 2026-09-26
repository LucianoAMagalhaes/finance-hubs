ALTER TABLE `corporate_action` ADD `status` text DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE `corporate_action` ADD `origin` text;