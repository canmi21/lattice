CREATE TABLE `media` (
	`resource` text PRIMARY KEY NOT NULL,
	`category` text,
	`source_url` text,
	`source_label` text,
	`excerpt` text,
	FOREIGN KEY (`resource`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `tag` ADD `display` text;