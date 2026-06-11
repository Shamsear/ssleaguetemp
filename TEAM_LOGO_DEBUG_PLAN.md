# Team Logo Debug Plan

## Issue
Team logos are not appearing in Player of Day/Week posters. Console shows `team_logo: undefined`.

## Data Flow Investigation

### Backend (API Route)
**File**: `app/api/committee/player-stats-by-round/route.ts`

The backend:
1. Fetches team logos from Firebase `team_seasons` collection (lines 380-400)
2. Creates a `teamLogoMap` mapping team names to logo URLs
3. Attempts to match player team names with team_seasons team names (lines 400-460)
4. Uses multiple matching strategies:
   - Exact match
   - Trimmed match
   - Fuzzy match with/without " FC" suffix
5. Adds `team_logo` field to player objects

**Added Debug Logs**:
- ✅ Log all team names from team_seasons
- ✅ Log number of logos found and added
- ✅ Log first 3 players with their team_logo and photo_url
- ✅ Log sample player in final response with all fields

### Frontend (Page Component)
**File**: `app/dashboard/committee/team-management/player-stats-by-round/page.tsx`

The frontend:
1. Calls the API endpoint
2. Receives JSON response with player data
3. Sets `playerStats` state with the data
4. Passes `playerStats` to `PosterStudio` component as `players` prop

**Added Debug Logs**:
- ✅ Log received data from API with team_logo field

### Component Chain
**Files**: 
- `components/PosterStudio.tsx`
- `components/PosterDesigns.tsx`

Component flow:
1. `PosterStudio` receives `players` prop from page
2. Filters/sorts players based on theme and selection
3. Passes players to `PosterSnapshot` component
4. `PosterSnapshot` passes player to `SinglePlayerDesign`
5. `SinglePlayerDesign` calls `PlayerOfDayDesign` or `PlayerOfWeekDesign`
6. Design components try to use `player.team_logo`

**Existing Debug Logs**:
- ✅ `PlayerOfDayDesign` logs player data structure
- ✅ `PlayerOfWeekDesign` logs player data structure

## Next Steps

### 1. Check Server Console
After navigating to the page and loading player stats, check the server console for:
```
[Player Stats By Round] Team logo map keys: [array of team names]
[Player Stats By Round] Successfully added X photos and Y team logos
[Player Stats By Round] First 3 players team data: [array with team_logo fields]
[Player Stats By Round] Sample player (full data): {includes team_logo}
```

### 2. Check Browser Console  
Check the browser console for:
```
[Player Stats By Round Page] Received data from API: {samplePlayer with team_logo}
[PlayerOfDayDesign] Player data: {includes team_logo}
```

### 3. Diagnose Based on Logs

**If team_logo is present in backend logs but undefined in frontend:**
- Data serialization issue between API and frontend
- Check if NextResponse.json properly serializes the fields
- Check for any middleware transforming the response

**If team_logo is undefined in backend logs:**
- Team names in player stats don't match team names in team_seasons
- Check the console for warnings like "No logo found for player X team Y"
- Compare player team names with team_seasons team names
- May need to adjust the matching logic or team name normalization

**If team_seasons collection is empty:**
- No logos in Firebase database
- Need to populate team_seasons with logo_url field

## TypeScript Interfaces

All interfaces already include `team_logo?: string`:
- ✅ `PlayerStats` interface in `page.tsx`
- ✅ `PlayerStats` interface in `PosterStudio.tsx`
- ✅ `PlayerStats` interface in `PosterDesigns.tsx`

## Current Status

🔍 **DEBUG MODE ACTIVE** - Enhanced logging added to track data flow from Firebase → API → Frontend → Components

**Action Required**: 
1. Navigate to the page: `http://localhost:3000/dashboard/committee/team-management/player-stats-by-round`
2. Select a theme like "Player of Day" or "Player of Week"
3. Check server console and browser console logs
4. Report findings to diagnose the root cause
