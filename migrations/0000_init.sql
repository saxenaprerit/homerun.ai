CREATE TABLE `bills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`relationship` text NOT NULL,
	`name` text NOT NULL,
	`amount` real NOT NULL,
	`due_day` integer NOT NULL,
	`kind` text DEFAULT 'bill' NOT NULL,
	`created_at` integer NOT NULL
);

--> statement-breakpoint
CREATE INDEX `bills_due_idx` ON `bills` (`relationship`,`due_day`);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`relationship` text NOT NULL,
	`title` text NOT NULL,
	`type` text DEFAULT 'dinner' NOT NULL,
	`date` text NOT NULL,
	`time` text,
	`attendees` text,
	`notes` text,
	`created_at` integer NOT NULL
);

--> statement-breakpoint
CREATE INDEX `events_date_idx` ON `events` (`relationship`,`date`);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`relationship` text NOT NULL,
	`label` text NOT NULL,
	`amount` real NOT NULL,
	`category` text,
	`month` text NOT NULL,
	`created_at` integer NOT NULL
);

--> statement-breakpoint
CREATE INDEX `expenses_month_idx` ON `expenses` (`relationship`,`month`);
--> statement-breakpoint
CREATE TABLE `grocery_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`relationship` text NOT NULL,
	`name` text NOT NULL,
	`qty` text,
	`done` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);

--> statement-breakpoint
CREATE INDEX `grocery_rel_idx` ON `grocery_items` (`relationship`);
--> statement-breakpoint
CREATE TABLE `movies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`runtime` integer,
	`rating` text,
	`reason` text NOT NULL
);

--> statement-breakpoint
CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`relationship` text NOT NULL,
	`role` text,
	`emoji` text,
	`created_at` integer NOT NULL
);

--> statement-breakpoint
CREATE INDEX `people_rel_idx` ON `people` (`relationship`);
