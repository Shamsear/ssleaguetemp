-- Create fantasy_slot_submissions table for per-slot submission tracking
-- This runs alongside the existing draft_submitted boolean for backward compatibility

CREATE TABLE IF NOT EXISTS fantasy_slot_submissions (
  id SERIAL PRIMARY KEY,
  team_id VARCHAR(255) NOT NULL,
  league_id VARCHAR(255) NOT NULL,
  slot_index INTEGER NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, league_id, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_fantasy_slot_submissions_team
  ON fantasy_slot_submissions(team_id, league_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_slot_submissions_league
  ON fantasy_slot_submissions(league_id, slot_index);
