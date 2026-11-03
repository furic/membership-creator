-- 永久會員: no expiry date. Rebuild the table so expiry_date can be NULL.
CREATE TABLE members_new (
  number INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  expiry_date TEXT,
  lifetime INTEGER NOT NULL DEFAULT 0,
  voided INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO members_new (number, name, issue_date, expiry_date, voided, created_at)
  SELECT number, name, issue_date, expiry_date, voided, created_at FROM members;
DROP TABLE members;
ALTER TABLE members_new RENAME TO members;
