# Player Stats Bulk Update - Super Admin Feature

## Overview

A comprehensive Super Admin tool for exporting, updating, and importing player statistics for historical seasons via Excel spreadsheets.

## Features

✅ **Season Selection** - Choose any season from the database
✅ **Flexible Stats Selection** - Select which stats fields you want to update
✅ **Excel Export** - Generate properly formatted Excel files with current values
✅ **Preview Changes** - See exactly what will be updated before committing
✅ **Safe Import** - Only updates selected fields, leaves other data untouched
✅ **Validation** - Built-in error checking and data validation
✅ **Summary Reports** - Detailed reports of what was changed

## Available Stats Fields

- **Total Points** - Total points accumulated by player
- **Matches Played** - Total matches played
- **Matches Won** - Matches won
- **Matches Drawn** - Matches drawn
- **Matches Lost** - Matches lost
- **Goals Scored** - Goals scored
- **Goals Conceded** - Goals conceded
- **Assists** - Assists made
- **Clean Sheets** - Clean sheets kept
- **MOTM Awards** - Man of the Match awards
- **Star Rating** - Star rating (3-10)
- **Wins** - Total wins
- **Draws** - Total draws
- **Losses** - Total losses

## How to Use

### Step 1: Export Data

1. Navigate to: **Super Admin Dashboard → Bulk Stats Update**
2. Select a season from the dropdown (e.g., SSPSLS6, SSPSLS7, etc.)
3. Check the stats fields you want to update
4. Click **"Export to Excel"**
5. An Excel file will be downloaded with the current data

### Step 2: Update Excel File

1. Open the downloaded Excel file
2. You'll see two sheets:
   - **"Player Stats Update"** - Main data sheet
   - **"Instructions"** - Detailed instructions
3. The file contains:
   - **Identifying columns**: player_id, player_name, season_id, team_name, category
   - **Current value columns**: `current_[field]` - shows current database values
   - **Update columns**: `new_[field]` - **HIGHLIGHTED IN YELLOW** - fill these in!
4. Fill in the yellow `new_*` columns with updated values:
   - Only fill in rows/fields you want to update
   - Leave cells empty to skip that player/field
   - Use numeric values only
5. Save the Excel file

### Step 3: Preview Changes

1. Back on the Bulk Stats Update page
2. Click **"Choose File"** and select your updated Excel file
3. Click **"Preview Changes"**
4. Review the preview:
   - Total rows processed
   - Number of players to update
   - Number skipped (empty cells)
   - Any errors detected
   - Sample of updates showing current → new values
5. Check for errors before proceeding

### Step 4: Execute Import

1. If the preview looks correct, click **"Execute Import"**
2. Confirm the warning dialog
3. The system will:
   - Update only the selected stats fields
   - Leave all other player data unchanged
   - Show a success summary when complete
4. Review the import results

## Database Updates

The tool updates the `realplayerstats` table in the NEON tournament database:

```sql
UPDATE realplayerstats
SET 
  [selected_field] = [new_value],
  updated_at = NOW()
WHERE player_id = [player_id]
AND season_id = [season_id]
```

**Important:**
- Only updates the fields you selected during export
- Does NOT touch other fields like trophies, team_id, etc.
- Preserves all historical data integrity

## Excel File Structure

### Identifying Columns (Read-Only)
- `player_id` - UUID of the player
- `player_name` - Player's name
- `season_id` - Season identifier
- `team_name` - Team the player was on
- `category` - Player category

### Data Columns (Per Selected Field)
- `current_[field]` - Current value in database (reference only)
- `new_[field]` - **NEW value to update** (fill this in!)

Example for Total Points:
- `current_total_points` - Shows current database value
- `new_total_points` - Fill in the updated value here

## Use Cases

### 1. Fix Missing Historical Data
Perfect for when historical season imports didn't capture all stats:
- Select seasons S6-S9
- Select "Total Points"
- Export, fill in missing points, import

### 2. Correct Data Entry Errors
Fix mistakes in historical records:
- Select the affected season
- Select the fields that need correction
- Update only the incorrect values

### 3. Bulk Stat Adjustments
Apply adjustments to multiple players at once:
- Export all players for a season
- Update multiple stats fields
- Import all changes in one go

## Safety Features

✅ **Preview Before Import** - See exactly what will change
✅ **Selective Updates** - Only updates non-empty cells
✅ **Field Validation** - Checks for numeric values
✅ **Error Reporting** - Shows validation errors before import
✅ **No Data Loss** - Only updates specified fields
✅ **Audit Trail** - updated_at timestamps track changes

## API Endpoints

### Export
```
POST /api/superadmin/player-stats-bulk-update/export
Body: { seasonId, statsFields }
Returns: Excel file download
```

### Preview
```
POST /api/superadmin/player-stats-bulk-update/preview
Body: FormData with file
Returns: { summary, seasonStats, updates }
```

### Import
```
POST /api/superadmin/player-stats-bulk-update/import
Body: FormData with file
Returns: { success, summary }
```

## File Locations

### Page
```
app/dashboard/superadmin/player-stats-bulk-update/page.tsx
```

### API Routes
```
app/api/superadmin/player-stats-bulk-update/export/route.ts
app/api/superadmin/player-stats-bulk-update/preview/route.ts
app/api/superadmin/player-stats-bulk-update/import/route.ts
```

## Tips & Best Practices

1. **Start Small** - Test with one season first before doing multiple
2. **Double Check** - Always preview before importing
3. **Keep Backups** - Save your Excel files as backups
4. **Incremental Updates** - You can export, import, then export again for additional updates
5. **Validation** - The system validates numeric values automatically
6. **Empty Cells** - Leave cells empty for players you don't want to update

## Error Handling

The system handles:
- Invalid file formats
- Missing required columns
- Non-numeric values in stats fields
- Missing player IDs or season IDs
- Database connection errors

All errors are reported in the preview phase before any data is changed.

## Example Workflow: Fixing S6-S9 Total Points

1. Go to Super Admin → Bulk Stats Update
2. Select "SSPSLS6" from season dropdown
3. Check only "Total Points"
4. Click "Export to Excel"
5. Open the file, fill in the `new_total_points` column with correct values
6. Save the file
7. Upload the file back
8. Click "Preview Changes" - verify the updates
9. Click "Execute Import"
10. Repeat for SSPSLS7, SSPSLS8, SSPSLS9

## Security

- Only accessible to Super Admin users
- Requires authentication token
- All operations are logged
- Database updates use parameterized queries
- Input validation on all fields

---

**Created:** 2025-01-27
**Location:** Super Admin Dashboard → Bulk Stats Update
**Access:** Super Admin only
