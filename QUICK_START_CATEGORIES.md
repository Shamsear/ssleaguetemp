# Quick Start: Capitalize Categories

## 🚀 Run This Command

```bash
npm run capitalize-categories
```

## ✅ What This Does

1. ✨ Capitalizes all categories in the database:
   - `Legend` → `LEGEND`
   - `Classic` → `CLASSIC`
   - `Gold` → `GOLD`
   - `Silver` → `SILVER`
   - `Bronze` → `BRONZE`
   - `Rising Star` → `RISING STAR`
   - `Veteran` → `VETERAN`

2. 🔄 Updates both tables:
   - `player_seasons` (S16/S17)
   - `realplayerstats` (S18+)

3. 📊 Shows you a summary of changes

## 🎯 What's Already Been Updated

### Backend ✓
- AI stats update now assigns CAPITAL categories
- Player categorization saves CAPITAL categories
- Category recalculation uses CAPITAL categories
- Default categories are now CAPITAL

### Frontend ✓
- All category comparisons are case-insensitive
- Display text shows CAPITAL categories
- Fixed S18+ player loading bug

## 📋 After Running

1. ✅ All existing categories will be CAPITAL
2. ✅ New categories will be CAPITAL automatically
3. ✅ Frontend will display CAPITAL categories
4. ✅ AI will only assign CAPITAL categories

## 🔍 Verify It Worked

1. Check the script output (should show # of rows updated)
2. Visit: `http://localhost:3000/dashboard/committee/real-players`
3. Categories should show as: LEGEND, CLASSIC, GOLD, etc.

## ⚠️ Important

- Safe to run multiple times
- No data loss
- Only updates the `category` column
- Preserves all other player data

## 📚 More Info

- Read `CAPITALIZE_CATEGORIES_README.md` for detailed documentation
- Read `CATEGORY_CAPITALIZATION_SUMMARY.md` for complete change list
