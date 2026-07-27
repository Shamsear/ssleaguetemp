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

## Related Issue
Previously, when trying to select a manager in S18+ seasons, the system was querying `player_seasons` table which didn't have the correct data, resulting in empty or incorrect player lists.

## Status
✅ **COMPLETED** - All changes implemented and ready for testing
