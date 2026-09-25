CREATE TABLE `ai_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`trip_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`request_text` text,
	`reply_text` text,
	`input_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cost_micro_usd` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_requests_account_kind_created_idx` ON `ai_requests` (`account_id`,`kind`,`created_at`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
