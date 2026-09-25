CREATE TABLE `plan_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`trip_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`source` text NOT NULL,
	`plan_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_versions_trip_version_idx` ON `plan_versions` (`trip_id`,`version_number`);