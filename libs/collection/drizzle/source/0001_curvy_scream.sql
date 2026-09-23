/*
 A table rebuild rather than the three ALTERs drizzle-kit drafted: `slug` is NOT NULL and the
 table already holds rows, which SQLite refuses to add a column to without a default. The rows
 carry the answer, so this reads it out of `path` instead of inventing one.

 `rtrim(path, replace(path, '/', ''))` strips every trailing character that is not a slash,
 which leaves the directory and its slash; the rest follows from that.
*/
DROP INDEX `path_by_path`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_path` (
	`resource` text NOT NULL,
	`directory` text,
	`slug` text NOT NULL,
	`since` text NOT NULL,
	`until` text,
	PRIMARY KEY(`resource`, `since`),
	FOREIGN KEY (`resource`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_path`(`resource`, `directory`, `slug`, `since`, `until`)
SELECT
	`resource`,
	nullif(rtrim(rtrim(`path`, replace(`path`, '/', '')), '/'), ''),
	replace(`path`, rtrim(`path`, replace(`path`, '/', '')), ''),
	`since`,
	`until`
FROM `path`;--> statement-breakpoint
DROP TABLE `path`;--> statement-breakpoint
ALTER TABLE `__new_path` RENAME TO `path`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `path_current` ON `path` (`resource`) WHERE until is null;--> statement-breakpoint
CREATE UNIQUE INDEX `path_slug_current` ON `path` (`slug`) WHERE until is null;--> statement-breakpoint
CREATE INDEX `path_by_slug` ON `path` (`slug`);
