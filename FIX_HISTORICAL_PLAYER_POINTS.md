# Fix Historical Player Total Points (S6-S9)

## Problem
During the historical season import for seasons 6-9 (SSPSLS6, SSPSLS7, SSPSLS8, SSPSLS9), the player `total_points` field was not properly fetched and saved to the `realplayerstats` table.

## Solution Overview
We'll provide:
1. An Excel export template showing players from each season that need updating
2. A script to update ONLY the `total_points` column based on the Excel data

## Step 1: Export Current Data

Run this script to export the current player data for seasons 6-9:

```bash
node export-historical-players-for-update.js
```

This will create a file: `historical_players_points_update_SSPSLS[6-9].xlsx`

## Step 2: Fill in the Total Points

Open the Excel file and:
- Review the columns: `player_id`, `player_name`, `season_id`, `current_points`, `new_total_points`
- Fill in the `new_total_points` column with the correct values from your historical records
- The `current_points` column shows what's currently in the database (likely 0 or incorrect)
- Leave `new_total_points` empty if you don't want to update that player

## Step 3: Import Updated Points

Once you've filled in the Excel file, run:

```bash
node import-historical-player-points.js historical_players_points_update_SSPSLS[X].xlsx
```

This will:
- Read the Excel file
- Update ONLY the `total_points` column in `realplayerstats` table
- NOT touch any other player statistics
- Provide a summary of updates

## Data Structure

### Excel Columns:
- `player_id` - Player UUID (e.g., sspslpsl0001)
- `player_name` - Player name for reference
- `season_id` - Season identifier (SSPSLS6, SSPSLS7, etc.)
- `team_name` - Team the player was on
- `current_points` - Current total_points value in database
- `new_total_points` - NEW value to update (fill this in!)
- `matches_played` - For reference only
- `goals_scored` - For reference only

## Safety Features

The import script will:
- ✅ Show a preview before making any changes
- ✅ Create a backup SQL file of current values
- ✅ Only update rows where `new_total_points` is not empty
- ✅ Log all changes made
- ✅ Provide rollback instructions if needed

## Notes

- This is a surgical update - it ONLY changes the `total_points` field
- All other player statistics remain unchanged
- You can run this multiple times for different seasons
- The script validates that the season exists before updating
