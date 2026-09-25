CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`seq` integer NOT NULL,
	`role` text NOT NULL,
	`text` text NOT NULL,
	`proposal_json` text,
	`proposal_status` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_messages_trip_seq_idx` ON `chat_messages` (`trip_id`,`seq`);