CREATE TABLE `results` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`case_id` text NOT NULL,
	`verdict` text NOT NULL,
	`observed` text NOT NULL,
	`expected` text NOT NULL,
	`evidence` text NOT NULL,
	`explanation` text NOT NULL,
	`transcript` text NOT NULL,
	`review_status` text DEFAULT 'unreviewed' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`assistant_version` text NOT NULL,
	`policy_version` integer NOT NULL,
	`created_at` text NOT NULL,
	`total` integer NOT NULL,
	`passed` integer NOT NULL,
	`failed` integer NOT NULL,
	`needs_review` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`policy` text NOT NULL,
	`catalog` text NOT NULL,
	`policy_version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stores_owner_id_unique` ON `stores` (`owner_id`);--> statement-breakpoint
CREATE TABLE `test_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`severity` text NOT NULL,
	`turns` text NOT NULL,
	`expected` text NOT NULL,
	`forbidden` text NOT NULL,
	`evidence` text NOT NULL,
	`rule_json` text DEFAULT '{}' NOT NULL,
	`source` text DEFAULT 'curated' NOT NULL,
	`created_at` text NOT NULL
);
