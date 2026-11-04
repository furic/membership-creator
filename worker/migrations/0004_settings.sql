-- Shared settings. `next_number` is the lowest number the next issued member may get.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
