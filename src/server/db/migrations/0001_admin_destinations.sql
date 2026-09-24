CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_account_id` text NOT NULL,
	`action` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`occurred_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `destinations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`country` text NOT NULL,
	`description` text NOT NULL,
	`popular_activities` text NOT NULL,
	`recommended_duration_days` integer NOT NULL,
	`travel_information` text NOT NULL,
	`disabled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD `disabled_at` integer;