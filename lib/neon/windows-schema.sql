-- Transfer Windows Schema

CREATE TABLE IF NOT EXISTS transfer_windows (
  id SERIAL PRIMARY KEY,
  season_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'release' or 'swap'
  status VARCHAR(50) DEFAULT 'closed', -- 'open' or 'closed'
  max_requests INTEGER DEFAULT 0,
  linked_window_id INTEGER REFERENCES transfer_windows(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfer_windows_season ON transfer_windows(season_id);
CREATE INDEX IF NOT EXISTS idx_transfer_windows_status ON transfer_windows(status);

-- Add window_id to release_requests
ALTER TABLE release_requests ADD COLUMN IF NOT EXISTS window_id INTEGER REFERENCES transfer_windows(id) ON DELETE CASCADE;

-- Add window_id to swap_requests
ALTER TABLE swap_requests ADD COLUMN IF NOT EXISTS window_id INTEGER REFERENCES transfer_windows(id) ON DELETE CASCADE;
