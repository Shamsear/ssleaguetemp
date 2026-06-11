# Poster Studio Player Photo Fix

## Changes Made

### 1. API Route Update (`app/api/committee/player-stats-by-round/route.ts`)
- Added Firebase Admin SDK integration to fetch player photos
- Photos are fetched from Firestore `players` collection after stats are calculated
- Mapped to player stats by `player_id`
- Added `photo_url` field to each player in the API response

### 2. Component Updates (`components/PosterDesigns.tsx`)
- Updated `PlayerStats` interface to support both `player_photo` and `photo_url` fields
- Added field name compatibility in `SinglePlayerDesign`
- Player photo now displays correctly in posters

### 3. Layout Improvements (`components/PosterDesigns.tsx`)
- **SinglePlayerDesign**: 
  - Team logo moved to LEFT side (42×42px)
  - Player name and team name appear to the RIGHT of logo
  - Horizontal flex layout for better space usage
  - Player name uses single-line with ellipsis overflow handling
  - Season/week info added to footer LEFT side
- **TableDesign**:
  - Added safety filter to remove undefined players

## If Photos Still Don't Appear

### Option 1: Restart Dev Server
The development server might be using cached code. Try:
```bash
# Stop the current server (Ctrl+C)
# Then restart
npm run dev
```

### Option 2: Clear Next.js Cache
```bash
# Remove .next folder
rm -rf .next
# Or on Windows
rmdir /s /q .next

# Then restart
npm run dev
```

### Option 3: Verify Firebase Config
Make sure `FIREBASE_SERVICE_ACCOUNT_KEY` environment variable is set in `.env.local`:
```
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

## Testing
1. Navigate to player stats page: `/dashboard/committee/team-management/player-stats-by-round`
2. Click "Poster Studio" button
3. Select a theme (Golden Boot, Golden Ball, etc.)
4. Player photos should now appear in the posters

## Technical Details
- **Database**: Player photos are stored in Firebase Firestore (`players` collection)
- **Field Name**: `photo_url`
- **API Response**: Now includes `photo_url` for each player
- **Fallback**: If photo is not available, shows placeholder icon
