CREATE TABLE `feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text,
	`plan_version` integer NOT NULL,
	`rating` integer NOT NULL,
	`comment` text,
	`destination_name` text NOT NULL,
	`destination_country` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "feedback_rating_range" CHECK("feedback"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_trip_idx` ON `feedback` (`trip_id`);