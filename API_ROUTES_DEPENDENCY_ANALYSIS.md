# API Routes & Dependencies Analysis for Multi-Season Cleanup

## Overview
This document maps which pages use which API routes, so we can decide what to keep and what to remove.

---

## 1. app/dashboard/committee/page_old.tsx

### Status: ❌ DELETE (Old backup file)

### API Routes Used:
- `/api/players` (GET) - Fetch all players

### Purpose:
Old/backup version of committee dashboard. Not actively used.

### Recommendation:
**DELETE** - This is a backup file, the main `page.tsx` is the active version.

---

## 2. app/dashboard/committee/real-players/page.tsx

### Status: ⚠️ NEEDS MAJOR REFACTORING

### API Routes Used:

#### 1. `/api/star-rating-config` (GET)
- **Line**: 130
- **Purpose**: Fetch star rating configuration for auction values
- **Status**: ❌ DELETED (was in Phase 2)
- **Impact**: Page will fail when trying to load star rating config
- **Used For**: Getting minimum auction values based on star ratings

#### 2. `/api/contracts/assign-bulk` (POST)
- **Lines**: 489, 590
- **Purpose**: Assign players to teams with multi-season contracts
- **Status**: ✅ EXISTS (app/api/contracts/assign-bulk/)
- **Used For**: 
  - Quick assign feature (line 489)
  - Save team assignments (line 590)
- **Payload**: Includes `contractStartSeason`, `contractEndSeason`, `salaryPerMatch`

#### 3. `/api/auth/set-token` (POST)
- **Line**: 580
- **Purpose**: Refresh auth token
- **Status**: ✅ EXISTS (standard auth route)
- **Used For**: Token refresh before saving

#### 4. `/api/stats/players` (GET)
- **Line**: 177 (via fetchWithTokenRefresh)
- **Purpose**: Fetch players from Neon database
- **Status**: ✅ EXISTS
- **Used For**: Loading player data for Season 16+

### Features in This Page:
1. **Team Management** - Assign SS Members to teams
2. **Contract Management** - Set 2-season contracts (S16→S17)
3. **Auction Value Assignment** - Set auction values for players
4. **Salary Calculation** - Calculate salary per match
5. **Budget Tracking** - Show team budgets (dual currency system)
6. **Quick Assign** - Fast player assignment with WhatsApp integration

### Multi-Season Dependencies:
- ❌ Star rating config (deleted API)
- ⚠️ Contract start/end seasons (multi-season concept)
- ⚠️ Salary per match (multi-season concept)
- ⚠️ 2-season contract duration logic
- ✅ Auction values (can keep for single-season)
- ✅ Team assignments (can keep for single-season)

### Recommendation:
**REFACTOR** to single-season model:
1. Remove star-rating-config API call (lines 129-137)
2. Simplify to single-season assignments (remove contract duration)
3. Keep auction value assignment
4. Keep team assignment functionality
5. Simplify salary calculation (no multi-season)
6. Update `/api/contracts/assign-bulk` to handle single-season OR create new `/api/realplayers/assign` route

---

## 3. app/dashboard/committee/contracts/mid-season-salary/page.tsx

### Status: ❌ DELETE (Deleted Feature #8)

### API Routes Used:

#### 1. `/api/contracts/mid-season-salary/preview` (GET)
- **Line**: 77
- **Purpose**: Preview mid-season salary deductions
- **Status**: ❌ DELETED (was in Phase 2)
- **Used For**: Showing which teams will be charged

#### 2. `/api/contracts/mid-season-salary` (POST)
- **Line**: 245
- **Purpose**: Process mid-season salary deductions
- **Status**: ❌ DELETED (was in Phase 2)
- **Used For**: Deducting football player salaries (10% of auction value)

### Features in This Page:
1. **Mid-Season Salary Payment** - Deduct 10% of football player auction value
2. **Preview Mode** - See deductions before processing
3. **Custom Amounts** - Override calculated amounts
4. **WhatsApp Integration** - Generate messages for teams
5. **Selective Processing** - Choose which teams to process

### Recommendation:
**DELETE** - This entire feature was removed in Phase 2. The page and both API routes are gone.

---

## 4. app/dashboard/committee/contracts/reconcile/page.tsx

### Status: ❌ DELETE (Deleted Feature #12)

### API Routes Used:

#### 1. `/api/admin/reconcile-contracts` (POST)
- **Line**: 40
- **Purpose**: Handle player contracts when teams don't re-register
- **Status**: ❌ DELETED (was in Phase 2)
- **Used For**: Cutting contracts and releasing players

### Features in This Page:
1. **Contract Reconciliation** - Cut contracts for non-returning teams
2. **Preview Mode** - See what will be affected
3. **Execute Mode** - Actually update database
4. **Handles Both** - SS Members and Football Players

### Recommendation:
**DELETE** - This entire feature was removed in Phase 2. The page and API route are gone.

---

## 5. app/dashboard/committee/contracts/expire/page.tsx

### Status: ❌ DELETE (Found during search)

### API Routes Used:

#### 1. `/api/contracts/expire` (POST)
- **Line**: 64
- **Purpose**: Expire contracts at end of season
- **Status**: ❌ DELETED (was in Phase 2)
- **Used For**: Marking contracts as expired

### Recommendation:
**DELETE** - This API was deleted in Phase 2.

---

## API Routes Status Summary

### Deleted APIs (Phase 2):
1. ❌ `/api/star-rating-config` - Used by real-players page
2. ❌ `/api/contracts/assign` - Not found in search
3. ❌ `/api/contracts/mid-season-salary` - Used by mid-season-salary page
4. ❌ `/api/contracts/mid-season-salary/preview` - Used by mid-season-salary page
5. ❌ `/api/contracts/expire` - Used by expire page
6. ❌ `/api/admin/reconcile-contracts` - Used by reconcile page

### Still Exist:
1. ✅ `/api/contracts/assign-bulk` - Used by real-players page
2. ✅ `/api/stats/players` - Used by real-players page
3. ✅ `/api/auth/set-token` - Standard auth route

---

## Decision Matrix

### Pages to Delete (No Refactoring Needed):
| Page | Reason | APIs Used | Impact |
|------|--------|-----------|--------|
| page_old.tsx | Backup file | /api/players | None - not used |
| mid-season-salary/page.tsx | Feature deleted | 2 deleted APIs | None - APIs gone |
| reconcile/page.tsx | Feature deleted | 1 deleted API | None - API gone |
| expire/page.tsx | Feature deleted | 1 deleted API | None - API gone |

### Pages to Refactor:
| Page | Keep? | Reason | Action Needed |
|------|-------|--------|---------------|
| real-players/page.tsx | ✅ YES | Core team management | Remove multi-season logic, simplify to single-season |

---

## Refactoring Plan for real-players/page.tsx

### What to Remove:
1. ❌ Star rating config API call (lines 129-137)
2. ❌ Contract start/end season fields
3. ❌ 2-season contract duration logic
4. ❌ Contract options dropdown (getContractOptions function)
5. ❌ Multi-season salary calculation

### What to Keep:
1. ✅ Team assignment functionality
2. ✅ Auction value assignment
3. ✅ Player listing and search
4. ✅ Budget tracking
5. ✅ Quick assign feature
6. ✅ WhatsApp integration

### What to Simplify:
1. ⚠️ Use simple salary calculation (no multi-season)
2. ⚠️ Single-season assignments only
3. ⚠️ Remove contract duration UI elements

### New API Route Needed:
Create `/api/realplayers/assign` (single-season version) OR update `/api/contracts/assign-bulk` to handle both models.

---

## API Route: /api/contracts/assign-bulk Analysis

### Current Location:
`app/api/contracts/assign-bulk/route.ts`

### What It Does:
- Assigns players to teams
- Sets auction values
- Sets salary per match
- Sets contract start/end seasons
- Updates both Neon (player_seasons) and Firebase (realplayer)

### Options:
1. **Keep & Update** - Make it work for single-season (remove contract duration)
2. **Create New** - Create `/api/realplayers/assign` for single-season model
3. **Make Flexible** - Support both multi-season (historical) and single-season (new)

### Recommendation:
**Option 3 - Make Flexible**: Update the route to:
- Accept optional `contractStartSeason` and `contractEndSeason`
- If not provided, use current season only
- This preserves historical data while supporting new single-season model

---

## Final Recommendations

### Immediate Actions:
1. ✅ DELETE `app/dashboard/committee/page_old.tsx`
2. ✅ DELETE `app/dashboard/committee/contracts/mid-season-salary/page.tsx`
3. ✅ DELETE `app/dashboard/committee/contracts/reconcile/page.tsx`
4. ✅ DELETE `app/dashboard/committee/contracts/expire/page.tsx` (if exists)

### Refactoring Actions:
1. ⚠️ UPDATE `app/dashboard/committee/real-players/page.tsx`:
   - Remove star-rating-config API call
   - Simplify to single-season model
   - Remove contract duration UI
   - Keep core assignment functionality

2. ⚠️ UPDATE `app/api/contracts/assign-bulk/route.ts`:
   - Make contract seasons optional
   - Support single-season assignments
   - Preserve backward compatibility for historical data

### Testing Checklist:
- [ ] Delete 4 pages
- [ ] Update real-players page
- [ ] Update assign-bulk API
- [ ] Test player assignment works
- [ ] Test budget tracking works
- [ ] Verify no broken links
- [ ] Run diagnostics

---

## Next Steps

1. Confirm deletion of 4 pages
2. Decide on API strategy (flexible vs new route)
3. Refactor real-players page
4. Update API route
5. Test thoroughly
6. Update documentation
