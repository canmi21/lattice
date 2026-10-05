CREATE TABLE `trust_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`country` text
);
--> statement-breakpoint
CREATE INDEX `trust_grants_expires_at_idx` ON `trust_grants` (`expires_at`);