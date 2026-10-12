-- Custom SQL migration file, put your code below! --
CREATE TRIGGER community_harden BEFORE UPDATE ON communities BEGIN
  SELECT RAISE(ABORT, 'MODE_IMMUTABLE') WHERE NEW.mode IS NOT OLD.mode;
  SELECT RAISE(ABORT, 'TAXONOMY_IMMUTABLE') WHERE json_extract(NEW.state,'$.categories') IS NOT json_extract(OLD.state,'$.categories') OR json_extract(NEW.state,'$.catalog') IS NOT json_extract(OLD.state,'$.catalog') OR json_extract(NEW.state,'$.venues') IS NOT json_extract(OLD.state,'$.venues');
  SELECT RAISE(ABORT, 'MEMBER_SHAPE') WHERE EXISTS (
    SELECT 1 FROM json_each(NEW.state,'$.members') m WHERE json_type(m.value,'$.id') IS NOT 'text' OR json_type(m.value,'$.role') IS NOT 'text' OR json_extract(m.value,'$.role') NOT IN ('member','moderator') OR json_type(m.value,'$.status') IS NOT 'text' OR json_extract(m.value,'$.status') NOT IN ('active','suspended','left') OR json_type(m.value,'$.version') IS NOT 'integer' OR json_type(m.value,'$.preferenceVersion') IS NOT 'integer' OR json_type(m.value,'$.availability') IS NOT 'array' OR json_type(m.value,'$.venueIds') IS NOT 'array');
  SELECT RAISE(ABORT, 'MEMBER_ADDITION') WHERE json_array_length(NEW.state,'$.members') IS NOT json_array_length(OLD.state,'$.members');
  SELECT RAISE(ABORT, 'MEMBER_PROFILE_AUTH') WHERE EXISTS (
    SELECT 1 FROM json_each(OLD.state,'$.members') o JOIN json_each(NEW.state,'$.members') n ON json_extract(o.value,'$.id')=json_extract(n.value,'$.id') WHERE (json_extract(o.value,'$.name') IS NOT json_extract(n.value,'$.name') OR json_extract(o.value,'$.timezone') IS NOT json_extract(n.value,'$.timezone')) AND json_extract(o.value,'$.id') IS NOT NEW.actor_id);
  SELECT RAISE(ABORT, 'PREFERENCE_VERSION') WHERE EXISTS (
    SELECT 1 FROM json_each(OLD.state,'$.members') o JOIN json_each(NEW.state,'$.members') n ON json_extract(o.value,'$.id')=json_extract(n.value,'$.id') WHERE (json_extract(o.value,'$.availability') IS NOT json_extract(n.value,'$.availability') OR json_extract(o.value,'$.venueIds') IS NOT json_extract(n.value,'$.venueIds')) AND json_extract(n.value,'$.preferenceVersion') IS NOT json_extract(o.value,'$.preferenceVersion')+1);
  SELECT RAISE(ABORT, 'LISTING_SHAPE') WHERE EXISTS (
    SELECT 1 FROM json_each(NEW.state,'$.listings') l WHERE json_type(l.value,'$.ownerId') IS NOT 'text' OR json_type(l.value,'$.status') IS NOT 'text' OR json_type(l.value,'$.condition') IS NOT 'integer' OR json_type(l.value,'$.wants') IS NOT 'array' OR length(json_extract(l.value,'$.title')) NOT BETWEEN 3 AND 80 OR length(json_extract(l.value,'$.description')) > 1000
      OR NOT EXISTS (SELECT 1 FROM json_each(NEW.state,'$.members') m WHERE json_extract(m.value,'$.id')=json_extract(l.value,'$.ownerId'))
      OR NOT EXISTS (SELECT 1 FROM json_each(NEW.state,'$.categories') c WHERE json_extract(c.value,'$.id')=json_extract(l.value,'$.categoryId'))
      OR (json_type(l.value,'$.catalogId') IS NOT 'null' AND NOT EXISTS (SELECT 1 FROM json_each(NEW.state,'$.catalog') c WHERE json_extract(c.value,'$.id')=json_extract(l.value,'$.catalogId') AND json_extract(c.value,'$.categoryId')=json_extract(l.value,'$.categoryId')))
      OR EXISTS (SELECT 1 FROM json_each(l.value,'$.wants') w WHERE json_type(w.value,'$.id') IS NOT 'text' OR json_type(w.value,'$.mode') IS NOT 'text' OR json_type(w.value,'$.minCondition') IS NOT 'integer' OR json_extract(w.value,'$.minCondition') NOT IN (1,2,3) OR json_type(w.value,'$.priority') IS NOT 'integer' OR json_extract(w.value,'$.priority') NOT IN (1,2,3) OR json_type(w.value,'$.version') IS NOT 'integer' OR json_extract(w.value,'$.version')<1
        OR NOT ((json_extract(w.value,'$.mode')='category' AND json_type(w.value,'$.catalogId') IS NULL AND EXISTS (SELECT 1 FROM json_each(NEW.state,'$.categories') c WHERE json_extract(c.value,'$.id')=json_extract(w.value,'$.categoryId'))) OR (json_extract(w.value,'$.mode')='catalog' AND json_type(w.value,'$.categoryId') IS NULL AND EXISTS (SELECT 1 FROM json_each(NEW.state,'$.catalog') c WHERE json_extract(c.value,'$.id')=json_extract(w.value,'$.catalogId'))))));
  SELECT RAISE(ABORT, 'NEW_LISTING_OWNER') WHERE EXISTS (SELECT 1 FROM json_each(NEW.state,'$.listings') n WHERE NOT EXISTS (SELECT 1 FROM json_each(OLD.state,'$.listings') o WHERE json_extract(o.value,'$.id')=json_extract(n.value,'$.id')) AND json_extract(n.value,'$.ownerId') IS NOT NEW.actor_id);
  SELECT RAISE(ABORT, 'LISTING_MATERIAL_VERSION') WHERE EXISTS (
    SELECT 1 FROM json_each(OLD.state,'$.listings') o JOIN json_each(NEW.state,'$.listings') n ON json_extract(o.value,'$.id')=json_extract(n.value,'$.id') WHERE json_remove(o.value,'$.status','$.version') IS NOT json_remove(n.value,'$.status','$.version') AND (json_extract(o.value,'$.status') IN ('reserved','exchanged','removed') OR json_extract(n.value,'$.version') IS NOT json_extract(o.value,'$.version')+1));
  SELECT RAISE(ABORT, 'LISTING_CAP') WHERE (SELECT count(*) FROM json_each(NEW.state,'$.listings') WHERE json_extract(value,'$.status')='active')>250;
  SELECT RAISE(ABORT, 'LOOP_TYPES') WHERE EXISTS (
    SELECT 1 FROM json_each(NEW.state,'$.loops') l WHERE json_type(l.value,'$.start') IS NOT 'integer' OR json_type(l.value,'$.end') IS NOT 'integer' OR json_type(l.value,'$.deadline') IS NOT 'integer' OR json_type(l.value,'$.createdAt') IS NOT 'integer' OR json_type(l.value,'$.listingIds') IS NOT 'array' OR json_type(l.value,'$.participants') IS NOT 'array' OR json_type(l.value,'$.transfers') IS NOT 'array' OR json_extract(l.value,'$.state') NOT IN ('PENDING','CONFIRMED','NEEDS_REVIEW','COMPLETED','RESOLVED','DECLINED','CANCELLED','EXPIRED','STALE','CONFLICTED')
      OR EXISTS (SELECT 1 FROM json_each(l.value,'$.participants') p WHERE json_type(p.value,'$.vote') IS NOT 'text' OR json_extract(p.value,'$.vote') NOT IN ('pending','accepted','declined')));


  SELECT RAISE(ABORT, 'CANONICAL_KEY') WHERE EXISTS (SELECT 1 FROM json_each(NEW.state,'$.loops') l WHERE json_extract(l.value,'$.listingIds[0]') IS NOT (SELECT min(value) FROM json_each(l.value,'$.listingIds')) OR json_extract(l.value,'$.key') IS NOT (
    SELECT group_concat(i.value || '@' || json_extract(p.value,'$.listingVersion'),'|') FROM json_each(l.value,'$.listingIds') i JOIN json_each(l.value,'$.participants') p ON json_extract(p.value,'$.offeredId')=i.value));
  SELECT RAISE(ABORT, 'PROPOSAL_CAP') WHERE EXISTS (SELECT 1 FROM json_each(NEW.state,'$.loops') WHERE json_extract(value,'$.createdAt')>unixepoch()-86400 GROUP BY json_extract(value,'$.initiatorId') HAVING count(*)>5) OR EXISTS (SELECT 1 FROM json_each(NEW.state,'$.loops') WHERE json_extract(value,'$.state')='PENDING' GROUP BY json_extract(value,'$.initiatorId') HAVING count(*)>3);
  SELECT RAISE(ABORT, 'DECLINE_COOLDOWN') WHERE EXISTS (
    SELECT 1 FROM json_each(NEW.state,'$.loops') n JOIN json_each(OLD.state,'$.loops') o JOIN json_each(o.value,'$.participants') op
    WHERE NOT EXISTS (SELECT 1 FROM json_each(OLD.state,'$.loops') x WHERE json_extract(x.value,'$.id')=json_extract(n.value,'$.id')) AND json_extract(o.value,'$.state')='DECLINED' AND json_extract(o.value,'$.initiatorId')=NEW.actor_id AND json_extract(op.value,'$.vote')='declined' AND json_extract(op.value,'$.voteAt')>unixepoch()-3600 AND EXISTS (SELECT 1 FROM json_each(n.value,'$.participants') p WHERE json_extract(p.value,'$.userId')=json_extract(op.value,'$.userId')));
  SELECT RAISE(ABORT, 'WANT_CONFORMANCE') WHERE EXISTS (
    SELECT 1 FROM json_each(NEW.state,'$.loops') n JOIN json_each(n.value,'$.transfers') t
    WHERE (NOT EXISTS (SELECT 1 FROM json_each(OLD.state,'$.loops') o WHERE json_extract(o.value,'$.id')=json_extract(n.value,'$.id')) OR (json_extract(n.value,'$.state')='CONFIRMED' AND EXISTS (SELECT 1 FROM json_each(OLD.state,'$.loops') o WHERE json_extract(o.value,'$.id')=json_extract(n.value,'$.id') AND json_extract(o.value,'$.state')='PENDING')))
      AND NOT EXISTS (
        SELECT 1 FROM json_each(OLD.state,'$.listings') giver JOIN json_each(OLD.state,'$.listings') recipient JOIN json_each(recipient.value,'$.wants') w
        WHERE json_extract(giver.value,'$.id')=json_extract(t.value,'$.listingId') AND json_extract(giver.value,'$.ownerId')=json_extract(t.value,'$.giverId')
          AND json_extract(recipient.value,'$.ownerId')=json_extract(t.value,'$.receiverId') AND EXISTS (SELECT 1 FROM json_each(n.value,'$.listingIds') i WHERE i.value=json_extract(recipient.value,'$.id'))
          AND json_extract(w.value,'$.id')=json_extract(t.value,'$.wantId') AND json_extract(w.value,'$.version')=json_extract(t.value,'$.wantVersion') AND json_extract(w.value,'$.priority')=json_extract(t.value,'$.priority')
          AND json_extract(giver.value,'$.condition')>=json_extract(w.value,'$.minCondition') AND ((json_extract(w.value,'$.mode')='catalog' AND json_extract(giver.value,'$.catalogId')=json_extract(w.value,'$.catalogId')) OR (json_extract(w.value,'$.mode')='category' AND json_extract(giver.value,'$.categoryId')=json_extract(w.value,'$.categoryId')))));
  SELECT RAISE(ABORT, 'SNAPSHOT_CONFORMANCE') WHERE EXISTS (
    SELECT 1 FROM json_each(NEW.state,'$.loops') n JOIN json_each(n.value,'$.participants') p WHERE NOT EXISTS (SELECT 1 FROM json_each(OLD.state,'$.loops') o WHERE json_extract(o.value,'$.id')=json_extract(n.value,'$.id')) AND (
      NOT EXISTS (SELECT 1 FROM json_each(OLD.state,'$.members') m WHERE json_extract(m.value,'$.id')=json_extract(p.value,'$.userId') AND json_extract(m.value,'$.status')='active' AND json_extract(m.value,'$.version')=json_extract(p.value,'$.memberVersion') AND json_extract(m.value,'$.preferenceVersion')=json_extract(p.value,'$.preferenceVersion'))
      OR NOT EXISTS (SELECT 1 FROM json_each(OLD.state,'$.listings') l WHERE json_extract(l.value,'$.id')=json_extract(p.value,'$.offeredId') AND json_extract(l.value,'$.status')='active' AND json_extract(l.value,'$.version')=json_extract(p.value,'$.listingVersion'))
      OR EXISTS (SELECT 1 FROM participant_holds h WHERE h.community_id=NEW.id AND h.user_id=json_extract(p.value,'$.userId'))));
  SELECT RAISE(ABORT, 'RECEIPT_SHAPE') WHERE EXISTS (SELECT 1 FROM json_each(NEW.state,'$.loops') l JOIN json_each(l.value,'$.transfers') t WHERE json_type(t.value,'$.receipt') IS NOT NULL AND (json_type(t.value,'$.receipt') IS NOT 'object' OR json_type(t.value,'$.receipt.receivedAt') IS NOT 'integer' OR json_extract(t.value,'$.receipt.recipientId') IS NOT json_extract(t.value,'$.receiverId')));
  SELECT RAISE(ABORT, 'OUTCOME_AUTH') WHERE EXISTS (
    SELECT 1 FROM json_each(OLD.state,'$.loops') o JOIN json_each(NEW.state,'$.loops') n ON json_extract(o.value,'$.id')=json_extract(n.value,'$.id') JOIN json_each(o.value,'$.transfers') ot JOIN json_each(n.value,'$.transfers') nt ON json_extract(ot.value,'$.id')=json_extract(nt.value,'$.id') WHERE json_extract(ot.value,'$.outcome') IS NOT json_extract(nt.value,'$.outcome') AND (json_extract(o.value,'$.state') IS NOT 'NEEDS_REVIEW' OR NOT EXISTS (SELECT 1 FROM json_each(OLD.state,'$.members') m WHERE json_extract(m.value,'$.id')=NEW.actor_id AND json_extract(m.value,'$.role')='moderator')));
  SELECT RAISE(ABORT, 'RESOLUTION_ITEM_STATE') WHERE EXISTS (
    SELECT 1 FROM json_each(NEW.state,'$.loops') l JOIN json_each(l.value,'$.transfers') t JOIN json_each(NEW.state,'$.listings') i ON json_extract(i.value,'$.id')=json_extract(t.value,'$.listingId') WHERE json_extract(l.value,'$.state')='RESOLVED' AND ((json_extract(t.value,'$.outcome')='recipient' AND json_extract(i.value,'$.status') IS NOT 'exchanged') OR (json_extract(t.value,'$.outcome')='original_owner' AND json_extract(i.value,'$.status') IS NOT 'paused')));
  SELECT RAISE(ABORT, 'RESERVED_ITEM_STATE') WHERE EXISTS (
    SELECT 1 FROM json_each(NEW.state,'$.loops') l JOIN json_each(l.value,'$.listingIds') i WHERE json_extract(l.value,'$.state') IN ('CONFIRMED','NEEDS_REVIEW') AND NOT EXISTS (SELECT 1 FROM json_each(NEW.state,'$.listings') x WHERE json_extract(x.value,'$.id')=i.value AND json_extract(x.value,'$.status')='reserved'));

  SELECT RAISE(ABORT, 'IDEMPOTENCY_IMMUTABLE') WHERE EXISTS (
    SELECT 1 FROM json_each(OLD.state,'$.idempotency') o WHERE json_extract(o.value,'$.at')>unixepoch()-172800 AND NOT EXISTS (SELECT 1 FROM json_each(NEW.state,'$.idempotency') n WHERE n.value IS o.value));
END;
--> statement-breakpoint
CREATE TRIGGER item_hold_insert BEFORE INSERT ON item_holds BEGIN
  SELECT RAISE(ABORT,'HOLD_INVALID') WHERE NOT EXISTS (SELECT 1 FROM communities c JOIN json_each(c.state,'$.loops') l JOIN json_each(l.value,'$.listingIds') i WHERE c.id=NEW.community_id AND json_extract(l.value,'$.id')=NEW.loop_id AND json_extract(l.value,'$.state') IN ('CONFIRMED','NEEDS_REVIEW') AND i.value=NEW.listing_id);
END;
--> statement-breakpoint
CREATE TRIGGER participant_hold_insert BEFORE INSERT ON participant_holds BEGIN
  SELECT RAISE(ABORT,'HOLD_INVALID') WHERE NOT EXISTS (SELECT 1 FROM communities c JOIN json_each(c.state,'$.loops') l JOIN json_each(l.value,'$.participants') p WHERE c.id=NEW.community_id AND json_extract(l.value,'$.id')=NEW.loop_id AND json_extract(l.value,'$.state') IN ('CONFIRMED','NEEDS_REVIEW') AND json_extract(p.value,'$.userId')=NEW.user_id);
END;
--> statement-breakpoint
CREATE TRIGGER item_hold_update BEFORE UPDATE ON item_holds BEGIN SELECT RAISE(ABORT,'HOLD_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER participant_hold_update BEFORE UPDATE ON participant_holds BEGIN SELECT RAISE(ABORT,'HOLD_IMMUTABLE'); END;
--> statement-breakpoint
CREATE INDEX idx_sessions_expiry ON demo_sessions(expires_at);
--> statement-breakpoint
CREATE INDEX idx_holds_loop ON item_holds(loop_id);
--> statement-breakpoint
CREATE INDEX idx_participant_holds_loop ON participant_holds(loop_id);
