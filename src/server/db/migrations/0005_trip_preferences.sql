ALTER TABLE `trips` ADD `interests` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `food_preferences` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `transportation` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` ADD `accommodation` text;