-- =====================================================
-- Main Database Schema: Seasons & Teams
-- Migrated from Firebase Firestore to Neon PostgreSQL
-- =====================================================

-- Seasons Table
CREATE TABLE IF NOT EXISTS seasons (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    year VARCHAR(50),
    season_number INTEGER,
    type VARCHAR(50) DEFAULT 'single',
    is_active BOOLEAN DEFAULT false,
    status VARCHAR(50) DEFAULT 'draft',
    registration_open BOOLEAN DEFAULT false,
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    total_teams INTEGER DEFAULT 0,
    total_rounds INTEGER DEFAULT 0,
    purse_amount NUMERIC DEFAULT 0,
    max_players_per_team INTEGER DEFAULT 11,
    -- Multi-season fields
    dollar_budget NUMERIC,
    euro_budget NUMERIC,
    required_real_players INTEGER,
    max_football_players INTEGER,
    category_fine_amount NUMERIC,
    -- Raw JSON for any extra fields Firebase might have
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for seasons
CREATE INDEX IF NOT EXISTS idx_seasons_is_active ON seasons(is_active);
CREATE INDEX IF NOT EXISTS idx_seasons_status ON seasons(status);
CREATE INDEX IF NOT EXISTS idx_seasons_season_number ON seasons(season_number);

-- Teams Table
CREATE TABLE IF NOT EXISTS teams (
    id VARCHAR(255) PRIMARY KEY,
    team_id VARCHAR(255),
    team_name VARCHAR(255) NOT NULL,
    team_code VARCHAR(50),
    owner_uid VARCHAR(255),
    owner_name VARCHAR(255),
    owner_email VARCHAR(255),
    username VARCHAR(255),
    balance NUMERIC DEFAULT 0,
    initial_balance NUMERIC DEFAULT 0,
    total_spent NUMERIC DEFAULT 0,
    currency_system VARCHAR(50) DEFAULT 'single',
    season_id VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    logo_url TEXT,
    team_color VARCHAR(50),
    players_count INTEGER DEFAULT 0,
    -- Stats as JSONB
    stats JSONB DEFAULT '{}',
    -- Player lists as JSONB
    real_players JSONB DEFAULT '[]',
    football_players JSONB DEFAULT '[]',
    -- Budget breakdown
    football_budget NUMERIC,
    football_spent NUMERIC DEFAULT 0,
    real_player_budget NUMERIC,
    real_player_spent NUMERIC DEFAULT 0,
    -- Raw JSON for any extra fields
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for teams
CREATE INDEX IF NOT EXISTS idx_teams_team_id ON teams(team_id);
CREATE INDEX IF NOT EXISTS idx_teams_team_code ON teams(team_code);
CREATE INDEX IF NOT EXISTS idx_teams_owner_uid ON teams(owner_uid);
CREATE INDEX IF NOT EXISTS idx_teams_season_id ON teams(season_id);
CREATE INDEX IF NOT EXISTS idx_teams_is_active ON teams(is_active);

-- Team Seasons Table (most complex - 187 Firebase refs)
CREATE TABLE IF NOT EXISTS team_seasons (
    id VARCHAR(255) PRIMARY KEY,
    team_id VARCHAR(255) NOT NULL,
    team_name VARCHAR(255),
    team_code VARCHAR(50),
    season_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    username VARCHAR(255),
    team_email VARCHAR(255),
    status VARCHAR(50) DEFAULT 'registered',
    budget NUMERIC DEFAULT 0,
    initial_budget NUMERIC DEFAULT 0,
    football_budget NUMERIC,
    football_spent NUMERIC DEFAULT 0,
    real_player_budget NUMERIC,
    real_player_spent NUMERIC DEFAULT 0,
    currency_system VARCHAR(50) DEFAULT 'single',
    players_count INTEGER DEFAULT 0,
    football_players_count INTEGER DEFAULT 0,
    -- Stats as JSONB (matches_played, wins, draws, losses, goals, etc.)
    stats JSONB DEFAULT '{}',
    -- Player lists as JSONB arrays
    real_players JSONB DEFAULT '[]',
    football_players JSONB DEFAULT '[]',
    logo_url TEXT,
    team_color VARCHAR(50),
    -- Extra fields
    dollar_balance NUMERIC,
    euro_balance NUMERIC,
    -- Raw JSON for any extra fields
    raw_data JSONB,
    joined_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for team_seasons
CREATE INDEX IF NOT EXISTS idx_team_seasons_team_id ON team_seasons(team_id);
CREATE INDEX IF NOT EXISTS idx_team_seasons_season_id ON team_seasons(season_id);
CREATE INDEX IF NOT EXISTS idx_team_seasons_user_id ON team_seasons(user_id);
CREATE INDEX IF NOT EXISTS idx_team_seasons_status ON team_seasons(status);
CREATE INDEX IF NOT EXISTS idx_team_seasons_composite ON team_seasons(team_id, season_id);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_seasons_updated_at BEFORE UPDATE
    ON seasons FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE
    ON teams FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_team_seasons_updated_at BEFORE UPDATE
    ON team_seasons FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
