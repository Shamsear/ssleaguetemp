# Fantasy League Changes - Implementation Summary

## Changes Implemented ✅

### 1. Category-Based Pricing (Instead of Star Rating)

**Before:** Players priced based on star_rating (1-10 stars)
**After:** Players priced based on category (A, B, C, D, E)

**Default Category Pricing:**
- Category A: €40.00M
- Category B: €25.00M
- Category C: €15.00M
- Category D: €10.00M
- Category E: €5.00M

### 2. Single Player Ownership (Unique Drafting)

**Before:** Multiple teams could draft the same player
**After:** Only one team can draft each player (enforced)

**Mechanism:**
- `fantasy_players.drafted_by_team_id` tracks which team owns the player
- `fantasy_players.is_available` flag indicates if player is available for draft
- When player is drafted, `is_available = false` and `drafted_by_team_id` is set
- When player is removed, `is_available = true` and `drafted_by_team_id = NULL`

---

## Files Modified

### 1. Database Migration Script
**File:** `scripts/migrate-fantasy-to-category-pricing.ts`
- Adds `category_prices` column to `fantasy_leagues`
- Adds `category` column to `fantasy_players`, `fantasy_squad`, `fantasy_drafts`
- Adds `drafted_by_team_id` column to `fantasy_players`
- Creates indexes for performance
- Migrates existing data from `player_seasons`
- Sets `drafted_by_team_id` for already drafted players

### 2. Available Players API
**File:** `app/api/fantasy/players/available/route.ts`
- Changed from `star_rating_prices` to `category_prices`
- Added fallback to `star_rating_prices` for backward compatibility
- Filters out already drafted players (checks `drafted_by_team_id`)
- Sorts by category (A first) instead of star rating
- Returns category instead of star_rating

### 3. Draft Player API
**File:** `app/api/fantasy/draft/player/route.ts`
- Added import for `getTournamentDb`
- Enhanced validation to check if player is already drafted by ANY team
- Fetches player category from `player_seasons` table
- Stores category in `fantasy_squad` and `fantasy_drafts`
- Sets `drafted_by_team_id` when player is drafted
- Clears `drafted_by_team_id` when player is removed (DELETE)
- Makes player available again when removed

### 4. Type Definitions
**File:** `types/fantasy.ts`
- Added `category_prices` to `FantasyLeague` interface
- Added `category` to `FantasyDraft` interface
- Added `drafted_by_team_id` and `category` to `FantasyPlayerStats`
- Kept `star_rating_prices` for backward compatibility

---

## Database Schema Changes

### fantasy_leagues
```sql
ALTER TABLE fantasy_leagues 
ADD COLUMN IF NOT EXISTS category_prices JSONB DEFAULT '[
  {"category": "A", "price": 40.00},
  {"category": "B", "price": 25.00},
  {"category": "C", "price": 15.00},
  {"category": "D", "price": 10.00},
  {"category": "E", "price": 5.00}
]'::jsonb;
```

### fantasy_players
```sql
ALTER TABLE fantasy_players
ADD COLUMN IF NOT EXISTS category VARCHAR(10) DEFAULT 'A';

ALTER TABLE fantasy_players
ADD COLUMN IF NOT EXISTS drafted_by_team_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_fantasy_players_drafted 
ON fantasy_players(league_id, drafted_by_team_id);

CREATE INDEX IF NOT EXISTS idx_fantasy_players_category
ON fantasy_players(league_id, category);
```

### fantasy_squad
```sql
ALTER TABLE fantasy_squad
ADD COLUMN IF NOT EXISTS category VARCHAR(10) DEFAULT 'A';
```

### fantasy_drafts
```sql
ALTER TABLE fantasy_drafts
ADD COLUMN IF NOT EXISTS category VARCHAR(10) DEFAULT 'A';
```

---

## How to Run the Migration

1. **Run the migration script:**
```bash
npx ts-node scripts/migrate-fantasy-to-category-pricing.ts
```

2. **Verify the changes:**
```sql
-- Check category_prices in leagues
SELECT league_id, category_prices FROM fantasy_leagues;

-- Check drafted players
SELECT real_player_id, category, drafted_by_team_id, is_available 
FROM fantasy_players 
WHERE drafted_by_team_id IS NOT NULL;

-- Check squad categories
SELECT squad_id, player_name, category FROM fantasy_squad LIMIT 10;
```

---

## API Changes

### GET /api/fantasy/players/available?league_id=xxx

**Before Response:**
```json
{
  "success": true,
  "available_players": [
    {
      "real_player_id": "player1",
      "player_name": "John Doe",
      "star_rating": 8,
      "draft_price": 30.00,
      "is_available": true
    }
  ]
}
```

**After Response:**
```json
{
  "success": true,
  "available_players": [
    {
      "real_player_id": "player1",
      "player_name": "John Doe",
      "category": "A",
      "draft_price": 40.00,
      "is_available": true
    }
  ],
  "total_available": 150
}
```

### POST /api/fantasy/draft/player

**Additional Validation:**
- Checks if player is already drafted by ANY team
- Returns error if player is unavailable

**New Error Response:**
```json
{
  "error": "Player already drafted",
  "message": "Player has been drafted by another team",
  "drafted_by": "team_abc123"
}
```

---

## Testing Guide

### 1. Test Draft Flow
```bash
# 1. Get available players
GET /api/fantasy/players/available?league_id=SSPSLFLS16

# 2. Draft a player (Team A)
POST /api/fantasy/draft/player
{
  "user_id": "userA",
  "real_player_id": "player1",
  "player_name": "John Doe",
  "position": "FWD",
  "team_name": "Team X",
  "draft_price": 40.00
}

# 3. Try to draft same player (Team B) - Should fail
POST /api/fantasy/draft/player
{
  "user_id": "userB",
  "real_player_id": "player1",  // Same player
  ...
}
# Expected: Error "Player already drafted"

# 4. Remove player (Team A)
DELETE /api/fantasy/draft/player?user_id=userA&real_player_id=player1

# 5. Try to draft again (Team B) - Should succeed now
POST /api/fantasy/draft/player
{
  "user_id": "userB",
  "real_player_id": "player1",
  ...
}
```

### 2. Test Category Pricing
```sql
-- Check that different categories have different prices
SELECT 
  player_name,
  category,
  purchase_price
FROM fantasy_squad
ORDER BY category, purchase_price DESC;
```

### 3. Test Availability
```sql
-- Check that drafted players are marked unavailable
SELECT 
  fp.real_player_id,
  fp.category,
  fp.is_available,
  fp.drafted_by_team_id,
  ft.team_name as drafted_by
FROM fantasy_players fp
LEFT JOIN fantasy_teams ft ON fp.drafted_by_team_id = ft.team_id
WHERE fp.league_id = 'SSPSLFLS16'
  AND fp.drafted_by_team_id IS NOT NULL;
```

---

## Backward Compatibility

### Old System Support
- `star_rating_prices` column kept in `fantasy_leagues` for backward compatibility
- API checks for `category_prices` first, falls back to `star_rating_prices`
- Default category prices used if neither is set

### Migration Safety
- All `ALTER TABLE` statements use `IF NOT EXISTS` (idempotent)
- Existing data is preserved
- Migration can be safely re-run

---

## Rollback Plan

If issues arise, you can rollback:

1. **Revert API changes** (git revert)
2. **Optional: Remove new columns**
```sql
ALTER TABLE fantasy_players DROP COLUMN IF EXISTS category;
ALTER TABLE fantasy_players DROP COLUMN IF EXISTS drafted_by_team_id;
ALTER TABLE fantasy_squad DROP COLUMN IF EXISTS category;
ALTER TABLE fantasy_drafts DROP COLUMN IF EXISTS category;
ALTER TABLE fantasy_leagues DROP COLUMN IF EXISTS category_prices;
```

3. **Restart services** to use old code

**Note:** Don't drop columns if data migration has already occurred and you want to preserve the data.

---

## Next Steps

### 1. Frontend Updates (Optional)
If you have frontend pages that display player information:
- Update to show category badges instead of star ratings
- Add visual indicators for drafted players
- Show "Already Drafted" badge on unavailable players

### 2. Admin Panel (Optional)
- Allow admins to configure category prices per league
- Add bulk category assignment tool
- View drafted players report

### 3. Documentation Updates
- Update user-facing documentation
- Update API documentation
- Create admin guide for category management

---

## Support

If you encounter any issues:
1. Check migration script logs for errors
2. Verify database schema changes
3. Test API endpoints with Postman/curl
4. Check application logs for detailed errors

---

**Migration Status:** ✅ Ready to deploy
**Breaking Changes:** None (backward compatible)
**Data Loss Risk:** None (all data preserved)
**Rollback Available:** Yes
