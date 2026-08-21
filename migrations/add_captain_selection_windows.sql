-- ============================================
-- Migration: Add Captain Selection Windows
-- Date: 2026-08-15
-- Description: Add fields to control when teams can set/change captain and vice-captain
-- ============================================

-- Add captain selection window fields to fantasy_leagues table
ALTER TABLE fantasy_leagues 
ADD COLUMN IF NOT EXISTS captain_window_status VARCHAR(20) DEFAULT 'closed',
ADD COLUMN IF NOT EXISTS captain_window_opens_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS captain_window_closes_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS current_round_id VARCHAR(100);

-- Add comments
COMMENT ON COLUMN fantasy_leagues.captain_window_status IS 'Status of captain selection window: closed, open, locked';
COMMENT ON COLUMN fantasy_leagues.captain_window_opens_at IS 'When teams can start selecting captain/VC';
COMMENT ON COLUMN fantasy_leagues.captain_window_closes_at IS 'Deadline for captain/VC selection';
COMMENT ON COLUMN fantasy_leagues.current_round_id IS 'Current active round for captain selection';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_fantasy_leagues_captain_window_status 
ON fantasy_leagues(captain_window_status);

CREATE INDEX IF NOT EXISTS idx_fantasy_leagues_current_round 
ON fantasy_leagues(current_round_id);

-- ============================================
-- Table: fantasy_captain_history
-- Description: Track all captain/VC changes for audit trail
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_captain_history (
  id SERIAL PRIMARY KEY,
  history_id VARCHAR(100) UNIQUE NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  round_id VARCHAR(100),
  captain_player_id VARCHAR(100),
  vice_captain_player_id VARCHAR(100),
  changed_by_user_id VARCHAR(100) NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  window_opens_at TIMESTAMP WITH TIME ZONE,
  window_closes_at TIMESTAMP WITH TIME ZONE,
  notes TEXT
);

-- Indexes for captain history
CREATE INDEX IF NOT EXISTS idx_captain_history_league 
ON fantasy_captain_history(league_id);

CREATE INDEX IF NOT EXISTS idx_captain_history_team 
ON fantasy_captain_history(team_id);

CREATE INDEX IF NOT EXISTS idx_captain_history_round 
ON fantasy_captain_history(round_id);

CREATE INDEX IF NOT EXISTS idx_captain_history_changed_at 
ON fantasy_captain_history(changed_at DESC);

-- Add comments
COMMENT ON TABLE fantasy_captain_history IS 'Audit trail of all captain and vice-captain changes';
COMMENT ON COLUMN fantasy_captain_history.history_id IS 'Unique identifier for this history entry';
COMMENT ON COLUMN fantasy_captain_history.changed_by_user_id IS 'User who made the change';
COMMENT ON COLUMN fantasy_captain_history.window_opens_at IS 'When the window opened (for reference)';
COMMENT ON COLUMN fantasy_captain_history.window_closes_at IS 'When the window closes (for reference)';
