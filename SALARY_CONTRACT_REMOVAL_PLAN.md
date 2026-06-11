# Salary & Contract System Removal Plan

## Overview
Converting from multi-season contract system to single-season without salary management.

## Features to Remove

### 1. Committee Admin Pages (13 pages)
- ❌ Player Contracts (`app/dashboard/committee/contracts/page.tsx`)
- ❌ Team Contracts (`app/dashboard/committee/team-contracts/page.tsx`)
- ❌ Player Ratings (`app/dashboard/committee/player-ratings/page.tsx`)
- ❌ Star Rating Config (`app/dashboard/committee/star-rating-config/page.tsx`)
- ❌ Stars and Points (`app/dashboard/committee/player-stars-points/page.tsx`)
- ❌ Star Upgrades (`app/dashboard/committee/player-star-upgrades/page.tsx`)
- ❌ Upgrade Ratings (same as star upgrades)
- ❌ Mid Season Salary (`app/dashboard/committee/salary-transactions/page.tsx`)
- ❌ Real Player Salaries (same as salary transactions)
- ❌ Match Rewards (`app/dashboard/committee/match-rewards/page.tsx`)
- ❌ Tournament Rewards (`app/dashboard/committee/tournament-rewards/page.tsx`)
- ❌ Contract Reconciliations (`app/api/admin/reconcile-contracts/route.ts`)
- ❌ Send Refunds (`app/api/committee/refunds/send/route.ts`)

### 2. API Routes (10+ routes)
- ❌ `/api/contracts/assign/route.ts` - Player contract assignment
- ❌ `/api/contracts/mid-season-salary/route.ts` - Mid-season salary deductions
- ❌ `/api/committee/refunds/send/route.ts` - Send refunds
- ❌ `/api/admin/reconcile-contracts/route.ts` - Contract reconciliation
- ❌ `/api/transactions/create-match-reward/route.ts` - Match rewards
- ❌ `/api/committee/salary-transactions/route.ts` - Salary transactions query
- ❌ `/api/player-ratings/assign/route.ts` - Player ratings assignment
- ❌ `/api/player-ratings/recalculate-categories/route.ts` - Category recalculation
- ❌ `/api/star-rating-config/route.ts` - Star rating config
- ❌ `/api/committee/update-player-stars-points/route.ts` - Update stars/points

### 3. Core Library Files
- ❌ `lib/contracts.ts` - All contract/salary calculation logic
- ❌ `types/salary-preview.ts` - Salary preview types

### 4. Database Strategy - Preserve Historical Data

#### Understanding Table Structure
**Single-Season Tables (Keep for historical data):**
- `realplayer` (Firebase) - Original single-season player data
- `footballplayers` (Neon Auction DB) - Single-season football players
- `teams` (Neon Auction DB) - Single-season team data

**Multi-Season Tables (Can be archived/removed):**
- `player_seasons` (Neon Tournament DB) - Added for Season 16+ multi-season contracts
- Extended fields in `team_seasons` (Firebase) - Multi-season budget tracking

#### Approach: Archive Multi-Season Data, Keep Single-Season Tables

**Option A: Archive player_seasons table (Recommended)**
```sql
-- Rename player_seasons to player_seasons_archive
ALTER TABLE player_seasons RENAME TO player_seasons_archive;

-- Keep the table for historical reference but don't use it
COMMENT ON TABLE player_seasons_archive IS 'Archived multi-season contract data (Season 16-17). Not used in single-season model.';
```

**Option B: Keep player_seasons but stop using contract fields**
- Keep table structure intact
- Only use basic fields (player_id, player_name, season_id, team_id, stats)
- Ignore contract-related columns (star_rating, points, auction_value, salary_per_match, contract_*)

#### Firebase Collections - Remove Multi-Season Fields Only

**team_seasons (keep collection, remove fields):**
- ❌ `dollar_balance`, `dollar_spent` (multi-season dual currency)
- ❌ `real_player_budget`, `real_player_spent` (multi-season)
- ❌ `football_budget`, `football_spent` (multi-season)
- ❌ `last_salary_deduction` (salary tracking)
- ❌ `skipped_seasons`, `penalty_amount`, `last_played_season` (contract penalties)
- ❌ `contract_id`, `contract_start_season`, `contract_end_season` (team contracts)
- ❌ `is_auto_registered` (auto-registration for 2nd season)
- ✅ KEEP: `balance`, `initial_balance`, `total_spent` (single-season budget)

**realplayer (Firebase - keep collection, clean fields):**
- ❌ `star_rating`, `points`, `base_points` (rating system)
- ❌ `auction_value`, `salary_per_match` (salary tracking)
- ❌ `contract_start_season`, `contract_end_season`, `contract_status` (contracts)
- ❌ `category`, `category_id`, `category_name` (player categories)
- ✅ KEEP: Basic player info (name, team_id, season_id, stats)

**transactions (Firebase - filter, don't delete):**
- ❌ Archive `transaction_type: 'salary'` or `'salary_payment'`
- ❌ Archive `transaction_type: 'match_reward'`
- ❌ Archive `transaction_type: 'refund'`
- ❌ Archive `currency_type: 'real_player'` transactions
- ✅ KEEP: All other transaction types for audit trail

#### Neon PostgreSQL - Archive Multi-Season Extensions

**player_seasons table (Tournament DB):**
```sql
-- Option 1: Archive entire table
ALTER TABLE player_seasons RENAME TO player_seasons_s16_s17_archive;

-- Option 2: Keep table, add flag to ignore contract fields
ALTER TABLE player_seasons ADD COLUMN use_contract_system BOOLEAN DEFAULT FALSE;
UPDATE player_seasons SET use_contract_system = FALSE;
```

**footballplayers table (Auction DB):**
- ❌ Remove: `acquisition_value`, `salary_per_half_season`
- ❌ Remove: `contract_start_season`, `contract_end_season`, `contract_status`
- ✅ KEEP: All other fields (player attributes, team assignment, auction status)

**teams table (Auction DB):**
- ❌ Remove: `dollar_balance`, `dollar_spent`
- ❌ Remove: `football_budget`, `football_spent`
- ❌ Remove: `real_player_budget`, `real_player_spent`
- ✅ KEEP: Basic team info, single `balance` field if needed

### 5. Migration Scripts to Remove
- ❌ `scripts/add-contract-columns.ts`
- ❌ `scripts/add-contract-columns.sql`
- ❌ `scripts/add-contract-duration-to-auction-settings.js`
- ❌ `scripts/add-footballplayers-contract-fields.ts`
- ❌ `migrations/add_contract_seasons_to_player_history.sql`
- ❌ `scripts/create-manchester-united-salary-transactions.js`
- ❌ `scripts/fix-duplicate-salary-deductions.sql`
- ❌ `scripts/preview-contract-fix.js`

### 6. Documentation to Remove
- ❌ `.analysis/multi-season-contract-support.md`
- ❌ `.analysis/football-players-contract-filter.md`
- ❌ `.analysis/real-players-budget-improvements.md`
- ❌ `SALARY_CALCULATION_REPORT.md`

## What to Keep

### Keep for Single Season
- ✅ Basic team registration
- ✅ Player registration
- ✅ Match/fixture management
- ✅ Tournament management
- ✅ Standings/statistics
- ✅ Basic budget tracking (single currency if needed)

### Simplified Budget Model
Instead of dual currency (eCoin/SSCoin) with salaries:
- Single budget per team per season
- No salary deductions
- No contract tracking
- No multi-season commitments

## Implementation Steps

### Phase 1: Remove UI Pages
1. Delete all 13 committee admin pages listed above
2. Remove menu links from committee dashboard
3. Update navigation components

### Phase 2: Remove API Routes
1. Delete all API route files
2. Remove any middleware/auth checks specific to these routes

### Phase 3: Clean Core Libraries
1. Delete `lib/contracts.ts`
2. Delete `types/salary-preview.ts`
3. Update `types/realPlayer.ts` - remove contract fields
4. Update `types/footballPlayer.ts` - remove contract fields
5. Update `types/team.ts` - remove budget tracking fields

### Phase 4: Database Cleanup (Data Preservation Strategy)
1. **Archive player_seasons table** (rename to player_seasons_s16_s17_archive)
2. **Remove multi-season fields** from Firebase collections (keep collections intact)
3. **Create migration scripts** to remove contract columns from Neon tables
4. **Archive salary/reward transactions** (move to separate collection for history)
5. **Document data preservation** for potential future migration back to multi-season

### Phase 5: Update Dependent Code
1. Search for imports of deleted files
2. Update any components using removed fields
3. Update forms/validation logic
4. Test all remaining features

### Phase 6: Documentation
1. Update README
2. Remove analysis documents
3. Create migration guide for existing data

## Risk Assessment

### High Risk
- Data loss if not backed up properly
- Breaking existing team/player records
- Transaction history corruption

### Medium Risk
- UI components referencing removed fields
- API calls from other parts of the app
- Reports/analytics using removed data

### Low Risk
- Menu navigation updates
- Documentation cleanup
- Unused migration scripts

## Rollback Plan
1. Keep database backups before any deletions
2. Tag current codebase in git
3. Document all removed fields for potential restoration
4. Keep removed files in archive branch

## Testing Checklist
- [ ] Team registration works
- [ ] Player registration works
- [ ] Match creation works
- [ ] Tournament management works
- [ ] Standings display correctly
- [ ] No broken links in committee dashboard
- [ ] No console errors
- [ ] Database queries don't reference removed fields

## Timeline Estimate
- Phase 1-2: 2-3 hours (file deletion)
- Phase 3: 2-3 hours (type updates)
- Phase 4: 3-4 hours (database cleanup)
- Phase 5: 4-6 hours (dependency updates)
- Phase 6: 1-2 hours (documentation)
- Testing: 3-4 hours

**Total: 15-22 hours**

## Next Steps
1. ✅ Create this plan
2. ⏳ Get approval from stakeholders
3. ⏳ Backup all databases
4. ⏳ Create git branch for removal
5. ⏳ Execute phases 1-6
6. ⏳ Test thoroughly
7. ⏳ Deploy to production


## Data Preservation Scripts

### Script 1: Archive player_seasons Table
```sql
-- File: migrations/archive_player_seasons_multi_season.sql
-- Archive the multi-season player_seasons table

-- Rename to archive
ALTER TABLE player_seasons RENAME TO player_seasons_s16_s17_archive;

-- Add documentation
COMMENT ON TABLE player_seasons_s16_s17_archive IS 
'Archived multi-season contract data from Season 16-17. 
Contains star ratings, points, auction values, salaries, and contract tracking.
Preserved for historical reference and potential future migration.';

-- Keep indexes for querying archived data
-- (indexes are automatically renamed with the table)
```

### Script 2: Archive Salary Transactions (Firebase)
```javascript
// File: scripts/archive-salary-transactions.js
// Move salary/reward transactions to archive collection

const admin = require('firebase-admin');
const db = admin.firestore();

async function archiveSalaryTransactions() {
  const batch = db.batch();
  let count = 0;
  
  // Query salary transactions
  const salaryQuery = await db.collection('transactions')
    .where('transaction_type', 'in', ['salary', 'salary_payment', 'match_reward', 'refund'])
    .get();
  
  console.log(`Found ${salaryQuery.size} salary/reward transactions to archive`);
  
  for (const doc of salaryQuery.docs) {
    // Copy to archive collection
    const archiveRef = db.collection('transactions_archive_s16_s17').doc(doc.id);
    batch.set(archiveRef, {
      ...doc.data(),
      archived_at: admin.firestore.FieldValue.serverTimestamp(),
      archive_reason: 'Multi-season salary system removal'
    });
    
    // Delete from main collection
    batch.delete(doc.ref);
    
    count++;
    
    // Commit in batches of 500
    if (count % 500 === 0) {
      await batch.commit();
      console.log(`Archived ${count} transactions...`);
    }
  }
  
  // Commit remaining
  if (count % 500 !== 0) {
    await batch.commit();
  }
  
  console.log(`✅ Archived ${count} transactions to transactions_archive_s16_s17`);
}
```

### Script 3: Clean Multi-Season Fields (Firebase)
```javascript
// File: scripts/clean-multi-season-fields.js
// Remove multi-season fields from Firebase collections

const admin = require('firebase-admin');
const db = admin.firestore();

async function cleanTeamSeasons() {
  const snapshot = await db.collection('team_seasons').get();
  const batch = db.batch();
  let count = 0;
  
  for (const doc of snapshot.docs) {
    batch.update(doc.ref, {
      // Remove multi-season budget fields
      dollar_balance: admin.firestore.FieldValue.delete(),
      dollar_spent: admin.firestore.FieldValue.delete(),
      real_player_budget: admin.firestore.FieldValue.delete(),
      real_player_spent: admin.firestore.FieldValue.delete(),
      football_budget: admin.firestore.FieldValue.delete(),
      football_spent: admin.firestore.FieldValue.delete(),
      
      // Remove salary tracking
      last_salary_deduction: admin.firestore.FieldValue.delete(),
      
      // Remove contract fields
      skipped_seasons: admin.firestore.FieldValue.delete(),
      penalty_amount: admin.firestore.FieldValue.delete(),
      last_played_season: admin.firestore.FieldValue.delete(),
      contract_id: admin.firestore.FieldValue.delete(),
      contract_start_season: admin.firestore.FieldValue.delete(),
      contract_end_season: admin.firestore.FieldValue.delete(),
      is_auto_registered: admin.firestore.FieldValue.delete(),
    });
    
    count++;
    
    if (count % 500 === 0) {
      await batch.commit();
      console.log(`Cleaned ${count} team_seasons...`);
    }
  }
  
  if (count % 500 !== 0) {
    await batch.commit();
  }
  
  console.log(`✅ Cleaned ${count} team_seasons documents`);
}

async function cleanRealPlayers() {
  const snapshot = await db.collection('realplayer').get();
  const batch = db.batch();
  let count = 0;
  
  for (const doc of snapshot.docs) {
    batch.update(doc.ref, {
      // Remove rating system
      star_rating: admin.firestore.FieldValue.delete(),
      points: admin.firestore.FieldValue.delete(),
      base_points: admin.firestore.FieldValue.delete(),
      
      // Remove salary tracking
      auction_value: admin.firestore.FieldValue.delete(),
      salary_per_match: admin.firestore.FieldValue.delete(),
      
      // Remove contract fields
      contract_start_season: admin.firestore.FieldValue.delete(),
      contract_end_season: admin.firestore.FieldValue.delete(),
      contract_status: admin.firestore.FieldValue.delete(),
      contract_id: admin.firestore.FieldValue.delete(),
      contract_length: admin.firestore.FieldValue.delete(),
      is_auto_registered: admin.firestore.FieldValue.delete(),
      
      // Remove category system
      category: admin.firestore.FieldValue.delete(),
      category_id: admin.firestore.FieldValue.delete(),
      category_name: admin.firestore.FieldValue.delete(),
    });
    
    count++;
    
    if (count % 500 === 0) {
      await batch.commit();
      console.log(`Cleaned ${count} realplayer...`);
    }
  }
  
  if (count % 500 !== 0) {
    await batch.commit();
  }
  
  console.log(`✅ Cleaned ${count} realplayer documents`);
}
```

### Script 4: Remove Contract Columns (Neon)
```sql
-- File: migrations/remove_contract_columns_neon.sql
-- Remove multi-season contract columns from Neon tables

-- footballplayers table (Auction DB)
ALTER TABLE footballplayers 
  DROP COLUMN IF EXISTS acquisition_value,
  DROP COLUMN IF EXISTS salary_per_half_season,
  DROP COLUMN IF EXISTS contract_start_season,
  DROP COLUMN IF EXISTS contract_end_season,
  DROP COLUMN IF EXISTS contract_status;

-- teams table (Auction DB)
ALTER TABLE teams
  DROP COLUMN IF EXISTS dollar_balance,
  DROP COLUMN IF EXISTS dollar_spent,
  DROP COLUMN IF EXISTS football_budget,
  DROP COLUMN IF EXISTS football_spent,
  DROP COLUMN IF EXISTS real_player_budget,
  DROP COLUMN IF EXISTS real_player_spent;

COMMENT ON TABLE footballplayers IS 'Football players table - single season model (contract columns removed)';
COMMENT ON TABLE teams IS 'Teams table - single season model (multi-currency budget removed)';
```

## Rollback Plan (If Needed)

### Restore player_seasons Table
```sql
-- Rename archive back to active table
ALTER TABLE player_seasons_s16_s17_archive RENAME TO player_seasons;
```

### Restore Transactions
```javascript
// Copy archived transactions back to main collection
const archiveSnapshot = await db.collection('transactions_archive_s16_s17').get();
for (const doc of archiveSnapshot.docs) {
  const data = doc.data();
  delete data.archived_at;
  delete data.archive_reason;
  await db.collection('transactions').doc(doc.id).set(data);
}
```
