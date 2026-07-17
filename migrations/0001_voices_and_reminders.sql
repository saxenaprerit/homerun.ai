CREATE TABLE `reminders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`relationship` text NOT NULL,
	`person_id` integer NOT NULL,
	`message` text NOT NULL,
	`due_at` text,
	`done` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);

--> statement-breakpoint
CREATE INDEX `reminders_rel_idx` ON `reminders` (`relationship`,`done`);
--> statement-breakpoint
ALTER TABLE `people` ADD `voice_id` text;
--> statement-breakpoint
ALTER TABLE `people` ADD `voice_name` text;
--> statement-breakpoint
ALTER TABLE `people` ADD `voice_created_at` integer;
