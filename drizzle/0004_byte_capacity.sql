-- Custom SQL migration file, put your code below! --
CREATE TRIGGER community_byte_capacity BEFORE UPDATE ON communities BEGIN
  SELECT RAISE(ABORT,'STATE_BYTE_CAPACITY') WHERE length(CAST(NEW.state AS BLOB))>1500000;
END;
--> statement-breakpoint
CREATE TRIGGER community_insert_capacity BEFORE INSERT ON communities BEGIN
  SELECT RAISE(ABORT,'STATE_BYTE_CAPACITY') WHERE length(CAST(NEW.state AS BLOB))>1500000;
  SELECT RAISE(ABORT,'INITIAL_LOOPS_NOT_EMPTY') WHERE json_type(NEW.state,'$.loops') IS NOT 'array' OR json_array_length(NEW.state,'$.loops') IS NOT 0;
END;
