# Fantasy Draft Manual/Auto Finalization - Deployment Guide

**Feature:** Manual and Automatic Finalization Modes  
**Status:** ✅ Code Complete | ⏳ Awaiting Database Migration & Deployment  
**Date:** 2026-08-15

---

## 🎯 What This Adds

Adds manual/auto finalization toggle to fantasy draft (matching normal auction functionality):

- **⚡ Auto Mode** - Draft finalizes automatically when closed (default, current behavior)
- **⚙️ Manual Mode** - Admin must manually click finalize button after closing draft

---

## 📋 Pre-Deployment Checklist

- [ ] Read this deployment guide completely
- [ ] Backup `fantasy_leagues` table
- [ ] Have database access credentials ready
- [ ] Ensure no active drafts are in progress
- [ ] Review all changes in this PR/commit

---

## 🗄️ Step 1: Database Migration

### A. Verify Current State (Optional but Recommended)

```bash
# Check if column already exists
psql $NEON_DATABASE_URL -f scripts/verify-finalization-mode-column.sql
```

**Expected output if migration NOT yet applied:**
```
 column_name | data_type | column_default | is_nullable 
-------------+-----------+----------------+-------------
(0 rows)
```

### B. Backup Database (Recommended)

```bash
# Backup fantasy_leagues table
pg_dump $NEON_DATABASE_URL -t fantasy_leagues > backup_fantasy_leagues_$(date +%Y%m%d).sql
```

### C. Apply Migration

```bash
# Run the migration
psql $NEON_DATABASE_URL -f migrations/add_draft_finalization_mode_to_fantasy_leagues.sql
```

**Expected output:**
```sql
ALTER TABLE
COMMENT
CREATE INDEX
UPDATE X  -- X = number of existing leagues
SELECT
(Shows 5 most recent leagues with their finalization mode)
```

### D. Verify Migration Success

```bash
# Check column was created
psql $NEON_DATABASE_URL -c "
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'fantasy_leagues' 
AND column_name = 'draft_finalization_mode';
"
```

**Expected output:**
```
      column_name        | data_type | column_default 
-------------------------+-----------+----------------
 draft_finalization_mode | varchar   | 'auto'
(1 row)
```

### E. Verify Existing Leagues

```bash
# Check all leagues have default value
psql $NEON_DATABASE_URL -c "
SELECT league_id, season_name, draft_finalization_mode, draft_status 
FROM fantasy_leagues 
ORDER BY created_at DESC;
"
```

**Expected output:**
```
  league_id   | season_name | draft_finalization_mode | draft_status 
--------------+-------------+-------------------------+--------------
 SSPSLFLS20   | Season 20   | auto                    | pending
 SSPSLFLS19   | Season 19   | auto                    | completed
...
```

All should show `auto` as the finalization mode.

---

## 💻 Step 2: Deploy Code

### A. Review Changes

```bash
# See what files changed
git status

# Review the changes
git diff
```

**Key files modified:**
- `app/api/fantasy/leagues/[leagueId]/route.ts` (API)
- `app/dashboard/committee/fantasy/[leagueId]/draft/process/page.tsx` (UI)
- `fantasy_database_schema.sql` (documentation)

### B. Commit Changes

```bash
git add .
git commit -m "feat(fantasy): Add manual/auto finalization modes to draft system

- Add draft_finalization_mode column to fantasy_leagues table
- Add PATCH endpoint to toggle finalization mode
- Add UI toggle in draft process page
- Update actions panel to conditionally show finalize button
- Add comprehensive documentation
- Backward compatible: defaults to 'auto' mode"
```

### C. Push to Repository

```bash
# Push to main branch
git push origin main
```

### D. Deploy to Production

**If using Vercel:**
```bash
vercel --prod
```

**If using other platform:**
Follow your platform's deployment process.

---

## ✅ Step 3: Post-Deployment Verification

### A. Access the Draft Process Page

Navigate to:
```
https://your-domain.com/dashboard/committee/fantasy/[leagueId]/draft/process
```

### B. Visual Verification Checklist

- [ ] **Finalization Mode Card** appears below header
- [ ] Current mode shows **⚡ Auto** (green badge)
- [ ] Description text displays correctly
- [ ] **Toggle button** is clickable and not disabled

### C. Test Mode Toggle

1. **Click the toggle button** (⚡ Auto)
2. **Expected behavior:**
   - Button text changes to "..."
   - API call to PATCH `/api/fantasy/leagues/[leagueId]`
   - Success alert: "Mode changed to MANUAL"
   - Badge changes to **⚙️ Manual** (amber color)
   - Description text updates

3. **Refresh the page**
   - Mode should still show **⚙️ Manual** (persisted)

4. **Toggle back to Auto**
   - Click button again
   - Should change back to **⚡ Auto**

### D. Test Auto Finalization Workflow

1. Ensure mode is set to **⚡ Auto**
2. Click **"Start Round"** 
3. Submit some test bids (optional)
4. Click **"Close Round"**
5. **Expected:** Draft should finalize automatically
6. Results should appear on the same page

### E. Test Manual Finalization Workflow

1. Click toggle to set mode to **⚙️ Manual**
2. Click **"Reset to Pending"** (if needed)
3. Click **"Start Round"**
4. Submit some test bids (optional)
5. Click **"Close Round"**
6. **Expected:** 
   - Draft status changes to "closed"
   - NO automatic finalization
   - **"Run Resolution Engine & Finalize"** button appears
7. Click the finalize button
8. Confirm in dialog
9. **Expected:** Draft finalizes and results appear

### F. Check Team Access

Navigate to:
```
https://your-domain.com/dashboard/team/fantasy/draft/results
```

- [ ] Teams can see their draft results
- [ ] Shows won players with purchase prices
- [ ] Shows won real team (if applicable)
- [ ] Shows bid log (won/lost status)
- [ ] Budget remaining displays correctly

### G. Database Verification

```bash
# Check mode is persisting
psql $NEON_DATABASE_URL -c "
SELECT league_id, draft_finalization_mode, draft_status, updated_at 
FROM fantasy_leagues 
WHERE league_id = 'YOUR_TEST_LEAGUE_ID';
"
```

Should show the mode you set during testing.

---

## 🐛 Troubleshooting

### Issue: Toggle button doesn't appear

**Possible causes:**
- Database migration not applied
- Page cached in browser
- User not logged in as committee admin

**Solutions:**
```bash
# Check if column exists
psql $NEON_DATABASE_URL -c "SELECT draft_finalization_mode FROM fantasy_leagues LIMIT 1;"

# Clear browser cache (Ctrl+Shift+R)
# Verify user role
```

### Issue: Toggle button is disabled

**Cause:** Draft is already completed

**Solution:** This is expected behavior. Mode can only be changed before finalization.

### Issue: Mode doesn't persist after refresh

**Possible causes:**
- API call failing
- Database not saving value
- Frontend not fetching on load

**Debug:**
```bash
# Check browser console for API errors
# Check database value
psql $NEON_DATABASE_URL -c "SELECT league_id, draft_finalization_mode FROM fantasy_leagues WHERE league_id = 'YOUR_LEAGUE_ID';"
```

### Issue: Manual finalize button doesn't appear

**Checklist:**
- [ ] Mode is set to 'manual' (not 'auto')
- [ ] Draft status is 'closed' (not 'active' or 'pending')
- [ ] Page has loaded completely
- [ ] No JavaScript errors in console

### Issue: Auto mode isn't finalizing automatically

**Possible causes:**
- Mode accidentally set to 'manual' in database
- Draft finalization API endpoint error
- Draft processor error

**Debug:**
```bash
# Check actual mode in database
psql $NEON_DATABASE_URL -c "SELECT draft_finalization_mode FROM fantasy_leagues WHERE league_id = 'YOUR_LEAGUE_ID';"

# Check server logs for finalization errors
```

---

## 🔄 Rollback Procedure

If you need to rollback the changes:

### A. Rollback Database

```sql
-- Remove the column (this will lose finalization mode settings)
ALTER TABLE fantasy_leagues DROP COLUMN IF EXISTS draft_finalization_mode;

-- Remove the index
DROP INDEX IF EXISTS idx_fantasy_leagues_finalization_mode;
```

### B. Rollback Code

```bash
# Revert the commit
git revert HEAD
git push origin main

# Or in Vercel
vercel rollback
```

**Note:** After rollback, all drafts will use the previous finalization logic (auto-finalize on close).

---

## 📊 Success Metrics

After deployment, monitor:

### Technical Metrics
- [ ] Zero errors in logs related to finalization mode
- [ ] API endpoint response time < 500ms
- [ ] Database queries complete successfully
- [ ] UI renders without errors

### User Metrics
- [ ] Committee admins can toggle modes successfully
- [ ] Auto mode finalizes drafts correctly
- [ ] Manual mode requires button click as expected
- [ ] Teams can view their results

### Database Metrics
- [ ] All existing leagues have 'auto' as default
- [ ] Mode persists correctly after updates
- [ ] No NULL values in draft_finalization_mode column

---

## 📞 Support

### If Issues Occur

1. **Check logs immediately:**
   - Browser console (frontend errors)
   - Server logs (API/backend errors)
   - Database logs (query errors)

2. **Document the issue:**
   - What action was taken
   - What was expected
   - What actually happened
   - Error messages
   - User role and permissions

3. **Emergency rollback:**
   - If critical issues occur, use rollback procedure above
   - System will revert to previous auto-finalize behavior

### Contact Information
- **Implementation Date:** 2026-08-15
- **Feature Docs:** See `FANTASY_DRAFT_MANUAL_AUTO_FINALIZATION.md`
- **Quick Start:** See `FANTASY_DRAFT_FINALIZATION_QUICKSTART.md`

---

## 📚 Documentation Index

Created documentation files:

1. **FANTASY_DRAFT_MANUAL_AUTO_FINALIZATION.md** - Complete implementation details
2. **FANTASY_DRAFT_FINALIZATION_QUICKSTART.md** - Quick start guide for users
3. **FANTASY_DRAFT_FINALIZATION_SUMMARY.md** - Executive summary
4. **FANTASY_DRAFT_FINALIZATION_CHECKLIST.md** - Pre-deployment checklist
5. **FANTASY_DRAFT_FINALIZATION_FLOW.md** - Visual flow diagrams
6. **FANTASY_DRAFT_FINALIZATION_FAQ.md** - Frequently asked questions
7. **DEPLOY_FANTASY_FINALIZATION.md** - This deployment guide

Migration files:
- **migrations/add_draft_finalization_mode_to_fantasy_leagues.sql** - Database migration
- **scripts/verify-finalization-mode-column.sql** - Verification script

---

## ✅ Deployment Sign-Off

### Pre-Deployment
- [ ] All code changes reviewed
- [ ] All documentation complete
- [ ] Database backup created
- [ ] Migration script tested on staging (if available)

### Deployment
- [ ] Database migration applied successfully
- [ ] Code deployed to production
- [ ] No errors in deployment logs

### Post-Deployment
- [ ] UI appears correctly
- [ ] Toggle functionality works
- [ ] Auto finalization works
- [ ] Manual finalization works
- [ ] Team results accessible
- [ ] Database values correct

### Sign-Off
- [ ] **Developer:** Implementation complete ✅
- [ ] **QA:** Testing passed _______
- [ ] **Product:** Feature approved _______
- [ ] **Deployment:** Production live _______

---

## 🎉 Completion

Once all steps are complete:

1. ✅ Database migration applied
2. ✅ Code deployed to production
3. ✅ All tests passing
4. ✅ No errors in logs
5. ✅ Users can access feature

**Feature is LIVE!** 🚀

---

**Deployment Guide Version:** 1.0  
**Last Updated:** 2026-08-15  
**Status:** Ready for Deployment
