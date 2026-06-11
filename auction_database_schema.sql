-- ============================================
-- Database Schema Export: auction_database
-- Generated: 2026-04-27T08:32:23.653Z
-- ============================================

-- IMPORTANT NOTES:
-- 1. SERIAL and BIGSERIAL types automatically create sequences
-- 2. Foreign key constraints are added AFTER all tables are created
-- 3. Indexes use IF NOT EXISTS to prevent duplicate errors
-- 4. This file can be safely re-run on an existing database

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function: calculate_rpss_stats
CREATE OR REPLACE FUNCTION public.calculate_rpss_stats()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
      BEGIN
        IF NEW.matches_played > 0 THEN
          NEW.goals_per_game = ROUND(NEW.goals_scored::DECIMAL / NEW.matches_played, 2);
          NEW.conceded_per_game = ROUND(NEW.goals_conceded::DECIMAL / NEW.matches_played, 2);
          NEW.win_rate = ROUND((NEW.matches_won::DECIMAL / NEW.matches_played) * 100, 2);
        ELSE
          NEW.goals_per_game = 0.00;
          NEW.conceded_per_game = 0.00;
          NEW.win_rate = 0.00;
        END IF;
        NEW.net_goals = NEW.goals_scored - NEW.goals_conceded;
        RETURN NEW;
      END;
      $function$
;

-- Function: check_tiebreaker_winner
CREATE OR REPLACE FUNCTION public.check_tiebreaker_winner(tiebreaker_id_param character varying)
 RETURNS TABLE(teams_left integer, winner_team_id character varying, winner_bid integer)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as teams_left,
        MAX(CASE WHEN status = 'active' THEN team_id END)::VARCHAR(255) as winner_team_id,
        MAX(CASE WHEN status = 'active' THEN current_bid END)::INTEGER as winner_bid
    FROM bulk_tiebreaker_teams
    WHERE tiebreaker_id = tiebreaker_id_param
    AND status = 'active';
END;
$function$
;

-- Function: log_fixture_change
CREATE OR REPLACE FUNCTION public.log_fixture_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    change_record JSONB;
BEGIN
    -- Build changes JSON
    change_record := jsonb_build_object(
        'old', row_to_json(OLD),
        'new', row_to_json(NEW)
    );
    
    -- Insert audit log (if updated_by is set)
    IF NEW.updated_by IS NOT NULL AND NEW.updated_by <> OLD.updated_by THEN
        INSERT INTO fixture_audit_log (
            fixture_id,
            action_type,
            action_by,
            action_by_name,
            changes,
            season_id,
            round_number,
            match_number
        ) VALUES (
            NEW.id,
            CASE 
                WHEN OLD.status <> NEW.status AND NEW.status = 'completed' THEN 'result_submitted'
                WHEN OLD.home_score <> NEW.home_score OR OLD.away_score <> NEW.away_score THEN 'result_edited'
                WHEN OLD.match_status_reason <> NEW.match_status_reason THEN 
                    CASE NEW.match_status_reason
                        WHEN 'wo_home_absent' THEN 'wo_declared'
                        WHEN 'wo_away_absent' THEN 'wo_declared'
                        WHEN 'null_both_absent' THEN 'null_declared'
                        ELSE 'updated'
                    END
                ELSE 'updated'
            END,
            NEW.updated_by,
            NEW.updated_by_name,
            change_record,
            NEW.season_id,
            NEW.round_number,
            NEW.match_number
        );
    END IF;
    
    RETURN NEW;
END;
$function$
;

-- Function: update_auction_rounds_updated_at
CREATE OR REPLACE FUNCTION public.update_auction_rounds_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

-- Function: update_auction_settings_updated_at
CREATE OR REPLACE FUNCTION public.update_auction_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

-- Function: update_round_deadlines_updated_at
CREATE OR REPLACE FUNCTION public.update_round_deadlines_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

-- Function: update_rpss_updated_at
CREATE OR REPLACE FUNCTION public.update_rpss_updated_at()
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

-- Function: update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
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
-- Table: auction_settings
-- ============================================

CREATE TABLE IF NOT EXISTS auction_settings (
  id SERIAL NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  settings JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  contract_duration INTEGER DEFAULT 2,
  max_rounds INTEGER DEFAULT 25 NOT NULL,
  min_balance_per_round INTEGER DEFAULT 30 NOT NULL,
  max_squad_size INTEGER DEFAULT 25 NOT NULL,
  phase_1_end_round INTEGER DEFAULT 18,
  phase_1_min_balance INTEGER DEFAULT 30,
  phase_2_end_round INTEGER DEFAULT 20,
  phase_2_min_balance INTEGER DEFAULT 30,
  phase_3_min_balance INTEGER DEFAULT 10,
  auction_window VARCHAR(50) DEFAULT 'season_start'::character varying,
  PRIMARY KEY (id),
  UNIQUE (auction_window, season_id)
);

CREATE INDEX IF NOT EXISTS idx_auction_settings_window ON public.auction_settings USING btree (season_id, auction_window);

CREATE UNIQUE INDEX IF NOT EXISTS unique_season_auction_window ON public.auction_settings USING btree (season_id, auction_window);


-- ============================================
-- Table: bid_submissions
-- ============================================

CREATE TABLE IF NOT EXISTS bid_submissions (
  id SERIAL NOT NULL,
  team_id VARCHAR(50) NOT NULL,
  round_id VARCHAR(50) NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  bid_count INTEGER NOT NULL,
  is_locked BOOLEAN DEFAULT true,
  unlocked_at TIMESTAMP WITH TIME ZONE,
  unlocked_by VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (round_id, team_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS bid_submissions_team_id_round_id_key ON public.bid_submissions USING btree (team_id, round_id);

CREATE INDEX IF NOT EXISTS idx_bid_submissions_locked ON public.bid_submissions USING btree (is_locked);

CREATE INDEX IF NOT EXISTS idx_bid_submissions_round ON public.bid_submissions USING btree (round_id);

CREATE INDEX IF NOT EXISTS idx_bid_submissions_team ON public.bid_submissions USING btree (team_id);


-- ============================================
-- Table: bids
-- ============================================

CREATE TABLE IF NOT EXISTS bids (
  id VARCHAR(100) NOT NULL,
  round_id VARCHAR(50) NOT NULL,
  team_id VARCHAR(50) NOT NULL,
  team_name VARCHAR(255),
  player_id VARCHAR(255) NOT NULL,
  amount NUMERIC,
  encrypted_bid_data TEXT,
  status VARCHAR(50) DEFAULT 'pending'::character varying,
  phase VARCHAR(50) DEFAULT 'open'::character varying,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  season_id VARCHAR(255),
  actual_bid_amount INTEGER,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_bids_player_id ON public.bids USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_bids_round_id ON public.bids USING btree (round_id);

CREATE INDEX IF NOT EXISTS idx_bids_season_id ON public.bids USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_bids_status ON public.bids USING btree (status);

CREATE INDEX IF NOT EXISTS idx_bids_team_id ON public.bids USING btree (team_id);


-- ============================================
-- Table: bonus_points
-- ============================================

CREATE TABLE IF NOT EXISTS bonus_points (
  id SERIAL NOT NULL,
  target_type VARCHAR(10) NOT NULL,
  target_id VARCHAR(255) NOT NULL,
  points INTEGER NOT NULL,
  reason VARCHAR(500) NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  tournament_id VARCHAR(255) NOT NULL,
  awarded_by VARCHAR(255) NOT NULL,
  awarded_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_bonus_points_awarded_at ON public.bonus_points USING btree (awarded_at DESC);

CREATE INDEX IF NOT EXISTS idx_bonus_points_season ON public.bonus_points USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_bonus_points_target ON public.bonus_points USING btree (target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_bonus_points_tournament ON public.bonus_points USING btree (tournament_id);


-- ============================================
-- Table: bulk_tiebreaker_bids
-- ============================================

CREATE TABLE IF NOT EXISTS bulk_tiebreaker_bids (
  id SERIAL NOT NULL,
  tiebreaker_id VARCHAR(50) NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  team_name VARCHAR(255),
  bid_amount INTEGER NOT NULL,
  bid_time TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  season_id VARCHAR(255),
  PRIMARY KEY (id)
);


-- ============================================
-- Table: bulk_tiebreaker_teams
-- ============================================

CREATE TABLE IF NOT EXISTS bulk_tiebreaker_teams (
  id SERIAL NOT NULL,
  tiebreaker_id VARCHAR(50) NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  team_name VARCHAR(255),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  season_id VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active'::character varying,
  current_bid INTEGER,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  withdrawn_at TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bulk_tiebreaker_teams_unique ON public.bulk_tiebreaker_teams USING btree (tiebreaker_id, team_id);


-- ============================================
-- Table: bulk_tiebreakers
-- ============================================

CREATE TABLE IF NOT EXISTS bulk_tiebreakers (
  id VARCHAR(50) NOT NULL,
  bulk_round_id VARCHAR(50),
  season_id VARCHAR(255),
  player_id VARCHAR(255) NOT NULL,
  player_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active'::character varying,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  current_highest_bid INTEGER,
  current_highest_team_id VARCHAR(50),
  max_end_time TIMESTAMP WITH TIME ZONE,
  start_time TIMESTAMP WITH TIME ZONE,
  last_activity_time TIMESTAMP WITH TIME ZONE,
  teams_remaining INTEGER,
  base_price INTEGER,
  player_position VARCHAR(50),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_bulk_tiebreakers_bulk_round_id ON public.bulk_tiebreakers USING btree (bulk_round_id);

CREATE INDEX IF NOT EXISTS idx_bulk_tiebreakers_player_id ON public.bulk_tiebreakers USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_bulk_tiebreakers_season_id ON public.bulk_tiebreakers USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_bulk_tiebreakers_status ON public.bulk_tiebreakers USING btree (status);


-- ============================================
-- Table: football_slot_purchases
-- ============================================

CREATE TABLE IF NOT EXISTS football_slot_purchases (
  id SERIAL NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  slots_purchased INTEGER NOT NULL,
  price_per_slot NUMERIC NOT NULL,
  total_cost NUMERIC NOT NULL,
  purchased_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  purchased_by VARCHAR(255),
  notes TEXT,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_slot_purchases_date ON public.football_slot_purchases USING btree (purchased_at);

CREATE INDEX IF NOT EXISTS idx_slot_purchases_season ON public.football_slot_purchases USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_slot_purchases_team ON public.football_slot_purchases USING btree (team_id);


-- ============================================
-- Table: footballplayers
-- ============================================

CREATE TABLE IF NOT EXISTS footballplayers (
  id VARCHAR(255) NOT NULL,
  player_id VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  position VARCHAR(50),
  position_group VARCHAR(50),
  team_id VARCHAR(255),
  team_name VARCHAR(255),
  season_id VARCHAR(255),
  round_id VARCHAR(255),
  is_auction_eligible BOOLEAN DEFAULT true,
  is_sold BOOLEAN DEFAULT false,
  acquisition_value INTEGER,
  nationality VARCHAR(100),
  age INTEGER,
  club VARCHAR(255),
  playing_style VARCHAR(50),
  overall_rating INTEGER,
  offensive_awareness INTEGER,
  ball_control INTEGER,
  dribbling INTEGER,
  tight_possession INTEGER,
  low_pass INTEGER,
  lofted_pass INTEGER,
  finishing INTEGER,
  heading INTEGER,
  set_piece_taking INTEGER,
  curl INTEGER,
  speed INTEGER,
  acceleration INTEGER,
  kicking_power INTEGER,
  jumping INTEGER,
  physical_contact INTEGER,
  balance INTEGER,
  stamina INTEGER,
  defensive_awareness INTEGER,
  tackling INTEGER,
  aggression INTEGER,
  defensive_engagement INTEGER,
  gk_awareness INTEGER,
  gk_catching INTEGER,
  gk_parrying INTEGER,
  gk_reflexes INTEGER,
  gk_reach INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  contract_id VARCHAR(100),
  contract_start_season VARCHAR(20),
  contract_end_season VARCHAR(20),
  contract_length INTEGER DEFAULT 2,
  status VARCHAR(50) DEFAULT 'free_agent'::character varying,
  is_auto_registered BOOLEAN DEFAULT false,
  PRIMARY KEY (id),
  UNIQUE (player_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS footballplayers_player_id_key ON public.footballplayers USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_fp_position ON public.footballplayers USING btree ("position");

CREATE INDEX IF NOT EXISTS idx_fp_season ON public.footballplayers USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_fp_sold ON public.footballplayers USING btree (is_sold);

CREATE INDEX IF NOT EXISTS idx_fp_team ON public.footballplayers USING btree (team_id);


-- ============================================
-- Table: pending_allocations
-- ============================================

CREATE TABLE IF NOT EXISTS pending_allocations (
  id SERIAL NOT NULL,
  round_id VARCHAR(255) NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  team_name VARCHAR(255) NOT NULL,
  player_id VARCHAR(255) NOT NULL,
  player_name VARCHAR(255) NOT NULL,
  amount INTEGER NOT NULL,
  bid_id VARCHAR(255),
  phase VARCHAR(20) NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (round_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_pending_allocations_player ON public.pending_allocations USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_pending_allocations_round ON public.pending_allocations USING btree (round_id);

CREATE INDEX IF NOT EXISTS idx_pending_allocations_team ON public.pending_allocations USING btree (team_id);

CREATE UNIQUE INDEX IF NOT EXISTS pending_allocations_round_id_team_id_key ON public.pending_allocations USING btree (round_id, team_id);


-- ============================================
-- Table: player_history
-- ============================================

CREATE TABLE IF NOT EXISTS player_history (
  id SERIAL NOT NULL,
  player_id VARCHAR(255) NOT NULL,
  player_name VARCHAR(255) NOT NULL,
  position VARCHAR(50),
  team_id VARCHAR(255) NOT NULL,
  team_name VARCHAR(255) NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  acquisition_type VARCHAR(50) NOT NULL,
  acquisition_value INTEGER,
  acquisition_date TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active'::character varying,
  end_date TIMESTAMP WITHOUT TIME ZONE,
  end_reason VARCHAR(50),
  round_id VARCHAR(255),
  transaction_id VARCHAR(255),
  related_history_id INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  contract_start_season VARCHAR(50),
  contract_end_season VARCHAR(50),
  position_group VARCHAR(50),
  overall_rating INTEGER,
  nationality VARCHAR(100),
  age INTEGER,
  playing_style VARCHAR(100),
  club VARCHAR(255),
  is_sold BOOLEAN DEFAULT true,
  speed INTEGER,
  acceleration INTEGER,
  ball_control INTEGER,
  dribbling INTEGER,
  low_pass INTEGER,
  lofted_pass INTEGER,
  finishing INTEGER,
  heading INTEGER,
  physical_contact INTEGER,
  stamina INTEGER,
  defensive_awareness INTEGER,
  ball_winning INTEGER,
  aggression INTEGER,
  gk_reflexes INTEGER,
  gk_reach INTEGER,
  gk_handling INTEGER,
  weak_foot_usage INTEGER,
  weak_foot_accuracy INTEGER,
  form INTEGER,
  injury_resistance INTEGER,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_player_history_contract_seasons ON public.player_history USING btree (contract_start_season, contract_end_season);

CREATE INDEX IF NOT EXISTS idx_player_history_player_id ON public.player_history USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_player_history_player_team_season ON public.player_history USING btree (player_id, team_id, season_id);

CREATE INDEX IF NOT EXISTS idx_player_history_season_id ON public.player_history USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_player_history_status ON public.player_history USING btree (status);

CREATE INDEX IF NOT EXISTS idx_player_history_team_id ON public.player_history USING btree (team_id);


-- ============================================
-- Table: round_bids
-- ============================================

CREATE TABLE IF NOT EXISTS round_bids (
  id SERIAL NOT NULL,
  round_id VARCHAR(50) NOT NULL,
  player_id VARCHAR(255) NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  team_name VARCHAR(255),
  bid_amount INTEGER NOT NULL,
  bid_time TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_winning BOOLEAN DEFAULT false,
  season_id VARCHAR(255),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_round_bids_round ON public.round_bids USING btree (round_id);


-- ============================================
-- Table: round_players
-- ============================================

CREATE TABLE IF NOT EXISTS round_players (
  id SERIAL NOT NULL,
  round_id VARCHAR(50) NOT NULL,
  player_id VARCHAR(255) NOT NULL,
  player_name VARCHAR(255),
  position VARCHAR(50),
  position_group VARCHAR(50),
  base_price INTEGER DEFAULT 10,
  status VARCHAR(50) DEFAULT 'pending'::character varying,
  winning_team_id VARCHAR(255),
  winning_bid INTEGER,
  bid_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  season_id VARCHAR(255),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_round_players_season_id ON public.round_players USING btree (season_id);


-- ============================================
-- Table: rounds
-- ============================================

CREATE TABLE IF NOT EXISTS rounds (
  id VARCHAR(50) NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  position VARCHAR(50),
  position_group VARCHAR(50),
  round_number INTEGER,
  round_type VARCHAR(50) DEFAULT 'normal'::character varying,
  max_bids_per_team INTEGER DEFAULT 5,
  base_price INTEGER DEFAULT 10,
  duration_seconds INTEGER DEFAULT 300,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50) DEFAULT 'active'::character varying,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  auction_window VARCHAR(50) DEFAULT 'season_start'::character varying,
  auction_settings_id INTEGER,
  finalization_mode VARCHAR(20) DEFAULT 'auto'::character varying,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_rounds_auction_window ON public.rounds USING btree (season_id, auction_window);

CREATE INDEX IF NOT EXISTS idx_rounds_position ON public.rounds USING btree ("position");

CREATE INDEX IF NOT EXISTS idx_rounds_season_id ON public.rounds USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_rounds_status ON public.rounds USING btree (status);


-- ============================================
-- Table: starred_players
-- ============================================

CREATE TABLE IF NOT EXISTS starred_players (
  id SERIAL NOT NULL,
  user_id VARCHAR(255),
  player_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  team_id VARCHAR(255) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE (player_id, team_id),
  UNIQUE (player_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_starred_players_player_id ON public.starred_players USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_starred_players_team_id ON public.starred_players USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_starred_players_team_player ON public.starred_players USING btree (team_id, player_id);

CREATE INDEX IF NOT EXISTS idx_starred_user ON public.starred_players USING btree (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS starred_players_team_id_player_id_key ON public.starred_players USING btree (team_id, player_id);

CREATE UNIQUE INDEX IF NOT EXISTS starred_players_user_id_player_id_key ON public.starred_players USING btree (user_id, player_id);


-- ============================================
-- Table: team_players
-- ============================================

CREATE TABLE IF NOT EXISTS team_players (
  id SERIAL NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  player_id VARCHAR(255) NOT NULL,
  season_id VARCHAR(255) NOT NULL,
  round_id VARCHAR(255),
  purchase_price INTEGER NOT NULL,
  acquired_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (player_id, season_id)
);

CREATE INDEX IF NOT EXISTS idx_team_players_player_id ON public.team_players USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_team_players_round_id ON public.team_players USING btree (round_id);

CREATE INDEX IF NOT EXISTS idx_team_players_season_id ON public.team_players USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_team_players_team_id ON public.team_players USING btree (team_id);

CREATE UNIQUE INDEX IF NOT EXISTS team_players_player_id_season_id_key ON public.team_players USING btree (player_id, season_id);


-- ============================================
-- Table: team_tiebreakers
-- ============================================

CREATE TABLE IF NOT EXISTS team_tiebreakers (
  id VARCHAR(100) NOT NULL,
  tiebreaker_id VARCHAR(50) NOT NULL,
  team_id VARCHAR(50) NOT NULL,
  team_name VARCHAR(255),
  bid_amount NUMERIC,
  old_bid_amount NUMERIC DEFAULT 0,
  new_bid_amount NUMERIC DEFAULT 0,
  encrypted_amount TEXT,
  status VARCHAR(50) DEFAULT 'pending'::character varying,
  submitted BOOLEAN DEFAULT false,
  submitted_at TIMESTAMP WITH TIME ZONE,
  original_bid_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  season_id VARCHAR(255),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_team_tiebreakers_season_id ON public.team_tiebreakers USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_team_tiebreakers_status ON public.team_tiebreakers USING btree (status);

CREATE INDEX IF NOT EXISTS idx_team_tiebreakers_team_id ON public.team_tiebreakers USING btree (team_id);

CREATE INDEX IF NOT EXISTS idx_team_tiebreakers_tiebreaker_id ON public.team_tiebreakers USING btree (tiebreaker_id);


-- ============================================
-- Table: teams
-- ============================================

CREATE TABLE IF NOT EXISTS teams (
  id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  firebase_uid VARCHAR(255),
  season_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  football_budget NUMERIC DEFAULT 0,
  football_spent NUMERIC DEFAULT 0,
  football_players_count INTEGER DEFAULT 0 NOT NULL,
  football_purchased_slots INTEGER DEFAULT 0,
  football_total_slots INTEGER DEFAULT 25,
  football_base_slots INTEGER DEFAULT 25,
  PRIMARY KEY (id),
  UNIQUE (firebase_uid)
);

CREATE INDEX IF NOT EXISTS idx_teams_firebase_uid ON public.teams USING btree (firebase_uid);

CREATE INDEX IF NOT EXISTS idx_teams_season_id ON public.teams USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_teams_total_slots ON public.teams USING btree (football_total_slots);

CREATE UNIQUE INDEX IF NOT EXISTS teams_firebase_uid_key ON public.teams USING btree (firebase_uid);


-- ============================================
-- Table: tiebreakers
-- ============================================

CREATE TABLE IF NOT EXISTS tiebreakers (
  id VARCHAR(50) NOT NULL,
  round_id VARCHAR(50),
  season_id VARCHAR(255),
  player_id VARCHAR(255) NOT NULL,
  player_name VARCHAR(255),
  original_amount NUMERIC,
  tied_teams JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'active'::character varying,
  duration_minutes INTEGER,
  winning_team_id VARCHAR(50),
  winning_amount NUMERIC,
  winning_bid NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_tiebreakers_player_id ON public.tiebreakers USING btree (player_id);

CREATE INDEX IF NOT EXISTS idx_tiebreakers_round_id ON public.tiebreakers USING btree (round_id);

CREATE INDEX IF NOT EXISTS idx_tiebreakers_season_id ON public.tiebreakers USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_tiebreakers_status ON public.tiebreakers USING btree (status);


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
  include_in_fantasy BOOLEAN DEFAULT true,
  include_in_awards BOOLEAN DEFAULT true,
  has_league_stage BOOLEAN DEFAULT true,
  has_group_stage BOOLEAN DEFAULT false,
  group_assignment_mode TEXT DEFAULT 'auto'::text,
  number_of_groups INTEGER DEFAULT 4,
  teams_per_group INTEGER DEFAULT 4,
  teams_advancing_per_group INTEGER DEFAULT 2,
  has_knockout_stage BOOLEAN DEFAULT false,
  playoff_teams INTEGER DEFAULT 4,
  direct_semifinal_teams INTEGER DEFAULT 2,
  qualification_threshold INTEGER DEFAULT 75,
  is_pure_knockout BOOLEAN DEFAULT false,
  rewards JSONB,
  number_of_teams INTEGER DEFAULT 16,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (season_id, tournament_type)
);

CREATE INDEX IF NOT EXISTS idx_tournaments_is_primary ON public.tournaments USING btree (is_primary) WHERE (is_primary = true);

CREATE INDEX IF NOT EXISTS idx_tournaments_rewards ON public.tournaments USING gin (rewards);

CREATE INDEX IF NOT EXISTS idx_tournaments_season_id ON public.tournaments USING btree (season_id);

CREATE INDEX IF NOT EXISTS idx_tournaments_status ON public.tournaments USING btree (status);

CREATE UNIQUE INDEX IF NOT EXISTS tournaments_season_id_tournament_type_key ON public.tournaments USING btree (season_id, tournament_type);


-- ============================================
-- FOREIGN KEY CONSTRAINTS
-- Added after all tables to avoid dependency issues
-- ============================================

ALTER TABLE bids ADD FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE;

ALTER TABLE bids ADD FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;

ALTER TABLE football_slot_purchases ADD FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;

ALTER TABLE round_bids ADD FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE;

ALTER TABLE round_players ADD FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE;

ALTER TABLE rounds ADD FOREIGN KEY (auction_settings_id) REFERENCES auction_settings(id) ON DELETE SET NULL;

ALTER TABLE team_tiebreakers ADD FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;

ALTER TABLE team_tiebreakers ADD FOREIGN KEY (tiebreaker_id) REFERENCES tiebreakers(id) ON DELETE CASCADE;

ALTER TABLE tiebreakers ADD FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE;

ALTER TABLE tiebreakers ADD FOREIGN KEY (winning_team_id) REFERENCES teams(id) ON DELETE SET NULL;
