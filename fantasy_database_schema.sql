-- ============================================
-- Database Schema Export: fantasy_database
-- Generated: 2026-04-27T08:32:45.462Z
-- ============================================

-- IMPORTANT NOTES:
-- 1. SERIAL and BIGSERIAL types automatically create sequences
-- 2. Foreign key constraints are added AFTER all tables are created
-- 3. Indexes use IF NOT EXISTS to prevent duplicate errors
-- 4. This file can be safely re-run on an existing database

-- ============================================
-- Table: bonus_points
-- ============================================

CREATE TABLE IF NOT EXISTS bonus_points (
  id SERIAL NOT NULL,
  target_type VARCHAR(10) NOT NULL,
  target_id VARCHAR(255) NOT NULL,
  points INTEGER NOT NULL,
  reason VARCHAR(500) NOT NULL,
  league_id VARCHAR(255) NOT NULL,
  awarded_by VARCHAR(255) NOT NULL,
  awarded_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_bonus_points_awarded_at ON public.bonus_points USING btree (awarded_at DESC);

CREATE INDEX IF NOT EXISTS idx_bonus_points_league ON public.bonus_points USING btree (league_id);

CREATE INDEX IF NOT EXISTS idx_bonus_points_target ON public.bonus_points USING btree (target_type, target_id);


-- ============================================
-- Table: fantasy_achievements
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_achievements (
  id SERIAL NOT NULL,
  achievement_id VARCHAR(100) NOT NULL,
  achievement_name VARCHAR(200) NOT NULL,
  achievement_description TEXT,
  achievement_category VARCHAR(50) NOT NULL,
  requirements JSONB DEFAULT '{}'::jsonb NOT NULL,
  badge_icon VARCHAR(50),
  badge_color VARCHAR(50),
  points_reward INTEGER DEFAULT 0,
  rarity VARCHAR(20) DEFAULT 'common'::character varying,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (achievement_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_achievements_achievement_id_key ON public.fantasy_achievements USING btree (achievement_id);

CREATE INDEX IF NOT EXISTS idx_achievements_active ON public.fantasy_achievements USING btree (is_active);

CREATE INDEX IF NOT EXISTS idx_achievements_category ON public.fantasy_achievements USING btree (achievement_category);

CREATE INDEX IF NOT EXISTS idx_achievements_rarity ON public.fantasy_achievements USING btree (rarity);


-- ============================================
-- Table: fantasy_challenge_completions
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_challenge_completions (
  id SERIAL NOT NULL,
  completion_id VARCHAR(100) NOT NULL,
  challenge_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  completed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  bonus_points_awarded INTEGER DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (completion_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_challenge_completions_completion_id_key ON public.fantasy_challenge_completions USING btree (completion_id);

CREATE INDEX IF NOT EXISTS idx_challenge_completions_challenge ON public.fantasy_challenge_completions USING btree (challenge_id);

CREATE INDEX IF NOT EXISTS idx_challenge_completions_completed ON public.fantasy_challenge_completions USING btree (completed_at);

CREATE INDEX IF NOT EXISTS idx_challenge_completions_team ON public.fantasy_challenge_completions USING btree (team_id);


-- ============================================
-- Table: fantasy_challenges
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_challenges (
  id SERIAL NOT NULL,
  challenge_id VARCHAR(100) NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  round_id VARCHAR(100),
  challenge_name VARCHAR(200) NOT NULL,
  challenge_description TEXT,
  challenge_type VARCHAR(50) NOT NULL,
  requirements JSONB DEFAULT '{}'::jsonb NOT NULL,
  bonus_points INTEGER DEFAULT 0,
  badge_name VARCHAR(100),
  start_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  end_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (challenge_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_challenges_challenge_id_key ON public.fantasy_challenges USING btree (challenge_id);

CREATE INDEX IF NOT EXISTS idx_challenges_active ON public.fantasy_challenges USING btree (is_active);

CREATE INDEX IF NOT EXISTS idx_challenges_dates ON public.fantasy_challenges USING btree (start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_challenges_league ON public.fantasy_challenges USING btree (league_id);

CREATE INDEX IF NOT EXISTS idx_challenges_round ON public.fantasy_challenges USING btree (round_id);


-- ============================================
-- Table: fantasy_chat_messages
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_chat_messages (
  id SERIAL NOT NULL,
  message_id VARCHAR(100) NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  message_text TEXT NOT NULL,
  reactions JSONB DEFAULT '{}'::jsonb,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (message_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_chat_messages_message_id_key ON public.fantasy_chat_messages USING btree (message_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON public.fantasy_chat_messages USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_deleted ON public.fantasy_chat_messages USING btree (is_deleted);

CREATE INDEX IF NOT EXISTS idx_chat_messages_league ON public.fantasy_chat_messages USING btree (league_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_team ON public.fantasy_chat_messages USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON public.fantasy_chat_messages USING btree (user_id);


-- ============================================
-- Table: fantasy_draft_tiers
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_draft_tiers (
  id SERIAL NOT NULL,
  tier_id VARCHAR(100) NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  draft_type VARCHAR(20) NOT NULL,
  tier_number INTEGER NOT NULL,
  tier_name VARCHAR(100),
  player_ids JSONB NOT NULL,
  player_count INTEGER NOT NULL,
  min_points INTEGER,
  max_points INTEGER,
  avg_points NUMERIC,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  tier_status VARCHAR(20) DEFAULT 'pending'::character varying,
  opened_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (id),
  UNIQUE (draft_type, league_id, tier_number),
  UNIQUE (tier_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_draft_tiers_league_id_draft_type_tier_number_key ON public.fantasy_draft_tiers USING btree (league_id, draft_type, tier_number);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_draft_tiers_tier_id_key ON public.fantasy_draft_tiers USING btree (tier_id);

CREATE INDEX IF NOT EXISTS idx_draft_tiers_league ON public.fantasy_draft_tiers USING btree (league_id);

CREATE INDEX IF NOT EXISTS idx_draft_tiers_league_type ON public.fantasy_draft_tiers USING btree (league_id, draft_type);

CREATE INDEX IF NOT EXISTS idx_draft_tiers_tier_number ON public.fantasy_draft_tiers USING btree (tier_number);

CREATE INDEX IF NOT EXISTS idx_draft_tiers_type ON public.fantasy_draft_tiers USING btree (draft_type);

CREATE INDEX IF NOT EXISTS idx_fantasy_draft_tiers_status ON public.fantasy_draft_tiers USING btree (league_id, tier_status);


-- ============================================
-- Table: fantasy_drafts
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_drafts (
  id SERIAL NOT NULL,
  draft_id VARCHAR(100) NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  real_player_id VARCHAR(100) NOT NULL,
  player_name VARCHAR(255) NOT NULL,
  position VARCHAR(50),
  real_team_name VARCHAR(255),
  draft_price NUMERIC NOT NULL,
  draft_order INTEGER,
  drafted_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (draft_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_drafts_draft_id_key ON public.fantasy_drafts USING btree (draft_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_drafts_team ON public.fantasy_drafts USING btree (team_id);


-- ============================================
-- Table: fantasy_h2h_fixtures
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_h2h_fixtures (
  id SERIAL NOT NULL,
  fixture_id VARCHAR(100) NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  round_id VARCHAR(100) NOT NULL,
  team_a_id VARCHAR(100) NOT NULL,
  team_b_id VARCHAR(100) NOT NULL,
  team_a_points NUMERIC DEFAULT 0,
  team_b_points NUMERIC DEFAULT 0,
  winner_id VARCHAR(100),
  is_draw BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'scheduled'::character varying,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (fixture_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_h2h_fixtures_fixture_id_key ON public.fantasy_h2h_fixtures USING btree (fixture_id);

CREATE INDEX IF NOT EXISTS idx_h2h_fixtures_league ON public.fantasy_h2h_fixtures USING btree (league_id);

CREATE INDEX IF NOT EXISTS idx_h2h_fixtures_round ON public.fantasy_h2h_fixtures USING btree (round_id);

CREATE INDEX IF NOT EXISTS idx_h2h_fixtures_status ON public.fantasy_h2h_fixtures USING btree (status);

CREATE INDEX IF NOT EXISTS idx_h2h_fixtures_team_a ON public.fantasy_h2h_fixtures USING btree (team_a_id);

CREATE INDEX IF NOT EXISTS idx_h2h_fixtures_team_b ON public.fantasy_h2h_fixtures USING btree (team_b_id);


-- ============================================
-- Table: fantasy_h2h_standings
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_h2h_standings (
  id SERIAL NOT NULL,
  standing_id VARCHAR(100) NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  matches_played INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  points_for NUMERIC DEFAULT 0,
  points_against NUMERIC DEFAULT 0,
  points_difference NUMERIC DEFAULT 0,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (league_id, team_id),
  UNIQUE (standing_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_h2h_standings_league_id_team_id_key ON public.fantasy_h2h_standings USING btree (league_id, team_id);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_h2h_standings_standing_id_key ON public.fantasy_h2h_standings USING btree (standing_id);

CREATE INDEX IF NOT EXISTS idx_h2h_standings_league ON public.fantasy_h2h_standings USING btree (league_id);

CREATE INDEX IF NOT EXISTS idx_h2h_standings_points ON public.fantasy_h2h_standings USING btree (league_id, points DESC);

CREATE INDEX IF NOT EXISTS idx_h2h_standings_team ON public.fantasy_h2h_standings USING btree (team_id);


-- ============================================
-- Table: fantasy_leaderboard
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_leaderboard (
  id SERIAL NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  team_name VARCHAR(255) NOT NULL,
  owner_name VARCHAR(255),
  total_points INTEGER DEFAULT 0,
  rank INTEGER NOT NULL,
  last_updated TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (league_id, team_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_leaderboard_league_id_team_id_key ON public.fantasy_leaderboard USING btree (league_id, team_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_leaderboard_league ON public.fantasy_leaderboard USING btree (league_id);


-- ============================================
-- Table: fantasy_leagues
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_leagues (
  id SERIAL NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  season_id VARCHAR(100) NOT NULL,
  season_name VARCHAR(255) NOT NULL,
  league_name VARCHAR(255) NOT NULL,
  budget_per_team NUMERIC DEFAULT 100.00,
  max_squad_size INTEGER DEFAULT 15,
  max_transfers_per_window INTEGER DEFAULT 2,
  points_cost_per_transfer INTEGER DEFAULT 4,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  star_rating_prices JSONB DEFAULT '[{"price": 5, "stars": 1}, {"price": 10, "stars": 2}, {"price": 15, "stars": 3}, {"price": 20, "stars": 4}, {"price": 25, "stars": 5}]'::jsonb,
  draft_status VARCHAR(20) DEFAULT 'pending'::character varying,
  draft_opens_at TIMESTAMP WITH TIME ZONE,
  draft_closes_at TIMESTAMP WITH TIME ZONE,
  min_squad_size INTEGER DEFAULT 11,
  lineup_lock_hours_before INTEGER DEFAULT 24,
  is_lineup_locked BOOLEAN DEFAULT false,
  starting_lineup_size INTEGER DEFAULT 5,
  number_of_tiers INTEGER DEFAULT 7,
  lineup_lock_enabled BOOLEAN DEFAULT true,
  current_active_tier INTEGER,
  PRIMARY KEY (id),
  UNIQUE (league_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_leagues_league_id_key ON public.fantasy_leagues USING btree (league_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_leagues_draft_status ON public.fantasy_leagues USING btree (draft_status);


-- ============================================
-- Table: fantasy_player_points
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_player_points (
  id SERIAL NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  real_player_id VARCHAR(100) NOT NULL,
  player_name VARCHAR(255) NOT NULL,
  fixture_id VARCHAR(100),
  round_number INTEGER,
  goals_scored INTEGER DEFAULT 0,
  goals_conceded INTEGER DEFAULT 0,
  clean_sheet BOOLEAN DEFAULT false,
  motm BOOLEAN DEFAULT false,
  base_points INTEGER DEFAULT 0,
  bonus_points INTEGER DEFAULT 0,
  total_points INTEGER DEFAULT 0,
  is_captain BOOLEAN DEFAULT false,
  points_multiplier INTEGER DEFAULT 1,
  recorded_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  result VARCHAR(10),
  is_motm BOOLEAN DEFAULT false,
  fine_goals INTEGER DEFAULT 0,
  substitution_penalty INTEGER DEFAULT 0,
  is_clean_sheet BOOLEAN DEFAULT false,
  points_breakdown JSONB,
  calculated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  fantasy_round_id VARCHAR(100),
  is_vice_captain BOOLEAN DEFAULT false,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_fantasy_player_points_fantasy_round ON public.fantasy_player_points USING btree (fantasy_round_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_player_points_team ON public.fantasy_player_points USING btree (team_id);


-- ============================================
-- Table: fantasy_players
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_players (
  id SERIAL NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  real_player_id VARCHAR(100) NOT NULL,
  draft_price NUMERIC NOT NULL,
  times_drafted INTEGER DEFAULT 0,
  total_points INTEGER DEFAULT 0,
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  form_status VARCHAR(20) DEFAULT 'steady'::character varying,
  form_streak INTEGER DEFAULT 0,
  last_5_games_avg NUMERIC DEFAULT 0,
  form_multiplier NUMERIC DEFAULT 1.00,
  games_played INTEGER DEFAULT 0,
  ownership_percentage NUMERIC DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE (league_id, real_player_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_players_league_id_real_player_id_key ON public.fantasy_players USING btree (league_id, real_player_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_players_league ON public.fantasy_players USING btree (league_id);


-- ============================================
-- Table: fantasy_power_up_usage
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_power_up_usage (
  id SERIAL NOT NULL,
  usage_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  round_id VARCHAR(100) NOT NULL,
  power_up_type VARCHAR(50) NOT NULL,
  used_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (usage_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_power_up_usage_usage_id_key ON public.fantasy_power_up_usage USING btree (usage_id);

CREATE INDEX IF NOT EXISTS idx_power_up_usage_round ON public.fantasy_power_up_usage USING btree (round_id);

CREATE INDEX IF NOT EXISTS idx_power_up_usage_team ON public.fantasy_power_up_usage USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_power_up_usage_type ON public.fantasy_power_up_usage USING btree (power_up_type);


-- ============================================
-- Table: fantasy_power_ups
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_power_ups (
  id SERIAL NOT NULL,
  power_up_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  triple_captain_remaining INTEGER DEFAULT 1,
  bench_boost_remaining INTEGER DEFAULT 2,
  free_hit_remaining INTEGER DEFAULT 1,
  wildcard_remaining INTEGER DEFAULT 2,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (power_up_id),
  UNIQUE (league_id, team_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_power_ups_power_up_id_key ON public.fantasy_power_ups USING btree (power_up_id);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_power_ups_team_id_league_id_key ON public.fantasy_power_ups USING btree (team_id, league_id);

CREATE INDEX IF NOT EXISTS idx_power_ups_league ON public.fantasy_power_ups USING btree (league_id);

CREATE INDEX IF NOT EXISTS idx_power_ups_team ON public.fantasy_power_ups USING btree (team_id);


-- ============================================
-- Table: fantasy_predictions
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_predictions (
  id SERIAL NOT NULL,
  prediction_id VARCHAR(100) NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  round_id VARCHAR(100) NOT NULL,
  predictions JSONB DEFAULT '{}'::jsonb NOT NULL,
  bonus_points NUMERIC DEFAULT 0,
  correct_predictions INTEGER DEFAULT 0,
  total_predictions INTEGER DEFAULT 0,
  is_locked BOOLEAN DEFAULT false,
  locked_at TIMESTAMP WITHOUT TIME ZONE,
  calculated_at TIMESTAMP WITHOUT TIME ZONE,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (league_id, round_id, team_id),
  UNIQUE (prediction_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_predictions_league_id_team_id_round_id_key ON public.fantasy_predictions USING btree (league_id, team_id, round_id);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_predictions_prediction_id_key ON public.fantasy_predictions USING btree (prediction_id);

CREATE INDEX IF NOT EXISTS idx_predictions_league ON public.fantasy_predictions USING btree (league_id);

CREATE INDEX IF NOT EXISTS idx_predictions_locked ON public.fantasy_predictions USING btree (is_locked);

CREATE INDEX IF NOT EXISTS idx_predictions_round ON public.fantasy_predictions USING btree (round_id);

CREATE INDEX IF NOT EXISTS idx_predictions_team ON public.fantasy_predictions USING btree (team_id);


-- ============================================
-- Table: fantasy_rounds
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_rounds (
  id SERIAL NOT NULL,
  fantasy_round_id VARCHAR(100) NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  round_id VARCHAR(50) NOT NULL,
  round_number INTEGER NOT NULL,
  round_name VARCHAR(255),
  round_start_date TIMESTAMP WITHOUT TIME ZONE,
  round_end_date TIMESTAMP WITHOUT TIME ZONE,
  is_active BOOLEAN DEFAULT false,
  is_completed BOOLEAN DEFAULT false,
  points_calculated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (fantasy_round_id),
  UNIQUE (league_id, round_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_rounds_fantasy_round_id_key ON public.fantasy_rounds USING btree (fantasy_round_id);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_rounds_league_id_round_id_key ON public.fantasy_rounds USING btree (league_id, round_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_rounds_active ON public.fantasy_rounds USING btree (is_active);

CREATE INDEX IF NOT EXISTS idx_fantasy_rounds_league ON public.fantasy_rounds USING btree (league_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_rounds_round ON public.fantasy_rounds USING btree (round_id);


-- ============================================
-- Table: fantasy_scoring_rules
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_scoring_rules (
  id SERIAL NOT NULL,
  rule_id VARCHAR(100) NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  rule_type VARCHAR(100) NOT NULL,
  rule_name VARCHAR(255) NOT NULL,
  points_value INTEGER NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  applies_to VARCHAR(50) DEFAULT 'player'::character varying,
  PRIMARY KEY (id),
  UNIQUE (league_id, rule_name, rule_type),
  UNIQUE (rule_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_scoring_rules_league_rule_name_key ON public.fantasy_scoring_rules USING btree (league_id, rule_type, rule_name);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_scoring_rules_rule_id_key ON public.fantasy_scoring_rules USING btree (rule_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_scoring_rules_active ON public.fantasy_scoring_rules USING btree (league_id, is_active);

CREATE INDEX IF NOT EXISTS idx_fantasy_scoring_rules_league ON public.fantasy_scoring_rules USING btree (league_id);


-- ============================================
-- Table: fantasy_squad
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_squad (
  id SERIAL NOT NULL,
  squad_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  real_player_id VARCHAR(100) NOT NULL,
  player_name VARCHAR(255) NOT NULL,
  position VARCHAR(50),
  real_team_name VARCHAR(255),
  purchase_price NUMERIC NOT NULL,
  current_value NUMERIC NOT NULL,
  total_points INTEGER DEFAULT 0,
  is_captain BOOLEAN DEFAULT false,
  is_vice_captain BOOLEAN DEFAULT false,
  acquisition_type VARCHAR(50) DEFAULT 'draft'::character varying,
  acquired_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (squad_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_squad_squad_id_key ON public.fantasy_squad USING btree (squad_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_squad_team ON public.fantasy_squad USING btree (team_id);


-- ============================================
-- Table: fantasy_team_achievements
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_team_achievements (
  id SERIAL NOT NULL,
  team_achievement_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  achievement_id VARCHAR(100) NOT NULL,
  unlocked_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  progress JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (team_achievement_id),
  UNIQUE (achievement_id, team_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_team_achievements_team_achievement_id_key ON public.fantasy_team_achievements USING btree (team_achievement_id);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_team_achievements_team_id_achievement_id_key ON public.fantasy_team_achievements USING btree (team_id, achievement_id);

CREATE INDEX IF NOT EXISTS idx_team_achievements_achievement ON public.fantasy_team_achievements USING btree (achievement_id);

CREATE INDEX IF NOT EXISTS idx_team_achievements_team ON public.fantasy_team_achievements USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_team_achievements_unlocked ON public.fantasy_team_achievements USING btree (unlocked_at DESC);


-- ============================================
-- Table: fantasy_team_bonus_points
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_team_bonus_points (
  id SERIAL NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  real_team_id VARCHAR(100) NOT NULL,
  real_team_name VARCHAR(255),
  fixture_id VARCHAR(100) NOT NULL,
  round_number INTEGER NOT NULL,
  bonus_breakdown JSONB DEFAULT '{}'::jsonb,
  total_bonus INTEGER DEFAULT 0,
  calculated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (fixture_id, league_id, team_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_team_bonus_points_league_id_team_id_fixture_id_key ON public.fantasy_team_bonus_points USING btree (league_id, team_id, fixture_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_team_bonus_fixture ON public.fantasy_team_bonus_points USING btree (fixture_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_team_bonus_league ON public.fantasy_team_bonus_points USING btree (league_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_team_bonus_round ON public.fantasy_team_bonus_points USING btree (round_number);

CREATE INDEX IF NOT EXISTS idx_fantasy_team_bonus_team ON public.fantasy_team_bonus_points USING btree (team_id);


-- ============================================
-- Table: fantasy_teams
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_teams (
  id SERIAL NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  real_team_id VARCHAR(100),
  real_team_name VARCHAR(255),
  owner_uid VARCHAR(100) NOT NULL,
  owner_name VARCHAR(255),
  team_name VARCHAR(255) NOT NULL,
  total_points INTEGER DEFAULT 0,
  rank INTEGER,
  budget_remaining NUMERIC,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  supported_team_id VARCHAR(100),
  supported_team_name VARCHAR(255),
  passive_points INTEGER DEFAULT 0,
  draft_submitted BOOLEAN DEFAULT false,
  player_points INTEGER DEFAULT 0,
  auto_sub_enabled BOOLEAN DEFAULT true,
  bench_priority JSONB DEFAULT '[]'::jsonb,
  PRIMARY KEY (id),
  UNIQUE (team_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_teams_team_id_key ON public.fantasy_teams USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_teams_draft_submitted ON public.fantasy_teams USING btree (draft_submitted);

CREATE INDEX IF NOT EXISTS idx_fantasy_teams_league ON public.fantasy_teams USING btree (league_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_teams_owner ON public.fantasy_teams USING btree (owner_uid);

CREATE INDEX IF NOT EXISTS idx_fantasy_teams_supported_team ON public.fantasy_teams USING btree (supported_team_id);


-- ============================================
-- Table: fantasy_tier_bids
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_tier_bids (
  id SERIAL NOT NULL,
  bid_id VARCHAR(100) NOT NULL,
  tier_id VARCHAR(100) NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  player_id VARCHAR(100),
  bid_amount NUMERIC,
  is_skip BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'pending'::character varying,
  submitted_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  processed_at TIMESTAMP WITHOUT TIME ZONE,
  PRIMARY KEY (id),
  UNIQUE (bid_id),
  UNIQUE (team_id, tier_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_tier_bids_bid_id_key ON public.fantasy_tier_bids USING btree (bid_id);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_tier_bids_tier_id_team_id_key ON public.fantasy_tier_bids USING btree (tier_id, team_id);

CREATE INDEX IF NOT EXISTS idx_tier_bids_league ON public.fantasy_tier_bids USING btree (league_id);

CREATE INDEX IF NOT EXISTS idx_tier_bids_league_tier ON public.fantasy_tier_bids USING btree (league_id, tier_id);

CREATE INDEX IF NOT EXISTS idx_tier_bids_player ON public.fantasy_tier_bids USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_tier_bids_status ON public.fantasy_tier_bids USING btree (status);

CREATE INDEX IF NOT EXISTS idx_tier_bids_team ON public.fantasy_tier_bids USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_tier_bids_tier ON public.fantasy_tier_bids USING btree (tier_id);


-- ============================================
-- Table: fantasy_transfer_windows
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_transfer_windows (
  id SERIAL NOT NULL,
  window_id VARCHAR(100) NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  window_name VARCHAR(200),
  start_time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  end_time TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  opens_at TIMESTAMP WITHOUT TIME ZONE,
  closes_at TIMESTAMP WITHOUT TIME ZONE,
  status VARCHAR(20) DEFAULT 'scheduled'::character varying,
  is_active BOOLEAN DEFAULT false,
  window_type VARCHAR(20),
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (window_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_transfer_windows_window_id_key ON public.fantasy_transfer_windows USING btree (window_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_transfer_windows_active ON public.fantasy_transfer_windows USING btree (league_id, is_active) WHERE (is_active = true);

CREATE INDEX IF NOT EXISTS idx_fantasy_transfer_windows_league ON public.fantasy_transfer_windows USING btree (league_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_transfer_windows_timing ON public.fantasy_transfer_windows USING btree (league_id, opens_at, closes_at);


-- ============================================
-- Table: fantasy_transfers
-- ============================================

CREATE TABLE IF NOT EXISTS fantasy_transfers (
  id SERIAL NOT NULL,
  transfer_id VARCHAR(100) NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  window_id VARCHAR(100),
  player_out_id VARCHAR(100),
  player_out_name VARCHAR(255),
  player_in_id VARCHAR(100),
  player_in_name VARCHAR(255),
  transfer_cost INTEGER DEFAULT 0,
  points_deducted INTEGER DEFAULT 0,
  is_free_transfer BOOLEAN DEFAULT true,
  transferred_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE (transfer_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fantasy_transfers_transfer_id_key ON public.fantasy_transfers USING btree (transfer_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_transfers_team ON public.fantasy_transfers USING btree (team_id);


-- ============================================
-- Table: fixture_difficulty_ratings
-- ============================================

CREATE TABLE IF NOT EXISTS fixture_difficulty_ratings (
  id SERIAL NOT NULL,
  rating_id VARCHAR(100) NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  round_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  opponent_id VARCHAR(100) NOT NULL,
  difficulty_score INTEGER NOT NULL,
  opponent_rank INTEGER,
  opponent_form_avg NUMERIC,
  is_home BOOLEAN DEFAULT true,
  calculated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (league_id, round_id, team_id),
  UNIQUE (rating_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS fixture_difficulty_ratings_league_id_round_id_team_id_key ON public.fixture_difficulty_ratings USING btree (league_id, round_id, team_id);

CREATE UNIQUE INDEX IF NOT EXISTS fixture_difficulty_ratings_rating_id_key ON public.fixture_difficulty_ratings USING btree (rating_id);

CREATE INDEX IF NOT EXISTS idx_fixture_difficulty_league ON public.fixture_difficulty_ratings USING btree (league_id);

CREATE INDEX IF NOT EXISTS idx_fixture_difficulty_round ON public.fixture_difficulty_ratings USING btree (round_id);

CREATE INDEX IF NOT EXISTS idx_fixture_difficulty_team ON public.fixture_difficulty_ratings USING btree (team_id);


-- ============================================
-- Table: scoring_rules
-- ============================================

CREATE TABLE IF NOT EXISTS scoring_rules (
  rule_id SERIAL NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  rule_name VARCHAR(255) NOT NULL,
  rule_type VARCHAR(100) NOT NULL,
  description TEXT,
  points_value NUMERIC NOT NULL,
  applies_to VARCHAR(50) DEFAULT 'player'::character varying,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (rule_id)
);

CREATE INDEX IF NOT EXISTS idx_scoring_rules_active ON public.scoring_rules USING btree (league_id, is_active);

CREATE INDEX IF NOT EXISTS idx_scoring_rules_league ON public.scoring_rules USING btree (league_id);


-- ============================================
-- Table: supported_team_changes
-- ============================================

CREATE TABLE IF NOT EXISTS supported_team_changes (
  id SERIAL NOT NULL,
  change_id VARCHAR(100) NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  window_id VARCHAR(100) NOT NULL,
  old_supported_team_id VARCHAR(100),
  old_supported_team_name VARCHAR(255),
  new_supported_team_id VARCHAR(100) NOT NULL,
  new_supported_team_name VARCHAR(255) NOT NULL,
  changed_by VARCHAR(100) NOT NULL,
  changed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  reason TEXT,
  PRIMARY KEY (id),
  UNIQUE (change_id)
);

CREATE INDEX IF NOT EXISTS idx_supported_team_changes_league ON public.supported_team_changes USING btree (league_id);

CREATE INDEX IF NOT EXISTS idx_supported_team_changes_team ON public.supported_team_changes USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_supported_team_changes_window ON public.supported_team_changes USING btree (window_id);

CREATE UNIQUE INDEX IF NOT EXISTS supported_team_changes_change_id_key ON public.supported_team_changes USING btree (change_id);


-- ============================================
-- Table: transfer_windows
-- ============================================

CREATE TABLE IF NOT EXISTS transfer_windows (
  id SERIAL NOT NULL,
  window_id VARCHAR(100) NOT NULL,
  league_id VARCHAR(100) NOT NULL,
  window_name VARCHAR(255) NOT NULL,
  opens_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  closes_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  max_transfers_per_window INTEGER DEFAULT 3,
  points_cost_per_transfer INTEGER DEFAULT 4,
  transfer_window_start TIMESTAMP WITHOUT TIME ZONE,
  transfer_window_end TIMESTAMP WITHOUT TIME ZONE,
  window_type VARCHAR(50) DEFAULT 'player_transfer'::character varying,
  allow_supported_team_change BOOLEAN DEFAULT false,
  PRIMARY KEY (id),
  UNIQUE (window_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS transfer_windows_window_id_key ON public.transfer_windows USING btree (window_id);


-- ============================================
-- FOREIGN KEY CONSTRAINTS
-- Added after all tables to avoid dependency issues
-- ============================================

ALTER TABLE fantasy_challenge_completions ADD FOREIGN KEY (challenge_id) REFERENCES fantasy_challenges(challenge_id);

ALTER TABLE fantasy_drafts ADD FOREIGN KEY (league_id) REFERENCES fantasy_leagues(league_id);

ALTER TABLE fantasy_drafts ADD FOREIGN KEY (team_id) REFERENCES fantasy_teams(team_id);

ALTER TABLE fantasy_leaderboard ADD FOREIGN KEY (league_id) REFERENCES fantasy_leagues(league_id);

ALTER TABLE fantasy_leaderboard ADD FOREIGN KEY (team_id) REFERENCES fantasy_teams(team_id);

ALTER TABLE fantasy_player_points ADD FOREIGN KEY (fantasy_round_id) REFERENCES fantasy_rounds(fantasy_round_id);

ALTER TABLE fantasy_player_points ADD FOREIGN KEY (league_id) REFERENCES fantasy_leagues(league_id);

ALTER TABLE fantasy_player_points ADD FOREIGN KEY (team_id) REFERENCES fantasy_teams(team_id);

ALTER TABLE fantasy_players ADD FOREIGN KEY (league_id) REFERENCES fantasy_leagues(league_id);

ALTER TABLE fantasy_rounds ADD FOREIGN KEY (league_id) REFERENCES fantasy_leagues(league_id);

ALTER TABLE fantasy_scoring_rules ADD FOREIGN KEY (league_id) REFERENCES fantasy_leagues(league_id);

ALTER TABLE fantasy_squad ADD FOREIGN KEY (league_id) REFERENCES fantasy_leagues(league_id);

ALTER TABLE fantasy_squad ADD FOREIGN KEY (team_id) REFERENCES fantasy_teams(team_id);

ALTER TABLE fantasy_team_achievements ADD FOREIGN KEY (achievement_id) REFERENCES fantasy_achievements(achievement_id);

ALTER TABLE fantasy_teams ADD FOREIGN KEY (league_id) REFERENCES fantasy_leagues(league_id);

ALTER TABLE fantasy_tier_bids ADD FOREIGN KEY (tier_id) REFERENCES fantasy_draft_tiers(tier_id) ON DELETE CASCADE;

ALTER TABLE fantasy_transfers ADD FOREIGN KEY (league_id) REFERENCES fantasy_leagues(league_id);

ALTER TABLE fantasy_transfers ADD FOREIGN KEY (team_id) REFERENCES fantasy_teams(team_id);

ALTER TABLE fantasy_transfers ADD FOREIGN KEY (window_id) REFERENCES transfer_windows(window_id);

ALTER TABLE scoring_rules ADD FOREIGN KEY (league_id) REFERENCES fantasy_leagues(league_id) ON DELETE CASCADE;

ALTER TABLE supported_team_changes ADD FOREIGN KEY (league_id) REFERENCES fantasy_leagues(league_id) ON DELETE CASCADE;

ALTER TABLE supported_team_changes ADD FOREIGN KEY (team_id) REFERENCES fantasy_teams(team_id) ON DELETE CASCADE;

ALTER TABLE supported_team_changes ADD FOREIGN KEY (window_id) REFERENCES transfer_windows(window_id) ON DELETE CASCADE;

ALTER TABLE transfer_windows ADD FOREIGN KEY (league_id) REFERENCES fantasy_leagues(league_id);
