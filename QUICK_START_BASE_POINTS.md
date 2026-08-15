# Quick Start: Fantasy Base Points Feature

## What This Feature Does

Shows **ALL players'** base points (without captain/vice-captain multipliers) so teams can:
- View performance of undrafted players
- Plan acquisitions when releasing existing players
- Compare players side-by-side
- Track per-round performance history

## Step-by-Step Setup

### 1. Apply Database Migration

Run the migration to make `team_id` nullable in `fantasy_player_points`:

```bash
# Using psql
psql -h <your-neon-host> -U <username> -d <database> -f migrations/make_team_id_nullable_fantasy_player_points.sql

# Or copy-paste SQL directly in Neon console
```

**Migration File**: `migrations/make_team_id_nullable_fantasy_player_points.sql`

### 2. Verify Migration

Run verification script:

```bash
psql -h <your-neon-host> -U <username> -d <database> -f scripts/verify-base-points-implementation.sql
```

**Expected Output**:
```
check_type              | status
------------------------+----------------------------------------
Implementation Status   | ✅ team_id is nullable
Base Points Records     | ⚠️ No base points records yet (run calculateLineupPoints)
Unique Constraint       | ✅ Unique constraint exists
```

### 3. Calculate Points for a Round

**Option A: Via API**
```bash
POST /api/fantasy/calculate-points
{
  "league_id": "your_league_id",
  "round_id": "your_round_id"
}
```

**Option B: Via Admin UI**
Navigate to the admin panel and click "Calculate Points" for a round.

**What Happens**:
- Calculates points for drafted players (with multipliers)
- **NEW**: Also calculates base points for ALL players (undrafted get team_id = NULL)

### 4. Access the Pages

**For Team Managers**:
```
URL: /dashboard/team/fantasy/all-players-points
```

**For Committee Admins**:
```
URL: /dashboard/committee/fantasy/all-players-points
```

### 5. Add Navigation Links (Optional)

The pages already exist but may not be linked in navigation. Add links to:

**Team Navigation** (`components/layout/MobileNav.tsx` or similar):
```typescript
{ 
  href: '/dashboard/team/fantasy/all-players-points', 
  label: 'All Players - Base Points', 
  icon: Target 
}
```

**Committee Navigation**:
```typescript
{ 
  href: '/dashboard/committee/fantasy/all-players-points', 
  label: 'Fantasy - All Players', 
  icon: Trophy 
}
```

## Testing Checklist

### Database
- [ ] Migration applied successfully
- [ ] `team_id` is nullable in `fantasy_player_points`
- [ ] Unique constraint exists for undrafted players

### API
- [ ] Calculate points for a round
- [ ] Verify base points records created with `team_id = NULL`
- [ ] API endpoint `/api/fantasy/players/all-base-points` returns data

### UI - Team Page
- [ ] Access `/dashboard/team/fantasy/all-players-points`
- [ ] See all players with base points
- [ ] Filter: All / Available / Drafted works
- [ ] Sort by: Points / Name / Acquired By works
- [ ] Search functionality works
- [ ] Round selector shows per-round points
- [ ] Acquisition status displays correctly

### UI - Admin Page
- [ ] Access `/dashboard/committee/fantasy/all-players-points`
- [ ] League selector works
- [ ] All team page features work
- [ ] Can switch between leagues

## Quick Verification Queries

### Check if base points are being calculated:
```sql
SELECT COUNT(*) 
FROM fantasy_player_points 
WHERE team_id IS NULL;
```

### View sample base points:
```sql
SELECT 
    player_name,
    fantasy_round_id,
    base_points,
    total_points,
    recorded_at
FROM fantasy_player_points 
WHERE team_id IS NULL
ORDER BY base_points DESC
LIMIT 10;
```

### Compare drafted vs undrafted points:
```sql
SELECT 
    real_player_id,
    player_name,
    COUNT(*) FILTER (WHERE team_id IS NULL) as base_point_records,
    COUNT(*) FILTER (WHERE team_id IS NOT NULL) as drafted_point_records,
    SUM(base_points) FILTER (WHERE team_id IS NULL) as total_base_points
FROM fantasy_player_points
GROUP BY real_player_id, player_name
ORDER BY total_base_points DESC
LIMIT 10;
```

## Troubleshooting

### Issue: No base points records found
**Solution**: Calculate points for at least one round using the admin panel or API.

### Issue: API returns empty players array
**Solution**: 
1. Check if league_id is correct
2. Verify points have been calculated for at least one round
3. Check if `fantasy_players` table has players for that league

### Issue: Page shows "Failed to fetch players"
**Solution**:
1. Check browser console for errors
2. Verify API endpoint is accessible: `/api/fantasy/players/all-base-points?league_id=xxx`
3. Check if user has proper authentication

### Issue: Duplicate base points for same player-round
**Solution**: The unique constraint should prevent this. If it happens:
```sql
-- Find duplicates
SELECT league_id, real_player_id, fantasy_round_id, COUNT(*)
FROM fantasy_player_points
WHERE team_id IS NULL
GROUP BY league_id, real_player_id, fantasy_round_id
HAVING COUNT(*) > 1;

-- Delete duplicates (keep latest)
DELETE FROM fantasy_player_points a
WHERE team_id IS NULL
AND id NOT IN (
    SELECT MAX(id)
    FROM fantasy_player_points b
    WHERE b.league_id = a.league_id
    AND b.real_player_id = a.real_player_id
    AND b.fantasy_round_id = a.fantasy_round_id
    AND b.team_id IS NULL
);
```

## Feature Usage

### For Team Managers

**Planning Acquisitions**:
1. Go to `/dashboard/team/fantasy/all-players-points`
2. Filter "Available" to see undrafted players
3. Sort by "Total Points" to find top performers
4. Note high-scoring players for future acquisition

**Comparing Players**:
1. Select a specific round
2. View per-round performance
3. Check goals, assists, MOTM, clean sheets
4. Identify consistent performers vs one-off scorers

**Market Analysis**:
1. See which teams have acquired which players
2. Identify acquisition patterns
3. Plan trading strategies

### For Committee Admins

**League Monitoring**:
1. Go to `/dashboard/committee/fantasy/all-players-points`
2. Select league to monitor
3. View all player performance metrics
4. Track acquisition patterns across teams

**Balancing Analysis**:
1. Identify if certain players are over-performing
2. Check pricing vs performance correlation
3. Monitor league competitive balance

## Files Changed

### New Files
- `migrations/make_team_id_nullable_fantasy_player_points.sql`
- `app/dashboard/committee/fantasy/all-players-points/page.tsx`
- `scripts/verify-base-points-implementation.sql`
- `FANTASY_BASE_POINTS_IMPLEMENTATION.md`
- `QUICK_START_BASE_POINTS.md`

### Modified Files
- `lib/fantasy/points-calculator-v2.ts` (added `calculateAllPlayersBasePoints()`)
- `fantasy_database_schema.sql` (made `team_id` nullable)
- `app/api/fantasy/players/all-base-points/route.ts` (already existed)
- `app/dashboard/team/fantasy/all-players-points/page.tsx` (already existed)

## Support

If you encounter issues:
1. Check the verification script output
2. Review API responses in browser dev tools
3. Check database records manually
4. Review calculation logs for errors

For detailed documentation, see: `FANTASY_BASE_POINTS_IMPLEMENTATION.md`
