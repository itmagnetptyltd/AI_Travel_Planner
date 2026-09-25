CREATE TABLE `notification_log` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`kind` text NOT NULL,
	`sent_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_log_trip_kind_idx` ON `notification_log` (`trip_id`,`kind`,`sent_at`);--> statement-breakpoint
CREATE TABLE `plan_shares` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`recipient_email` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_shares_token_hash_unique` ON `plan_shares` (`token_hash`);--> statement-breakpoint
CREATE INDEX `plan_shares_trip_created_idx` ON `plan_shares` (`trip_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `notify_trip_created` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `notify_itinerary_updated` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `notify_trip_reminder` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `reminder_sent_at` integer;