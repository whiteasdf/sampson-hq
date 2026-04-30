-- Phase 3: Cross-device timer persistence
CREATE TABLE running_timers (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id),
  task_accelo_id   int NOT NULL,
  started_at       timestamptz NOT NULL,
  accumulated_secs int DEFAULT 0,
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE running_timers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_timer" ON running_timers
  FOR ALL USING (user_id = auth.uid());
