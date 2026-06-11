# Simplified Salary & Contract Removal Plan

## Strategy: Keep Tables, Remove Features Only

### Key Principle
- **Don't rename or move tables** - keep `player_seasons` for historical data
- **Don't touch Firebase transactions** - no schema, just filter by type in queries
- **Remove UI pages and APIs only** - clean up the interface
- **Stop using multi-season fields** - but keep them in database for history

## Phase 1: Remove Committee Admin Pages (13 pages)

### Delete These Files:
```bash
# Player/Team Contracts
rm app/dashboard/committee/contracts/page.tsx
rm app/dashboard/committee/team-contracts/page.tsx

# Rating System
rm app/dashboard/committee/player-ratings/page.tsx
rm app/dashboard/committee/star-rating-config/page.tsx
rm app/dashboard/committee/player-stars-points/page.tsx
rm app/dashboard/committee/player-star-upgrades/page.tsx

# Salary System
rm app/dashboard/committee/salary-transactions/page.tsx

# Rewards System
rm app/dashboard/committee/match-rewards/page.tsx
rm app/dashboard/committee/tournament-rewards/page.tsx
```

## Phase 2: Remove API Routes

### Delete These Files:
```bash
# Contract APIs
rm app/api/contracts/assign/route.ts
rm app/api/contracts/mid-season-salary/route.ts
rm app/api/admin/reconcile-contracts/route.ts

# Refund API
rm app/api/committee/refunds/send/route.ts

# Salary APIs
rm app/api/committee/salary-transactions/route.ts

# Rating APIs
rm app/api/player-ratings/assign/route.ts
rm app/api/player-ratings/recalculate-categories/route.ts
rm app/api/star-rating-config/route.ts
rm app/api/committee/update-player-stars-points/route.ts

# Reward APIs
rm app/api/transactions/create-match-reward/route.ts
```

## Phase 3: Remove Core Libraries

### Delete These Files:
```bash
rm lib/contracts.ts
rm types/salary-preview.ts
```

### Update Type Files (Remove Fields Only):
- `types/realPlayer.ts` - Remove: star_rating, points, auction_value, salary_per_match, contract_* fields
- `types/footballPlayer.ts` - Remove: acquisition_value, salary_per_half_season, contract_* fields  
- `types/team.ts` - Remove: dollar_balance, football_budget, real_player_budget fields

## Phase 4: Update Committee Dashboard Menu

Remove links to deleted pages from:
- `app/dashboard/committee/page.tsx` (or wherever menu is defined)

## Phase 5: Database - NO CHANGES NEEDED

### What We're NOT Doing:
- ❌ NOT renaming `player_seasons` table
- ❌ NOT moving transactions
- ❌ NOT removing columns from tables
- ❌ NOT creating new tables

### Why:
- `player_seasons` contains Season 16-17 historical data - keep as-is
- Firebase transactions have no schema - just filter in queries
- Removing columns is risky and unnecessary
- Future pages can still query old data if needed

### For Future Historical Data Pages:
If you need to show Season 16-17 contract/salary data:
- Query `player_seasons` table with WHERE clause for season_id
- Filter Firebase transactions by transaction_type
- Data is preserved, just not actively used

## Phase 6: Clean Up Imports

Search and fix any imports of deleted files:
```bash
# Find files importing deleted modules
grep -r "from '@/lib/contracts'" app/
grep -r "from '@/types/salary-preview'" app/
```

## Testing Checklist
- [ ] Committee dashboard loads without errors
- [ ] No broken menu links
- [ ] Team registration works
- [ ] Player registration works  
- [ ] Match/fixture management works
- [ ] Tournament management works
- [ ] No console errors about missing modules

## Rollback Plan
Since we're not touching the database:
- Just restore deleted files from git
- No database migrations needed
- No data restoration needed

## Timeline
- Phase 1: 30 minutes (delete pages)
- Phase 2: 30 minutes (delete APIs)
- Phase 3: 1 hour (update types, remove lib)
- Phase 4: 15 minutes (update menu)
- Phase 5: 0 minutes (no database changes!)
- Phase 6: 1 hour (fix imports)
- Testing: 1 hour

**Total: ~4 hours**

## Benefits of This Approach
✅ No data loss - everything preserved
✅ No database migrations - zero risk
✅ Can query historical data anytime
✅ Fast execution - just file deletion
✅ Easy rollback - just restore files
✅ No breaking changes to existing data
