-- ============================================
-- Migration: Create Fantasy Captain Windows Table
-- Date: 2026-08-15
-- Description: Separate table to track captain selection windows per round (not in fantasy_leagues)
-- ============================================

-- Remove fields from fantasy_leagues if they were added (cleanup from previous attempt)
ALTER TABLE fantasy_leagues 
DROP COLUMN IF EXISTS captain_window_status,
DROP COLUMN IF EXISTS captain_window_opens_at,
DROP COLUMN IF EXISTS captain_window_closes_at,
DROP COLUMN IF EXISTS current_round_id;

-- ============================================
-- Table: fantasy_captain_windows
-- Description: Track captain selection windows per round
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_captain_windows (
  id SERIAL PRIMARY KEY,
  window_id VARCHAR(100) UNIQUE NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  round_id VARCHAR(100) NOT NULL,
  round_number INTEGER,
  round_name VARCHAR(255),
  window_status VARCHAR(20) DEFAULT 'pending',
  -- Status: pending (not started), open (active), closed (ended), locked (finalized)
  
  opens_at TIMESTAMP WITH TIME ZONE NOT NULL,
  closes_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  created_by_user_id VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Stats
  total_teams INTEGER DEFAULT 0,
  teams_with_captain_set INTEGER DEFAULT 0,
  
  notes TEXT,
  
  -- Ensure one window per round per league
  UNIQUE(league_id, round_id)
);

-- Indexes for fantasy_captain_windows
CREATE INDEX IF NOT EXISTS idx_captain_windows_league 
ON fantasy_captain_windows(league_id);

CREATE INDEX IF NOT EXISTS idx_captain_windows_round 
ON fantasy_captain_windows(round_id);

CREATE INDEX IF NOT EXISTS idx_captain_windows_status 
ON fantasy_captain_windows(window_status);

CREATE INDEX IF NOT EXISTS idx_captain_windows_opens_at 
ON fantasy_captain_windows(opens_at);

CREATE INDEX IF NOT EXISTS idx_captain_windows_closes_at 
ON fantasy_captain_windows(closes_at);

-- Add comments
COMMENT ON TABLE fantasy_captain_windows IS 'Captain selection windows per round - admin creates one for each round';
COMMENT ON COLUMN fantasy_captain_windows.window_status IS 'pending: not started, open: teams can select, closed: time expired, locked: finalized';
COMMENT ON COLUMN fantasy_captain_windows.opens_at IS 'When teams can start selecting captain/VC';
COMMENT ON COLUMN fantasy_captain_windows.closes_at IS 'Deadline for captain/VC selection';
COMMENT ON COLUMN fantasy_captain_windows.teams_with_captain_set IS 'Count of teams that have set captain/VC for this window';

-- ============================================
-- Table: fantasy_captain_history
-- Description: Track all captain/VC changes for audit trail
-- (Keep this table as is - already created in previous migration)
-- ============================================

-- Recreate if not exists
CREATE TABLE IF NOT EXISTS fantasy_captain_history (
  id SERIAL PRIMARY KEY,
  history_id VARCHAR(100) UNIQUE NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  round_id VARCHAR(100),
  window_id VARCHAR(100),
  captain_player_id VARCHAR(100),
  vice_captain_player_id VARCHAR(100),
  changed_by_user_id VARCHAR(100) NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT
);

-- Indexes for captain history (if not exists)
CREATE INDEX IF NOT EXISTS idx_captain_history_league 
ON fantasy_captain_history(league_id);

CREATE INDEX IF NOT EXISTS idx_captain_history_team 
ON fantasy_captain_history(team_id);

CREATE INDEX IF NOT EXISTS idx_captain_history_round 
ON fantasy_captain_history(round_id);

CREATE INDEX IF NOT EXISTS idx_captain_history_window 
ON fantasy_captain_history(window_id);

CREATE INDEX IF NOT EXISTS idx_captain_history_changed_at 
ON fantasy_captain_history(changed_at DESC);
