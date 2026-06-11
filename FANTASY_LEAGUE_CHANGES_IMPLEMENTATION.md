# Fantasy League Changes Implementation Plan

## Required Changes

### 1. Use Player Category Instead of Star Rating for Pricing
**Current:** Players are priced based on star_rating (1-10 stars)
**New:** Players should be priced based on category (A, B, C, etc.)

### 2. Prevent Multiple Teams from Drafting Same Player
**Current:** Multiple teams can draft the same player (is_available flag not enforced)
**New:** Once a player is drafted, they become unavailable to other teams

---

## Implementation Steps

### Phase 1: Database Schema Changes

#### A. Update fantasy_leagues table
```sql
-- Add category_prices column (if not exists)
ALTER TABLE fantasy_leagues 
ADD COLUMN IF NOT EXISTS category_prices JSONB DEFAULT '[
  {"category": "A", "price": 40.00},
  {"category": "B", "price": 25.00},
  {"category": "C", "price": 15.00},
  {"category": "D", "price": 10.00},
  {"category": "E", "price": 5.00}
]'::jsonb;

-- Update existing leagues to have category pricing
UPDATE fantasy_leagues
SET category_prices = '[
  {"category": "A", "price": 40.00},
  {"category": "B", "price": 25.00},
  {"category": "C", "price": 15.00},
  {"category": "D", "price": 10.00},
  {"category": "E", "price": 5.00}
]'::jsonb
WHERE category_prices IS NULL;
```

#### B. Update fantasy_players table
```sql
-- Add category column (if not exists)
ALTER TABLE fantasy_players
ADD COLUMN IF NOT EXISTS category VARCHAR(10) DEFAULT 'A';

-- Add drafted_by_team_id column
ALTER TABLE fantasy_players
ADD COLUMN IF NOT EXISTS drafted_by_team_id VARCHAR(100);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_fantasy_players_drafted 
ON fantasy_players(league_id, drafted_by_team_id);
```

#### C. Update fantasy_squad table
```sql
-- Add category column (if not exists)
ALTER TABLE fantasy_squad
ADD COLUMN IF NOT EXISTS category VARCHAR(10) DEFAULT 'A';
```

#### D. Update fantasy_drafts table
```sql
-- Add category column (if not exists)
ALTER TABLE fantasy_drafts
ADD COLUMN IF NOT EXISTS category VARCHAR(10) DEFAULT 'A';
```

---

### Phase 2: API Changes

#### A. Update /api/fantasy/players/available/route.ts
**Changes:**
- Use category instead of star_rating for pricing
- Filter out players that are already drafted (is_available = false)
- Check drafted_by_team_id to enforce single ownership



#### B. Update /api/fantasy/draft/player/route.ts
**Changes:**
- Check if player is already drafted (is_available = false OR drafted_by_team_id IS NOT NULL)
- Update fantasy_players to set drafted_by_team_id = team_id
- Store category in fantasy_squad and fantasy_drafts

#### C. Update /api/fantasy/draft/player/route.ts (DELETE)
**Changes:**
- When player is removed, set drafted_by_team_id = NULL
- Set is_available = true
- Make player available again

---

### Phase 3: Migration Script

Create a migration script to:
1. Add category_prices to existing leagues
2. Migrate star_rating prices to category prices
3. Update fantasy_players with category data from player_seasons
4. Update fantasy_squad with category data
5. Set drafted_by_team_id for already drafted players

---

### Phase 4: Frontend Changes

#### A. Update Draft Page
- Display category instead of star rating
- Show price based on category
- Disable draft button if player is already drafted

#### B. Update Available Players Display
- Group by category instead of star rating
- Show category badges/colors
- Indicate if player is drafted (shouldn't show up)

---

## Files to Modify

### Backend Files
1. ✅ `app/api/fantasy/players/available/route.ts` - Filter and pricing
2. ✅ `app/api/fantasy/draft/player/route.ts` - Draft logic
3. ✅ `app/api/register/player/confirm/route.ts` - Already using category!
4. ✅ `scripts/migrate-fantasy-to-category-pricing.ts` - New migration script
5. ✅ `types/fantasy.ts` - Update type definitions

### Frontend Files (if needed)
1. `app/dashboard/team/fantasy/draft/page.tsx` - Draft interface
2. `app/dashboard/team/fantasy/players/page.tsx` - Player browser
3. `components/fantasy/*` - Fantasy components

---

## Testing Checklist

### Draft Flow
- [ ] Player can be drafted by first team
- [ ] Player becomes unavailable after draft
- [ ] Second team cannot draft same player
- [ ] Draft price matches category price
- [ ] Player removal makes player available again

### Pricing
- [ ] Category A players priced correctly (€40M)
- [ ] Category B players priced correctly (€25M)
- [ ] Category C players priced correctly (€15M)
- [ ] Default category (A) works if category missing

### Availability
- [ ] Available players API only returns undrafted players
- [ ] Drafted players show drafted_by_team_id
- [ ] is_available flag is enforced

---

## Backward Compatibility

### Old star_rating System
- Keep star_rating_prices column for backward compatibility
- Prioritize category_prices if both exist
- Migration script converts star to category mapping

### Existing Drafted Players
- Migration script sets drafted_by_team_id for current squads
- Sets is_available = false for drafted players

---

## Rollback Plan

If issues arise:
1. Database changes use ALTER TABLE ... IF NOT EXISTS (safe)
2. Keep old star_rating system as fallback
3. Migration script can be reversed by:
   - Removing category columns
   - Reverting to star_rating pricing

---

## Implementation Order

1. ✅ Create migration script
2. ✅ Run database migrations (add columns)
3. ✅ Update API endpoints
4. ✅ Update type definitions
5. ✅ Test draft flow
6. ✅ Update frontend (if needed)
7. ✅ Update documentation

