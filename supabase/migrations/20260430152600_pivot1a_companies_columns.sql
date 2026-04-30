-- =============================================================================
-- Pivot 1A (addendum): Companies table columns for outbound sync
-- Adds synced_to_accelo_at tracking and default_job_accelo_id for task push.
--
-- Linear: GAR-948, GAR-984
-- =============================================================================

-- Track when company data was last pushed to Accelo (manual sync via button)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS synced_to_accelo_at timestamptz;

-- Backfill: existing companies came from Accelo, mark them as synced
UPDATE companies SET synced_to_accelo_at = synced_at WHERE synced_to_accelo_at IS NULL;

-- Default catch-all Job in Accelo for each company.
-- Required by push-tasks cron: Accelo tasks must be created under a Job
-- (against_type='job', against_id=job_id). Populated by sync-companies cron
-- or manually by managers.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS default_job_accelo_id int;
