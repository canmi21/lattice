CREATE TABLE `content_derived` (
	`source` text NOT NULL,
	`cid` text NOT NULL,
	`format` text NOT NULL,
	`width` integer,
	`quality` real,
	PRIMARY KEY(`source`, `cid`),
	FOREIGN KEY (`source`) REFERENCES `content`(`cid`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cid`) REFERENCES `content`(`cid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `content` (
	`cid` text PRIMARY KEY NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`created` text NOT NULL,
	`layers` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `document` (
	`resource` text PRIMARY KEY NOT NULL,
	`source_file` text,
	`published` text,
	`modified` text NOT NULL,
	`modified_locked` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`resource`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `draft` (
	`resource` text NOT NULL,
	`slot` text NOT NULL,
	`body` text NOT NULL,
	`updated` text NOT NULL,
	PRIMARY KEY(`resource`, `slot`),
	FOREIGN KEY (`resource`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `path` (
	`resource` text NOT NULL,
	`path` text NOT NULL,
	`since` text NOT NULL,
	`until` text,
	PRIMARY KEY(`resource`, `since`),
	FOREIGN KEY (`resource`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `path_current` ON `path` (`resource`) WHERE until is null;--> statement-breakpoint
CREATE INDEX `path_by_path` ON `path` (`path`);--> statement-breakpoint
CREATE TABLE `resource_content` (
	`resource` text NOT NULL,
	`cid` text NOT NULL,
	`slot` text NOT NULL,
	`seq` integer NOT NULL,
	PRIMARY KEY(`resource`, `slot`, `seq`),
	FOREIGN KEY (`resource`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cid`) REFERENCES `content`(`cid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `resource_content_by_cid` ON `resource_content` (`cid`);--> statement-breakpoint
CREATE TABLE `resource_tag` (
	`resource` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`resource`, `tag`),
	FOREIGN KEY (`resource`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tag`) REFERENCES `tag`(`name`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `resource` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`canonical` text,
	`layers` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `revision` (
	`resource` text NOT NULL,
	`seq` integer NOT NULL,
	`at` text NOT NULL,
	`cid` text,
	`back_diff` text,
	`composed` text NOT NULL,
	`format` text DEFAULT 'dmp-1' NOT NULL,
	`note` text,
	PRIMARY KEY(`resource`, `seq`),
	FOREIGN KEY (`resource`) REFERENCES `resource`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "revision_head_or_patch" CHECK(("revision"."cid" is null) <> ("revision"."back_diff" is null))
);
--> statement-breakpoint
CREATE TABLE `tag` (
	`name` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`meaning` text,
	`source` text
);
--> statement-breakpoint
CREATE TABLE `text` (
	`owner_kind` text NOT NULL,
	`owner_id` text NOT NULL,
	`field` text NOT NULL,
	`locale` text NOT NULL,
	`body` text NOT NULL,
	`provider` text,
	`model` text,
	`at` text,
	`seconds` real,
	`tokens` integer,
	`review` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`owner_kind`, `owner_id`, `field`, `locale`)
);
