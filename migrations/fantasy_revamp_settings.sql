-- 1. Add category settings column to fantasy_leagues to store slot configs and custom player lists
ALTER TABLE fantasy_leagues 
ADD COLUMN IF NOT EXISTS category_settings JSONB DEFAULT '{
  "slots": [
    {"slot_index": 1, "name": "Red Slot 1", "list_id": "red_list_1", "base_price": 20},
    {"slot_index": 2, "name": "Red Slot 2", "list_id": "red_list_2", "base_price": 15},
    {"slot_index": 3, "name": "Blue Slot", "list_id": "blue_list", "base_price": 10},
    {"slot_index": 4, "name": "Black Slot", "list_id": "black_list", "base_price": 5},
    {"slot_index": 5, "name": "White Slot", "list_id": "white_list", "base_price": 3},
    {"slot_index": 6, "name": "Real Team Slot", "list_id": "real_team_list", "base_price": 25}
  ],
  "lists": {
    "red_list_1": [],
    "red_list_2": [],
    "blue_list": [],
    "black_list": [],
    "white_list": [],
    "real_team_list": []
  }
}'::jsonb;

-- 2. Alter default budget_per_team to 500
ALTER TABLE fantasy_leagues ALTER COLUMN budget_per_team SET DEFAULT 500;

-- 3. Create the fantasy_draft_bids table with slot_index and priority
CREATE TABLE IF NOT EXISTS fantasy_draft_bids (
  id SERIAL PRIMARY KEY,
  bid_id VARCHAR(100) UNIQUE NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  slot_index INTEGER NOT NULL, -- 1 to 6 (5 player slots + 1 team slot)
  priority INTEGER DEFAULT 1, -- 1 = primary, 2 = secondary fallback, etc.
  target_id VARCHAR(100) NOT NULL, -- player_id or real_team_id
  bid_type VARCHAR(20) NOT NULL, -- 'player' or 'real_team'
  bid_amount NUMERIC NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'won', 'lost'
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  UNIQUE(league_id, team_id, target_id, bid_type)
);

CREATE INDEX IF NOT EXISTS idx_draft_bids_league_team ON fantasy_draft_bids(league_id, team_id);
CREATE INDEX IF NOT EXISTS idx_draft_bids_target ON fantasy_draft_bids(target_id, bid_type);
