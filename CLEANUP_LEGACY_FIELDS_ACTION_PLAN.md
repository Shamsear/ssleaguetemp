# Legacy Fields Cleanup Action Plan

**Date**: June 4, 2026
**Status**: 📋 Action Plan - Not Yet Executed

---

## Overview

This document outlines the plan to remove legacy fields from the codebase that are no longer needed based on the current system design:

1. **Multi-Season Contract Fields** - Remove auto-registration logic
2. **Single Currency System** - Remove single currency support (keep only dual)
3. **Penalty System** - Remove skipped seasons and penalty tracking

---

## ⚠️ IMPORTANT: Before Executing

### 1. **Database Backup**
```bash
# Backup Firebase
# Use Firebase Console > Firestore > Export

# Backup Neon PostgreSQL
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

### 2. **Data Migration Requirements**

#### Check Existing Data
```sql
-- Check if any teams have skipped_seasons or penalties
SELECT team_id, skipped_seasons, penalty_amount, last_played_season
FROM team_seasons (Firebase)
WHERE skipped_seasons > 0 OR penalty_amount > 0;

-- Check if any teams use single currency
SELECT team_id, currency_system, balance
FROM team_seasons (Firebase)
WHERE currency_system = 'single';

-- Check contract fields
SELECT team_id, contract_start_season, contract_end_season, is_auto_registered
FROM team_seasons (Firebase)
WHERE is_auto_registered = true 
   OR contract_start_season IS NOT NULL;
```

#### Migration Strategy
If data exists:
1. **Export** all records with legacy fields
2. **Document** any active multi-season contracts
3. **Notify** affected teams
4. **Migrate** single currency to dual currency
5. **Clear** penalty balances (or apply them first)

---

## Phase 1: Remove Multi-Season Contract Fields

### Fields to Remove

#### Firebase `team_seasons` Collection
- `contract_id`
- `contract_start_season`
- `contract_end_season`
- `contract_length`
- `is_auto_registered`
- `registration_type` (keep it simple, always "manual")

#### Neon `player_seasons` Table
- `contract_id`
- `contract_start_season`
- `contract_end_season`
- `contract_length`

### Files to Update

#### 1. Type Definitions
**File**: `types/*.ts`
```typescript
// REMOVE from TeamSeason interface:
contract_id?: string;
contract_start_season?: string;
contract_end_season?: string;
contract_length?: number;
is_auto_registered?: boolean;
registration_type?: string;
```

#### 2. API Routes
**Files to update**:
- `app/api/team/dashboard/route.ts` (lines 176-181)
- `app/api/team/[teamId]/route.ts` (lines 181-182)
- `app/api/seasons/[id]/register/route.ts` (entire contract logic section)

**Changes**:
```typescript
// REMOVE these fields from API responses
delete teamData.contract_id;
delete teamData.contract_start_season;
delete teamData.contract_end_season;
delete teamData.is_auto_registered;
```

#### 3. Components
**Files to update**:
- `app/dashboard/team/RegisteredTeamDashboard.tsx` (line 42)
- `app/dashboard/team/squad/[teamId]/page.tsx` (line 172)
- `app/dashboard/committee/teams/page_old.tsx` (lines 28-29, 185-186)

**Changes**:
Remove all contract-related UI elements and props.

#### 4. Scripts (Archive or Update)
**Files**:
- `scripts/add-contract-columns.ts` - Archive (no longer needed)
- `scripts/analyze-realplayer-seasons-takeover.js` - Update to remove contract references
- `scripts/complete-asgardians-document.js` - Update or archive

---

## Phase 2: Remove Single Currency System

### Fields to Remove

#### Firebase `team_seasons` Collection
- `balance` (single currency field)
- `total_spent` (single currency field)

Keep only:
- `currency_system: 'dual'` (but make it implicit)
- `football_budget` (eCoin)
- `football_spent`
- `real_player_budget` (SSCoin)
- `real_player_spent`

### Files to Update

#### 1. Remove Currency System Checks
**Files with `currency_system === 'single'` checks**:
- `app/dashboard/team/RegisteredTeamDashboard.tsx` (lines 702, 1393, 1657)
- `app/api/seasons/[id]/register/route.ts` (lines 155, 169)
- `scripts/reset-team-budgets.ts` (line 112)
- `scripts/migrate-season16-to-dual-currency.js` (archive this script)
- All `fix-team-finances*.js` scripts

**Changes**:
```typescript
// REMOVE this check:
if (team.currency_system === 'dual') {
  // dual currency logic
} else {
  // single currency logic  
}

// REPLACE with:
// Always assume dual currency
const budget = team.football_budget;
const spent = team.football_spent;
```

#### 2. UI Components
**File**: `app/dashboard/team/RegisteredTeamDashboard.tsx`

**Current** (lines 702-752):
```typescript
{team.currency_system === 'dual' ? (
  <div>Dual currency display</div>
) : (
  <div>Single currency display</div>
)}
```

**Replace with**:
```typescript
<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
  <div>eCoin (€): {team.football_budget}</div>
  <div>SSCoin ($): {team.real_player_budget}</div>
  <div>Squad: {stats.playerCount}/{team.football_total_slots}</div>
  <div>Avg Rating: {stats.avgRating}</div>
</div>
```

#### 3. Type Definitions
```typescript
// REMOVE from interfaces:
currency_system?: 'single' | 'dual';
balance?: number;
total_spent?: number;

// Keep only:
football_budget: number;
football_spent: number;
real_player_budget: number;
real_player_spent: number;
```

---

## Phase 3: Remove Penalty System

### Fields to Remove

#### Firebase `team_seasons` Collection
- `skipped_seasons`
- `penalty_amount`
- `last_played_season`

### Files to Update

#### 1. Type Definitions
```typescript
// REMOVE:
skipped_seasons?: number;
penalty_amount?: number;
last_played_season?: string;
```

#### 2. API Routes
**Files**:
- `app/api/team/dashboard/route.ts` (lines 176-178)
- `app/api/team/[teamId]/route.ts` (lines 177-179)
- `app/api/seasons/[id]/register/route.ts` (penalty calculation section)

**Remove**:
```typescript
// DELETE penalty calculation logic
const skippedSeasons = lastPlayedSeason?.skipped_seasons || 0;
const penaltyAmount = skippedSeasons * PENALTY_PER_SKIPPED_SEASON;
```

#### 3. Components
**Files**:
- `app/dashboard/team/RegisteredTeamDashboard.tsx` (lines 38-40)
- `app/dashboard/team/squad/[teamId]/page.tsx` (lines 172-173)
- `app/dashboard/team/all-teams/page.tsx` (lines 23-25, 211-213)
- `app/dashboard/committee/teams/page_old.tsx` (lines 24-26, 181-183)

**Remove**:
All penalty display UI elements.

#### 4. Scripts
**Files with penalty logic**:
- `scripts/complete-asgardians-document.js`
- `scripts/verify-asgardians-complete.js`

---

## Phase 4: Backward-Compatible Implementation

### ✅ RECOMMENDED APPROACH: Dual Path Strategy

Instead of removing fields, we implement a **dual path** that:
1. **Reads** from both old and new fields (backward compatible)
2. **Writes** only to new fields (forward compatible)
3. **Gracefully handles** missing fields with fallbacks

#### Example: Currency System

```typescript
// ✅ GOOD: Backward-compatible read
function getTeamBudget(team: any): { football: number, real: number } {
  // Try new dual currency fields first
  if (team.football_budget !== undefined && team.real_player_budget !== undefined) {
    return {
      football: team.football_budget,
      real: team.real_player_budget
    };
  }
  
  // Fallback to old single currency (for legacy data)
  if (team.balance !== undefined) {
    return {
      football: team.balance,
      real: 0  // No real player budget in old system
    };
  }
  
  // Default values if nothing exists
  return {
    football: 10000,
    real: 1000
  };
}

// ✅ GOOD: Always write to new fields
function updateTeamBudget(teamId: string, football: number, real: number) {
  return updateDoc(doc(db, 'team_seasons', teamId), {
    football_budget: football,
    real_player_budget: real,
    // Don't write to old 'balance' field anymore
  });
}
```

#### Example: Multi-Season Contracts

```typescript
// ✅ GOOD: Ignore contract fields, but don't break if they exist
function isTeamRegistered(team: any, seasonId: string): boolean {
  // Check current season registration
  return team.season_id === seasonId && team.status === 'registered';
  
  // Don't check is_auto_registered or contract fields anymore
  // But they won't cause errors if they exist
}
```

#### Example: Penalties

```typescript
// ✅ GOOD: Ignore penalties, but handle if present
function calculateStartingBudget(seasonConfig: any, previousSeason?: any): number {
  // New system: always use season default
  const baseBudget = seasonConfig.default_football_budget || 10000;
  
  // Old system would check: previousSeason?.penalty_amount
  // We ignore it now, but code doesn't break if field exists
  
  return baseBudget;
}
```

### Database Schema Updates

#### Firebase Firestore: NO CHANGES NEEDED
```typescript
// ✅ Keep all fields in database
// ✅ Code just ignores old fields
// ✅ Existing data works as-is
// ✅ New registrations use new fields only

// Example document can have both:
{
  // Old fields (still there, but unused)
  balance: 1000,
  contract_id: "old_contract",
  skipped_seasons: 0,
  
  // New fields (actively used)
  football_budget: 10000,
  real_player_budget: 1000,
  
  // Both coexist peacefully!
}
```

#### Neon PostgreSQL: ADD, Don't Remove
```sql
-- ✅ ADD new columns if missing (don't drop old ones)
ALTER TABLE player_seasons
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- ✅ Keep old contract columns for historical data
-- They won't hurt anything, just won't be used for new records

-- ✅ Create view for clean data access
CREATE OR REPLACE VIEW active_player_seasons AS
SELECT 
  player_id,
  team_id,
  season_id,
  -- Use new fields only in view
  acquisition_value,
  status
FROM player_seasons
WHERE status = 'active';
```

---

## Benefits of Dual Path Approach

### ✅ Zero Downtime
- Deploy changes gradually
- No "big bang" migration
- Rollback is trivial (just revert code)

### ✅ No Data Migration Needed
- Existing data stays as-is
- New data uses new format
- Both work simultaneously

### ✅ Backward Compatible
- Old data still readable
- Historical queries work
- Reports don't break

### ✅ Forward Compatible
- New features use new fields
- Gradual transition
- Eventually old fields become unused naturally

### ✅ Low Risk
- No database alterations
- No data loss
- Easy to verify

---

## Implementation Pattern

### 1. Utility Functions (Create Once, Use Everywhere)

**File**: `lib/team-season-utils.ts`
```typescript
/**
 * Backward-compatible utility to get team budgets
 * Handles both old single currency and new dual currency
 */
export function getTeamBudgets(teamSeason: any) {
  // Prefer new dual currency fields
  if (teamSeason.football_budget !== undefined) {
    return {
      football: teamSeason.football_budget,
      footballSpent: teamSeason.football_spent || 0,
      real: teamSeason.real_player_budget || 0,
      realSpent: teamSeason.real_player_spent || 0,
      system: 'dual' as const
    };
  }
  
  // Fallback to old single currency
  if (teamSeason.balance !== undefined) {
    return {
      football: teamSeason.balance,
      footballSpent: teamSeason.total_spent || 0,
      real: 0,
      realSpent: 0,
      system: 'single' as const
    };
  }
  
  // Defaults
  return {
    football: 10000,
    footballSpent: 0,
    real: 1000,
    realSpent: 0,
    system: 'dual' as const
  };
}

/**
 * Always write using new format
 */
export function setTeamBudgets(teamSeasonRef: any, budgets: {
  football: number;
  footballSpent: number;
  real: number;
  realSpent: number;
}) {
  return updateDoc(teamSeasonRef, {
    football_budget: budgets.football,
    football_spent: budgets.footballSpent,
    real_player_budget: budgets.real,
    real_player_spent: budgets.realSpent,
    // currency_system is implicit (always dual now)
    // Don't touch old balance/total_spent fields
  });
}

/**
 * Check if team is registered (ignore contract fields)
 */
export function isTeamRegisteredForSeason(teamSeason: any, seasonId: string): boolean {
  return teamSeason.season_id === seasonId && 
         teamSeason.status === 'registered';
  // Old code might check: && !teamSeason.is_auto_registered
  // We don't care anymore - registration is registration
}

/**
 * Get starting budget (ignore penalties)
 */
export function getStartingBudget(seasonConfig: any): {
  football: number;
  real: number;
} {
  return {
    football: seasonConfig.default_football_budget || 10000,
    real: seasonConfig.default_real_player_budget || 1000
  };
  // Old code would subtract penalty_amount
  // We don't do that anymore
}
```

### 2. Update Components to Use Utilities

**Before**:
```typescript
// ❌ Direct access, breaks with old data
const budget = team.football_budget;
const spent = team.football_spent;
```

**After**:
```typescript
// ✅ Use utility function
import { getTeamBudgets } from '@/lib/team-season-utils';

const budgets = getTeamBudgets(teamSeason);
// Works with both old and new data!
```

### 3. Update API Routes

**Before**:
```typescript
// ❌ Conditional logic everywhere
if (team.currency_system === 'dual') {
  balance = team.football_budget;
} else {
  balance = team.balance;
}
```

**After**:
```typescript
// ✅ One function handles all cases
const budgets = getTeamBudgets(teamSeason);
// budgets.football works regardless of data format
```

---

## Migration Timeline (Non-Breaking)

### Week 1: Create Utility Functions
- Create `lib/team-season-utils.ts`
- Add comprehensive tests
- Deploy (no changes to app yet)

### Week 2: Update UI Components
- Replace direct field access with utility functions
- Test with existing data (should work unchanged)
- Deploy gradually (feature flags if needed)

### Week 3: Update API Routes
- Use utilities in all API endpoints
- Verify existing functionality
- Deploy

### Week 4: Update New Registrations
- New registrations write only new fields
- Old data still readable
- Both formats coexist

### Future: Natural Deprecation
- Over time, old fields become unused
- Can be cleaned up later (optional)
- No urgency - they're harmless

---

## Testing Checklist

After each phase:

### Phase 1 Tests (Multi-Season Removal)
- [ ] Team registration works without contract fields
- [ ] Existing registrations still display correctly
- [ ] No references to `is_auto_registered` in UI
- [ ] API responses don't include contract fields
- [ ] No errors in browser console

### Phase 2 Tests (Single Currency Removal)
- [ ] All teams show dual currency display
- [ ] Budget calculations use football_budget/real_player_budget
- [ ] No conditional checks for currency_system
- [ ] Auction bids deduct from correct budget
- [ ] Transaction history shows dual currency

### Phase 3 Tests (Penalty Removal)
- [ ] Registration doesn't calculate penalties
- [ ] UI doesn't display penalty information
- [ ] Teams register with full starting budget
- [ ] No skipped_seasons tracking

### Overall Tests
- [ ] Full registration flow works
- [ ] Team dashboard loads correctly
- [ ] Auctions function properly
- [ ] Budget tracking accurate
- [ ] No TypeScript errors
- [ ] No console warnings
- [ ] Database queries optimized

---

## Rollback Plan

If issues occur:

1. **Revert Code Changes**
```bash
git revert <commit-hash>
git push
```

2. **Restore Database**
```bash
# Restore from backup
psql $DATABASE_URL < backup_YYYYMMDD.sql

# Firebase: Use Console > Import
```

3. **Communicate**
- Notify users of rollback
- Document issues encountered
- Plan fixes before retry

---

## Execution Timeline (Recommended: Dual Path)

### ✅ Week 1: Create Utility Layer
**Risk**: NONE (no changes to existing code)

1. Create `lib/team-season-utils.ts` with backward-compatible functions
2. Write comprehensive tests
3. Deploy (library available but not used yet)

### ✅ Week 2: Update UI Components  
**Risk**: VERY LOW (utilities handle both formats)

1. Replace direct field access with utility functions in:
   - `app/dashboard/team/RegisteredTeamDashboard.tsx`
   - `app/dashboard/team/squad/[teamId]/page.tsx`
   - `app/dashboard/team/all-teams/page.tsx`
2. Test with existing data (should work identically)
3. Deploy

### ✅ Week 3: Update API Routes
**Risk**: LOW (backward compatible reads)

1. Update API endpoints:
   - `app/api/team/dashboard/route.ts`
   - `app/api/team/[teamId]/route.ts`
   - `app/api/seasons/[id]/register/route.ts`
2. Use utility functions for all team_season operations
3. Deploy

### ✅ Week 4: New Registrations Only Write New Fields
**Risk**: NONE (reads still backward compatible)

1. Update registration flow to write only new fields
2. Old data still readable via utilities
3. Both formats coexist peacefully

### 🎯 Result: Zero Breaking Changes
- ✅ Existing data works unchanged
- ✅ New data uses new format
- ✅ Gradual transition
- ✅ No data migration needed
- ✅ Easy rollback (just revert code)

### Alternative: **Big Bang Migration** (❌ Not Recommended)
- All changes at once
- Higher risk
- Longer testing required
- Greater chance of issues
- **Not needed with dual path approach!**

---

## Success Criteria

✅ **Code Cleanup**
- No references to removed fields in active code
- TypeScript compiles without errors
- All tests pass

✅ **Database**
- No orphaned data
- Optimized schema
- Faster queries

✅ **User Experience**
- No disruption to teams
- All features work as before
- Cleaner, more consistent UI

✅ **Documentation**
- All docs updated
- Migration notes published
- Team communication sent

---

## Files Summary

### High Priority (Must Update)
1. `app/dashboard/team/RegisteredTeamDashboard.tsx` - Main UI component
2. `app/api/team/dashboard/route.ts` - Dashboard API
3. `app/api/seasons/[id]/register/route.ts` - Registration logic
4. Type definitions in `types/*.ts`

### Medium Priority (Should Update)
5. `app/dashboard/committee/teams/*` - Admin views
6. `app/dashboard/team/squad/*` - Squad views
7. `app/api/team/[teamId]/route.ts` - Team API

### Low Priority (Can Archive)
8. Migration scripts in `scripts/*`
9. Audit scripts for old currency system
10. Historical data scripts

---

## Conclusion

This cleanup will:
- ✅ Simplify codebase
- ✅ Remove ~500+ lines of dead code
- ✅ Improve performance
- ✅ Make system easier to maintain
- ✅ Align code with documentation

**Recommendation**: Execute gradually over 4 weeks with thorough testing at each phase.

**Risk Level**: MEDIUM (with proper testing and backups)

**Effort**: ~40 hours of development + testing