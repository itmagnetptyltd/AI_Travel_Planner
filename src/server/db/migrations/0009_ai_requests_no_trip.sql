PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ai_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`trip_id` text,
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
INSERT INTO `__new_ai_requests`("id", "account_id", "trip_id", "kind", "status", "request_text", "reply_text", "input_tokens", "output_tokens", "cost_micro_usd", "created_at") SELECT "id", "account_id", "trip_id", "kind", "status", "request_text", "reply_text", "input_tokens", "output_tokens", "cost_micro_usd", "created_at" FROM `ai_requests`;--> statement-breakpoint
DROP TABLE `ai_requests`;--> statement-breakpoint
ALTER TABLE `__new_ai_requests` RENAME TO `ai_requests`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `ai_requests_account_kind_created_idx` ON `ai_requests` (`account_id`,`kind`,`created_at`);