CREATE TABLE `active_proposals` (
	`community_id` text NOT NULL,
	`loop_id` text NOT NULL,
	`canonical_key` text NOT NULL,
	PRIMARY KEY(`community_id`, `loop_id`),
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `active_cycle_unique` ON `active_proposals` (`community_id`,`canonical_key`);--> statement-breakpoint
CREATE TABLE `communities` (
	`id` text PRIMARY KEY NOT NULL,
	`mode` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`state` text NOT NULL,
	`actor_id` text DEFAULT 'system' NOT NULL,
	`operation` text DEFAULT 'seed' NOT NULL,
	`operation_id` text DEFAULT 'seed' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CONSTRAINT "state_valid" CHECK(json_valid("communities"."state") AND length("communities"."state") < 1500000),
	CONSTRAINT "mode_valid" CHECK("communities"."mode" IN ('demo','pilot') AND json_extract("communities"."state", '$.mode') IS "communities"."mode")
);
--> statement-breakpoint
CREATE TABLE `platform_identities` (
	`platform_id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`community_id` text NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_identities_member_id_unique` ON `platform_identities` (`member_id`);--> statement-breakpoint
CREATE TABLE `item_holds` (
	`community_id` text NOT NULL,
	`listing_id` text NOT NULL,
	`loop_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`community_id`, `listing_id`),
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `loop_events` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `notification_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'delivered' NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `loop_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_event_recipient` ON `notification_outbox` (`event_id`,`recipient_id`);--> statement-breakpoint
CREATE TABLE `participant_holds` (
	`community_id` text NOT NULL,
	`user_id` text NOT NULL,
	`loop_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`community_id`, `user_id`),
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `demo_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`community_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action
);
