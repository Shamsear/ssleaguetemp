# Team Players Table - Complete Report

## Table Schema

```sql
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
```

## Indexes

```sql
-- Performance indexes
CREATE INDEX idx_team_players_player_id ON team_players (player_id);
CREATE INDEX idx_team_players_round_id ON team_players (round_id);
CREATE INDEX idx_team_players_season_id ON team_players (season_id);
CREATE INDEX idx_team_players_team_id ON team_players (team_id);

-- Unique constraint index
CREATE UNIQUE INDEX team_players_player_id_season_id_key ON team_players (player_id, season_id);
```

---

## Fields Explanation

| Field | Type | Description |
|-------|------|-------------|
| `id` | SERIAL (AUTO INCREMENT) | Primary key, unique row identifier |
| `team_id` | VARCHAR(255) | Team identifier (e.g., "los_galacticos") |
| `player_id` | VARCHAR(255) | Player identifier from `footballplayers` table |
| `season_id` | VARCHAR(255) | Season identifier (e.g., "SSPSLS18") |
| `round_id` | VARCHAR(255) | Round where player was acquired (can be NULL) |
| `purchase_price` | INTEGER | Amount paid to acquire player (in coins) |
| `acquired_at` | TIMESTAMP | When player was acquired |
| `created_at` | TIMESTAMP | When record was created |
| `updated_at` | TIMESTAMP | When record was last updated |

---

## When Players Are Assigned (INSERT)

### During Bulk Round Finalization

**Location:** `app/api/admin/bulk-rounds/[id]/finalize/route.ts`

```sql
INSERT INTO team_players (
  team_id,
  player_id,
  season_id,
  round_id,
  purchase_price,
  acquired_at
) VALUES (
  'los_galacticos',      -- Team ID
  'aashiq_id',           -- Player ID
  'SSPSLS18',            -- Season ID
  'round_12345',         -- Round ID where acquired
  25,                    -- Purchase price (base_price from round)
  NOW()                  -- Acquisition timestamp
)
ON CONFLICT (player_id, season_id) DO UPDATE
SET 
  team_id = EXCLUDED.team_id,
  round_id = EXCLUDED.round_id,
  purchase_price = EXCLUDED.purchase_price
```

### Example Data:
```
id: 1
team_id: "los_galacticos"
player_id: "player_abc123"
season_id: "SSPSLS18"
round_id: "round_xyz789"
purchase_price: 25
acquired_at: 2025-01-15 14:30:00
created_at: 2025-01-15 14:30:00
updated_at: 2025-01-15 14:30:00
```

---

## ON CONFLICT Behavior

The table has a **UNIQUE constraint** on `(player_id, season_id)`. This means:

- ✅ **One player can only belong to ONE team per season**
- ✅ If player is assigned again in same season, the record is UPDATED (not duplicated)
- ✅ Player can be in different teams across different seasons

### What Gets Updated on Conflict:
```sql
ON CONFLICT (player_id, season_id) DO UPDATE
SET 
  team_id = EXCLUDED.team_id,         -- New team (if player traded/reassigned)
  round_id = EXCLUDED.round_id,       -- New acquisition round
  purchase_price = EXCLUDED.purchase_price  -- New purchase price
```

**Note:** `acquired_at` is NOT updated on conflict (preserves original acquisition time)

---

## When Records Are Updated

### 1. Player Swap/Trade
**Location:** `app/api/players/simple-swap/route.ts`

```sql
UPDATE team_players 
SET team_id = 'new_team_id', updated_at = NOW() 
WHERE player_id = 'player_id'
```

**Updates:**
- `team_id` → New team
- `updated_at` → Current timestamp

**Does NOT Update:**
- `purchase_price` (keeps original acquisition price)
- `round_id` (keeps original round)
- `acquired_at` (keeps original acquisition date)

### 2. Bulk Player Swap
**Location:** `app/api/players/bulk-swap/route.ts`

```sql
UPDATE team_players 
SET team_id = 'new_team_id', updated_at = NOW() 
WHERE player_id = 'player_id'
```

Same update pattern as simple swap.

---

## Fields That Are NEVER Updated After Initial Assignment

1. ❌ **`acquired_at`** - Always preserves first acquisition timestamp
2. ❌ **`created_at`** - Never changes after record creation

---

## Fields That CAN Be Updated

1. ✅ **`team_id`** - Changes when player is traded/swapped
2. ✅ **`round_id`** - Changes if player re-acquired via ON CONFLICT
3. ✅ **`purchase_price`** - Changes if player re-acquired via ON CONFLICT
4. ✅ **`updated_at`** - Changes on any UPDATE

---

## Relationship to Other Tables

### Related Tables:
1. **`footballplayers`** - Main player data (via `player_id`)
2. **`teams`** - Team data (via `team_id`)
3. **`rounds`** - Round information (via `round_id`)
4. **`round_players`** - Round-specific player data

### Data Consistency:
When a player is assigned via bulk round finalization:

```
team_players.player_id = footballplayers.id
team_players.team_id = footballplayers.team_id
team_players.purchase_price = round_players.winning_bid
```

---

## Query Examples

### Get all players for a team in current season:
```sql
SELECT * FROM team_players
WHERE team_id = 'los_galacticos'
AND season_id = 'SSPSLS18'
ORDER BY acquired_at DESC;
```

### Get player's acquisition history across seasons:
```sql
SELECT * FROM team_players
WHERE player_id = 'player_abc123'
ORDER BY season_id, acquired_at;
```

### Get total spent by team in season:
```sql
SELECT SUM(purchase_price) as total_spent
FROM team_players
WHERE team_id = 'los_galacticos'
AND season_id = 'SSPSLS18';
```

### Get players acquired in specific round:
```sql
SELECT * FROM team_players
WHERE round_id = 'round_xyz789'
ORDER BY team_id, acquired_at;
```

---

## Important Notes

1. **Unique Constraint:** A player can only be on ONE team per season
2. **Idempotency:** Using `ON CONFLICT` makes assignment idempotent (safe to run multiple times)
3. **Historical Data:** The table preserves acquisition history across seasons
4. **Trade Tracking:** When players are traded, `team_id` changes but `acquired_at` stays original
5. **Price Preservation:** Original `purchase_price` is kept even after trades (unless re-acquired)

---

## Summary of What Gets Updated During Player Assignment

### On Initial Assignment (INSERT):
✅ `team_id` - Team acquiring player  
✅ `player_id` - Player being acquired  
✅ `season_id` - Current season  
✅ `round_id` - Round where acquired  
✅ `purchase_price` - Amount paid  
✅ `acquired_at` - Acquisition timestamp  
✅ `created_at` - Record creation timestamp  
✅ `updated_at` - Record update timestamp  

### On Re-Assignment (ON CONFLICT UPDATE):
✅ `team_id` - New team  
✅ `round_id` - New acquisition round  
✅ `purchase_price` - New purchase price  
✅ `updated_at` - Current timestamp  
❌ `acquired_at` - NOT UPDATED (preserves original)  
❌ `created_at` - NOT UPDATED (preserves original)  

### On Trade/Swap:
✅ `team_id` - New team  
✅ `updated_at` - Current timestamp  
❌ `purchase_price` - NOT UPDATED  
❌ `round_id` - NOT UPDATED  
❌ `acquired_at` - NOT UPDATED  

---

## End of Report
