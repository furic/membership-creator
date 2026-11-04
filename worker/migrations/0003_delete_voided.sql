-- 作廢 is replaced by permanent deletion: remove members that were voided, then the column.
DELETE FROM members WHERE voided = 1;
ALTER TABLE members DROP COLUMN voided;
