-- ============================================
-- Database Schema Export: tournament_database
-- Generated: 2026-04-27T08:32:31.628Z
-- ============================================

-- IMPORTANT NOTES:
-- 1. SERIAL and BIGSERIAL types automatically create sequences
-- 2. Foreign key constraints are added AFTER all tables are created
-- 3. Indexes use IF NOT EXISTS to prevent duplicate errors
-- 4. This file can be safely re-run on an existing database

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function: update_lineups_updated_at
CREATE OR REPLACE FUNCTION public.update_lineups_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

-- Function: update_managers_updated_at
CREATE OR REPLACE FUNCTION public.update_managers_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

-- Function: update_owners_updated_at
CREATE OR REPLACE FUNCTION public.update_owners_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

-- Function: update_tournament_settings_updated_at
CREATE OR REPLACE FUNCTION public.update_tournament_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

-- ============================================
-- Table: awards
-- ============================================

CREATE TABLE IF NOT EXISTS awards (
  id TEXT NOT NULL,
  award_type VARCHAR(20) NOT NULL,
  tournament_id TEXT NOT NULL,
  season_id TEXT NOT NULL,
  round_number INTEGER,
  week_number INTEGER,
  player_id TEXT,
  player_name TEXT,
  team_id TEXT,
  team_name TEXT,
  performance_stats JSONB,
  selected_by TEXT NOT NULL,
  selected_by_name TEXT,
  selected_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  instagram_link TEXT,
  instagram_post_url TEXT,
  display_order INTEGER DEFAULT 0,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_awards_display_order ON public.awards USING btree (season_id, display_order DESC, selected_at DESC);

CREATE INDEX IF NOT EXISTS idx_awards_player ON public.awards USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_awards_round ON public.awards USING btree (tournament_id, season_id, round_number);

CREATE INDEX IF NOT EXISTS idx_awards_team ON public.awards USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_awards_tournament_season ON public.awards USING btree (tournament_id, season_id);

CREATE INDEX IF NOT EXISTS idx_awards_type ON public.awards USING btree (award_type);

CREATE INDEX IF NOT EXISTS idx_awards_week ON public.awards USING btree (tournament_id, season_id, week_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_potd ON public.awards USING btree (tournament_id, season_id, round_number) WHERE ((award_type)::text = 'POTD'::text);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pots ON public.awards USING btree (tournament_id, season_id) WHERE ((award_type)::text = 'POTS'::text);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_potw ON public.awards USING btree (tournament_id, season_id, week_number) WHERE ((award_type)::text = 'POTW'::text);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_tod ON public.awards USING btree (tournament_id, season_id, round_number) WHERE ((award_type)::text = 'TOD'::text);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_tots ON public.awards USING btree (tournament_id, season_id) WHERE ((award_type)::text = 'TOTS'::text);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_tow ON public.awards USING btree (tournament_id, season_id, week_number) WHERE ((award_type)::text = 'TOW'::text);


-- ============================================
-- Table: fcm_tokens
-- ============================================

CREATE TABLE IF NOT EXISTS fcm_tokens (
  id SERIAL NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  token TEXT NOT NULL,
  device_name VARCHAR(255),
  device_type VARCHAR(50),
  browser VARCHAR(100),
  os VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  last_used_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (token)
);

CREATE UNIQUE INDEX IF NOT EXISTS fcm_tokens_token_key ON public.fcm_tokens USING btree (token);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_active ON public.fcm_tokens USING btree (is_active);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_active ON public.fcm_tokens USING btree (user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id ON public.fcm_tokens USING btree (user_id);


-- ============================================
-- Table: fixture_audit_log
-- ============================================

CREATE TABLE IF NOT EXISTS fixture_audit_log (
  id SERIAL NOT NULL,
  fixture_id VARCHAR(255) NOT NULL,
  changed_by VARCHAR(255),
  change_type VARCHAR(50),
  old_values JSONB,
  new_values JSONB,
  changes JSONB,
  timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  tournament_id TEXT,
  PRIMARY KEY (id)
);


-- ============================================
-- Table: fixtures
-- ============================================

CREATE TABLE IF NOT EXISTS fixtures (
  id VARCHAR(255) NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  round_number INTEGER,
  leg VARCHAR(50),
  match_day INTEGER,
  home_team_id VARCHAR(255),
  away_team_id VARCHAR(255),
  home_team_name VARCHAR(255),
  away_team_name VARCHAR(255),
  home_score INTEGER,
  away_score INTEGER,
  status VARCHAR(50) DEFAULT 'scheduled'::character varying,
  result VARCHAR(50),
  scheduled_date TIMESTAMP WITHOUT TIME ZONE,
  played_date TIMESTAMP WITHOUT TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  match_number INTEGER DEFAULT 1 NOT NULL,
  tournament_id TEXT NOT NULL,
  motm_player_id TEXT,
  motm_player_name TEXT,
  home_penalty_goals INTEGER DEFAULT 0,
  away_penalty_goals INTEGER DEFAULT 0,
  group_name VARCHAR(10),
  knockout_round VARCHAR(50),
  matchups_created_by VARCHAR(255),
  matchups_created_at TIMESTAMP WITHOUT TIME ZONE,
  lineup_last_edited_by VARCHAR(255),
  lineup_last_edited_at TIMESTAMP WITHOUT TIME ZONE,
  home_lineup_submitted_at TIMESTAMP WITHOUT TIME ZONE,
  home_lineup_submitted_by VARCHAR(100),
  away_lineup_submitted_at TIMESTAMP WITHOUT TIME ZONE,
  away_lineup_submitted_by VARCHAR(100),
  matchup_mode VARCHAR(20) DEFAULT 'manual'::character varying,
  home_lineup_submitted BOOLEAN DEFAULT false,
  away_lineup_submitted BOOLEAN DEFAULT false,
  lineups_locked BOOLEAN DEFAULT false,
  scoring_system VARCHAR(20) DEFAULT 'goals'::character varying,
  knockout_format VARCHAR(20) DEFAULT 'single_leg'::character varying,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_fixtures_group_name ON public.fixtures USING btree (group_name) WHERE (group_name IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_fixtures_knockout_round ON public.fixtures USING btree (knockout_round) WHERE (knockout_round IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_fixtures_matchup_mode ON public.fixtures USING btree (matchup_mode);

CREATE INDEX IF NOT EXISTS idx_fixtures_matchups_created ON public.fixtures USING btree (matchups_created_by, matchups_created_at);

CREATE INDEX IF NOT EXISTS idx_fixtures_motm ON public.fixtures USING btree (motm_player_id);

CREATE INDEX IF NOT EXISTS idx_fixtures_round ON public.fixtures USING btree (round_number);

CREATE INDEX IF NOT EXISTS idx_fixtures_season ON public.fixtures USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_fixtures_season_tournament ON public.fixtures USING btree (season_id, tournament_id);

CREATE INDEX IF NOT EXISTS idx_fixtures_status ON public.fixtures USING btree (status);

CREATE INDEX IF NOT EXISTS idx_fixtures_tournament_id ON public.fixtures USING btree (tournament_id);


-- ============================================
-- Table: leaderboards
-- ============================================

CREATE TABLE IF NOT EXISTS leaderboards (
  id SERIAL NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  category VARCHAR(50),
  rankings JSONB NOT NULL,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (category, season_id, type)
);

CREATE INDEX IF NOT EXISTS idx_leaderboards_season ON public.leaderboards USING btree (season_id);

CREATE UNIQUE INDEX IF NOT EXISTS leaderboards_season_id_type_category_key ON public.leaderboards USING btree (season_id, type, category);


-- ============================================
-- Table: lineup_audit_log
-- ============================================

CREATE TABLE IF NOT EXISTS lineup_audit_log (
  id SERIAL NOT NULL,
  fixture_id VARCHAR(255) NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL,
  previous_lineup JSONB,
  new_lineup JSONB,
  changed_by VARCHAR(255) NOT NULL,
  changed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  reason TEXT,
  matchups_deleted BOOLEAN DEFAULT false,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_lineup_audit_fixture ON public.lineup_audit_log USING btree (fixture_id);

CREATE INDEX IF NOT EXISTS idx_lineup_audit_team ON public.lineup_audit_log USING btree (team_id);


-- ============================================
-- Table: lineup_submissions
-- ============================================

CREATE TABLE IF NOT EXISTS lineup_submissions (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  fixture_id VARCHAR(255) NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  tournament_id VARCHAR(255) NOT NULL,
  players JSONB NOT NULL,
  submitted_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
  is_locked BOOLEAN DEFAULT false,
  PRIMARY KEY (id),
  UNIQUE (fixture_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_lineup_submissions_fixture ON public.lineup_submissions USING btree (fixture_id);

CREATE INDEX IF NOT EXISTS idx_lineup_submissions_team ON public.lineup_submissions USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_lineup_submissions_tournament ON public.lineup_submissions USING btree (tournament_id);

CREATE UNIQUE INDEX IF NOT EXISTS lineup_submissions_fixture_team_unique ON public.lineup_submissions USING btree (fixture_id, team_id);


-- ============================================
-- Table: lineup_substitutions
-- ============================================

CREATE TABLE IF NOT EXISTS lineup_substitutions (
  id SERIAL NOT NULL,
  lineup_id VARCHAR(255) NOT NULL,
  fixture_id VARCHAR(255) NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  player_out VARCHAR(255) NOT NULL,
  player_out_name VARCHAR(255),
  player_in VARCHAR(255) NOT NULL,
  player_in_name VARCHAR(255),
  made_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  made_by VARCHAR(255) NOT NULL,
  made_by_name VARCHAR(255),
  notes TEXT,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_lineup_subs_fixture ON public.lineup_substitutions USING btree (fixture_id);

CREATE INDEX IF NOT EXISTS idx_lineup_subs_lineup ON public.lineup_substitutions USING btree (lineup_id);

CREATE INDEX IF NOT EXISTS idx_lineup_subs_player_in ON public.lineup_substitutions USING btree (player_in);

CREATE INDEX IF NOT EXISTS idx_lineup_subs_player_out ON public.lineup_substitutions USING btree (player_out);

CREATE INDEX IF NOT EXISTS idx_lineup_subs_team ON public.lineup_substitutions USING btree (team_id);


-- ============================================
-- Table: lineups
-- ============================================

CREATE TABLE IF NOT EXISTS lineups (
  id VARCHAR(255) NOT NULL,
  fixture_id VARCHAR(255) NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  round_number INTEGER NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  tournament_id VARCHAR(255),
  starting_xi JSONB DEFAULT '[]'::jsonb NOT NULL,
  substitutes JSONB DEFAULT '[]'::jsonb NOT NULL,
  classic_player_count INTEGER DEFAULT 0 NOT NULL,
  is_valid BOOLEAN DEFAULT true,
  validation_errors JSONB DEFAULT '[]'::jsonb,
  is_locked BOOLEAN DEFAULT false,
  locked_at TIMESTAMP WITH TIME ZONE,
  locked_by VARCHAR(255),
  warning_given BOOLEAN DEFAULT false,
  warning_given_at TIMESTAMP WITH TIME ZONE,
  selected_by_opponent BOOLEAN DEFAULT false,
  opponent_selector_id VARCHAR(255),
  opponent_selected_at TIMESTAMP WITH TIME ZONE,
  submitted_by VARCHAR(255) NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_draft BOOLEAN DEFAULT false,
  PRIMARY KEY (id),
  UNIQUE (fixture_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_lineups_draft ON public.lineups USING btree (is_draft);

CREATE INDEX IF NOT EXISTS idx_lineups_fixture ON public.lineups USING btree (fixture_id);

CREATE INDEX IF NOT EXISTS idx_lineups_locked ON public.lineups USING btree (is_locked);

CREATE INDEX IF NOT EXISTS idx_lineups_round ON public.lineups USING btree (round_number);

CREATE INDEX IF NOT EXISTS idx_lineups_season ON public.lineups USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_lineups_team ON public.lineups USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_lineups_valid ON public.lineups USING btree (is_valid);

CREATE INDEX IF NOT EXISTS idx_lineups_warning ON public.lineups USING btree (warning_given);

CREATE UNIQUE INDEX IF NOT EXISTS lineups_unique_per_team ON public.lineups USING btree (fixture_id, team_id);

-- Trigger: trigger_update_lineups_updated_at
DROP TRIGGER IF EXISTS trigger_update_lineups_updated_at ON lineups;
CREATE TRIGGER trigger_update_lineups_updated_at
  BEFORE UPDATE
  ON lineups
  FOR EACH ROW
  EXECUTE FUNCTION update_lineups_updated_at();


-- ============================================
-- Table: managers
-- ============================================

CREATE TABLE IF NOT EXISTS managers (
  id SERIAL NOT NULL,
  manager_id VARCHAR(255) NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  photo_url TEXT,
  photo_file_id VARCHAR(255),
  player_id VARCHAR(255),
  is_player BOOLEAN DEFAULT false,
  email VARCHAR(255),
  phone VARCHAR(50),
  date_of_birth DATE,
  place VARCHAR(255),
  nationality VARCHAR(100),
  jersey_number INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by VARCHAR(255),
  PRIMARY KEY (id),
  UNIQUE (manager_id),
  UNIQUE (season_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_managers_player_id ON public.managers USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_managers_season_id ON public.managers USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_managers_team_id ON public.managers USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_managers_team_season ON public.managers USING btree (team_id, season_id);

CREATE UNIQUE INDEX IF NOT EXISTS managers_manager_id_key ON public.managers USING btree (manager_id);

CREATE UNIQUE INDEX IF NOT EXISTS managers_team_id_season_id_key ON public.managers USING btree (team_id, season_id);

-- Trigger: trigger_update_managers_updated_at
DROP TRIGGER IF EXISTS trigger_update_managers_updated_at ON managers;
CREATE TRIGGER trigger_update_managers_updated_at
  BEFORE UPDATE
  ON managers
  FOR EACH ROW
  EXECUTE FUNCTION update_managers_updated_at();


-- ============================================
-- Table: match_days
-- ============================================

CREATE TABLE IF NOT EXISTS match_days (
  id SERIAL NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  round_number INTEGER NOT NULL,
  leg VARCHAR(50) DEFAULT 'first'::character varying,
  scheduled_date DATE,
  home_fixture_deadline_time VARCHAR(10) DEFAULT '23:30'::character varying,
  away_fixture_deadline_time VARCHAR(10) DEFAULT '23:45'::character varying,
  result_entry_deadline_day_offset INTEGER DEFAULT 2,
  result_entry_deadline_time VARCHAR(10) DEFAULT '00:30'::character varying,
  status VARCHAR(50) DEFAULT 'pending'::character varying,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (leg, round_number, season_id)
);

CREATE INDEX IF NOT EXISTS idx_matchdays_active ON public.match_days USING btree (is_active);

CREATE INDEX IF NOT EXISTS idx_matchdays_season ON public.match_days USING btree (season_id);

CREATE UNIQUE INDEX IF NOT EXISTS match_days_season_id_round_number_leg_key ON public.match_days USING btree (season_id, round_number, leg);


-- ============================================
-- Table: matches
-- ============================================

CREATE TABLE IF NOT EXISTS matches (
  id VARCHAR(255) NOT NULL,
  fixture_id VARCHAR(255) NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  round_number INTEGER,
  home_team_id VARCHAR(255),
  away_team_id VARCHAR(255),
  home_score INTEGER,
  away_score INTEGER,
  winner_id VARCHAR(255),
  result_type VARCHAR(50),
  match_date TIMESTAMP WITHOUT TIME ZONE,
  details JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_matches_fixture ON public.matches USING btree (fixture_id);

CREATE INDEX IF NOT EXISTS idx_matches_season ON public.matches USING btree (season_id);


-- ============================================
-- Table: matchups
-- ============================================

CREATE TABLE IF NOT EXISTS matchups (
  id SERIAL NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  round_number INTEGER NOT NULL,
  home_team_id VARCHAR(255),
  away_team_id VARCHAR(255),
  home_team_name VARCHAR(255),
  away_team_name VARCHAR(255),
  result VARCHAR(50),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  tournament_id TEXT,
  match_duration INTEGER DEFAULT 6,
  home_goals INTEGER,
  away_goals INTEGER,
  result_entered_by TEXT,
  result_entered_at TIMESTAMP WITHOUT TIME ZONE,
  fixture_id TEXT NOT NULL,
  home_player_id TEXT,
  home_player_name TEXT,
  away_player_id TEXT,
  away_player_name TEXT,
  position INTEGER,
  created_by TEXT,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  home_original_player_id VARCHAR(255),
  home_original_player_name TEXT,
  home_substituted BOOLEAN DEFAULT false,
  home_sub_penalty INTEGER DEFAULT 0,
  away_original_player_id VARCHAR(255),
  away_original_player_name TEXT,
  away_substituted BOOLEAN DEFAULT false,
  away_sub_penalty INTEGER DEFAULT 0,
  is_null BOOLEAN DEFAULT false,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_matchups_created_by ON public.matchups USING btree (created_by);

CREATE INDEX IF NOT EXISTS idx_matchups_fixture_id ON public.matchups USING btree (fixture_id);

CREATE INDEX IF NOT EXISTS idx_matchups_tournament_id ON public.matchups USING btree (tournament_id);


-- ============================================
-- Table: news
-- ============================================

CREATE TABLE IF NOT EXISTS news (
  id VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  season_id VARCHAR(50),
  season_name VARCHAR(100),
  is_published BOOLEAN DEFAULT false,
  generated_by VARCHAR(20) DEFAULT 'ai'::character varying,
  edited_by_admin BOOLEAN DEFAULT false,
  image_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP WITHOUT TIME ZONE,
  language VARCHAR(5) DEFAULT 'en'::character varying,
  tone VARCHAR(20) DEFAULT 'neutral'::character varying,
  reporter_name VARCHAR(100),
  has_poll BOOLEAN DEFAULT false,
  poll_id VARCHAR(100),
  title_en TEXT,
  title_ml TEXT,
  content_en TEXT,
  content_ml TEXT,
  summary_en TEXT,
  summary_ml TEXT,
  reporter_en VARCHAR(100),
  reporter_ml VARCHAR(100),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_news_category ON public.news USING btree (category);

CREATE INDEX IF NOT EXISTS idx_news_category_published ON public.news USING btree (category, is_published, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_created_at ON public.news USING btree (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_event_type ON public.news USING btree (event_type);

CREATE INDEX IF NOT EXISTS idx_news_language ON public.news USING btree (language);

CREATE INDEX IF NOT EXISTS idx_news_poll ON public.news USING btree (poll_id);

CREATE INDEX IF NOT EXISTS idx_news_published ON public.news USING btree (is_published);

CREATE INDEX IF NOT EXISTS idx_news_published_created ON public.news USING btree (is_published, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_news_season ON public.news USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_news_season_language ON public.news USING btree (season_id, language);


-- ============================================
-- Table: news_reaction_counts
-- ============================================

CREATE TABLE IF NOT EXISTS news_reaction_counts (
  id SERIAL NOT NULL,
  news_id VARCHAR(255) NOT NULL,
  reaction_type VARCHAR(20) NOT NULL,
  count INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (news_id, reaction_type)
);

CREATE INDEX IF NOT EXISTS idx_news_reaction_counts_news ON public.news_reaction_counts USING btree (news_id);

CREATE UNIQUE INDEX IF NOT EXISTS news_reaction_counts_news_id_reaction_type_key ON public.news_reaction_counts USING btree (news_id, reaction_type);


-- ============================================
-- Table: news_reactions
-- ============================================

CREATE TABLE IF NOT EXISTS news_reactions (
  id SERIAL NOT NULL,
  reaction_id VARCHAR(100) NOT NULL,
  news_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(100),
  device_fingerprint VARCHAR(255) NOT NULL,
  reaction_type VARCHAR(20) NOT NULL,
  ip_address VARCHAR(50),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (device_fingerprint, news_id),
  UNIQUE (reaction_id)
);

CREATE INDEX IF NOT EXISTS idx_news_reactions_device ON public.news_reactions USING btree (device_fingerprint);

CREATE INDEX IF NOT EXISTS idx_news_reactions_news ON public.news_reactions USING btree (news_id);

CREATE UNIQUE INDEX IF NOT EXISTS news_reactions_news_id_device_fingerprint_key ON public.news_reactions USING btree (news_id, device_fingerprint);

CREATE UNIQUE INDEX IF NOT EXISTS news_reactions_reaction_id_key ON public.news_reactions USING btree (reaction_id);


-- ============================================
-- Table: owners
-- ============================================

CREATE TABLE IF NOT EXISTS owners (
  id SERIAL NOT NULL,
  owner_id VARCHAR(255) NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  photo_url TEXT,
  photo_file_id VARCHAR(255),
  email VARCHAR(255),
  registered_email VARCHAR(255),
  phone VARCHAR(50),
  date_of_birth DATE,
  place VARCHAR(255),
  nationality VARCHAR(100),
  bio TEXT,
  instagram_handle VARCHAR(100),
  twitter_handle VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by VARCHAR(255),
  registered_user_id VARCHAR(255),
  PRIMARY KEY (id),
  UNIQUE (owner_id)
);

CREATE INDEX IF NOT EXISTS idx_owners_email ON public.owners USING btree (email);

CREATE UNIQUE INDEX IF NOT EXISTS idx_owners_registered_user_id_unique ON public.owners USING btree (registered_user_id) WHERE (registered_user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_owners_team_id ON public.owners USING btree (team_id);

CREATE UNIQUE INDEX IF NOT EXISTS owners_owner_id_key ON public.owners USING btree (owner_id);

-- Trigger: trigger_update_owners_updated_at
DROP TRIGGER IF EXISTS trigger_update_owners_updated_at ON owners;
CREATE TRIGGER trigger_update_owners_updated_at
  BEFORE UPDATE
  ON owners
  FOR EACH ROW
  EXECUTE FUNCTION update_owners_updated_at();


-- ============================================
-- Table: player_awards
-- ============================================

CREATE TABLE IF NOT EXISTS player_awards (
  id SERIAL NOT NULL,
  player_id VARCHAR(255) NOT NULL,
  player_name VARCHAR(255) NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  award_category VARCHAR(50) NOT NULL,
  award_type VARCHAR(100) NOT NULL,
  award_position VARCHAR(50),
  player_category VARCHAR(50),
  performance_stats JSONB,
  awarded_by VARCHAR(50) DEFAULT 'system'::character varying,
  notes TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  instagram_link TEXT,
  instagram_post_url TEXT,
  tournament_id VARCHAR(255),
  display_order INTEGER DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE (award_category, award_position, award_type, player_id, season_id, tournament_id),
  UNIQUE (award_category, award_position, award_type, player_id, season_id)
);

CREATE INDEX IF NOT EXISTS idx_player_awards_category ON public.player_awards USING btree (award_category);

CREATE INDEX IF NOT EXISTS idx_player_awards_display_order ON public.player_awards USING btree (season_id, display_order DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_player_awards_player_category ON public.player_awards USING btree (player_category);

CREATE INDEX IF NOT EXISTS idx_player_awards_player_id ON public.player_awards USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_player_awards_player_season ON public.player_awards USING btree (player_id, season_id);

CREATE INDEX IF NOT EXISTS idx_player_awards_position ON public.player_awards USING btree (award_position);

CREATE INDEX IF NOT EXISTS idx_player_awards_season_id ON public.player_awards USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_player_awards_tournament_id ON public.player_awards USING btree (tournament_id);

CREATE INDEX IF NOT EXISTS idx_player_awards_type ON public.player_awards USING btree (award_type);

CREATE UNIQUE INDEX IF NOT EXISTS player_awards_unique_award ON public.player_awards USING btree (player_id, season_id, tournament_id, award_category, award_type, award_position) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX IF NOT EXISTS unique_player_award ON public.player_awards USING btree (player_id, season_id, award_category, award_type, award_position);


-- ============================================
-- Table: player_seasons
-- ============================================

CREATE TABLE IF NOT EXISTS player_seasons (
  id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  season_id TEXT NOT NULL,
  team_id TEXT,
  player_name TEXT NOT NULL,
  team TEXT,
  contract_id TEXT,
  contract_start_season TEXT,
  contract_end_season TEXT,
  contract_length INTEGER DEFAULT 2,
  is_auto_registered BOOLEAN DEFAULT false,
  category TEXT,
  star_rating INTEGER DEFAULT 3,
  points INTEGER DEFAULT 100,
  matches_played INTEGER DEFAULT 0,
  goals_scored INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  clean_sheets INTEGER DEFAULT 0,
  motm_awards INTEGER DEFAULT 0,
  registration_date TIMESTAMP WITHOUT TIME ZONE,
  registration_status TEXT DEFAULT 'active'::text,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  auction_value INTEGER DEFAULT 0,
  salary_per_match NUMERIC DEFAULT 0.00,
  registration_type VARCHAR(20) DEFAULT 'confirmed'::character varying,
  status VARCHAR(50),
  goals_conceded INTEGER DEFAULT 0,
  processed_fixtures JSONB DEFAULT '[]'::jsonb,
  prevent_auto_promotion BOOLEAN DEFAULT false,
  base_points INTEGER DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE (player_id, season_id)
);

CREATE INDEX IF NOT EXISTS idx_player_seasons_base_points ON public.player_seasons USING btree (base_points);

CREATE INDEX IF NOT EXISTS idx_player_seasons_category ON public.player_seasons USING btree (category);

CREATE INDEX IF NOT EXISTS idx_player_seasons_contract ON public.player_seasons USING btree (contract_id);

CREATE INDEX IF NOT EXISTS idx_player_seasons_contract_id ON public.player_seasons USING btree (contract_id);

CREATE INDEX IF NOT EXISTS idx_player_seasons_contract_season ON public.player_seasons USING btree (contract_start_season, contract_end_season);

CREATE INDEX IF NOT EXISTS idx_player_seasons_player ON public.player_seasons USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_player_seasons_prevent_auto_promotion ON public.player_seasons USING btree (prevent_auto_promotion);

CREATE INDEX IF NOT EXISTS idx_player_seasons_processed_fixtures ON public.player_seasons USING gin (processed_fixtures);

CREATE INDEX IF NOT EXISTS idx_player_seasons_registration_type ON public.player_seasons USING btree (registration_type);

CREATE INDEX IF NOT EXISTS idx_player_seasons_season ON public.player_seasons USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_player_seasons_season_reg_type ON public.player_seasons USING btree (season_id, registration_type);

CREATE INDEX IF NOT EXISTS idx_player_seasons_team ON public.player_seasons USING btree (team_id);

CREATE UNIQUE INDEX IF NOT EXISTS player_seasons_player_id_season_id_key ON public.player_seasons USING btree (player_id, season_id);

CREATE UNIQUE INDEX IF NOT EXISTS player_seasons_player_season_unique ON public.player_seasons USING btree (player_id, season_id);


-- ============================================
-- Table: poll_results
-- ============================================

CREATE TABLE IF NOT EXISTS poll_results (
  id SERIAL NOT NULL,
  poll_id VARCHAR(100) NOT NULL,
  option_id VARCHAR(50) NOT NULL,
  option_text_en TEXT NOT NULL,
  option_text_ml TEXT,
  vote_count INTEGER DEFAULT 0,
  vote_percentage NUMERIC DEFAULT 0,
  is_winner BOOLEAN DEFAULT false,
  last_updated TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (option_id, poll_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_results_poll ON public.poll_results USING btree (poll_id);

CREATE UNIQUE INDEX IF NOT EXISTS poll_results_poll_id_option_id_key ON public.poll_results USING btree (poll_id, option_id);


-- ============================================
-- Table: poll_vote_flags
-- ============================================

CREATE TABLE IF NOT EXISTS poll_vote_flags (
  id SERIAL NOT NULL,
  poll_id VARCHAR(100) NOT NULL,
  voter_name VARCHAR(255) NOT NULL,
  flag_reason VARCHAR(255) NOT NULL,
  device_count INTEGER DEFAULT 1,
  flagged_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  reviewed_by VARCHAR(100),
  reviewed_at TIMESTAMP WITHOUT TIME ZONE,
  resolution VARCHAR(50),
  PRIMARY KEY (id),
  UNIQUE (poll_id, voter_name)
);

CREATE INDEX IF NOT EXISTS idx_poll_flags_poll ON public.poll_vote_flags USING btree (poll_id);

CREATE INDEX IF NOT EXISTS idx_poll_flags_unreviewed ON public.poll_vote_flags USING btree (poll_id) WHERE (reviewed_at IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS poll_vote_flags_poll_id_voter_name_key ON public.poll_vote_flags USING btree (poll_id, voter_name);


-- ============================================
-- Table: poll_votes
-- ============================================

CREATE TABLE IF NOT EXISTS poll_votes (
  id SERIAL NOT NULL,
  vote_id VARCHAR(100) NOT NULL,
  poll_id VARCHAR(100) NOT NULL,
  user_id VARCHAR(100) NOT NULL,
  user_name VARCHAR(255),
  user_team_id VARCHAR(100),
  selected_option_id VARCHAR(50) NOT NULL,
  is_correct BOOLEAN,
  voted_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  voter_name VARCHAR(255),
  device_fingerprint VARCHAR(255),
  ip_address VARCHAR(50),
  user_agent TEXT,
  browser_info JSONB,
  updated_at TIMESTAMP WITHOUT TIME ZONE,
  is_flagged BOOLEAN DEFAULT false,
  flag_reason VARCHAR(255),
  admin_verified BOOLEAN DEFAULT false,
  admin_notes TEXT,
  deleted_by VARCHAR(100),
  deleted_at TIMESTAMP WITHOUT TIME ZONE,
  PRIMARY KEY (id),
  UNIQUE (vote_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_votes_device_unique ON public.poll_votes USING btree (poll_id, device_fingerprint) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_poll_votes_flagged ON public.poll_votes USING btree (poll_id, is_flagged) WHERE (is_flagged = true);

CREATE INDEX IF NOT EXISTS idx_poll_votes_name ON public.poll_votes USING btree (poll_id, voter_name) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON public.poll_votes USING btree (poll_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_votes_unique_user_poll ON public.poll_votes USING btree (poll_id, user_id) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS idx_poll_votes_user ON public.poll_votes USING btree (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS poll_votes_vote_id_key ON public.poll_votes USING btree (vote_id);


-- ============================================
-- Table: polls
-- ============================================

CREATE TABLE IF NOT EXISTS polls (
  id SERIAL NOT NULL,
  poll_id VARCHAR(100) NOT NULL,
  news_id VARCHAR(255),
  season_id VARCHAR(100) NOT NULL,
  poll_type VARCHAR(50) NOT NULL,
  title_en TEXT NOT NULL,
  title_ml TEXT,
  description_en TEXT,
  description_ml TEXT,
  related_fixture_id VARCHAR(255),
  related_round_id VARCHAR(255),
  related_matchday_date DATE,
  options JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'active'::character varying,
  opens_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  closes_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  result_announced_at TIMESTAMP WITHOUT TIME ZONE,
  winning_option_id VARCHAR(50),
  total_votes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  created_by VARCHAR(100),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (poll_id)
);

CREATE INDEX IF NOT EXISTS idx_polls_closes_at ON public.polls USING btree (closes_at);

CREATE INDEX IF NOT EXISTS idx_polls_fixture ON public.polls USING btree (related_fixture_id);

CREATE INDEX IF NOT EXISTS idx_polls_round ON public.polls USING btree (related_round_id);

CREATE INDEX IF NOT EXISTS idx_polls_season ON public.polls USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_polls_status ON public.polls USING btree (status);

CREATE INDEX IF NOT EXISTS idx_polls_type ON public.polls USING btree (poll_type);

CREATE UNIQUE INDEX IF NOT EXISTS polls_poll_id_key ON public.polls USING btree (poll_id);


-- ============================================
-- Table: realplayerstats
-- ============================================

CREATE TABLE IF NOT EXISTS realplayerstats (
  id VARCHAR(255) NOT NULL,
  player_id VARCHAR(255) NOT NULL,
  player_name VARCHAR(255) NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  team VARCHAR(255),
  team_id VARCHAR(255),
  category VARCHAR(50),
  matches_played INTEGER DEFAULT 0,
  matches_won INTEGER DEFAULT 0,
  matches_lost INTEGER DEFAULT 0,
  matches_drawn INTEGER DEFAULT 0,
  goals_scored INTEGER DEFAULT 0,
  goals_conceded INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  clean_sheets INTEGER DEFAULT 0,
  own_goals INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  penalties_saved INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  motm_awards INTEGER DEFAULT 0,
  points REAL DEFAULT 0,
  trophies JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  tournament_id TEXT NOT NULL,
  participation_type VARCHAR(20),
  match_played BOOLEAN DEFAULT false,
  lineup_id VARCHAR(255),
  PRIMARY KEY (player_id, season_id, tournament_id),
  UNIQUE (player_id, season_id)
);

CREATE INDEX IF NOT EXISTS idx_playerstats_player ON public.realplayerstats USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_playerstats_points ON public.realplayerstats USING btree (points DESC);

CREATE INDEX IF NOT EXISTS idx_playerstats_season ON public.realplayerstats USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_playerstats_team ON public.realplayerstats USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_realplayerstats_match_played ON public.realplayerstats USING btree (match_played);

CREATE INDEX IF NOT EXISTS idx_realplayerstats_participation ON public.realplayerstats USING btree (participation_type);

CREATE INDEX IF NOT EXISTS idx_realplayerstats_player_id ON public.realplayerstats USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_realplayerstats_player_tournament ON public.realplayerstats USING btree (player_id, tournament_id);

CREATE INDEX IF NOT EXISTS idx_realplayerstats_season_tournament ON public.realplayerstats USING btree (season_id, tournament_id);

CREATE INDEX IF NOT EXISTS idx_realplayerstats_team ON public.realplayerstats USING btree (team);

CREATE INDEX IF NOT EXISTS idx_realplayerstats_team_id ON public.realplayerstats USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_realplayerstats_team_season ON public.realplayerstats USING btree (team, season_id);

CREATE INDEX IF NOT EXISTS idx_realplayerstats_tournament_id ON public.realplayerstats USING btree (tournament_id);

CREATE UNIQUE INDEX IF NOT EXISTS unique_player_season ON public.realplayerstats USING btree (player_id, season_id);


-- ============================================
-- Table: round_deadlines
-- ============================================

CREATE TABLE IF NOT EXISTS round_deadlines (
  id SERIAL NOT NULL,
  tournament_id VARCHAR(255),
  season_id VARCHAR(255) NOT NULL,
  round_number INTEGER NOT NULL,
  leg VARCHAR(20) DEFAULT 'first'::character varying,
  scheduled_date DATE,
  home_fixture_deadline_time VARCHAR(10) DEFAULT '17:00'::character varying,
  away_fixture_deadline_time VARCHAR(10) DEFAULT '17:00'::character varying,
  result_entry_deadline_day_offset INTEGER DEFAULT 2,
  result_entry_deadline_time VARCHAR(10) DEFAULT '00:30'::character varying,
  status VARCHAR(50) DEFAULT 'pending'::character varying,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  round_start_time VARCHAR(10) DEFAULT '14:00'::character varying,
  home_substitution_deadline_time TIME WITHOUT TIME ZONE DEFAULT '21:00:00'::time without time zone,
  away_substitution_deadline_time TIME WITHOUT TIME ZONE DEFAULT '21:00:00'::time without time zone,
  home_substitution_deadline_day_offset INTEGER DEFAULT 1,
  away_substitution_deadline_day_offset INTEGER DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE (leg, round_number, tournament_id)
);

CREATE INDEX IF NOT EXISTS idx_round_deadlines_season ON public.round_deadlines USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_round_deadlines_start_time ON public.round_deadlines USING btree (round_start_time);

CREATE INDEX IF NOT EXISTS idx_round_deadlines_status ON public.round_deadlines USING btree (status);

CREATE INDEX IF NOT EXISTS idx_round_deadlines_tournament ON public.round_deadlines USING btree (tournament_id);

CREATE UNIQUE INDEX IF NOT EXISTS round_deadlines_tournament_id_round_number_leg_key ON public.round_deadlines USING btree (tournament_id, round_number, leg);


-- ============================================
-- Table: team_players
-- ============================================

CREATE TABLE IF NOT EXISTS team_players (
  id SERIAL NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  player_id VARCHAR(255) NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  acquisition_price INTEGER,
  acquisition_type VARCHAR(50),
  status VARCHAR(50) DEFAULT 'active'::character varying,
  joined_date TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  left_date TIMESTAMP WITHOUT TIME ZONE,
  PRIMARY KEY (id),
  UNIQUE (player_id, season_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_teamplayers_season ON public.team_players USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_teamplayers_team ON public.team_players USING btree (team_id);

CREATE UNIQUE INDEX IF NOT EXISTS team_players_team_id_player_id_season_id_key ON public.team_players USING btree (team_id, player_id, season_id);


-- ============================================
-- Table: team_trophies
-- ============================================

CREATE TABLE IF NOT EXISTS team_trophies (
  id SERIAL NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  team_name VARCHAR(255) NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  trophy_type VARCHAR(50) NOT NULL,
  trophy_name VARCHAR(255) NOT NULL,
  position INTEGER,
  awarded_by VARCHAR(50) DEFAULT 'system'::character varying,
  notes TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  trophy_position VARCHAR(50),
  instagram_link TEXT,
  instagram_post_url TEXT,
  display_order INTEGER DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE (season_id, team_id, trophy_name, trophy_position)
);

CREATE INDEX IF NOT EXISTS idx_team_trophies_season_id ON public.team_trophies USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_team_trophies_team_id ON public.team_trophies USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_team_trophies_trophy_position ON public.team_trophies USING btree (trophy_position);

CREATE INDEX IF NOT EXISTS idx_team_trophies_type ON public.team_trophies USING btree (trophy_type);

CREATE UNIQUE INDEX IF NOT EXISTS team_trophies_unique_trophy ON public.team_trophies USING btree (team_id, season_id, trophy_name, trophy_position);


-- ============================================
-- Table: team_violations
-- ============================================

CREATE TABLE IF NOT EXISTS team_violations (
  id SERIAL NOT NULL,
  team_id VARCHAR(100) NOT NULL,
  season_id VARCHAR(100) NOT NULL,
  violation_type VARCHAR(50) NOT NULL,
  fixture_id VARCHAR(100),
  round_number INTEGER,
  violation_date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  deadline TIMESTAMP WITHOUT TIME ZONE,
  minutes_late INTEGER,
  penalty_applied VARCHAR(100),
  penalty_amount INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_team_violations_fixture ON public.team_violations USING btree (fixture_id);

CREATE INDEX IF NOT EXISTS idx_team_violations_season ON public.team_violations USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_team_violations_team ON public.team_violations USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_team_violations_type ON public.team_violations USING btree (violation_type);


-- ============================================
-- Table: teamstats
-- ============================================

CREATE TABLE IF NOT EXISTS teamstats (
  id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  tournament_id TEXT NOT NULL,
  season_id TEXT NOT NULL,
  team_name TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  matches_played INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  goals_for INTEGER DEFAULT 0,
  goals_against INTEGER DEFAULT 0,
  goal_difference INTEGER DEFAULT 0,
  current_form TEXT,
  win_streak INTEGER DEFAULT 0,
  unbeaten_streak INTEGER DEFAULT 0,
  trophies JSONB DEFAULT '[]'::jsonb,
  processed_fixtures JSONB DEFAULT '[]'::jsonb,
  points_deducted INTEGER DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (season_id, team_id, tournament_id)
);

CREATE INDEX IF NOT EXISTS idx_teamstats_season_id ON public.teamstats USING btree (season_id);

CREATE UNIQUE INDEX IF NOT EXISTS teamstats_new2_team_id_season_id_tournament_id_key ON public.teamstats USING btree (team_id, season_id, tournament_id);


-- ============================================
-- Table: teamstats_old2
-- ============================================

CREATE TABLE IF NOT EXISTS teamstats_old2 (
  id VARCHAR(255) NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  team_name VARCHAR(255) NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  matches_played INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  goals_for INTEGER DEFAULT 0,
  goals_against INTEGER DEFAULT 0,
  goal_difference INTEGER DEFAULT 0,
  points INTEGER DEFAULT 0,
  current_form VARCHAR(10),
  win_streak INTEGER DEFAULT 0,
  unbeaten_streak INTEGER DEFAULT 0,
  position INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  tournament_id TEXT,
  trophies JSONB DEFAULT '[]'::jsonb,
  processed_fixtures JSONB DEFAULT '[]'::jsonb,
  points_deducted INTEGER DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE (season_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_teamstats_points ON public.teamstats_old2 USING btree (points DESC);

CREATE INDEX IF NOT EXISTS idx_teamstats_processed_fixtures ON public.teamstats_old2 USING gin (processed_fixtures);

CREATE INDEX IF NOT EXISTS idx_teamstats_season ON public.teamstats_old2 USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_teamstats_season_tournament ON public.teamstats_old2 USING btree (season_id, tournament_id);

CREATE INDEX IF NOT EXISTS idx_teamstats_team_id ON public.teamstats_old2 USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_teamstats_team_name ON public.teamstats_old2 USING btree (team_name);

CREATE INDEX IF NOT EXISTS idx_teamstats_team_season ON public.teamstats_old2 USING btree (team_name, season_id);

CREATE INDEX IF NOT EXISTS idx_teamstats_team_tournament ON public.teamstats_old2 USING btree (team_id, tournament_id);

CREATE INDEX IF NOT EXISTS idx_teamstats_tournament ON public.teamstats_old2 USING btree (tournament_id);

CREATE INDEX IF NOT EXISTS idx_teamstats_tournament_id ON public.teamstats_old2 USING btree (tournament_id);

CREATE UNIQUE INDEX IF NOT EXISTS teamstats_team_id_season_id_key ON public.teamstats_old2 USING btree (team_id, season_id);


-- ============================================
-- Table: tournament_penalties
-- ============================================

CREATE TABLE IF NOT EXISTS tournament_penalties (
  id SERIAL NOT NULL,
  tournament_id VARCHAR(50) NOT NULL,
  season_id VARCHAR(50) NOT NULL,
  team_id VARCHAR(50) NOT NULL,
  team_name VARCHAR(255) NOT NULL,
  points_deducted INTEGER NOT NULL,
  reason TEXT NOT NULL,
  applied_by_id VARCHAR(50) NOT NULL,
  applied_by_name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  removed_by_id VARCHAR(50),
  removed_by_name VARCHAR(255),
  removed_at TIMESTAMP WITHOUT TIME ZONE,
  removal_reason TEXT,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  ecoin_fine NUMERIC DEFAULT 0,
  sscoin_fine NUMERIC DEFAULT 0,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_penalties_active ON public.tournament_penalties USING btree (is_active);

CREATE INDEX IF NOT EXISTS idx_tournament_penalties_season ON public.tournament_penalties USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_tournament_penalties_team ON public.tournament_penalties USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_tournament_penalties_tournament ON public.tournament_penalties USING btree (tournament_id);


-- ============================================
-- Table: tournament_rewards_distributed
-- ============================================

CREATE TABLE IF NOT EXISTS tournament_rewards_distributed (
  id SERIAL NOT NULL,
  tournament_id VARCHAR(255) NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  reward_type VARCHAR(50) NOT NULL,
  reward_details JSONB,
  ecoin_amount INTEGER DEFAULT 0,
  sscoin_amount INTEGER DEFAULT 0,
  distributed_by VARCHAR(255),
  distributed_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  notes TEXT,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_rewards_season ON public.tournament_rewards_distributed USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_rewards_team ON public.tournament_rewards_distributed USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_rewards_tournament ON public.tournament_rewards_distributed USING btree (tournament_id);

CREATE INDEX IF NOT EXISTS idx_rewards_type ON public.tournament_rewards_distributed USING btree (reward_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_reward ON public.tournament_rewards_distributed USING btree (tournament_id, team_id, reward_type, ((reward_details)::text));


-- ============================================
-- Table: tournament_settings
-- ============================================

CREATE TABLE IF NOT EXISTS tournament_settings (
  id SERIAL NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  total_rounds INTEGER,
  points_per_win INTEGER DEFAULT 3,
  points_per_draw INTEGER DEFAULT 1,
  points_per_loss INTEGER DEFAULT 0,
  settings JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  tournament_id TEXT NOT NULL,
  squad_size INTEGER DEFAULT 11,
  tournament_system VARCHAR(50) DEFAULT 'match_round'::character varying,
  home_deadline_time VARCHAR(10) DEFAULT '17:00'::character varying,
  away_deadline_time VARCHAR(10) DEFAULT '17:00'::character varying,
  result_day_offset INTEGER DEFAULT 2,
  result_deadline_time VARCHAR(10) DEFAULT '00:30'::character varying,
  has_knockout_stage BOOLEAN DEFAULT false,
  playoff_teams INTEGER DEFAULT 4,
  direct_semifinal_teams INTEGER DEFAULT 2,
  qualification_threshold INTEGER DEFAULT 75,
  lineup_category_requirements JSONB DEFAULT '{}'::jsonb,
  enable_category_requirements BOOLEAN DEFAULT false,
  rewards JSONB DEFAULT '{}'::jsonb,
  number_of_teams INTEGER,
  scoring_type VARCHAR(20) DEFAULT 'goals'::character varying,
  PRIMARY KEY (tournament_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_settings_scoring_type ON public.tournament_settings USING btree (scoring_type);

CREATE INDEX IF NOT EXISTS idx_tournament_settings_season_id ON public.tournament_settings USING btree (season_id);

-- Trigger: trigger_update_tournament_settings_updated_at
DROP TRIGGER IF EXISTS trigger_update_tournament_settings_updated_at ON tournament_settings;
CREATE TRIGGER trigger_update_tournament_settings_updated_at
  BEFORE UPDATE
  ON tournament_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_tournament_settings_updated_at();


-- ============================================
-- Table: tournament_team_groups
-- ============================================

CREATE TABLE IF NOT EXISTS tournament_team_groups (
  id SERIAL NOT NULL,
  tournament_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  group_name VARCHAR(10) NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (team_id, tournament_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_team_groups_group ON public.tournament_team_groups USING btree (group_name);

CREATE INDEX IF NOT EXISTS idx_tournament_team_groups_team ON public.tournament_team_groups USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_tournament_team_groups_tournament ON public.tournament_team_groups USING btree (tournament_id);

CREATE UNIQUE INDEX IF NOT EXISTS tournament_team_groups_tournament_id_team_id_key ON public.tournament_team_groups USING btree (tournament_id, team_id);


-- ============================================
-- Table: tournaments
-- ============================================

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT NOT NULL,
  season_id TEXT NOT NULL,
  tournament_type TEXT NOT NULL,
  tournament_name TEXT NOT NULL,
  tournament_code TEXT,
  status TEXT DEFAULT 'upcoming'::text,
  start_date TIMESTAMP WITHOUT TIME ZONE,
  end_date TIMESTAMP WITHOUT TIME ZONE,
  description TEXT,
  is_primary BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  include_in_fantasy BOOLEAN DEFAULT true,
  has_group_stage BOOLEAN DEFAULT false,
  number_of_groups INTEGER DEFAULT 4,
  teams_per_group INTEGER DEFAULT 4,
  teams_advancing_per_group INTEGER DEFAULT 2,
  has_knockout_stage BOOLEAN DEFAULT false,
  playoff_teams INTEGER DEFAULT 4,
  direct_semifinal_teams INTEGER DEFAULT 2,
  qualification_threshold INTEGER DEFAULT 75,
  is_pure_knockout BOOLEAN DEFAULT false,
  include_in_awards BOOLEAN DEFAULT true,
  has_league_stage BOOLEAN DEFAULT true,
  group_assignment_mode VARCHAR(20) DEFAULT 'auto'::character varying,
  is_historical BOOLEAN DEFAULT false,
  rewards JSONB,
  number_of_teams INTEGER DEFAULT 16,
  PRIMARY KEY (id),
  UNIQUE (season_id, tournament_type)
);

CREATE INDEX IF NOT EXISTS idx_tournaments_is_historical ON public.tournaments USING btree (is_historical) WHERE (is_historical = true);

CREATE INDEX IF NOT EXISTS idx_tournaments_season ON public.tournaments USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_tournaments_status ON public.tournaments USING btree (status);

CREATE INDEX IF NOT EXISTS idx_tournaments_type ON public.tournaments USING btree (tournament_type);

CREATE UNIQUE INDEX IF NOT EXISTS tournaments_season_id_tournament_type_key ON public.tournaments USING btree (season_id, tournament_type);


-- ============================================
-- FOREIGN KEY CONSTRAINTS
-- Added after all tables to avoid dependency issues
-- ============================================

ALTER TABLE fixture_audit_log ADD FOREIGN KEY (fixture_id) REFERENCES fixtures(id) ON DELETE CASCADE;

ALTER TABLE fixtures ADD FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;

ALTER TABLE lineup_submissions ADD FOREIGN KEY (fixture_id) REFERENCES fixtures(id) ON DELETE CASCADE;

ALTER TABLE lineup_substitutions ADD FOREIGN KEY (fixture_id) REFERENCES fixtures(id) ON DELETE CASCADE;

ALTER TABLE lineup_substitutions ADD FOREIGN KEY (lineup_id) REFERENCES lineups(id) ON DELETE CASCADE;

ALTER TABLE lineups ADD FOREIGN KEY (fixture_id) REFERENCES fixtures(id) ON DELETE CASCADE;

ALTER TABLE matches ADD FOREIGN KEY (fixture_id) REFERENCES fixtures(id) ON DELETE CASCADE;

ALTER TABLE news ADD FOREIGN KEY (poll_id) REFERENCES polls(poll_id) ON DELETE SET NULL;

ALTER TABLE poll_results ADD FOREIGN KEY (poll_id) REFERENCES polls(poll_id) ON DELETE CASCADE;

ALTER TABLE poll_votes ADD FOREIGN KEY (poll_id) REFERENCES polls(poll_id) ON DELETE CASCADE;

ALTER TABLE realplayerstats ADD FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;

ALTER TABLE teamstats ADD FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;

ALTER TABLE tournament_penalties ADD FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;

ALTER TABLE tournament_settings ADD FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;

ALTER TABLE tournament_team_groups ADD FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE;
