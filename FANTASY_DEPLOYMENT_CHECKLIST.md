# Fantasy League Critical Fixes - Deployment Checklist

## Pre-Deployment

### 1. Backup Database
```bash
# Create backup of fantasy database
pg_dump -h <host> -U <user> -d <fantasy_db> > fantasy_backup_$(date +%Y%m%d_%H%M%S).sql

# Verify backup file exists and is not empty
ls -lh fantasy_backup_*.sql
```

- [ ] Database backup created
- [ ] Backup file size looks reasonable (>1MB for production)
- [ ] Backup stored in safe location

### 2. Run Constraint Migration
```bash
npx ts-node scripts/add-fantasy-constraints.ts
```

Expected output:
```
✅ Budget constraint added
✅ Unique ownership constraint added
✅ All indexes created
✅ All constraints and indexes added successfully!
```

- [ ] Script completed without errors
- [ ] Verified constraints exist in database

### 3. Run Migration Script (if not already done)
```bash
npx ts-node scripts/migrate-fantasy-to-category-pricing.ts
```

- [ ] Migration completed successfully
- [ ] All players have categories
- [ ] drafted_by_team_id set for drafted players

### 4. Run Test Script
```bash
npx ts-node scripts/test-fantasy-fixes.ts
```

Expected: All tests passed (0 failures)

- [ ] All 8 tests passed
- [ ] No constraint violations found
- [ ] No data integrity issues found

### 5. Code Review
- [ ] Transaction logic reviewed in `draft/player/route.ts`
- [ ] Price validation logic verified
- [ ] Category fallback logic checked
- [ ] Error handling reviewed
- [ ] Type definitions updated

---

## Deployment Steps

### Step 1: Deploy Code Changes
```bash
# Build the application
npm run build

# Or deploy to your hosting platform
# vercel deploy --prod
# or
# git push origin main
```

- [ ] Code successfully built
- [ ] No TypeScript errors
- [ ] No build warnings (critical ones)

### Step 2: Verify API Endpoints
Test each endpoint after deployment:

**Test 1: Get Available Players**
```bash
curl "https://your-domain.com/api/fantasy/players/available?league_id=SSPSLFLS16"
```

Expected: Returns available players with categories

- [ ] Returns 200 status
- [ ] Players have `category` field
- [ ] No drafted players in list

**Test 2: Draft Player (Valid)**
```bash
curl -X POST https://your-domain.com/api/fantasy/draft/player \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user",
    "real_player_id": "test_player",
    "player_name": "Test Player",
    "position": "FWD",
    "team_name": "Test Team",
    "draft_price": 40.00
  }'
```

Expected: Success response

- [ ] Returns 200 status
- [ ] Player drafted successfully
- [ ] Budget deducted correctly

**Test 3: Draft Same Player (Should Fail)**
```bash
# Try to draft same player with different user
curl -X POST https://your-domain.com/api/fantasy/draft/player \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "another_user",
    "real_player_id": "test_player",
    ...
  }'
```

Expected: Error "Player already drafted"

- [ ] Returns 400 status
- [ ] Error message indicates player is drafted

**Test 4: Invalid Price (Should Fail)**
```bash
curl -X POST https://your-domain.com/api/fantasy/draft/player \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test_user",
    "real_player_id": "another_player",
    "draft_price": 1.00
  }'
```

Expected: Error "Invalid draft price"

- [ ] Returns 400 status
- [ ] Shows expected vs provided price

### Step 3: Concurrent Draft Test
Run this test to verify race condition fix:

```bash
# Terminal 1
curl -X POST https://your-domain.com/api/fantasy/draft/player -d '{...player1...}' &

# Terminal 2 (immediately)
curl -X POST https://your-domain.com/api/fantasy/draft/player -d '{...player1...}' &

# Wait for both to complete
wait
```

Expected: One succeeds, one fails with "Player already drafted"

- [ ] Only ONE request succeeded
- [ ] Other request got "Player already drafted" error
- [ ] No duplicate entries in database

---

## Post-Deployment Monitoring

### 1. Database Queries to Run

**Check for any duplicate drafts:**
```sql
SELECT 
  league_id,
  real_player_id,
  COUNT(*) as team_count
FROM fantasy_squad
GROUP BY league_id, real_player_id
HAVING COUNT(*) > 1;
```
Expected: 0 rows

- [ ] No duplicate drafts found

**Check for negative budgets:**
```sql
SELECT team_id, budget_remaining
FROM fantasy_teams
WHERE budget_remaining < 0;
```
Expected: 0 rows (constraint prevents this)

- [ ] No negative budgets

**Check drafted players consistency:**
```sql
SELECT 
  fp.real_player_id,
  fp.drafted_by_team_id,
  fs.team_id as squad_team_id
FROM fantasy_players fp
LEFT JOIN fantasy_squad fs 
  ON fp.league_id = fs.league_id 
  AND fp.real_player_id = fs.real_player_id
WHERE fp.drafted_by_team_id IS NOT NULL
  AND (fs.team_id IS NULL OR fs.team_id != fp.drafted_by_team_id)
LIMIT 10;
```
Expected: 0 rows

- [ ] All drafted players have consistent team ownership

### 2. Monitor Application Logs

Check for:
- [ ] No "Draft transaction failed" errors
- [ ] No "PLAYER_ALREADY_DRAFTED" exceptions (some expected, but not excessive)
- [ ] No database connection errors
- [ ] Response times under 500ms for draft requests

### 3. Monitor Performance

```sql
-- Check query performance
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%fantasy_players%'
  OR query LIKE '%fantasy_squad%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

- [ ] Draft queries complete in <300ms average
- [ ] No queries taking >1 second
- [ ] Index scans being used (not sequential)

---

## Rollback Plan (If Issues Occur)

### Level 1: Close Draft Period (Quick)
```sql
UPDATE fantasy_leagues SET draft_status = 'closed';
```

- Prevents new drafts while investigating
- No data loss
- Reversible immediately

### Level 2: Revert Code (Medium)
```bash
# Deploy previous version
git revert <commit-hash>
git push origin main

# Or use hosting platform rollback
vercel rollback <deployment-id>
```

- Reverts API changes
- Keeps database changes (safe)
- Can redeploy fixes later

### Level 3: Remove Constraints (Last Resort)
```sql
-- Only if constraints are causing issues
ALTER TABLE fantasy_teams DROP CONSTRAINT IF EXISTS chk_budget_non_negative;
DROP INDEX IF EXISTS idx_fantasy_players_unique_owner;
```

- Only use if constraints blocking valid operations
- Investigate root cause first
- Re-add constraints after fix

### Level 4: Full Database Restore (Emergency)
```bash
# Restore from backup
psql -h <host> -U <user> -d <fantasy_db> < fantasy_backup_YYYYMMDD_HHMMSS.sql
```

- Last resort only
- Loses all data since backup
- Coordinate with users

---

## Success Criteria

All boxes must be checked:

### Functionality
- [ ] Available players API returns correct data
- [ ] Draft endpoint enforces single ownership
- [ ] Price validation works correctly
- [ ] Transactions roll back on error
- [ ] Concurrent drafts handled properly

### Performance
- [ ] Draft requests complete in <500ms
- [ ] No database deadlocks
- [ ] Indexes being used correctly

### Data Integrity
- [ ] No duplicate player ownership
- [ ] No negative budgets
- [ ] All players have categories
- [ ] drafted_by_team_id consistent with fantasy_squad

### Error Handling
- [ ] Clear error messages for users
- [ ] No unhandled exceptions in logs
- [ ] Proper HTTP status codes

---

## Support Contacts

- **Database Admin:** [Contact Info]
- **Backend Team:** [Contact Info]
- **DevOps:** [Contact Info]
- **On-Call:** [Contact Info]

---

## Post-Deployment Tasks

### Within 24 Hours
- [ ] Monitor error logs
- [ ] Check database metrics
- [ ] Verify draft success rate >99%
- [ ] Review user feedback

### Within 1 Week
- [ ] Analyze performance metrics
- [ ] Check for any edge cases
- [ ] Plan Phase 2 improvements
- [ ] Update documentation

---

## Sign-Off

- [ ] Tech Lead approval
- [ ] QA approval
- [ ] Database admin notified
- [ ] Support team briefed
- [ ] Documentation updated

**Deployed By:** _______________
**Date:** _______________
**Time:** _______________
**Rollback Plan Tested:** [ ] Yes [ ] No

---

## Notes

Additional notes or issues encountered during deployment:

```
[Space for notes]
```

---

**Status:** Ready for Deployment ✅
**Estimated Deployment Time:** 30-60 minutes
**Risk Level:** Low (with proper testing)
