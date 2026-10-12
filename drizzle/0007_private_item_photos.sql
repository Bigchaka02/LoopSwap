CREATE TABLE `photo_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`object_key` text NOT NULL,
	`input_hash` text NOT NULL,
	`state` text DEFAULT 'staged' NOT NULL,
	`cleanup_at` integer DEFAULT 0 NOT NULL,
	`byte_size` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "photo_state" CHECK("photo_uploads"."state" IN ('staged','ready','deleting','deleted')),
	CONSTRAINT "photo_dimensions" CHECK("photo_uploads"."width" BETWEEN 1 AND 900 AND "photo_uploads"."height" BETWEEN 1 AND 900),
	CONSTRAINT "photo_bytes" CHECK("photo_uploads"."byte_size" BETWEEN 1 AND 1000000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `photo_uploads_object_key_unique` ON `photo_uploads` (`object_key`);--> statement-breakpoint
CREATE INDEX `photo_owner_created_idx` ON `photo_uploads` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `photo_gc_idx` ON `photo_uploads` (`state`,`cleanup_at`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER photo_upload_insert BEFORE INSERT ON photo_uploads BEGIN
  SELECT RAISE(ABORT,'photo_initial_state') WHERE NEW.state!='staged' OR NEW.cleanup_at!=0 OR NEW.created_at!=unixepoch();
  SELECT RAISE(ABORT,'photo_owner_invalid') WHERE NOT EXISTS (
    SELECT 1 FROM communities c JOIN json_each(c.state,'$.members') m
    WHERE c.id=NEW.community_id AND json_extract(m.value,'$.id')=NEW.owner_id AND json_extract(m.value,'$.status')='active');
  SELECT RAISE(ABORT,'photo_daily_limit') WHERE NOT EXISTS (SELECT 1 FROM photo_uploads WHERE id=NEW.id)
    AND (SELECT count(*) FROM photo_uploads WHERE owner_id=NEW.owner_id AND created_at>unixepoch()-86400)>=20;
END;
--> statement-breakpoint
CREATE TRIGGER photo_upload_update BEFORE UPDATE ON photo_uploads BEGIN
  SELECT RAISE(ABORT,'photo_upload_immutable') WHERE NEW.id IS NOT OLD.id OR NEW.community_id IS NOT OLD.community_id OR NEW.owner_id IS NOT OLD.owner_id OR NEW.object_key IS NOT OLD.object_key OR NEW.input_hash IS NOT OLD.input_hash OR NEW.byte_size IS NOT OLD.byte_size OR NEW.width IS NOT OLD.width OR NEW.height IS NOT OLD.height OR NEW.created_at IS NOT OLD.created_at
    OR NOT ((OLD.state='staged' AND NEW.state='ready') OR (OLD.state IN ('staged','ready','deleting','deleted') AND NEW.state='deleting') OR (OLD.state='deleting' AND NEW.state='deleted'));
  SELECT RAISE(ABORT,'photo_still_referenced') WHERE NEW.state='deleting' AND (
    EXISTS (SELECT 1 FROM communities c JOIN json_each(c.state,'$.listings') i WHERE json_extract(i.value,'$.photo')='/api/photos/'||OLD.id)
    OR EXISTS (SELECT 1 FROM communities c JOIN json_each(c.state,'$.loops') l JOIN json_each(l.value,'$.transfers') t WHERE json_extract(t.value,'$.item.photo')='/api/photos/'||OLD.id)
    OR EXISTS (SELECT 1 FROM communities c JOIN json_each(c.state,'$.loans') l WHERE json_extract(l.value,'$.item.photo')='/api/photos/'||OLD.id));
END;
--> statement-breakpoint
CREATE TRIGGER photo_upload_delete BEFORE DELETE ON photo_uploads BEGIN SELECT RAISE(ABORT,'photo_tombstone_required'); END;
--> statement-breakpoint
CREATE TRIGGER community_photo_guard BEFORE UPDATE ON communities BEGIN
  SELECT RAISE(ABORT,'photo_reference_invalid') WHERE EXISTS (
    SELECT 1 FROM json_each(NEW.state,'$.listings') n
    LEFT JOIN json_each(OLD.state,'$.listings') o ON json_extract(o.value,'$.id')=json_extract(n.value,'$.id')
    WHERE json_extract(n.value,'$.photo') IS NOT NULL AND json_extract(n.value,'$.photo') IS NOT json_extract(o.value,'$.photo')
    AND NOT EXISTS (SELECT 1 FROM photo_uploads p WHERE p.community_id=NEW.id AND p.owner_id=json_extract(n.value,'$.ownerId') AND p.state='ready' AND '/api/photos/'||p.id=json_extract(n.value,'$.photo')));
END;
