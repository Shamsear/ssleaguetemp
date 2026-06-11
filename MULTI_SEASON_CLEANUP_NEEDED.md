# Multi-Season Features Cleanup Report

## Status: Additional Cleanup Required

After removing the 13 committee admin features, several files still contain references to multi-season contract system features that need attention.

---

## Files That Need Cleanup

### 1. **app/dashboard/committee/page_old.tsx** ❌
**Status**: Old/backup file - SHOULD BE DELETED
**Issues**:
- Line 330: Links to deleted `/dashboard/committee/team-contracts` page
- Line 336: Links to deleted `/dashboard/committee/player-ratings` page
- Contains references to deleted contract management pages

**Recommendation**: DELETE this entire file (it's a backup/old version)

---

### 2. **app/dashboard/committee/real-players/page.tsx** ⚠️
**Status**: Active file - NEEDS UPDATE
**Issues**:
- Line 130: Calls deleted API `/api/star-rating-config`
- Line 199-203: References `salary_per_match` field (multi-season)
- Uses `calculateRealPlayerSalary` from lib/salary-utils (OK)
- References `contract_start_season`, `contract_end_season` fields

**Recommendation**: 
- Remove star rating config API call (lines 129-137)
- Keep salary calculation but simplify (no multi-season contracts)
- Remove contract season fields from UI

---

### 3. **app/dashboard/committee/contracts/mid-season-salary/page.tsx** ❌
**Status**: Active file - SHOULD BE DELETED
**Issues**:
- Entire page for mid-season salary feature (deleted feature #8)
- Calls deleted API `/api/contracts/mid-season-salary`
- Calls deleted API `/api/contracts/mid-season-salary/preview`

**Recommendation**: DELETE this entire file

---

### 4. **app/dashboard/committee/contracts/reconcile/page.tsx** ❌
**Status**: Active file - SHOULD BE DELETED
**Issues**:
- Entire page for contract reconciliation feature (deleted feature #12)
- Calls deleted API `/api/admin/reconcile-contracts`

**Recommendation**: DELETE this entire file

---

## Database Fields Still in Use

### Fields that appear in active code:
1. `salary_per_match` - Used in multiple pages
2. `contract_start_season` - Used in player management
3. `contract_end_season` - Used in player management
4. `star_rating` - Used extensively
5. `player_seasons` table - Referenced in many scripts

**Note**: These fields exist in the database for historical Season 16-17 data. The question is whether NEW pages should continue using them or switch to single-season model.

---

## Scripts Directory (Historical/Maintenance)

Many scripts in `/scripts/` directory reference multi-season features:
- `check-player-seasons-*.js` - Query player_seasons table
- `check-football-player-contracts.js` - Check contract fields
- `backfill-historical-swaps.js` - Uses contract fields

**Recommendation**: KEEP these scripts - they're for historical data maintenance and debugging

---

## Transaction Types Still in Use

These transaction types are still referenced in active code:
- `match_reward` - Used in transactions page, all-transactions page
- `salary_per_match` - Used in player stats pages

**Recommendation**: 
- `match_reward` - KEEP (this is a valid transaction type for match bonuses)
- `salary_per_match` - REMOVE from new implementations, keep for historical data

---

## Summary of Actions Needed

### Immediate Deletions Required:
1. ❌ DELETE `app/dashboard/committee/page_old.tsx`
2. ❌ DELETE `app/dashboard/committee/contracts/mid-season-salary/page.tsx`
3. ❌ DELETE `app/dashboard/committee/contracts/reconcile/page.tsx`

### Files Needing Updates:
1. ⚠️ UPDATE `app/dashboard/committee/real-players/page.tsx`
   - Remove star-rating-config API call
   - Simplify contract fields (remove multi-season logic)
   - Keep basic salary calculation

### Database Strategy:
- ✅ Keep all database fields/tables for historical data (Season 16-17)
- ✅ New pages should use single-season model (Firebase `realplayer` collection)
- ✅ Scripts can continue querying historical data

### Transaction Types:
- ✅ Keep `match_reward` (valid for match bonuses)
- ⚠️ Phase out `salary_per_match` in new implementations

---

## Verification Checklist

- [ ] Delete page_old.tsx
- [ ] Delete mid-season-salary page
- [ ] Delete reconcile page
- [ ] Update real-players page to remove star-rating-config
- [ ] Verify no broken links in committee dashboard
- [ ] Test that remaining pages work without deleted APIs
- [ ] Document which fields are "historical only" vs "active use"

---

## Next Steps

1. Delete the 3 identified files
2. Update real-players page to remove deleted API calls
3. Run diagnostics to check for any broken imports
4. Test committee dashboard navigation
5. Update SALARY_CONTRACT_REMOVAL_STATUS.md with final status
