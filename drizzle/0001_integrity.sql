CREATE TRIGGER community_validate BEFORE UPDATE ON communities BEGIN
  SELECT RAISE(ABORT, 'REVISION_INVALID') WHERE NEW.id IS NOT OLD.id OR NEW.revision IS NOT OLD.revision + 1;
  SELECT RAISE(ABORT, 'STATE_SHAPE') WHERE json_extract(NEW.state, '$.mode') IS NOT json_extract(OLD.state, '$.mode')
    OR json_type(NEW.state, '$.members') IS NOT 'array' OR json_type(NEW.state, '$.listings') IS NOT 'array'
    OR json_type(NEW.state, '$.loops') IS NOT 'array' OR json_type(NEW.state, '$.events') IS NOT 'array'
    OR json_type(NEW.state, '$.notifications') IS NOT 'array';
  SELECT RAISE(ABORT, 'DUPLICATE_JSON_KEY') WHERE EXISTS (SELECT 1 FROM json_tree(NEW.state) WHERE typeof(key) = 'text' GROUP BY parent, key HAVING count(*) > 1);
  SELECT RAISE(ABORT, 'ACTOR_INVALID') WHERE NEW.actor_id != 'system' AND NOT EXISTS (SELECT 1 FROM json_each(OLD.state, '$.members') m WHERE json_extract(m.value, '$.id') = NEW.actor_id AND json_extract(m.value, '$.status') = 'active');
  SELECT RAISE(ABORT, 'SYSTEM_SCOPE') WHERE NEW.actor_id = 'system' AND (NEW.operation != 'reconcile' OR json_extract(NEW.state, '$.members') IS NOT json_extract(OLD.state, '$.members') OR json_extract(NEW.state, '$.listings') IS NOT json_extract(OLD.state, '$.listings') OR json_extract(NEW.state, '$.blocks') IS NOT json_extract(OLD.state, '$.blocks'));
  SELECT RAISE(ABORT, 'DUPLICATE_ENTITY') WHERE
    EXISTS (SELECT 1 FROM json_each(NEW.state, '$.listings') GROUP BY json_extract(value, '$.id') HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM json_each(NEW.state, '$.members') GROUP BY json_extract(value, '$.id') HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM json_each(NEW.state, '$.loops') GROUP BY json_extract(value, '$.id') HAVING count(*) > 1);
  SELECT RAISE(ABORT, 'PROTECTED_MEMBERSHIP') WHERE EXISTS (
    SELECT 1 FROM json_each(OLD.state, '$.members') o LEFT JOIN json_each(NEW.state, '$.members') n ON json_extract(n.value, '$.id') = json_extract(o.value, '$.id')
    WHERE n.value IS NULL OR json_extract(o.value, '$.role') IS NOT json_extract(n.value, '$.role')
      OR (json_extract(o.value, '$.status') IS NOT json_extract(n.value, '$.status') AND json_extract(o.value, '$.id') != NEW.actor_id AND NOT EXISTS (SELECT 1 FROM json_each(OLD.state, '$.members') a WHERE json_extract(a.value, '$.id') = NEW.actor_id AND json_extract(a.value, '$.role') = 'moderator'))
      OR ((json_extract(o.value, '$.availability') IS NOT json_extract(n.value, '$.availability') OR json_extract(o.value, '$.venueIds') IS NOT json_extract(n.value, '$.venueIds')) AND json_extract(o.value, '$.id') != NEW.actor_id));
  SELECT RAISE(ABORT, 'LISTING_OWNERSHIP') WHERE EXISTS (
    SELECT 1 FROM json_each(OLD.state, '$.listings') o LEFT JOIN json_each(NEW.state, '$.listings') n ON json_extract(n.value, '$.id') = json_extract(o.value, '$.id')
    WHERE n.value IS NULL OR json_extract(o.value, '$.ownerId') IS NOT json_extract(n.value, '$.ownerId')
      OR (json_remove(o.value, '$.status', '$.version') IS NOT json_remove(n.value, '$.status', '$.version') AND json_extract(o.value, '$.ownerId') != NEW.actor_id));
  SELECT RAISE(ABORT, 'ACTIVE_QUOTA') WHERE EXISTS (SELECT 1 FROM json_each(NEW.state, '$.listings') WHERE json_extract(value, '$.status') IN ('active', 'reserved') GROUP BY json_extract(value, '$.ownerId') HAVING count(*) > 3);
  SELECT RAISE(ABORT, 'LISTING_INVALID') WHERE EXISTS (SELECT 1 FROM json_each(NEW.state, '$.listings') l WHERE
    json_type(l.value, '$.id') IS NOT 'text' OR json_type(l.value, '$.version') IS NOT 'integer' OR json_extract(l.value, '$.version') < 1
    OR json_extract(l.value, '$.status') NOT IN ('draft','active','reserved','paused','exchanged','removed')
    OR json_extract(l.value, '$.condition') NOT IN (1,2,3)
    OR (json_extract(l.value, '$.status') = 'active' AND (json_array_length(l.value, '$.wants') < 1 OR json_array_length(l.value, '$.wants') > 5)));
  SELECT RAISE(ABORT, 'LOOP_REMOVED') WHERE EXISTS (SELECT 1 FROM json_each(OLD.state, '$.loops') o WHERE NOT EXISTS (SELECT 1 FROM json_each(NEW.state, '$.loops') n WHERE json_extract(n.value, '$.id') = json_extract(o.value, '$.id')));
  SELECT RAISE(ABORT, 'LOOP_LEDGER') WHERE EXISTS (SELECT 1 FROM json_each(NEW.state, '$.loops') l WHERE
    json_type(l.value, '$.id') IS NOT 'text' OR json_type(l.value, '$.state') IS NOT 'text'
    OR json_array_length(l.value, '$.participants') NOT IN (2,3)
    OR json_array_length(l.value, '$.transfers') IS NOT json_array_length(l.value, '$.participants')
    OR json_array_length(l.value, '$.listingIds') IS NOT json_array_length(l.value, '$.participants')
    OR json_type(l.value, '$.version') IS NOT 'integer' OR json_extract(l.value, '$.version') IS NOT 1
    OR json_extract(l.value, '$.end') IS NOT json_extract(l.value, '$.start') + 1800
    OR json_extract(l.value, '$.start') % 900 IS NOT 0
    OR (SELECT count(DISTINCT json_extract(value, '$.userId')) FROM json_each(l.value, '$.participants')) IS NOT json_array_length(l.value, '$.participants')
    OR (SELECT count(DISTINCT json_extract(value, '$.offeredId')) FROM json_each(l.value, '$.participants')) IS NOT json_array_length(l.value, '$.participants')
    OR (SELECT count(DISTINCT json_extract(value, '$.listingId')) FROM json_each(l.value, '$.transfers')) IS NOT json_array_length(l.value, '$.participants')
    OR EXISTS (SELECT 1 FROM json_each(l.value, '$.participants') p WHERE
      (SELECT count(*) FROM json_each(l.value, '$.transfers') t WHERE json_extract(t.value, '$.giverId') = json_extract(p.value, '$.userId') AND json_extract(t.value, '$.listingId') = json_extract(p.value, '$.offeredId')) IS NOT 1
      OR (SELECT count(*) FROM json_each(l.value, '$.transfers') t WHERE json_extract(t.value, '$.receiverId') = json_extract(p.value, '$.userId') AND json_extract(t.value, '$.listingId') = json_extract(p.value, '$.incomingId')) IS NOT 1)
    OR EXISTS (SELECT 1 FROM json_each(l.value, '$.transfers') t WHERE json_extract(t.value, '$.giverId') IS json_extract(t.value, '$.receiverId') OR json_extract(t.value, '$.item.ownerId') IS NOT json_extract(t.value, '$.giverId') OR json_extract(t.value, '$.item.id') IS NOT json_extract(t.value, '$.listingId')));
  SELECT RAISE(ABORT, 'TERMS_IMMUTABLE') WHERE EXISTS (
    SELECT 1 FROM json_each(OLD.state, '$.loops') o JOIN json_each(NEW.state, '$.loops') n ON json_extract(o.value, '$.id') = json_extract(n.value, '$.id') WHERE
    json_remove(o.value, '$.state', '$.sequence', '$.terminalReason', '$.resolution', '$.participants', '$.transfers') IS NOT json_remove(n.value, '$.state', '$.sequence', '$.terminalReason', '$.resolution', '$.participants', '$.transfers')
    OR EXISTS (SELECT 1 FROM json_each(o.value, '$.participants') op LEFT JOIN json_each(n.value, '$.participants') np ON json_extract(op.value, '$.userId') = json_extract(np.value, '$.userId') WHERE np.value IS NULL OR json_remove(op.value, '$.vote', '$.voteAt') IS NOT json_remove(np.value, '$.vote', '$.voteAt'))
    OR EXISTS (SELECT 1 FROM json_each(o.value, '$.transfers') ot LEFT JOIN json_each(n.value, '$.transfers') nt ON json_extract(ot.value, '$.id') = json_extract(nt.value, '$.id') WHERE nt.value IS NULL OR json_remove(ot.value, '$.receipt', '$.outcome') IS NOT json_remove(nt.value, '$.receipt', '$.outcome')));
  SELECT RAISE(ABORT, 'STATE_TRANSITION') WHERE EXISTS (
    SELECT 1 FROM json_each(OLD.state, '$.loops') o JOIN json_each(NEW.state, '$.loops') n ON json_extract(o.value, '$.id') = json_extract(n.value, '$.id')
    WHERE json_extract(o.value, '$.state') IS NOT json_extract(n.value, '$.state') AND NOT (
      (json_extract(o.value, '$.state') = 'PENDING' AND json_extract(n.value, '$.state') IN ('CONFIRMED','DECLINED','CANCELLED','EXPIRED','STALE','CONFLICTED'))
      OR (json_extract(o.value, '$.state') = 'CONFIRMED' AND json_extract(n.value, '$.state') IN ('COMPLETED','CANCELLED','NEEDS_REVIEW'))
      OR (json_extract(o.value, '$.state') = 'NEEDS_REVIEW' AND json_extract(n.value, '$.state') IN ('COMPLETED','RESOLVED'))));
  SELECT RAISE(ABORT, 'VOTE_AUTH') WHERE EXISTS (
    SELECT 1 FROM json_each(OLD.state, '$.loops') o JOIN json_each(NEW.state, '$.loops') n ON json_extract(o.value, '$.id') = json_extract(n.value, '$.id') JOIN json_each(o.value, '$.participants') op JOIN json_each(n.value, '$.participants') np ON json_extract(op.value, '$.userId') = json_extract(np.value, '$.userId')
    WHERE json_extract(op.value, '$.vote') IS NOT json_extract(np.value, '$.vote') AND (json_extract(np.value, '$.userId') IS NOT NEW.actor_id OR json_extract(o.value, '$.state') IS NOT 'PENDING' OR unixepoch('now') >= json_extract(o.value, '$.deadline')));
  SELECT RAISE(ABORT, 'RECEIPT_AUTH') WHERE EXISTS (
    SELECT 1 FROM json_each(OLD.state, '$.loops') o JOIN json_each(NEW.state, '$.loops') n ON json_extract(o.value, '$.id') = json_extract(n.value, '$.id') JOIN json_each(o.value, '$.transfers') ot JOIN json_each(n.value, '$.transfers') nt ON json_extract(ot.value, '$.id') = json_extract(nt.value, '$.id')
    WHERE (json_type(ot.value, '$.receipt') IS NOT NULL AND json_extract(ot.value, '$.receipt') IS NOT json_extract(nt.value, '$.receipt'))
      OR (json_type(ot.value, '$.receipt') IS NULL AND json_type(nt.value, '$.receipt') IS NOT NULL AND (
        json_extract(nt.value, '$.receiverId') IS NOT NEW.actor_id OR json_extract(nt.value, '$.receipt.recipientId') IS NOT NEW.actor_id
        OR json_extract(o.value, '$.state') NOT IN ('CONFIRMED','NEEDS_REVIEW') OR unixepoch('now') < json_extract(o.value, '$.start') - 600)));
  SELECT RAISE(ABORT, 'PROPOSAL_INVALID') WHERE EXISTS (SELECT 1 FROM json_each(NEW.state, '$.loops') n WHERE NOT EXISTS (SELECT 1 FROM json_each(OLD.state, '$.loops') o WHERE json_extract(o.value, '$.id') = json_extract(n.value, '$.id')) AND (
    json_extract(n.value, '$.state') IS NOT 'PENDING' OR json_extract(n.value, '$.initiatorId') IS NOT NEW.actor_id
    OR json_extract(n.value, '$.start') < unixepoch('now') + 7200
    OR json_extract(n.value, '$.deadline') IS NOT min(json_extract(n.value, '$.createdAt') + 86400, json_extract(n.value, '$.start') - 3600)
    OR (SELECT count(*) FROM json_each(n.value, '$.participants') WHERE json_extract(value, '$.vote') = 'accepted' AND json_extract(value, '$.userId') = NEW.actor_id) IS NOT 1
    OR EXISTS (SELECT 1 FROM json_each(n.value, '$.participants') WHERE json_extract(value, '$.vote') != 'pending' AND json_extract(value, '$.userId') != NEW.actor_id)));
  SELECT RAISE(ABORT, 'FINAL_ACCEPTANCE_INVALID') WHERE EXISTS (
    SELECT 1 FROM json_each(NEW.state, '$.loops') n JOIN json_each(OLD.state, '$.loops') o ON json_extract(o.value, '$.id') = json_extract(n.value, '$.id')
    WHERE json_extract(n.value, '$.state') = 'CONFIRMED' AND json_extract(o.value, '$.state') = 'PENDING' AND (
      unixepoch('now') >= json_extract(n.value, '$.deadline')
      OR EXISTS (SELECT 1 FROM json_each(n.value, '$.participants') p WHERE json_extract(p.value, '$.vote') IS NOT 'accepted'
        OR NOT EXISTS (SELECT 1 FROM json_each(OLD.state, '$.members') m WHERE json_extract(m.value, '$.id') = json_extract(p.value, '$.userId') AND json_extract(m.value, '$.status') = 'active' AND json_extract(m.value, '$.version') = json_extract(p.value, '$.memberVersion') AND json_extract(m.value, '$.preferenceVersion') = json_extract(p.value, '$.preferenceVersion'))
        OR NOT EXISTS (SELECT 1 FROM json_each(OLD.state, '$.listings') i WHERE json_extract(i.value, '$.id') = json_extract(p.value, '$.offeredId') AND json_extract(i.value, '$.ownerId') = json_extract(p.value, '$.userId') AND json_extract(i.value, '$.version') = json_extract(p.value, '$.listingVersion') AND json_extract(i.value, '$.status') = 'active')
        OR EXISTS (SELECT 1 FROM participant_holds h WHERE h.community_id = NEW.id AND h.user_id = json_extract(p.value, '$.userId'))
        OR EXISTS (SELECT 1 FROM item_holds h WHERE h.community_id = NEW.id AND h.listing_id = json_extract(p.value, '$.offeredId')))
      OR EXISTS (SELECT 1 FROM json_each(OLD.state, '$.blocks') b WHERE EXISTS (SELECT 1 FROM json_each(n.value, '$.participants') p WHERE json_extract(p.value, '$.userId') = json_extract(b.value, '$.blockerId')) AND EXISTS (SELECT 1 FROM json_each(n.value, '$.participants') p WHERE json_extract(p.value, '$.userId') = json_extract(b.value, '$.blockedId')))));
  SELECT RAISE(ABORT, 'MEETUP_INVALID') WHERE EXISTS (
    SELECT 1 FROM json_each(NEW.state, '$.loops') l WHERE (NOT EXISTS (SELECT 1 FROM json_each(OLD.state, '$.loops') o WHERE json_extract(o.value, '$.id') = json_extract(l.value, '$.id')) OR (json_extract(l.value, '$.state') = 'CONFIRMED' AND EXISTS (SELECT 1 FROM json_each(OLD.state, '$.loops') o WHERE json_extract(o.value, '$.id') = json_extract(l.value, '$.id') AND json_extract(o.value, '$.state') = 'PENDING'))) AND (
      NOT EXISTS (SELECT 1 FROM json_each(OLD.state, '$.venues') v JOIN json_each(v.value, '$.windows') w WHERE json_extract(v.value, '$.id') = json_extract(l.value, '$.venueId') AND json_extract(v.value, '$.active') = 1 AND json_extract(w.value, '$.start') <= json_extract(l.value, '$.start') AND json_extract(w.value, '$.end') >= json_extract(l.value, '$.end'))
      OR EXISTS (SELECT 1 FROM json_each(l.value, '$.participants') p WHERE NOT EXISTS (
        SELECT 1 FROM json_each(OLD.state, '$.members') m JOIN json_each(m.value, '$.availability') w WHERE json_extract(m.value, '$.id') = json_extract(p.value, '$.userId') AND json_extract(w.value, '$.start') <= json_extract(l.value, '$.start') AND json_extract(w.value, '$.end') >= json_extract(l.value, '$.end') AND EXISTS (SELECT 1 FROM json_each(m.value, '$.venueIds') v WHERE v.value = json_extract(l.value, '$.venueId'))))));
  SELECT RAISE(ABORT, 'CANCEL_UNSAFE') WHERE EXISTS (
    SELECT 1 FROM json_each(OLD.state, '$.loops') o JOIN json_each(NEW.state, '$.loops') n ON json_extract(o.value, '$.id') = json_extract(n.value, '$.id') WHERE json_extract(o.value, '$.state') = 'CONFIRMED' AND json_extract(n.value, '$.state') = 'CANCELLED' AND (unixepoch('now') >= json_extract(o.value, '$.start') OR EXISTS (SELECT 1 FROM json_each(o.value, '$.transfers') WHERE json_type(value, '$.receipt') IS NOT NULL) OR EXISTS (SELECT 1 FROM json_each(OLD.state, '$.problems') WHERE json_extract(value, '$.loopId') = json_extract(o.value, '$.id'))));
  SELECT RAISE(ABORT, 'COMPLETION_INVALID') WHERE EXISTS (SELECT 1 FROM json_each(NEW.state, '$.loops') l WHERE json_extract(l.value, '$.state') = 'COMPLETED' AND (
    EXISTS (SELECT 1 FROM json_each(l.value, '$.transfers') WHERE json_type(value, '$.receipt') IS NOT 'object')
    OR EXISTS (SELECT 1 FROM json_each(NEW.state, '$.problems') WHERE json_extract(value, '$.loopId') = json_extract(l.value, '$.id') AND json_extract(value, '$.status') = 'open')
    OR EXISTS (SELECT 1 FROM json_each(l.value, '$.listingIds') i WHERE NOT EXISTS (SELECT 1 FROM json_each(NEW.state, '$.listings') x WHERE json_extract(x.value, '$.id') = i.value AND json_extract(x.value, '$.status') = 'exchanged'))));
  SELECT RAISE(ABORT, 'REVIEW_UNRESOLVED') WHERE EXISTS (
    SELECT 1 FROM json_each(OLD.state, '$.loops') o JOIN json_each(NEW.state, '$.loops') n ON json_extract(o.value, '$.id') = json_extract(n.value, '$.id') WHERE json_extract(o.value, '$.state') = 'NEEDS_REVIEW' AND json_extract(n.value, '$.state') IN ('COMPLETED','RESOLVED') AND (NOT EXISTS (SELECT 1 FROM json_each(OLD.state, '$.members') a WHERE json_extract(a.value, '$.id') = NEW.actor_id AND json_extract(a.value, '$.role') = 'moderator') OR EXISTS (SELECT 1 FROM json_each(n.value, '$.transfers') WHERE coalesce(json_extract(value, '$.outcome'), 'unresolved') NOT IN ('recipient', 'original_owner'))));
  SELECT RAISE(ABORT, 'AUDIT_IMMUTABLE') WHERE EXISTS (SELECT 1 FROM json_each(OLD.state, '$.events') o LEFT JOIN json_each(NEW.state, '$.events') n ON json_extract(o.value, '$.id') = json_extract(n.value, '$.id') WHERE n.value IS NULL OR o.value IS NOT n.value);
END;
--> statement-breakpoint
CREATE TRIGGER community_project AFTER UPDATE ON communities BEGIN
  DELETE FROM item_holds WHERE community_id = NEW.id AND NOT EXISTS (SELECT 1 FROM json_each(NEW.state, '$.loops') l JOIN json_each(l.value, '$.listingIds') i WHERE json_extract(l.value, '$.state') IN ('CONFIRMED','NEEDS_REVIEW') AND i.value = item_holds.listing_id AND json_extract(l.value, '$.id') = item_holds.loop_id);
  INSERT INTO item_holds SELECT NEW.id, i.value, json_extract(l.value, '$.id'), unixepoch('now') FROM json_each(NEW.state, '$.loops') l JOIN json_each(l.value, '$.listingIds') i WHERE json_extract(l.value, '$.state') IN ('CONFIRMED','NEEDS_REVIEW') AND NOT EXISTS (SELECT 1 FROM item_holds h WHERE h.community_id = NEW.id AND h.listing_id = i.value AND h.loop_id = json_extract(l.value, '$.id'));
  DELETE FROM participant_holds WHERE community_id = NEW.id AND NOT EXISTS (SELECT 1 FROM json_each(NEW.state, '$.loops') l JOIN json_each(l.value, '$.participants') p WHERE json_extract(l.value, '$.state') IN ('CONFIRMED','NEEDS_REVIEW') AND json_extract(p.value, '$.userId') = participant_holds.user_id AND json_extract(l.value, '$.id') = participant_holds.loop_id);
  INSERT INTO participant_holds SELECT NEW.id, json_extract(p.value, '$.userId'), json_extract(l.value, '$.id'), unixepoch('now') FROM json_each(NEW.state, '$.loops') l JOIN json_each(l.value, '$.participants') p WHERE json_extract(l.value, '$.state') IN ('CONFIRMED','NEEDS_REVIEW') AND NOT EXISTS (SELECT 1 FROM participant_holds h WHERE h.community_id = NEW.id AND h.user_id = json_extract(p.value, '$.userId') AND h.loop_id = json_extract(l.value, '$.id'));
  DELETE FROM active_proposals WHERE community_id = NEW.id AND NOT EXISTS (SELECT 1 FROM json_each(NEW.state, '$.loops') l WHERE json_extract(l.value, '$.state') IN ('PENDING','CONFIRMED','NEEDS_REVIEW') AND json_extract(l.value, '$.id') = active_proposals.loop_id);
  INSERT INTO active_proposals SELECT NEW.id, json_extract(l.value, '$.id'), json_extract(l.value, '$.key') FROM json_each(NEW.state, '$.loops') l WHERE json_extract(l.value, '$.state') IN ('PENDING','CONFIRMED','NEEDS_REVIEW') AND NOT EXISTS (SELECT 1 FROM active_proposals a WHERE a.community_id = NEW.id AND a.loop_id = json_extract(l.value, '$.id'));
  INSERT INTO loop_events SELECT json_extract(e.value, '$.id'), NEW.id, e.value, json_extract(e.value, '$.at') FROM json_each(NEW.state, '$.events') e WHERE NOT EXISTS (SELECT 1 FROM loop_events a WHERE a.id = json_extract(e.value, '$.id'));
  INSERT INTO notification_outbox SELECT json_extract(n.value, '$.id'), json_extract(n.value, '$.eventId'), json_extract(n.value, '$.recipientId'), n.value, 'delivered' FROM json_each(NEW.state, '$.notifications') n WHERE NOT EXISTS (SELECT 1 FROM notification_outbox o WHERE o.id = json_extract(n.value, '$.id'));
END;
--> statement-breakpoint
CREATE TRIGGER item_hold_retain BEFORE DELETE ON item_holds BEGIN
 SELECT RAISE(ABORT, 'HOLD_REQUIRED') WHERE EXISTS (SELECT 1 FROM communities c JOIN json_each(c.state, '$.loops') l JOIN json_each(l.value, '$.listingIds') i WHERE c.id = OLD.community_id AND json_extract(l.value, '$.id') = OLD.loop_id AND json_extract(l.value, '$.state') IN ('CONFIRMED','NEEDS_REVIEW') AND i.value = OLD.listing_id);
END;
--> statement-breakpoint
CREATE TRIGGER member_hold_retain BEFORE DELETE ON participant_holds BEGIN
 SELECT RAISE(ABORT, 'HOLD_REQUIRED') WHERE EXISTS (SELECT 1 FROM communities c JOIN json_each(c.state, '$.loops') l JOIN json_each(l.value, '$.participants') p WHERE c.id = OLD.community_id AND json_extract(l.value, '$.id') = OLD.loop_id AND json_extract(l.value, '$.state') IN ('CONFIRMED','NEEDS_REVIEW') AND json_extract(p.value, '$.userId') = OLD.user_id);
END;
--> statement-breakpoint
CREATE TRIGGER event_immutable BEFORE UPDATE ON loop_events BEGIN SELECT RAISE(ABORT, 'AUDIT_IMMUTABLE'); END;
