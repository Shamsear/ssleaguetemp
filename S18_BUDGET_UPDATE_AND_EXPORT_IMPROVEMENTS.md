# S18+ Budget Update & Export Players Improvements

## Overview
Two major updates completed:
1. **S18+ teams now use 500 SSCoins** instead of 1000
2. **Export players page now supports multiple seasons** selection

---

## 1. S18+ Budget Update (1000 → 500 SSCoins)

### Changes Made

#### A. Season Registration API Updated
**File**: `app/api/seasons/[id]/register/route.ts`

```typescript
// S18+ uses 500 SSCoins, earlier seasons use 1000
const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
const realPlayerBudget = seasonNum >= 18 ? 500 : (seasonData.dollar_budget || 1000);
```

- **New registrations for S18+** will automatically get 500 SSCoins
- **S15, S16, S17** still get 1000 SSCoins (or custom amount)

#### B. Migration Script Created
**File**: `update-s18-budget-to-500.ts`

**What it does**:
- Finds all `team_seasons` for S18+ (season_id >= 'SSPSLS18')
- Updates initial budget from 1000 → 500
- Recalculates current budget: `500 - spent`
- Skips teams already at 500
- Uses Firestore batch operations (500 ops per batch)

**Fields updated**:
```typescript
{
  initial_real_player_budget: 500,
  real_player_budget_initial: 500,
  real_player_budget: 500 - currentSpent,
  real_player_starting_balance: 500,
  updated_at: new Date()
}
```

---

### How to Run Budget Update

```bash
npm run update-s18-budget
```

**Expected output**:
```
🔧 Updating S18+ Team Budgets to 500 SSCoins...

📋 Found 45 team_seasons for S18+

✅ SSPSLT0001_SSPSLS18: 1000 → 500 | Current: 800 → 300 | Spent: 200
✅ SSPSLT0002_SSPSLS18: 1000 → 500 | Current: 950 → 450 | Spent: 50
⏭️  SSPSLT0003_SSPSLS18: Already at 500 (skipped)

💾 Committed batch of 42 updates

📊 Summary:
   ✅ Updated: 42 team_seasons
   ⏭️  Skipped: 3 team_seasons
   📋 Total: 45 team_seasons

✅ Budget update complete!
```

---

### Verification

After running the script, verify in Firestore:

```
team_seasons/[TEAM_ID]_SSPSLS18
{
  initial_real_player_budget: 500,    ← Should be 500
  real_player_budget: 300,            ← Should be 500 - spent
  real_player_spent: 200,
  ...
}
```

---

## 2. Export Players Page - Multiple Seasons Support

### Changes Made

**File**: `app/dashboard/committee/export-players/page.tsx`

#### Before (Single Season)
- Select dropdown for 1 season
- Load players from 1 season
- Export Excel with 1 season data

#### After (Multiple Seasons)
- **Checkboxes for multiple seasons**
- **Select All / Clear All buttons**
- Load players from selected seasons
- Export Excel with all selected seasons data
- **Season column added** to show which season each player is from

---

### New Features

1. **Multi-Select UI**
   - Grid of season buttons
   - Click to toggle selection
   - Amber highlight for selected seasons
   - Shows count: "(3 selected)"

2. **Bulk Actions**
   - **Select All** - Check all seasons
   - **Clear All** - Uncheck all seasons

3. **Enhanced Excel Export**
   - Includes "Season" column
   - Filename shows season count: `RealPlayers_3_Seasons_2024-12-26.xlsx`
   - All data from selected seasons in one file

4. **Better Preview Table**
   - Season column with blue badges
   - Player name, category, team
   - Goals, wins, draws, losses
   - Shows first 50 players with scroll

---

### Usage Example

1. Go to `/dashboard/committee/export-players`
2. Click on multiple season buttons (e.g., S15, S16, S17, S18)
3. Click **"Load Players from 4 Season(s)"**
4. Review the preview table
5. Click **"Export to Excel"**
6. Download: `RealPlayers_4_Seasons_2024-12-26.xlsx`

---

### Excel File Structure

```
# | Season  | Player ID | Player Name | Category | Team      | Base | Auction | Points | Matches | Goals | Assists | CS | W | D | L
1 | S18     | P001      | John Doe    | RED      | Team A    | 25   | 30      | 150    | 10      | 5     | 3       | 2  | 6 | 2 | 2
2 | S18     | P002      | Jane Smith  | BLACK    | Team B    | 20   | 25      | 120    | 9       | 3     | 4       | 1  | 5 | 2 | 2
3 | S17     | P001      | John Doe    | RED      | Team C    | 25   | 28      | 140    | 11      | 4     | 2       | 3  | 7 | 1 | 3
...
```

---

## 📊 Summary of Changes

### Files Modified
1. `app/api/seasons/[id]/register/route.ts` - Season registration logic
2. `app/dashboard/committee/export-players/page.tsx` - Export page UI
3. `package.json` - Added npm script

### Files Created
1. `update-s18-budget-to-500.ts` - Migration script
2. `S18_BUDGET_UPDATE_AND_EXPORT_IMPROVEMENTS.md` - This file

---

## ✅ Testing Checklist

### Budget Update
- [ ] Run migration script: `npm run update-s18-budget`
- [ ] Verify Firestore: Check team_seasons have 500 budget
- [ ] Register new S18 team → Should get 500 SSCoins
- [ ] Register new S17 team → Should get 1000 SSCoins

### Export Page
- [ ] Select single season → Exports correctly
- [ ] Select multiple seasons → Exports correctly
- [ ] Select All button works
- [ ] Clear All button works
- [ ] Preview table shows season column
- [ ] Excel file has season column
- [ ] Filename reflects season count

---

## 🎯 Benefits

### Budget Update
- **Consistent pricing** across S18+ seasons
- **Easier auction planning** with standard 500 budget
- **Automatic** for new registrations
- **Retroactive** with migration script

### Export Improvements
- **Compare players across seasons**
- **Historical analysis** in single export
- **Faster workflow** - no multiple downloads
- **Better insights** - see player progression

---

## 📝 Notes

### Budget Update
- Safe to run multiple times (skips already-updated teams)
- Preserves spent amounts
- Recalculates remaining budget correctly
- Uses batch operations for efficiency

### Export Page
- Can select 1 to all seasons
- No limit on number of seasons
- Loads data sequentially (no rate limiting issues)
- Excel library handles large datasets well

---

## 🚀 Future Enhancements

### Potential Improvements
1. **Season range selector** (e.g., S15-S18)
2. **Player comparison view** - side-by-side stats
3. **CSV export option** for analysis tools
4. **Filter by category/team** before export
5. **Aggregate stats** - career totals per player

---

**Status**: ✅ Complete and Ready to Use
**Date**: December 2024
