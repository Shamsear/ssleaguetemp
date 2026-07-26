# Capitalize Categories - Database Update

## Overview
This script capitalizes all player category values in both `player_seasons` (S16/S17) and `realplayerstats` (S18+) tables to ensure consistency across the application.

## Categories Updated
The following categories will be capitalized:
- `Legend` → `LEGEND`
- `Classic` → `CLASSIC`
- `Gold` → `GOLD`
- `Silver` → `SILVER`
- `Bronze` → `BRONZE`
- `Rising Star` → `RISING STAR`
- `Veteran` → `VETERAN`

## How to Run

### Method 1: Using Node.js
```bash
node capitalize-categories.js
```

### Method 2: Using npm/yarn
```bash
npm run capitalize-categories
# or
yarn capitalize-categories
```

## What the Script Does

1. **Updates player_seasons table (S16/S17 seasons)**
   - Capitalizes all category values
   - Updates the `updated_at` timestamp
   - Only updates rows where the category is not already capitalized

2. **Updates realplayerstats table (S18+ and S1-S15 seasons)**
   - Capitalizes all category values
   - Updates the `updated_at` timestamp
   - Only updates rows where the category is not already capitalized

3. **Shows Summary**
   - Displays count of players by category in each table
   - Confirms total number of rows updated

## Code Changes Made

### Backend APIs Updated
1. **`/app/api/realplayers/update-points/route.ts`**
   - `calculateCategory()` function now returns capitalized categories
   - Default category changed to `'BRONZE'`
   - Category comparison uses `.toUpperCase().trim()`

2. **`/app/api/committee/player-categorization/route.ts`**
   - Categories are now capitalized before saving to database
   - Uses `.toUpperCase().trim()` on all category assignments

3. **`/app/api/telegram/email-requests/[id]/route.ts`**
   - Default category changed to `'WHITE'` and capitalized

4. **`/app/api/realplayers/recalculate-categories/route.ts`**
   - Legend and Classic categories now saved as `'LEGEND'` and `'CLASSIC'`

### Frontend Components Updated
1. **`/app/dashboard/committee/real-players/page.tsx`**
   - Default category changed to `'BRONZE'`

2. **`/app/dashboard/team/fixture/[fixtureId]/page.tsx`**
   - Category comparisons now use `.toUpperCase()`
   - Display text shows capitalized categories

3. **`/app/dashboard/team/RegisteredTeamDashboard.tsx`**
   - Category comparisons now use `.toUpperCase()`
   - Display text shows capitalized categories

## After Running the Script

1. All existing player categories in the database will be capitalized
2. Future category assignments will automatically be capitalized
3. The AI stats update system will only assign capitalized categories
4. Frontend displays will show categories in uppercase

## Verification

After running the script, you can verify the changes by:
1. Checking the script output for the number of updated rows
2. Reviewing the category summary tables displayed at the end
3. Navigating to `/dashboard/committee/real-players` and checking player categories

## Rollback

If you need to revert categories to title case (Legend, Classic, etc.), you can run a similar UPDATE query:
```sql
UPDATE player_seasons
SET category = INITCAP(category)
WHERE category IS NOT NULL;

UPDATE realplayerstats  
SET category = INITCAP(category)
WHERE category IS NOT NULL;
```

## Notes

- The script only updates rows where the category needs to be changed (idempotent)
- Running the script multiple times is safe
- The script preserves all other player data
- Both Firebase and PostgreSQL/Neon databases are kept in sync
