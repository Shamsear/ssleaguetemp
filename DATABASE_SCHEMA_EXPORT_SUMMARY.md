# Database Schema Export Summary

## Overview
Successfully exported complete SQL schemas for all three databases with proper SERIAL type handling.

## Generated Files

### 1. auction_database_schema.sql (28.46 KB)
**Connection:** `NEON_AUCTION_DB_URL` / `DATABASE_URL`

**Tables (20):**
- `auction_settings` - Auction configuration and settings
- `bid_submissions` - Tracks when teams submit bids
- `bids` - All bids placed by teams
- `bonus_points` - Bonus points system
- `bulk_tiebreaker_bids` - Bids during tiebreaker auctions
- `bulk_tiebreaker_teams` - Teams participating in tiebreakers
- `bulk_tiebreakers` - Tiebreaker auction management
- `football_slot_purchases` - Squad slot purchase history
- `footballplayers` - Main player database with attributes
- `pending_allocations` - Preview finalization results
- `player_history` - Historical player data
- `round_bids` - Bids during auction rounds
- `round_players` - Players assigned to rounds
- `rounds` - Auction rounds
- `starred_players` - Players marked as favorites
- `team_players` - Players acquired by teams
- `team_tiebreakers` - Team tiebreaker tracking
- `teams` - Team information and budgets
- `tiebreakers` - Tiebreaker management
- `tournaments` - Tournament data

**Functions (9):**
- `calculate_rpss_stats` - Calculate team statistics
- `check_tiebreaker_winner` - Determine tiebreaker winner
- `log_fixture_change` - Audit trail for fixtures
- `update_auction_settings_updated_at` - Timestamp trigger
- `update_footballplayers_updated_at` - Timestamp trigger
- `update_rounds_updated_at` - Timestamp trigger
- `update_team_players_updated_at` - Timestamp trigger
- `update_teams_updated_at` - Timestamp trigger
- `update_tournaments_updated_at` - Timestamp trigger

---

### 2. tournament_database_schema.sql (53.97 KB)
**Connection:** `NEON_TOURNAMENT_DB_URL`

**Tables (35):**
- `awards` - Player awards system
- `fcm_tokens` - Firebase Cloud Messaging tokens
- `fixture_audit_log` - Fixture change audit trail
- `fixtures` - Tournament fixtures
- `leaderboards` - Tournament leaderboards
- `lineup_audit_log` - Lineup change audit trail
- `lineup_submissions` - Blind lineup submissions
- `lineup_substitutions` - Player substitutions
- `lineups` - Match lineups
- `managers` - Team managers
- `match_days` - Match day scheduling
- `matches` - Individual matches
- `matchups` - Match pairings
- `news` - News articles
- `news_reaction_counts` - News reaction statistics
- `news_reactions` - User reactions to news
- `owners` - Team owners
- `player_awards` - Player award records
- `player_seasons` - Player statistics per season
- `poll_results` - Poll result cache
- `poll_vote_flags` - Suspicious voting patterns
- `poll_votes` - Individual poll votes
- `polls` - Fan polls
- `realplayerstats` - Real player statistics
- `round_deadlines` - Round deadline management
- `team_players` - Team rosters
- `team_trophies` - Team trophy records
- `team_violations` - Team penalty tracking
- `teamstats` - Team statistics
- `teamstats_old2` - Legacy team stats
- `tournament_penalties` - Tournament penalties
- `tournament_rewards_distributed` - Reward distribution tracking
- `tournament_settings` - Tournament configuration
- `tournament_team_groups` - Group stage assignments
- `tournaments` - Tournament definitions

**Functions (4):**
- `log_fixture_change` - Audit trail for fixtures
- `log_lineup_change` - Audit trail for lineups
- `update_fixtures_updated_at` - Timestamp trigger
- `update_tournaments_updated_at` - Timestamp trigger

---

### 3. fantasy_database_schema.sql (37.33 KB)
**Connection:** `FANTASY_DATABASE_URL`

**Tables (29):**
- `bonus_points` - Fantasy bonus points
- `fantasy_achievements` - Achievement definitions
- `fantasy_challenge_completions` - Completed challenges
- `fantasy_challenges` - Challenge system
- `fantasy_chat_messages` - League chat
- `fantasy_draft_tiers` - Draft tier system
- `fantasy_drafts` - Draft management
- `fantasy_h2h_fixtures` - Head-to-head fixtures
- `fantasy_h2h_standings` - H2H league standings
- `fantasy_leaderboard` - Fantasy leaderboard
- `fantasy_leagues` - Fantasy league configuration
- `fantasy_player_points` - Player points per round
- `fantasy_players` - Fantasy player pool
- `fantasy_power_up_usage` - Power-up usage tracking
- `fantasy_power_ups` - Power-up definitions
- `fantasy_predictions` - Match predictions
- `fantasy_rounds` - Fantasy round tracking
- `fantasy_scoring_rules` - Scoring configuration
- `fantasy_squad` - Team squads
- `fantasy_team_achievements` - Team achievement progress
- `fantasy_team_bonus_points` - Team bonus points
- `fantasy_teams` - Fantasy teams
- `fantasy_tier_bids` - Tier draft bids
- `fantasy_transfer_windows` - Transfer window management
- `fantasy_transfers` - Player transfers
- `fixture_difficulty_ratings` - Fixture difficulty
- `scoring_rules` - Scoring rules
- `supported_team_changes` - Team affiliation changes
- `transfer_windows` - Transfer window definitions

**Functions:** None

---

## Key Features

### ✅ Fixed Issues
- **SERIAL Types:** All auto-increment columns now use `SERIAL` or `BIGSERIAL` instead of `nextval()` references
- **Sequences:** Automatically created by PostgreSQL when using SERIAL types
- **No Missing Dependencies:** All sequences are implicitly created
- **Duplicate Constraints:** Fixed duplicate PRIMARY KEY and UNIQUE constraints in composite keys
- **Proper Constraint Grouping:** Composite keys are now properly grouped into single constraints
- **Trigger Re-execution:** All triggers now use `DROP TRIGGER IF EXISTS` before creation to allow safe re-runs

### 📋 What's Included
- Complete table definitions with all columns
- Primary keys, foreign keys, and unique constraints
- Check constraints with validation rules
- All indexes for performance optimization
- Triggers for automated updates (timestamps, calculations)
- Functions used by triggers and stored procedures
- Proper data types and default values
- NOT NULL constraints
- ON DELETE/UPDATE rules for foreign keys

### 🔧 Usage

To create a new database from these schemas:

```bash
# Create database
createdb your_database_name

# Import schema (can be run multiple times safely)
psql your_database_name < auction_database_schema.sql
psql your_database_name < tournament_database_schema.sql
psql your_database_name < fantasy_database_schema.sql
```

Or using connection strings:

```bash
psql "postgresql://user:pass@host:5432/dbname?sslmode=require" < auction_database_schema.sql
```

**Note:** The schemas are idempotent and can be safely re-run on existing databases:
- Tables use `CREATE TABLE IF NOT EXISTS`
- Indexes use `CREATE INDEX IF NOT EXISTS`
- Triggers use `DROP TRIGGER IF EXISTS` before creation
- Functions use `CREATE OR REPLACE FUNCTION`

### 📝 Notes

1. **SERIAL vs INTEGER:** The export now uses `SERIAL` type which automatically:
   - Creates a sequence named `<table>_<column>_seq`
   - Sets the column default to `nextval('<table>_<column>_seq')`
   - Makes the column NOT NULL by default

2. **Order of Execution:** Tables are created in alphabetical order. Foreign key constraints are included, so you may need to disable them temporarily if there are circular dependencies.

3. **Triggers and Functions:** Functions are exported before tables since triggers depend on them.

4. **Indexes:** All indexes except primary key indexes are explicitly created.

## Export Script

The export script is located at: `scripts/export-database-schemas.js`

To regenerate schemas:
```bash
node scripts/export-database-schemas.js
```

## Database Connections

The script reads from `.env.local`:
- `NEON_AUCTION_DB_URL` or `DATABASE_URL` → auction_database_schema.sql
- `NEON_TOURNAMENT_DB_URL` → tournament_database_schema.sql
- `FANTASY_DATABASE_URL` → fantasy_database_schema.sql
