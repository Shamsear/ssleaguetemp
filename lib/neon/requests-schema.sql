-- Swap and Release Request System Tables

-- 1. Release Requests
CREATE TABLE IF NOT EXISTS release_requests (
  id SERIAL PRIMARY KEY,
  team_id VARCHAR(255) NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  player_id VARCHAR(255) NOT NULL,
  player_name VARCHAR(255) NOT NULL,
  player_type VARCHAR(50) NOT NULL, -- 'real' or 'football'
  refund_amount NUMERIC NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected, cancelled
  rejection_reason TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by VARCHAR(255)
);

-- Index for querying team's pending requests
CREATE INDEX IF NOT EXISTS idx_release_requests_team_status ON release_requests(team_id, status);

-- 2. Swap Requests
CREATE TABLE IF NOT EXISTS swap_requests (
  id SERIAL PRIMARY KEY,
  season_id VARCHAR(255) NOT NULL,
  requesting_team_id VARCHAR(255) NOT NULL,
  target_team_id VARCHAR(255) NOT NULL,
  cash_amount NUMERIC DEFAULT 0,
  cash_direction VARCHAR(20) DEFAULT 'none', -- 'A_to_B', 'B_to_A', 'none'
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected, cancelled
  rejection_reason TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by VARCHAR(255)
);

-- Indexes for querying team's swap requests
CREATE INDEX IF NOT EXISTS idx_swap_requests_requesting_team ON swap_requests(requesting_team_id, status);
CREATE INDEX IF NOT EXISTS idx_swap_requests_target_team ON swap_requests(target_team_id, status);

-- 3. Swap Request Players
CREATE TABLE IF NOT EXISTS swap_request_players (
  id SERIAL PRIMARY KEY,
  swap_request_id INTEGER REFERENCES swap_requests(id) ON DELETE CASCADE,
  from_team_id VARCHAR(255) NOT NULL,
  to_team_id VARCHAR(255) NOT NULL,
  player_id VARCHAR(255) NOT NULL,
  player_name VARCHAR(255) NOT NULL,
  player_type VARCHAR(50) NOT NULL
);
