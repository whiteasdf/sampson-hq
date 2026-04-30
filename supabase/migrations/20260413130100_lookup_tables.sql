-- =============================================================================
-- Migration 1: Lookup Tables
-- Small, static reference data — public read, mirrors Accelo IDs exactly.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- task_statuses
-- IDs mirror Accelo exactly — do NOT change these values.
-- ---------------------------------------------------------------------------
CREATE TABLE task_statuses (
  id        int  PRIMARY KEY,
  title     text NOT NULL,
  standing  text NOT NULL,
  ordering  int  NOT NULL
);

INSERT INTO task_statuses VALUES
  (2, 'Pending',  'pending',  0),
  (3, 'Accepted', 'accepted', 1),
  (4, 'Started',  'started',  2),
  (5, 'Complete', 'complete', 3),
  (6, 'Inactive', 'inactive', 5),
  (7, 'Paused',   'paused',   4);

-- ---------------------------------------------------------------------------
-- rates
-- Only the 4 active billing rates from Accelo.
-- ---------------------------------------------------------------------------
CREATE TABLE rates (
  id       int  PRIMARY KEY,
  title    text NOT NULL,
  standing text NOT NULL DEFAULT 'active'
);

INSERT INTO rates VALUES
  (18, 'Sr. Profit and Growth Accountants', 'active'),
  (19, 'Jr. Profit and Growth Accountant',  'active'),
  (22, 'Executive Leadership',               'active'),
  (24, 'Admin',                              'active');

-- ---------------------------------------------------------------------------
-- Grants — public read for both lookup tables
-- ---------------------------------------------------------------------------
GRANT SELECT ON task_statuses TO anon, authenticated;
GRANT SELECT ON rates          TO anon, authenticated;
