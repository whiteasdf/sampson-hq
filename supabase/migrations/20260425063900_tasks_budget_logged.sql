-- Add budgeted and logged hours to tasks (synced from Accelo)
ALTER TABLE tasks ADD COLUMN budgeted_seconds int;
ALTER TABLE tasks ADD COLUMN logged_seconds   int;
