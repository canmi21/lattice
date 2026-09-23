CREATE TABLE `reference` (
	`from_kind` text NOT NULL,
	`from_id` text NOT NULL,
	`cid` text NOT NULL,
	`via` text,
	PRIMARY KEY(`from_kind`, `from_id`, `cid`)
);
--> statement-breakpoint
CREATE INDEX `reference_by_cid` ON `reference` (`cid`);--> statement-breakpoint
CREATE TABLE `unreferenced` (
	`cid` text PRIMARY KEY NOT NULL,
	`since` text NOT NULL,
	`collected` integer DEFAULT false NOT NULL
);
