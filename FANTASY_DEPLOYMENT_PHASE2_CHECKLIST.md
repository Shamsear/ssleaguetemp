# Fantasy League Phase 2 - Deployment Checklist

## Pre-Deployment Verification

### 1. Code Compilation
```bash
npm run build
```
- [ ] Build completes successfully
- [ ] No TypeScript errors
- [ ] No critical warnings

### 2. Dependencies Installed
```bash
npm install
```
- [x] `zod` package installed
- [ ] All dependencies up to date
- [ ] No security vulnerabilities (run `npm audit`)

---

## Testing

### 3. Manual API Testing

**Test Draft Endpoint:**
```bash
# Test successful draft
curl -X POST http://localhost:3000/api/fantasy/draft/player \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_ID",
    "real_player_id": "test_player_1",
    "player_name": "Test Player",
    "position": "FWD",
    "team_name": "Test Team",
    "draft_price": 40.0
  }'
```

Expected: Success response with squad_id, budget, etc.

- [ ] Draft succeeds with valid data
- [ ] Returns detailed success response

**Test Validation:**
```bash
# Test with missing field
curl -X POST http://localhost:3000/api/fantasy/draft/player \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "YOUR_USER_ID"
  }'
```

Expected: Validation error with details

- [ ] Returns validation error
- [ ] Error includes field details

**Test Duplicate Draft:**
```bash
# Draft same player twice
curl -X POST http://localhost:3000/api/fantasy/draft/player \
  -H "Content-Type: application/json" \
  -d '{ ... same player ... }'
```

Expected: PLAYER_ALREADY_DRAFTED error with suggested alternatives

- [ ] Returns player drafted error
- [ ] Includes drafted_by details
- [ ] Includes suggested alternatives

**Test Available Players:**
```bash
# Test basic query
curl "http://localhost:3000/api/fantasy/players/available?league_id=YOUR_LEAGUE_ID&limit=10"
```

Expected: Success with 10 players and pagination info

- [ ] Returns available players
- [ ] Includes pagination object
- [ ] next_cursor is present if has_more

**Test Pagination:**
```bash
# Test with cursor
curl "http://localhost:3000/api/fantasy/players/available?league_id=YOUR_LEAGUE_ID&limit=10&cursor=CURSOR_FROM_PREV"
```

Expected: Next page of results

- [ ] Returns next page
- [ ] Cursor-based pagination works

**Test Filtering:**
```bash
# Test category filter
curl "http://localhost:3000/api/fantasy/players/available?league_id=YOUR_LEAGUE_ID&category=A"
```

Expected: Only category A players

- [ ] Returns filtered results
- [ ] filters_applied shows category

**Test Search:**
```bash
# Test search
curl "http://localhost:3000/api/fantasy/players/available?league_id=YOUR_LEAGUE_ID&search=ronaldo"
```

Expected: Players matching "ronaldo"

- [ ] Returns search results
- [ ] filters_applied shows search term

---

## Code Review

### 4. Service Layer
- [ ] Review `lib/fantasy/draft-service.ts`
- [ ] Review `lib/fantasy/players-service.ts`
- [ ] Verify error handling
- [ ] Check transaction usage

### 5. Validation
- [ ] Review `lib/fantasy/validation.ts`
- [ ] Verify all schemas are correct
- [ ] Check error messages

### 6. Error Handling
- [ ] Review `lib/fantasy/errors.ts`
- [ ] Verify error details are helpful
- [ ] Check status codes

### 7. API Routes
- [ ] Review `app/api/fantasy/draft/player/route.ts`
- [ ] Review `app/api/fantasy/players/available/route.ts`
- [ ] Verify service usage
- [ ] Check error responses

---

## Performance Testing

### 8. Query Performance
```sql
-- Run in database
EXPLAIN ANALYZE
SELECT 
  ft.team_id, ft.budget_remaining,
  fl.league_id, fl.max_squad_size
FROM fantasy_teams ft
JOIN fantasy_leagues fl ON ft.league_id = fl.league_id
WHERE ft.owner_uid = 'test_user';
```

- [ ] Query uses indexes
- [ ] Execution time < 50ms
- [ ] No sequential scans on large tables

### 9. Load Testing (Optional)
```bash
# Test concurrent drafts (requires tool like Apache Bench or k6)
ab -n 100 -c 10 -p draft.json http://localhost:3000/api/fantasy/draft/player
```

- [ ] No duplicate drafts under load
- [ ] Error rate < 1%
- [ ] Response time p95 < 500ms

---

## Documentation Review

### 10. Documentation Complete
- [x] `FANTASY_IMPROVEMENTS_PHASE2_COMPLETED.md` created
- [x] `FANTASY_API_GUIDE.md` created
- [x] `FANTASY_PHASE2_SUMMARY.md` created
- [x] `FANTASY_DEPLOYMENT_PHASE2_CHECKLIST.md` created (this file)

- [ ] Review documentation for accuracy
- [ ] Verify code examples work
- [ ] Check API endpoint URLs

---

## Staging Deployment

### 11. Deploy to Staging
```bash
# Build
npm run build

# Deploy (adjust for your platform)
vercel deploy --env staging
# or
git push staging main
```

- [ ] Deployed to staging environment
- [ ] No deployment errors
- [ ] Application starts successfully

### 12. Staging Smoke Tests
- [ ] Draft endpoint works
- [ ] Available players endpoint works
- [ ] Pagination works
- [ ] Error messages display correctly
- [ ] No console errors in browser

### 13. Staging Integration Tests
- [ ] Create test fantasy league
- [ ] Draft multiple players
- [ ] Test validation errors
- [ ] Test pagination
- [ ] Test search and filtering
- [ ] Remove a player
- [ ] Verify budget calculations

---

## Production Deployment

### 14. Pre-Production Checks
- [ ] All staging tests passed
- [ ] No critical bugs found
- [ ] Performance is acceptable
- [ ] Documentation is complete
- [ ] Rollback plan is ready

### 15. Production Deployment
```bash
# Deploy to production
npm run build
vercel deploy --prod
# or
git push production main
```

- [ ] Deployed to production
- [ ] No deployment errors
- [ ] Application starts successfully

### 16. Production Smoke Tests
Within 10 minutes of deployment:

- [ ] Draft endpoint accessible
- [ ] Available players endpoint accessible
- [ ] Error responses correct
- [ ] No 500 errors in logs

### 17. Production Monitoring
Within 1 hour of deployment:

- [ ] Check error logs
- [ ] Monitor response times
- [ ] Check database performance
- [ ] Verify no user complaints

---

## Post-Deployment

### 18. Monitor Metrics

**Check Database:**
```sql
-- Check query performance
SELECT 
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE query LIKE '%fantasy%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

- [ ] No slow queries (>500ms)
- [ ] Query counts are expected
- [ ] No connection errors

**Check Application Logs:**
- [ ] No unhandled errors
- [ ] Error rates < 1%
- [ ] Response times normal

**Check User Feedback:**
- [ ] No complaints about errors
- [ ] Pagination working well
- [ ] Error messages helpful

### 19. Document Issues
If any issues found:

| Issue | Severity | Description | Fix |
|-------|----------|-------------|-----|
|       |          |             |     |

### 20. Celebrate! 🎉
- [ ] All checks passed
- [ ] No critical issues
- [ ] Users are happy
- [ ] Team informed

---

## Rollback Plan (If Needed)

### If Critical Issues Occur

**Level 1: Quick Fix**
```bash
# Deploy hotfix
git checkout main
# Make fix
git commit -m "hotfix: ..."
git push production main
```

**Level 2: Revert Deployment**
```bash
# Revert to previous version
vercel rollback DEPLOYMENT_ID
# or
git revert HEAD
git push production main
```

**Level 3: Code Rollback**
```bash
# Revert all Phase 2 changes
git revert --no-commit <commit-range>
git commit -m "Rollback Phase 2 changes"
git push production main
```

**Level 4: Full Restore**
- Restore database from backup (Phase 1 fixes remain)
- Deploy previous code version
- Notify users

---

## Success Criteria

### Must Pass Before Marking Complete

- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] Build succeeds
- [ ] Staging tests pass
- [ ] Production deployment successful
- [ ] No errors in first hour
- [ ] Documentation complete

### Performance Targets

- [ ] Draft endpoint: < 500ms p95
- [ ] Available players: < 300ms p95
- [ ] Error rate: < 1%
- [ ] No race conditions
- [ ] No duplicate drafts

### Quality Targets

- [ ] Code coverage: Service layer testable
- [ ] Error messages: Clear and actionable
- [ ] Documentation: Complete and accurate
- [ ] API: Backward compatible

---

## Rollback Triggers

Immediately rollback if:
- [ ] Error rate > 5%
- [ ] Response time > 2s p95
- [ ] Duplicate drafts occurring
- [ ] Database connection errors
- [ ] Multiple user complaints

---

## Contact Information

**On-Call Engineer:** _______________  
**Deployment Lead:** _______________  
**Database Admin:** _______________  
**Date/Time:** _______________

---

## Sign-Off

- [ ] Technical Lead: _______________
- [ ] QA: _______________
- [ ] Product Owner: _______________
- [ ] DevOps: _______________

**Deployment Status:** ⬜ Ready ⬜ In Progress ⬜ Complete ⬜ Rolled Back

---

**Notes:**

```
[Add any additional notes about the deployment]
```

---

**Last Updated:** June 11, 2026
