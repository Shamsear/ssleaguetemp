# Fantasy League System - Complete Explanation

> **Purpose**: This document provides a comprehensive explanation of how the fantasy league system works, including its architecture, connections to tournaments/seasons/teams, and how to make changes.

---

## Table of Contents
1. [System Overview](#1-system-overview)
2. [How Fantasy League Connects to Tournament System](#2-how-fantasy-league-connects-to-tournament-system)
3. [Database Architecture](#3-database-architecture)
4. [User Journey & Flow](#4-user-journey--flow)
5. [Key Features](#5-key-features)
6. [API Reference](#6-api-reference)
7. [Frontend Pages](#7-frontend-pages)
8. [How to Make Changes](#8-how-to-make-changes)
9. [Common Modifications Guide](#9-common-modifications-guide)

---

## 1. System Overview

### What is the Fantasy League?

The fantasy league is a **season-long fantasy football competition** where teams:
- Draft real players (footballers) to build a fantasy squad
- Earn points automatically based on player performance in actual matches
- Compete against other teams on a leaderboard
- Use captain multipliers (2x points) for strategic advantage
- Earn passive bonuses when their supported real team performs well

### Key Characteristics

**Automatic System**: No weekly lineup setting required (simplified)
**Captain System**: Select captain (2x) and vice-captain (1.5x) for bonus points
**Passive Bonuses**: Earn points when your supported team wins/performs well
**Transfer System**: Make transfers during designated windows
**Budget Management**: €100M budget to draft 11-15 players


---

## 2. How Fantasy League Connects to Tournament System

### A. Season → Fantasy League Connection

Every season automatically gets a fantasy league:

```typescript
// Season ID Format:    SSPSLS16
// Fantasy League ID:   SSPSLFLS16
//                      ^^^^^^^^ - Same season number

// The league is created via:
GET /api/fantasy/leagues?season_id=SSPSLS16
// Auto-creates league if it doesn't exist
```

**Database Relationship:**
```sql
fantasy_leagues.season_id → seasons.id (Tournament DB)
fantasy_leagues.league_id → Generated as SSPSLFLS{season_number}
```

### B. Team → Fantasy Team Connection

When a team registers for a season, they can opt into fantasy:

```typescript
// Registration Flow (committee admin):
1. Admin registers team for season
2. Team opts in: "Join Fantasy League (Optional)" ✓
3. Creates entry in fantasy_teams table (PostgreSQL)
4. Updates team document (Firebase):
   - fantasy_participating: true
   - fantasy_league_id: "SSPSLFLS16"
   - fantasy_player_points: 0
   - fantasy_team_bonus_points: 0
   - fantasy_total_points: 0
```

**Database Relationship:**
```sql
fantasy_teams.team_id → teams.id (Firebase)
fantasy_teams.league_id → fantasy_leagues.league_id
fantasy_teams.owner_uid → users.uid (Firebase)
```


### C. Tournament Round → Fantasy Round Connection

Fantasy points are calculated per tournament round:

```sql
-- fantasy_rounds table links fantasy to tournaments
CREATE TABLE fantasy_rounds (
  fantasy_round_id VARCHAR(100) PRIMARY KEY,  -- Unique fantasy round ID
  league_id VARCHAR(100),                     -- SSPSLFLS16
  round_id VARCHAR(50),                       -- Tournament round ID
  round_number INTEGER,                       -- Round 1, 2, 3...
  is_active BOOLEAN,
  is_completed BOOLEAN,
  points_calculated BOOLEAN                   -- Points calculated for this round?
)
```

**Flow:**
1. Tournament creates fixture (e.g., Team A vs Team B)
2. Fixture assigned to Round 5
3. Fixture completes → Fantasy system calculates points for Round 5
4. Updates fantasy_player_points with round_number = 5

### D. Real Player → Fantasy Draft Connection

Real players (footballers) are draftable in fantasy:

```sql
-- Real players stored in Tournament DB
realplayers (PostgreSQL - Tournament DB)
  ├── player_id (unique)
  ├── player_name
  ├── position
  ├── star_rating (1-10)
  └── real_team_id

-- Fantasy draft links to real players
fantasy_drafts (PostgreSQL - Fantasy DB)
  ├── real_player_id → realplayers.player_id
  ├── team_id (fantasy team)
  ├── draft_price (based on star_rating)
  └── draft_order
```

**Pricing Example:**
```javascript
// Player pricing based on star rating
const starRatingPrices = {
  "1": 2.00,   // 1★ = €2M
  "3": 5.00,   // 3★ = €5M
  "5": 15.00,  // 5★ = €15M
  "10": 40.00  // 10★ = €40M
}
```


### E. Match Result → Fantasy Points Connection

After a fixture completes, fantasy points are calculated:

```typescript
// Fixture completes in tournament system
fixture_results (PostgreSQL - Tournament DB)
  ├── fixture_id
  ├── home_team_id
  ├── away_team_id
  ├── home_score
  ├── away_score
  └── status: 'completed'

// Triggers fantasy points calculation
POST /api/fantasy/calculate-points
  1. Fetches fixture results
  2. Gets player stats (goals, assists, clean sheets)
  3. Applies scoring rules
  4. Calculates captain multipliers
  5. Stores in fantasy_player_points
```

---

## 3. Database Architecture

### Database Layers

The fantasy system uses **4 separate databases**:

1. **Fantasy Database** (PostgreSQL - Neon)
   - Connection: `FANTASY_DATABASE_URL`
   - All fantasy-specific data
   - 20+ tables for fantasy operations

2. **Tournament Database** (PostgreSQL - Neon)
   - Connection: `NEON_TOURNAMENT_DB_URL`
   - Seasons, fixtures, rounds, real players
   - Source of truth for match data

3. **Auction Database** (PostgreSQL - Neon)
   - Connection: `NEON_DATABASE_URL`
   - Football player auction system (separate from fantasy)
   - Bidding, tiebreakers, auction rounds

4. **Firebase** (Firestore + Realtime DB)
   - Team and user management
   - Real-time updates
   - Authentication


### Core Fantasy Database Tables

#### 1. fantasy_leagues
**Purpose**: One league per season

```sql
CREATE TABLE fantasy_leagues (
  league_id VARCHAR(100) PRIMARY KEY,       -- SSPSLFLS16
  season_id VARCHAR(100),                   -- SSPSLS16
  season_name VARCHAR(255),
  league_name VARCHAR(255),
  
  -- Configuration
  budget_per_team NUMERIC DEFAULT 100.00,   -- €100M draft budget
  max_squad_size INTEGER DEFAULT 15,        -- Max 15 players
  min_squad_size INTEGER DEFAULT 11,        -- Min 11 players
  starting_lineup_size INTEGER DEFAULT 5,   -- 5 starters required
  
  -- Draft Period
  draft_status VARCHAR(20),                 -- 'pending' | 'active' | 'closed'
  draft_opens_at TIMESTAMP,
  draft_closes_at TIMESTAMP,
  
  -- Transfer Rules
  max_transfers_per_window INTEGER DEFAULT 2,
  points_cost_per_transfer INTEGER DEFAULT 4,
  
  -- Pricing
  star_rating_prices JSONB,                 -- {"1": 2.00, "5": 15.00, ...}
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

#### 2. fantasy_teams
**Purpose**: One entry per team participating in fantasy

```sql
CREATE TABLE fantasy_teams (
  team_id VARCHAR(100) PRIMARY KEY,         -- Links to Firebase team
  league_id VARCHAR(100),                   -- SSPSLFLS16
  
  -- Team Info
  team_name VARCHAR(255),
  owner_uid VARCHAR(100),                   -- Firebase user ID
  owner_name VARCHAR(255),
  real_team_id VARCHAR(100),                -- Base team ID
  real_team_name VARCHAR(255),
  
  -- Budget & Points
  budget_remaining NUMERIC,                 -- Remaining draft budget
  total_points INTEGER DEFAULT 0,
  rank INTEGER DEFAULT 999,
  
  -- Passive Bonuses
  supported_team_id VARCHAR(100),           -- Team for passive bonuses
  supported_team_name VARCHAR(255),
  passive_points INTEGER DEFAULT 0,
  
  -- Status
  draft_submitted BOOLEAN DEFAULT false,
  is_enabled BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```


#### 3. fantasy_squad
**Purpose**: Players owned by each fantasy team

```sql
CREATE TABLE fantasy_squad (
  squad_id VARCHAR(100) PRIMARY KEY,
  team_id VARCHAR(100),                     -- Fantasy team
  league_id VARCHAR(100),
  
  -- Player Info
  real_player_id VARCHAR(100),              -- Links to realplayers
  player_name VARCHAR(255),
  position VARCHAR(50),
  real_team_name VARCHAR(255),
  
  -- Financial
  purchase_price NUMERIC,                   -- Draft price
  current_value NUMERIC,                    -- Current market value
  
  -- Performance
  total_points INTEGER DEFAULT 0,
  matches_played INTEGER DEFAULT 0,
  
  -- Lineup Status
  is_captain BOOLEAN DEFAULT false,         -- 2x points
  is_vice_captain BOOLEAN DEFAULT false,    -- 1.5x if captain absent
  is_starter BOOLEAN DEFAULT false,
  bench_order INTEGER,
  
  -- Metadata
  acquisition_type VARCHAR(50),             -- 'draft' | 'transfer' | 'trade'
  acquired_at TIMESTAMP DEFAULT NOW()
)
```

#### 4. fantasy_drafts
**Purpose**: Historical record of all drafts

```sql
CREATE TABLE fantasy_drafts (
  draft_id VARCHAR(100) PRIMARY KEY,
  league_id VARCHAR(100),
  team_id VARCHAR(100),
  
  real_player_id VARCHAR(100),
  player_name VARCHAR(255),
  position VARCHAR(50),
  real_team_name VARCHAR(255),
  
  draft_price NUMERIC,
  draft_order INTEGER,                      -- Pick number (1, 2, 3...)
  
  drafted_at TIMESTAMP DEFAULT NOW()
)
```


#### 5. fantasy_player_points
**Purpose**: Points earned by players in each fixture

```sql
CREATE TABLE fantasy_player_points (
  id SERIAL PRIMARY KEY,
  league_id VARCHAR(100),
  team_id VARCHAR(100),                     -- Fantasy team owning player
  real_player_id VARCHAR(100),
  player_name VARCHAR(255),
  
  -- Match Context
  fixture_id VARCHAR(100),
  round_number INTEGER,
  opponent VARCHAR(255),
  result VARCHAR(10),                       -- 'win' | 'draw' | 'loss'
  
  -- Performance Stats
  goals_scored INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  goals_conceded INTEGER DEFAULT 0,
  clean_sheet BOOLEAN DEFAULT false,
  motm BOOLEAN DEFAULT false,               -- Man of the Match
  yellow_cards INTEGER DEFAULT 0,
  red_cards INTEGER DEFAULT 0,
  minutes_played INTEGER DEFAULT 0,
  
  -- Points Calculation
  base_points INTEGER DEFAULT 0,            -- Before multipliers
  bonus_points INTEGER DEFAULT 0,
  captain_bonus INTEGER DEFAULT 0,          -- Extra from captain multiplier
  total_points INTEGER DEFAULT 0,
  
  -- Multipliers
  is_captain BOOLEAN DEFAULT false,
  is_vice_captain BOOLEAN DEFAULT false,
  points_multiplier NUMERIC DEFAULT 1.0,    -- 2.0 for captain
  
  -- Breakdown (JSON)
  points_breakdown JSONB,                   -- Detailed scoring
  
  calculated_at TIMESTAMP DEFAULT NOW()
)
```

**Points Breakdown Example:**
```json
{
  "goals": 10,           // 2 goals × 5 points
  "assists": 3,          // 1 assist × 3 points
  "clean_sheet": 3,
  "motm": 5,
  "captain_bonus": 21,   // (10+3+3+5) × 1 (2x total - base)
  "total": 42            // Base 21 × 2 (captain)
}
```


#### 6. fantasy_scoring_rules
**Purpose**: Configurable point values for different actions

```sql
CREATE TABLE fantasy_scoring_rules (
  rule_id VARCHAR(100) PRIMARY KEY,
  league_id VARCHAR(100),
  
  rule_type VARCHAR(100),                   -- See types below
  points_value INTEGER,                     -- Can be negative
  description TEXT,
  
  -- Position-specific rules
  applies_to_positions TEXT[],              -- ['FWD', 'MID'] or empty for all
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

**Standard Rule Types:**
```typescript
type ScoringRuleType = 
  | 'goals_scored'         // +5 points
  | 'assists'              // +3 points
  | 'clean_sheet'          // +3 points (DEF/GK only)
  | 'motm'                 // +5 points
  | 'goals_conceded'       // -1 point (DEF/GK)
  | 'yellow_card'          // -1 point
  | 'red_card'             // -3 points
  | 'substitution_penalty' // -2 points
  | 'full_90_minutes'      // +2 points
  | 'hat_trick'            // +5 bonus
  | 'brace'                // +3 bonus
  | 'win'                  // +1 point
  | 'draw'                 // +0 points
  | 'loss'                 // -1 point
```

#### 7. fantasy_transfers
**Purpose**: Track player transfers between teams

```sql
CREATE TABLE fantasy_transfers (
  transfer_id VARCHAR(100) PRIMARY KEY,
  league_id VARCHAR(100),
  team_id VARCHAR(100),
  
  -- Transfer Details
  player_out_id VARCHAR(100),
  player_out_name VARCHAR(255),
  player_in_id VARCHAR(100),
  player_in_name VARCHAR(255),
  
  transfer_cost INTEGER,                    -- Points deducted (e.g., -4)
  
  status VARCHAR(20),                       -- 'pending' | 'completed' | 'rejected'
  
  transferred_at TIMESTAMP DEFAULT NOW()
)
```


#### 8. fantasy_team_bonus_points
**Purpose**: Passive bonuses from supported team performance

```sql
CREATE TABLE fantasy_team_bonus_points (
  bonus_id VARCHAR(100) PRIMARY KEY,
  league_id VARCHAR(100),
  team_id VARCHAR(100),                     -- Fantasy team
  supported_team_id VARCHAR(100),           -- Real team providing bonus
  
  round_number INTEGER,
  match_id VARCHAR(100),
  
  bonus_type VARCHAR(50),                   -- See types below
  points_awarded INTEGER,
  reason TEXT,
  
  awarded_at TIMESTAMP DEFAULT NOW()
)
```

**Bonus Types:**
```typescript
type BonusType = 
  | 'win'               // +5 points when supported team wins
  | 'clean_sheet'       // +3 points for clean sheet
  | 'high_scoring'      // +2 points for 3+ goals scored
  | 'weekly_top_scorer' // +3 points if player is top scorer of round
  | 'winning_streak'    // +5 points for 3+ consecutive wins
```

#### 9. Additional Tables

**fantasy_rounds** - Links fantasy to tournament rounds
**fantasy_transfer_windows** - Defines when transfers are allowed
**fantasy_leaderboard** - Pre-computed rankings (performance optimization)
**fantasy_predictions** - Match prediction mini-games
**fantasy_h2h_fixtures** - Head-to-head matchups between teams
**fantasy_challenges** - Weekly challenges for bonus points
**fantasy_achievements** - Unlockable badges/achievements
**fantasy_power_ups** - Special abilities (triple captain, wildcard)
**fantasy_chat_messages** - League chat system
**bonus_points** - Admin-awarded bonus points (POTD, POTW)


---

## 4. User Journey & Flow

### Phase 1: Team Registration

```
┌─────────────────────────────────────────────────┐
│ Committee Admin registers team for Season 16    │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Registration Form includes:                     │
│ ☑ Join Fantasy League (Optional)               │
└─────────────────┬───────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │ If checked:       │
        │                   │
        ▼                   ▼
┌───────────────┐   ┌──────────────────┐
│ PostgreSQL:   │   │ Firebase:        │
│ fantasy_teams │   │ teams document   │
│               │   │                  │
│ team_id       │   │ fantasy_         │
│ league_id     │   │ participating    │
│ owner_uid     │   │ = true           │
│ budget=€100M  │   │                  │
└───────────────┘   └──────────────────┘
```

**API Endpoint:**
```typescript
POST /api/seasons/[id]/register
Body: {
  userId: "user123",
  teamName: "Thunder FC",
  joinFantasy: true  // ← Fantasy opt-in
}
```


### Phase 2: Draft Period

```
┌─────────────────────────────────────────────────┐
│ Committee Admin Opens Draft                     │
│ POST /api/fantasy/admin/draft/open              │
│                                                 │
│ Sets: draft_status = 'active'                   │
│       draft_opens_at = NOW()                    │
│       draft_closes_at = NOW() + 7 days          │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Teams Access Draft Page                         │
│ /dashboard/team/fantasy/draft                   │
│                                                 │
│ Shows:                                          │
│ • Available players (from realplayers table)    │
│ • Player price (based on star rating)           │
│ • Remaining budget                              │
│ • Squad status (X/15 players)                   │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Team Drafts Players                             │
│ POST /api/fantasy/draft/player                  │
│                                                 │
│ Validations:                                    │
│ ✓ Player not already drafted                    │
│ ✓ Team has sufficient budget                    │
│ ✓ Squad not full (< 15 players)                │
│ ✓ Draft period is active                        │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Updates:                                        │
│ 1. fantasy_squad (adds player to team)          │
│ 2. fantasy_drafts (historical record)           │
│ 3. fantasy_teams.budget_remaining -= price      │
│ 4. fantasy_players.is_available = false         │
└─────────────────────────────────────────────────┘
```

**Draft Example:**
```typescript
// Team drafts Cristiano Ronaldo (10★ = €40M)
POST /api/fantasy/draft/player
{
  user_id: "user123",
  real_player_id: "player_cr7",
  player_name: "Cristiano Ronaldo",
  position: "FWD",
  team_name: "Manchester United",
  draft_price: 40.00
}

// Response:
{
  success: true,
  remaining_budget: 60.00,  // €100M - €40M
  squad_size: 1,
  max_squad_size: 15
}
```


### Phase 3: Captain & Lineup Selection

```
┌─────────────────────────────────────────────────┐
│ Team Selects Captain & Vice-Captain             │
│ PUT /api/fantasy/squad/captain                  │
│                                                 │
│ Captain: 2x points multiplier                   │
│ Vice-Captain: 1.5x (if captain doesn't play)    │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ fantasy_squad updated:                          │
│                                                 │
│ Player 1: is_captain = true                     │
│ Player 2: is_vice_captain = true                │
└─────────────────────────────────────────────────┘
```

**API Example:**
```typescript
PUT /api/fantasy/squad/captain
{
  user_id: "user123",
  captain_id: "player_cr7",
  vice_captain_id: "player_messi"
}
```

**Note**: Some implementations require weekly lineup submission with 5 starters + bench. The current system appears simplified with just captain selection.


### Phase 4: Automatic Points Calculation

```
┌─────────────────────────────────────────────────┐
│ Tournament Fixture Completes                    │
│ fixture_results.status = 'completed'            │
│                                                 │
│ Team A 3-1 Team B (Round 5)                     │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Fantasy Points Calculation Triggered            │
│ POST /api/fantasy/calculate-points              │
│                                                 │
│ Body: { fixture_id: "fix_123", round: 5 }       │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Step 1: Fetch Player Stats                     │
│                                                 │
│ • Goals scored by each player                   │
│ • Assists                                       │
│ • Clean sheets                                  │
│ • MOTM awards                                   │
│ • Cards (yellow/red)                            │
│ • Minutes played                                │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Step 2: Apply Scoring Rules                    │
│                                                 │
│ Example for Cristiano Ronaldo:                  │
│ • 2 goals × 5 pts = 10 points                   │
│ • 1 assist × 3 pts = 3 points                   │
│ • Clean sheet = 0 (forward)                     │
│ • MOTM = 5 points                               │
│ • Full 90 mins = 2 points                       │
│ ────────────────────────────                    │
│ Base Points = 20                                │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Step 3: Apply Captain Multiplier               │
│                                                 │
│ IF is_captain = true:                           │
│   total_points = base_points × 2                │
│   = 20 × 2 = 40 points                          │
│                                                 │
│ captain_bonus = 20 (extra from multiplier)      │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Step 4: Store Results                          │
│                                                 │
│ INSERT INTO fantasy_player_points:              │
│ {                                               │
│   real_player_id: "player_cr7",                 │
│   fixture_id: "fix_123",                        │
│   round_number: 5,                              │
│   goals_scored: 2,                              │
│   assists: 1,                                   │
│   motm: true,                                   │
│   base_points: 20,                              │
│   is_captain: true,                             │
│   points_multiplier: 2.0,                       │
│   captain_bonus: 20,                            │
│   total_points: 40                              │
│ }                                               │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Step 5: Update Team Total                      │
│                                                 │
│ UPDATE fantasy_teams                            │
│ SET total_points = total_points + 40            │
│ WHERE team_id = "team123"                       │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Step 6: Recalculate Leaderboard                │
│                                                 │
│ UPDATE fantasy_leaderboard                      │
│ SET rank = ROW_NUMBER() OVER (                  │
│   ORDER BY total_points DESC                    │
│ )                                               │
└─────────────────────────────────────────────────┘
```


### Phase 5: Passive Team Bonuses

```
┌─────────────────────────────────────────────────┐
│ Real Team Completes Match                       │
│ e.g., Manchester United wins 3-0                │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Calculate Team Bonuses                          │
│ POST /api/fantasy/calculate-team-bonuses        │
│                                                 │
│ For all teams supporting Man United:            │
│ • Win bonus: +5 points                          │
│ • Clean sheet bonus: +3 points                  │
│ • High scoring (3+ goals): +2 points            │
│ ────────────────────────────                    │
│ Total Passive Bonus: +10 points                 │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Store in fantasy_team_bonus_points:             │
│                                                 │
│ {                                               │
│   team_id: "team123",                           │
│   supported_team_id: "man_united",              │
│   bonus_type: "win",                            │
│   points_awarded: 5,                            │
│   round_number: 5                               │
│ }                                               │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Update fantasy_teams:                           │
│                                                 │
│ passive_points += 10                            │
│ total_points += 10                              │
└─────────────────────────────────────────────────┘
```


### Phase 6: Transfers & Trading

```
┌─────────────────────────────────────────────────┐
│ Committee Opens Transfer Window                 │
│ POST /api/fantasy/transfer-windows              │
│                                                 │
│ window_opens_at: 2024-03-01                     │
│ window_closes_at: 2024-03-07                    │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Team Executes Transfer                          │
│ POST /api/fantasy/transfers/player              │
│                                                 │
│ Body: {                                         │
│   user_id: "user123",                           │
│   player_out_id: "player_old",                  │
│   player_in_id: "player_new",                   │
│   transfer_cost: 4  // Points deducted          │
│ }                                               │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Validations:                                    │
│ ✓ Transfer window is open                       │
│ ✓ Team has available transfer quota             │
│ ✓ Player_in is available (not drafted)          │
│ ✓ Budget sufficient for price difference        │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Updates:                                        │
│ 1. Remove player_out from fantasy_squad         │
│ 2. Add player_in to fantasy_squad               │
│ 3. Deduct points: total_points -= 4             │
│ 4. Record in fantasy_transfers table            │
│ 5. Update budget_remaining                      │
└─────────────────────────────────────────────────┘
```

**Transfer Rules:**
- **Free Transfers**: 2 per window (configurable)
- **Additional Transfers**: Cost 4 points each (configurable)
- **Budget Constraint**: Can't exceed remaining budget
- **Window Timing**: Only during open windows


### Phase 7: Leaderboard & Rankings

```
┌─────────────────────────────────────────────────┐
│ After Each Points Update                        │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Recalculate Leaderboard                         │
│ GET /api/fantasy/leaderboard/SSPSLFLS16         │
│                                                 │
│ Query:                                          │
│ SELECT team_id, team_name,                      │
│        total_points,                            │
│        passive_points,                          │
│        ROW_NUMBER() OVER (                      │
│          ORDER BY total_points DESC             │
│        ) as rank                                │
│ FROM fantasy_teams                              │
│ WHERE league_id = 'SSPSLFLS16'                  │
└─────────────────┬───────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────┐
│ Result (Example):                               │
│                                                 │
│ Rank | Team Name    | Points | Passive         │
│ ──────────────────────────────────────────      │
│  1   | Thunder FC   | 245    | 35              │
│  2   | Lightning FC | 238    | 28              │
│  3   | Storm FC     | 215    | 22              │
└─────────────────────────────────────────────────┘
```

---

## 5. Key Features

### A. Captain System

**Multipliers:**
- Captain: 2.0x points
- Vice-Captain: 1.5x points (backup if captain doesn't play)

**Example:**
```javascript
// Ronaldo as captain scores 2 goals (10 base points)
base_points = 10
captain_multiplier = 2.0
total_points = 10 × 2 = 20 points
```


### B. Scoring Rules

Standard scoring configuration (configurable per league):

| Action | Points | Applies To |
|--------|--------|------------|
| Goal scored | +5 | All positions |
| Assist | +3 | All positions |
| Clean sheet | +3 | DEF, GK only |
| MOTM | +5 | All positions |
| Full 90 minutes | +2 | All positions |
| Hat-trick bonus | +5 | All positions |
| Brace bonus | +3 | All positions |
| Goal conceded | -1 | DEF, GK only |
| Yellow card | -1 | All positions |
| Red card | -3 | All positions |
| Substitution penalty | -2 | All positions |
| Win | +1 | All positions |
| Loss | -1 | All positions |

### C. Passive Team Bonuses

Teams earn points when their supported real team performs:

| Bonus Type | Points | Trigger |
|------------|--------|---------|
| Win | +5 | Team wins match |
| Clean Sheet | +3 | Team keeps clean sheet |
| High Scoring | +2 | Team scores 3+ goals |
| Weekly Top Scorer | +3 | Team player is top scorer of round |
| Winning Streak | +5 | 3+ consecutive wins |

**Supported Team Selection:**
- Set during registration or later via `/dashboard/team/fantasy/change-supported-team`
- Can be changed (typically once per season or with restrictions)


### D. Player Pricing

Players priced based on star rating (1-10 stars):

```javascript
// Default pricing structure (configurable in league)
const starRatingPrices = {
  "1": 2.00,   // €2M
  "2": 3.50,   // €3.5M
  "3": 5.00,   // €5M
  "4": 8.00,   // €8M
  "5": 15.00,  // €15M
  "6": 20.00,  // €20M
  "7": 25.00,  // €25M
  "8": 30.00,  // €30M
  "9": 35.00,  // €35M
  "10": 40.00  // €40M
}
```

**Budget Management:**
- Initial budget: €100M per team
- Remaining budget tracked in `fantasy_teams.budget_remaining`
- Must maintain budget for transfers

### E. Draft Types

**Open Draft** (Current Implementation):
- First-come, first-served during draft period
- No turn order
- Players marked unavailable once drafted

**Future Enhancements** (Mentioned in code):
- Snake draft with turn order
- Auction draft with bidding
- Draft tiers with scheduled openings


### F. Advanced Features

The system includes several advanced features (some may be partially implemented):

**1. Head-to-Head (H2H) Fixtures**
- Fantasy teams play against each other weekly
- Winner gets bonus points
- Table: `fantasy_h2h_fixtures`

**2. Predictions System**
- Predict match outcomes for bonus points
- Table: `fantasy_predictions`

**3. Challenges**
- Weekly challenges (e.g., "Score 50+ points this round")
- Bonus points for completion
- Table: `fantasy_challenges`

**4. Achievements**
- Unlockable badges (e.g., "First Draft Pick", "100 Points Club")
- Table: `fantasy_achievements`

**5. Power-Ups**
- Special abilities (e.g., Triple Captain, Wildcard)
- Limited use per season
- Table: `fantasy_power_ups`

**6. League Chat**
- In-app messaging between teams
- Table: `fantasy_chat_messages`

**7. Admin Bonus Points**
- Committee awards bonus points for:
  - Player of the Day (POTD)
  - Player of the Week (POTW)
  - Team of the Day (TOD)
  - Team of the Week (TOW)
- Table: `bonus_points`
- API: `POST /api/fantasy/bonus-points`


---

## 6. API Reference

### League Management

**Get/Create League**
```typescript
GET /api/fantasy/leagues?season_id=SSPSLS16
// Auto-creates league if doesn't exist
// Returns: { league: FantasyLeague }
```

**Get Leaderboard**
```typescript
GET /api/fantasy/leaderboard/SSPSLFLS16
// Returns: { leaderboard: FantasyLeaderboardEntry[] }
```

### Team Management

**Get My Team**
```typescript
GET /api/fantasy/teams/my-team?user_id=xxx
// Returns: { team: FantasyTeam, players: Player[], recent_rounds: [] }
```

**Register for Fantasy League**
```typescript
POST /api/fantasy/teams/my-team
Body: { user_id, league_id? }
// Returns: { success: true, team: FantasyTeam }
```

**Get Squad**
```typescript
GET /api/fantasy/squad?user_id=xxx
// Returns: { squad: FantasySquadPlayer[] }
```

**Set Captain & Vice-Captain**
```typescript
PUT /api/fantasy/squad/captain
Body: { user_id, captain_id, vice_captain_id }
// Returns: { success: true }
```


### Draft System

**Draft a Player**
```typescript
POST /api/fantasy/draft/player
Body: {
  user_id,
  real_player_id,
  player_name,
  position,
  team_name,
  draft_price
}
// Returns: { success: true, remaining_budget, squad_size }
```

**Remove Drafted Player** (during draft only)
```typescript
DELETE /api/fantasy/draft/player?user_id=xxx&real_player_id=yyy
// Returns: { success: true, refunded_amount }
```

**Get Available Players**
```typescript
GET /api/fantasy/players/available?league_id=xxx
// Returns: { players: AvailablePlayer[] }
```

**Get Player Pricing**
```typescript
GET /api/fantasy/pricing?league_id=xxx
// Returns: { pricing: { "1": 2.00, "5": 15.00, ... } }
```

### Points Calculation

**Calculate Player Points**
```typescript
POST /api/fantasy/calculate-points
Body: { fixture_id, league_id, round_number? }
// Returns: { success: true, points_awarded: PlayerPoints[] }
```

**Calculate Team Bonuses**
```typescript
POST /api/fantasy/calculate-team-bonuses
Body: { league_id, round_number, match_id }
// Returns: { success: true, bonuses_awarded: TeamBonus[] }
```

**Get Points Breakdown**
```typescript
GET /api/fantasy/points-breakdown/{playerId}?league_id=xxx
// Returns: { breakdown: PointsBreakdown[] }
```


### Transfer System

**Execute Transfer**
```typescript
POST /api/fantasy/transfers/player
Body: {
  user_id,
  player_out_id,
  player_in_id,
  transfer_cost  // Usually 4 points
}
// Returns: { success: true, new_squad: [] }
```

**Get Transfer History**
```typescript
GET /api/fantasy/transfers/player?user_id=xxx
// Returns: { transfers: FantasyTransfer[] }
```

**Manage Transfer Windows**
```typescript
POST /api/fantasy/transfer-windows
Body: {
  league_id,
  window_opens_at,
  window_closes_at,
  free_transfers: 2
}
// Returns: { success: true, window: TransferWindow }
```

### Trading (Team-to-Team)

**Propose Trade**
```typescript
POST /api/fantasy/trades/propose
Body: {
  from_team_id,
  to_team_id,
  offered_player_id,
  requested_player_id
}
// Returns: { success: true, trade_id }
```

**View Incoming Trades**
```typescript
GET /api/fantasy/trades/incoming?team_id=xxx
// Returns: { trades: TradeProposal[] }
```

**Accept/Reject Trade**
```typescript
PUT /api/fantasy/trades/{tradeId}
Body: { action: 'accept' | 'reject' }
// Returns: { success: true }
```


### Admin Endpoints

**Open Draft**
```typescript
POST /api/fantasy/admin/draft/open
Body: {
  league_id,
  draft_opens_at,
  draft_closes_at
}
// Returns: { success: true }
```

**Award Bonus Points**
```typescript
POST /api/fantasy/bonus-points
Body: {
  target_type: 'team' | 'player',
  target_id,
  points,
  reason,
  league_id,
  awarded_by
}
// Returns: { success: true }
```

**Bulk Update Pricing**
```typescript
POST /api/fantasy/admin/pricing/bulk-update
Body: {
  league_id,
  star_rating_prices: { "1": 2.00, ... }
}
// Returns: { success: true }
```

**Recalculate All Points**
```typescript
POST /api/fantasy/admin/recalculate
Body: { league_id, season_id }
// Returns: { success: true, recalculated_count }
```

**Manage Teams**
```typescript
GET /api/fantasy/admin/teams?league_id=xxx
// Returns: { teams: FantasyTeam[] }

PUT /api/fantasy/admin/teams/{teamId}
Body: { updates: {...} }
// Returns: { success: true }
```


---

## 7. Frontend Pages

### Team Dashboard Pages

Located in: `app/dashboard/team/fantasy/`

**Core Pages:**
- `my-team/page.tsx` - Squad overview, total points, player stats
- `draft/page.tsx` - Draft interface (during draft period)
- `lineup/page.tsx` - Set weekly lineup (if enabled)
- `leaderboard/page.tsx` - View league rankings
- `players/page.tsx` - Browse available players

**Transfer & Trading:**
- `transfers/page.tsx` - Execute player transfers
- `trades/propose/page.tsx` - Propose trades with other teams
- `trades/incoming/page.tsx` - View and respond to trade offers

**Points & Analytics:**
- `points-breakdown/page.tsx` - Detailed scoring breakdown
- `passive-breakdown/page.tsx` - Team bonus breakdown
- `h2h/page.tsx` - Head-to-head fixtures and results

**Engagement Features:**
- `predictions/page.tsx` - Match predictions
- `challenges/page.tsx` - Weekly challenges
- `achievements/page.tsx` - Unlockable badges
- `power-ups/page.tsx` - Special abilities
- `chat/page.tsx` - League chat

**Settings:**
- `change-supported-team/page.tsx` - Change passive bonus team
- `claim/page.tsx` - Claim rewards


### Committee Admin Pages

Located in: `app/dashboard/committee/fantasy/`

**Admin Management:**
- `enable-teams/page.tsx` - Enable fantasy for registered teams
- `[leagueId]/page.tsx` - League dashboard and settings
- `[leagueId]/lineups/page.tsx` - View all team lineups
- `[leagueId]/draft/page.tsx` - Monitor draft progress

### Components

Located in: `components/fantasy/`

Common fantasy-related React components (e.g., player cards, leaderboard tables, draft interface).

---

## 8. How to Make Changes

### A. Change Scoring Rules

**Location:** Database table `fantasy_scoring_rules`

**Example: Increase goal points from 5 to 7**

```sql
-- Via SQL
UPDATE fantasy_scoring_rules
SET points_value = 7
WHERE rule_type = 'goals_scored'
  AND league_id = 'SSPSLFLS16';

-- Via API
POST /api/fantasy/scoring-rules
{
  "league_id": "SSPSLFLS16",
  "rule_type": "goals_scored",
  "points_value": 7,
  "description": "Goals scored (updated)",
  "is_active": true
}
```


### B. Change Captain Multiplier

**Location:** Code logic in points calculation APIs

**File:** `app/api/fantasy/calculate-points/route.ts`

```typescript
// Find this logic (approximate):
if (player.is_captain) {
  multiplier = 2.0;  // Change this value
} else if (player.is_vice_captain) {
  multiplier = 1.5;  // Change this value
}

// Example: Change captain to 3x
if (player.is_captain) {
  multiplier = 3.0;  // Triple captain!
}
```

After changing, recalculate existing points:
```typescript
POST /api/fantasy/admin/recalculate
{ "league_id": "SSPSLFLS16" }
```

### C. Change Draft Budget

**Location:** Database table `fantasy_leagues`

```sql
-- Increase budget to €150M
UPDATE fantasy_leagues
SET budget_per_team = 150.00
WHERE league_id = 'SSPSLFLS16';

-- Also update existing teams
UPDATE fantasy_teams
SET budget_remaining = budget_remaining + 50.00
WHERE league_id = 'SSPSLFLS16';
```

### D. Change Squad Size Limits

**Location:** Database table `fantasy_leagues`

```sql
-- Change max squad size to 20 players
UPDATE fantasy_leagues
SET max_squad_size = 20,
    min_squad_size = 15
WHERE league_id = 'SSPSLFLS16';
```


### E. Change Player Pricing

**Location:** Database table `fantasy_leagues.star_rating_prices` (JSONB)

```sql
-- Update pricing structure
UPDATE fantasy_leagues
SET star_rating_prices = '{
  "1": 3.00,
  "2": 5.00,
  "3": 8.00,
  "4": 12.00,
  "5": 20.00,
  "6": 25.00,
  "7": 30.00,
  "8": 35.00,
  "9": 40.00,
  "10": 50.00
}'::jsonb
WHERE league_id = 'SSPSLFLS16';
```

Or via API:
```typescript
POST /api/fantasy/admin/pricing/bulk-update
{
  "league_id": "SSPSLFLS16",
  "star_rating_prices": {
    "1": 3.00,
    "5": 20.00,
    "10": 50.00
  }
}
```

### F. Add New Scoring Rule

**Example: Add "penalty saved" rule for goalkeepers**

```sql
INSERT INTO fantasy_scoring_rules (
  rule_id,
  league_id,
  rule_type,
  points_value,
  description,
  applies_to_positions,
  is_active
) VALUES (
  'rule_penalty_saved',
  'SSPSLFLS16',
  'penalty_saved',
  5,
  'Penalty saved by goalkeeper',
  ARRAY['GK'],
  true
);
```

Then update calculation logic in `app/api/fantasy/calculate-points/route.ts` to check for penalty saves.


### G. Change Transfer Rules

**Location:** Database table `fantasy_leagues`

```sql
-- Change to 3 free transfers, 5 points cost for additional
UPDATE fantasy_leagues
SET max_transfers_per_window = 3,
    points_cost_per_transfer = 5
WHERE league_id = 'SSPSLFLS16';
```

### H. Open/Close Draft Period

**Via API:**
```typescript
POST /api/fantasy/admin/draft/open
{
  "league_id": "SSPSLFLS16",
  "draft_opens_at": "2024-03-01T00:00:00Z",
  "draft_closes_at": "2024-03-07T23:59:59Z"
}
```

**Via SQL:**
```sql
UPDATE fantasy_leagues
SET draft_status = 'active',
    draft_opens_at = '2024-03-01 00:00:00',
    draft_closes_at = '2024-03-07 23:59:59'
WHERE league_id = 'SSPSLFLS16';

-- To close draft
UPDATE fantasy_leagues
SET draft_status = 'closed'
WHERE league_id = 'SSPSLFLS16';
```

### I. Change Passive Bonus Points

**Location:** Code logic in `app/api/fantasy/calculate-team-bonuses/route.ts`

```typescript
// Find bonus calculation logic (approximate):
const BONUS_RULES = {
  WIN: 5,              // Change to 10
  CLEAN_SHEET: 3,      // Change to 5
  HIGH_SCORING: 2,     // Change to 4
  // ... etc
}
```

Or store in database and make configurable per league.


---

## 9. Common Modifications Guide

### Scenario 1: Add Position-Specific Scoring

**Goal:** Defenders get +5 for clean sheets instead of +3

```sql
-- Update existing rule
UPDATE fantasy_scoring_rules
SET points_value = 5,
    applies_to_positions = ARRAY['DEF']
WHERE rule_type = 'clean_sheet'
  AND league_id = 'SSPSLFLS16';

-- Or create new rule for GK
INSERT INTO fantasy_scoring_rules (
  rule_id, league_id, rule_type, points_value,
  applies_to_positions, description, is_active
) VALUES (
  'clean_sheet_gk',
  'SSPSLFLS16',
  'clean_sheet',
  4,
  ARRAY['GK'],
  'Clean sheet for goalkeeper',
  true
);
```

### Scenario 2: Implement Weekly Lineup System

Currently simplified (captain only). To add full lineup:

1. **Enable lineup table usage**
   - Table already exists: `fantasy_lineups`
   - Contains: starters (by position), bench, captain, vice-captain

2. **Update frontend**
   - File: `app/dashboard/team/fantasy/lineup/page.tsx`
   - Add drag-drop interface for 5 starters + bench

3. **Update points calculation**
   - File: `app/api/fantasy/calculate-points/route.ts`
   - Only calculate points for players in lineup
   - Apply auto-substitution if starter didn't play


### Scenario 3: Add Snake Draft System

Current system is open draft. To implement snake draft:

1. **Add draft order to league**
```sql
ALTER TABLE fantasy_leagues
ADD COLUMN draft_type VARCHAR(20) DEFAULT 'open',
ADD COLUMN current_pick INTEGER DEFAULT 1,
ADD COLUMN draft_order JSONB;  -- ['team1', 'team2', 'team3']
```

2. **Update draft API**
   - File: `app/api/fantasy/draft/player/route.ts`
   - Check if it's team's turn before allowing draft
   - Increment pick number after successful draft
   - Reverse order on even rounds (snake)

3. **Update frontend**
   - File: `app/dashboard/team/fantasy/draft/page.tsx`
   - Show draft order and current pick
   - Disable draft button when not team's turn

### Scenario 4: Add Daily/Weekly Limits

**Goal:** Limit captain changes to once per week

1. **Add tracking table**
```sql
CREATE TABLE fantasy_captain_changes (
  id SERIAL PRIMARY KEY,
  team_id VARCHAR(100),
  league_id VARCHAR(100),
  round_number INTEGER,
  old_captain_id VARCHAR(100),
  new_captain_id VARCHAR(100),
  changed_at TIMESTAMP DEFAULT NOW()
);
```

2. **Update captain API**
   - File: `app/api/fantasy/squad/captain/route.ts`
   - Check how many changes this round
   - Reject if limit exceeded

```typescript
// Check changes this round
const changes = await fantasySql`
  SELECT COUNT(*) as count
  FROM fantasy_captain_changes
  WHERE team_id = ${teamId}
    AND round_number = ${currentRound}
`;

if (changes[0].count >= 1) {
  return NextResponse.json(
    { error: 'Captain already changed this round' },
    { status: 403 }
  );
}
```


### Scenario 5: Customize for Different Sport

**Goal:** Adapt fantasy system for cricket/basketball

1. **Update positions**
```sql
-- For cricket
ALTER TABLE fantasy_squad
ALTER COLUMN position TYPE VARCHAR(50);

-- Update valid positions in code
// In types/fantasy.ts
type PlayerPosition = 'BAT' | 'BOWL' | 'AR' | 'WK';  // Cricket
```

2. **Create sport-specific scoring rules**
```sql
-- Cricket scoring
INSERT INTO fantasy_scoring_rules VALUES
  ('runs_scored', 'SSPSLFLS16', 'runs_scored', 1, 'Run scored', true),
  ('wicket_taken', 'SSPSLFLS16', 'wicket_taken', 25, 'Wicket taken', true),
  ('catch', 'SSPSLFLS16', 'catch', 8, 'Catch taken', true),
  ('fifty', 'SSPSLFLS16', 'fifty', 8, 'Half-century bonus', true),
  ('century', 'SSPSLFLS16', 'century', 16, 'Century bonus', true);
```

3. **Update points calculation logic**
   - File: `app/api/fantasy/calculate-points/route.ts`
   - Modify to read cricket/basketball stats instead of football stats

---

## 10. Important Notes & Gotchas

### A. Dual Database System

The system uses **PostgreSQL for fantasy data** and **Firebase for team/user data**. This means:

- Fantasy squad and points → PostgreSQL
- Team info and authentication → Firebase
- Must sync between both databases
- Risk of data inconsistency if not careful

**Best Practice:**
- PostgreSQL is source of truth for fantasy
- Firebase holds references and cached totals
- Use transactions where possible


### B. Points Recalculation

When you change scoring rules, you need to recalculate all existing points:

```typescript
// Recalculate all points for a league
POST /api/fantasy/admin/recalculate
{
  "league_id": "SSPSLFLS16"
}
```

**Warning:** This can take 30+ seconds for large leagues. Consider:
- Running during off-peak hours
- Implementing background jobs
- Adding progress indicators

### C. Captain Multiplier Timing

Captain multipliers are applied **during calculation**, not stored permanently. This means:

- Changing captain retroactively requires recalculation
- Historical captain assignments needed for accurate recalc
- Current system may not track captain changes over time

**Recommendation:** Store captain status per fixture in `fantasy_player_points.is_captain`.

### D. Draft vs Auction Confusion

There are **two separate systems**:

1. **Fantasy Draft** (`/api/fantasy/draft/*`)
   - For drafting real players (footballers)
   - Used in fantasy competition
   - Budget: €100M

2. **Football Player Auction** (`AUCTION_SYSTEM_DOCUMENTATION.md`)
   - For acquiring football (game) players
   - Separate system, different database
   - Budget: eCoin (€10,000)

Don't confuse these!


### E. Real-Time Updates

The system uses Firebase Realtime Database for live updates:

**File:** `lib/fantasy/chat-realtime.ts`, `lib/realtime/broadcast.ts`

```typescript
// Broadcast draft update
await broadcastFantasyDraftUpdate(leagueId, {
  type: 'player_drafted',
  team_id: teamId,
  player_name: playerName,
  draft_price: price
});
```

Frontend subscribes to these updates for live leaderboard and draft tracking.

### F. Performance Considerations

With 20+ tables and complex queries:

- **Use indexes**: Critical for `league_id`, `team_id`, `real_player_id`
- **Pagination**: Large datasets (leaderboards, player lists)
- **Caching**: Consider Redis for leaderboards and player stats
- **Background Jobs**: For recalculations and batch operations

### G. Migration Path

If making breaking changes:

1. Add new columns (don't drop old ones immediately)
2. Migrate data gradually
3. Update APIs to use new structure
4. Test thoroughly
5. Remove old columns after confirming success

---

## 11. Key Files Reference

### Configuration
- `.env.local` - Database connection strings
- `lib/neon/fantasy-config.ts` - Fantasy DB connection
- `lib/neon/tournament-config.ts` - Tournament DB connection

### Type Definitions
- `types/fantasy.ts` - All fantasy TypeScript interfaces

### Core Libraries
- `lib/fantasy-award-points.ts` - Bonus points logic
- `lib/team-season-utils.ts` - Team registration utilities

### Database Schema
- `fantasy_database_schema.sql` - Complete schema export


---

## 12. Quick Reference

### Connection Flow
```
Season (SSPSLS16)
  └─> Fantasy League (SSPSLFLS16)
       ├─> Fantasy Teams (team_id links to Firebase)
       │    ├─> Fantasy Squad (drafted players)
       │    ├─> Draft History
       │    └─> Transfer History
       ├─> Scoring Rules (configurable points)
       ├─> Fantasy Rounds (links to tournament rounds)
       └─> Leaderboard (rankings)

Tournament Fixture Complete
  └─> Calculate Fantasy Points
       ├─> Apply scoring rules
       ├─> Apply captain multipliers
       ├─> Calculate team bonuses
       └─> Update leaderboard
```

### Database Connections
```javascript
// Fantasy DB (PostgreSQL)
import { fantasySql } from '@/lib/neon/fantasy-config';
const teams = await fantasySql`SELECT * FROM fantasy_teams`;

// Tournament DB (PostgreSQL)
import { getTournamentDb } from '@/lib/neon/tournament-config';
const tournamentSql = getTournamentDb();
const fixtures = await tournamentSql`SELECT * FROM fixtures`;

// Firebase
import { adminDb } from '@/lib/firebase/admin';
const teamDoc = await adminDb.collection('teams').doc(teamId).get();
```

### Common Queries

**Get team's current squad:**
```sql
SELECT * FROM fantasy_squad
WHERE team_id = 'team123' AND league_id = 'SSPSLFLS16';
```

**Get leaderboard:**
```sql
SELECT team_id, team_name, total_points,
       ROW_NUMBER() OVER (ORDER BY total_points DESC) as rank
FROM fantasy_teams
WHERE league_id = 'SSPSLFLS16'
ORDER BY total_points DESC;
```

**Get player points for a round:**
```sql
SELECT real_player_id, player_name, SUM(total_points) as points
FROM fantasy_player_points
WHERE league_id = 'SSPSLFLS16' AND round_number = 5
GROUP BY real_player_id, player_name
ORDER BY points DESC;
```


---

## 13. Summary

### What the Fantasy League Does

1. **Season-Long Competition**: Teams draft real players and compete based on actual match performance
2. **Automatic Points**: No weekly lineup management - points calculated automatically after fixtures
3. **Strategic Elements**: Captain multipliers (2x), vice-captain backup (1.5x), passive team bonuses
4. **Budget Management**: €100M to build 11-15 player squad
5. **Transfers**: Modify squad during transfer windows (points cost applies)
6. **Leaderboard**: Real-time rankings based on total points earned

### How It Connects

- **Season → League**: Each season gets one fantasy league (SSPSLFLS{seasonNumber})
- **Team → Fantasy Team**: Teams opt in during registration, creates fantasy_teams entry
- **Real Players → Draft Pool**: Players from realplayers table become draftable
- **Tournament Rounds → Points**: Fixture results trigger points calculation per round
- **Match Stats → Fantasy Points**: Goals, assists, clean sheets convert to fantasy points via scoring rules

### Where Everything Lives

- **Database**: PostgreSQL (Neon) for fantasy data, Firebase for teams/users
- **APIs**: `app/api/fantasy/*` - 25+ endpoints for all operations
- **Frontend**: `app/dashboard/team/fantasy/*` - Team pages
- **Admin**: `app/dashboard/committee/fantasy/*` - Committee management
- **Types**: `types/fantasy.ts` - TypeScript definitions
- **Schema**: `fantasy_database_schema.sql` - Database structure

### Making Changes

Most changes involve:
1. **Database update** (SQL or migration)
2. **API update** (route.ts files)
3. **Type update** (types/fantasy.ts)
4. **Frontend update** (page.tsx components)
5. **Testing** (verify in browser/database)

---

## 14. Related Documentation

- `FANTASY_LEAGUE_EXECUTIVE_SUMMARY.md` - High-level overview and issues
- `FANTASY_SYSTEM_COMPLETE.md` - Feature completion status
- `FANTASY_PHASE1_COMPLETE.md` - Schema implementation details
- `AUCTION_SYSTEM_DOCUMENTATION.md` - Separate auction system (not fantasy)
- `TEAM_SEASON_REGISTRATION_FLOW.md` - How teams register
- `fantasy_database_schema.sql` - Complete database schema
- `types/fantasy.ts` - TypeScript type definitions

---

**Document Version:** 1.0  
**Last Updated:** June 11, 2026  
**Maintainer:** Development Team
