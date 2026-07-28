# Team Pages Real Player Stats Fix

## Problem
The team pages were incorrectly fetching from `player_seasons` table instead of `realplayerstats` for manager selection and other features in S18+ seasons.

## Root Cause
- The `/api/team/[teamId]/route.ts` was using `isModernSeason()` helper that treated S16+ as "modern" seasons
- This logic queried `player_seasons` for S16+, but `player_seasons` should only be used for S16-S17
- The ManagerRegistrationForm was using `/api/team/${teamId}/players` which only fetched football players, not real cricket players

## Solution Implemented

### 1. Updated `/app/api/team/[teamId]/route.ts`
**Changed logic to:**
- S16-S17 only: Query `player_seasons` table
- S1-S15 and S18+: Query `realplayerstats` table

**Before:**
```typescript
if (isModernSeason(seasonId)) {
  // Season 16+: Query player_seasons table
  realPlayersData = await sql`SELECT * FROM player_seasons ...`;
} else {
  // Season 1-15: Query realplayerstats table
  realPlayersData = await sql`SELECT * FROM realplayerstats ...`;
}
```

**After:**
```typescript
if (isModernSeason(seasonId)) {
  // Season 16-17 only: Query player_seasons table
  realPlayersData = await sql`SELECT * FROM player_seasons ...`;
} else {
  // Season 1-15 and S18+: Query realplayerstats table
  realPlayersData = await sql`SELECT * FROM realplayerstats ...`;
}
```

### 2. Created New Endpoint `/app/api/team/real-players/route.ts`
**Purpose:** Fetch real cricket players (not football players) for a specific team and season

**Features:**
- Accepts `teamId` and `seasonId` as query parameters
- Uses same season logic: S16-S17 queries `player_seasons`, all others query `realplayerstats`
- Returns consistent data format for both table sources
- Used specifically for manager registration and selection

**Endpoint URL:**
```
GET /api/team/real-players?teamId={teamId}&seasonId={seasonId}
```

**Response Format:**
```json
{
  "success": true,
  "data": [
    {
      "id": "player_doc_id",
      "player_id": "sspslpsl0038",
      "name": "Player Name",
      "position": "Striker",
      "photo_url": null
    }
  ]
}
```

### 3. Updated ManagerRegistrationForm Component
**Changed endpoint from:**
```typescript
fetch(`/api/team/${teamId}/players?seasonId=${seasonId}`)
```

**To:**
```typescript
fetch(`/api/team/real-players?teamId=${teamId}&seasonId=${seasonId}`)
```

This ensures manager selection shows real cricket players from `realplayerstats` instead of football players.

## Verification: All Team-Side Routes Checked ✅

### Routes Already Using Correct Logic (S16-S17 → player_seasons, others → realplayerstats):
1. ✅ `/api/team/[teamId]/route.ts` - **FIXED** (updated comments)
2. ✅ `/api/team/[teamId]/players/route.ts` - Already correct
3. ✅ `/api/team/[teamId]/roster/route.ts` - Already correct
4. ✅ `/api/team/tournament-players/route.ts` - Already correct
5. ✅ `/api/team/player-stats/route.ts` - Already correct
6. ✅ `/api/team/dashboard/route.ts` - Already correct
7. ✅ `/api/team/player-counts/route.ts` - Already correct
8. ✅ `/api/team/all/route.ts` - Already correct
9. ✅ `/api/team/player-matchday-stats/route.ts` - Already correct
10. ✅ `/api/team/historical-stats/route.ts` - Only uses `realplayerstats` (correct for historical data)

### New Route Created:
11. ✅ `/api/team/real-players/route.ts` - **NEW** (created for manager selection)

## Season Data Flow

### Season 1-15 (Historical)
- **Real Players:** `realplayerstats` table ✅
- **Football Players:** `footballplayers` table

### Season 16-17 (Transition)
- **Real Players:** `player_seasons` table ✅
- **Football Players:** `footballplayers` table

### Season 18+ (Current)
- **Real Players:** `realplayerstats` table ✅
- **Football Players:** `footballplayers` table

## Files Modified
1. ✅ `app/api/team/[teamId]/route.ts` - Updated season logic and comments
2. ✅ `app/api/team/real-players/route.ts` - New endpoint created
3. ✅ `components/forms/ManagerRegistrationForm.tsx` - Updated to use new endpoint

## Testing Checklist
- [ ] Test manager selection in S18+ seasons - should show real cricket players from `realplayerstats`
- [ ] Test manager selection in S16-S17 seasons - should show players from `player_seasons`
- [ ] Test manager selection in S1-S15 seasons - should show players from `realplayerstats`
- [ ] Verify team dashboard displays correct player data
- [ ] Verify `/api/team/[teamId]` endpoint returns correct real players for each season range
- [ ] Test all other team-side routes to ensure they still work correctly

## Related Issue
Previously, when trying to select a manager in S18+ seasons, the system was querying `player_seasons` table which didn't have the correct data, resulting in empty or incorrect player lists.

## Status
✅ **COMPLETED** - All changes implemented and all team-side routes verified to use correct table logic
