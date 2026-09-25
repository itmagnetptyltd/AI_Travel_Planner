CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_account_id` text NOT NULL,
	`name` text NOT NULL,
	`destination_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`adults` integer NOT NULL,
	`children` integer NOT NULL,
	`budget` integer NOT NULL,
	`currency` text NOT NULL,
	`travel_styles` text NOT NULL,
	`status` text NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`destination_id`) REFERENCES `destinations`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `trips_owner_deleted_idx` ON `trips` (`owner_account_id`,`deleted_at`);