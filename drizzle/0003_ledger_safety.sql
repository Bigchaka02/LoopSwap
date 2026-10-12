CREATE TRIGGER community_ledger_safety BEFORE UPDATE ON communities BEGIN
  SELECT RAISE(ABORT, 'LEDGER_ITEM_SET') WHERE EXISTS (
    SELECT 1 FROM json_each(NEW.state,'$.loops') l WHERE (SELECT count(DISTINCT value) FROM json_each(l.value,'$.listingIds')) IS NOT json_array_length(l.value,'$.participants') OR EXISTS (SELECT 1 FROM json_each(l.value,'$.listingIds') i WHERE NOT EXISTS (SELECT 1 FROM json_each(l.value,'$.participants') p WHERE json_extract(p.value,'$.offeredId')=i.value) OR NOT EXISTS (SELECT 1 FROM json_each(l.value,'$.transfers') t WHERE json_extract(t.value,'$.listingId')=i.value)));
  SELECT RAISE(ABORT, 'LOOP_TRANSITION_AUTH') WHERE EXISTS (
    SELECT 1 FROM json_each(OLD.state,'$.loops') o JOIN json_each(NEW.state,'$.loops') n ON json_extract(o.value,'$.id')=json_extract(n.value,'$.id') WHERE json_extract(o.value,'$.state') IS NOT json_extract(n.value,'$.state') AND NOT (
      (NEW.actor_id='system' AND NEW.operation='reconcile' AND json_extract(n.value,'$.state') IN ('EXPIRED','NEEDS_REVIEW'))
      OR EXISTS (SELECT 1 FROM json_each(o.value,'$.participants') p WHERE json_extract(p.value,'$.userId')=NEW.actor_id)
      OR EXISTS (SELECT 1 FROM json_each(OLD.state,'$.members') m WHERE json_extract(m.value,'$.id')=NEW.actor_id AND json_extract(m.value,'$.role')='moderator' AND json_extract(n.value,'$.state') IN ('STALE','NEEDS_REVIEW','COMPLETED','RESOLVED'))
      OR (json_extract(n.value,'$.state') IN ('STALE','EXPIRED','NEEDS_REVIEW') AND NEW.operation IN ('listing.save','listing.pause','listing.remove','preferences.save','member.block','member.delete','loop.vote','loop.propose','notification.read','profile.save','loop.receipt','loop.cancel','loop.problem','report.listing'))));
  SELECT RAISE(ABORT, 'ORPHAN_RESERVED_ITEM') WHERE EXISTS (SELECT 1 FROM json_each(NEW.state,'$.listings') i WHERE json_extract(i.value,'$.status')='reserved' AND NOT EXISTS (SELECT 1 FROM json_each(NEW.state,'$.loops') l JOIN json_each(l.value,'$.listingIds') li WHERE json_extract(l.value,'$.state') IN ('CONFIRMED','NEEDS_REVIEW') AND li.value=json_extract(i.value,'$.id')));
  SELECT RAISE(ABORT, 'COMBINED_CANCEL_RECEIPT') WHERE NEW.operation IS NOT 'loop.receipt' AND EXISTS (
    SELECT 1 FROM json_each(OLD.state,'$.loops') o JOIN json_each(NEW.state,'$.loops') n ON json_extract(o.value,'$.id')=json_extract(n.value,'$.id') JOIN json_each(o.value,'$.transfers') ot JOIN json_each(n.value,'$.transfers') nt ON json_extract(ot.value,'$.id')=json_extract(nt.value,'$.id') WHERE json_type(ot.value,'$.receipt') IS NULL AND json_type(nt.value,'$.receipt') IS NOT NULL);
  SELECT RAISE(ABORT, 'EXPIRY_CLOCK') WHERE EXISTS (
    SELECT 1 FROM json_each(OLD.state,'$.loops') o JOIN json_each(NEW.state,'$.loops') n ON json_extract(o.value,'$.id')=json_extract(n.value,'$.id') WHERE json_extract(o.value,'$.state')='PENDING' AND json_extract(n.value,'$.state')='EXPIRED' AND unixepoch()<json_extract(o.value,'$.deadline'));
  SELECT RAISE(ABORT, 'RECONCILE_CLOCK') WHERE NEW.actor_id='system' AND EXISTS (
    SELECT 1 FROM json_each(OLD.state,'$.loops') o JOIN json_each(NEW.state,'$.loops') n ON json_extract(o.value,'$.id')=json_extract(n.value,'$.id') WHERE json_extract(o.value,'$.state')='CONFIRMED' AND json_extract(n.value,'$.state')='NEEDS_REVIEW' AND unixepoch()<json_extract(o.value,'$.end')+7200);
END;
