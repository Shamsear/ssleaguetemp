# ⚡ Quick Test Guide - Fantasy Draft Finalization

**Status**: ✅ Migration Complete - Ready to Test  
**Last Updated**: 2026-08-15

---

## 🎯 What Changed?

You can now choose between:
- **⚡ Auto Mode**: Draft finalizes automatically when closed (like before)
- **⚙️ Manual Mode**: Draft needs admin approval to finalize (NEW!)

---

## 🧪 Quick Tests

### Test 1: Toggle Mode (30 seconds)
1. Open: `http://localhost:3000/dashboard/committee/fantasy/SSPSLFLS17/draft/process`
2. Find the "Finalization Mode" section
3. Click the toggle button: ⚡ Auto ↔ ⚙️ Manual
4. ✅ Pass: Button changes and no errors

### Test 2: Manual Finalization (2 minutes)
1. Set mode to **⚙️ Manual**
2. Close the draft (if not closed)
3. 🔍 Click "Preview Draft Results" button
4. Review the blue preview card
5. ✅ Click "Finalize Draft" button
6. Check team results page - should show results

### Test 3: Team Access Control (1 minute)
1. Close draft in manual mode (DON'T finalize)
2. Open: `http://localhost:3000/dashboard/team/fantasy/draft/results`
3. ✅ Pass: Should see "Draft Results Pending" message
4. Go back to admin and finalize
5. Refresh team page
6. ✅ Pass: Should now see full results

---

## 📍 Key URLs

### Admin Pages
```
Draft Process (with toggle):
http://localhost:3000/dashboard/committee/fantasy/SSPSLFLS17/draft/process

Fantasy Console:
http://localhost:3000/dashboard/committee/fantasy/SSPSLFLS17
```

### Team Pages
```
Draft Results:
http://localhost:3000/dashboard/team/fantasy/draft/results
```

---

## 🔍 What to Look For

### ✅ Good Signs
- Toggle button changes: ⚡ ↔ ⚙️
- Preview button appears in manual mode when closed
- Finalize button appears in manual mode when closed
- Preview shows blue card with results
- Teams see waiting message when not finalized
- Teams see results after finalization
- No console errors

### ❌ Bad Signs
- "Column does not exist" error → Migration didn't run
- 404 errors → API routes missing
- Toggle doesn't change → API failing
- Teams see results before finalization → Access control broken

---

## 🔧 Troubleshooting

### Error: "Column draft_finalization_mode does not exist"
**Fix**: Re-run migration
```bash
npx tsx scripts/add-draft-finalization-mode.ts
```

### Toggle Button Not Working
**Check**: Browser console for API errors
**Verify**: `FANTASY_DATABASE_URL` in `.env.local`

### Preview Not Showing
**Requirement**: Draft must be **closed** AND mode must be **manual**
**Check**: Draft status in database

### Teams See Results Too Early
**Check**: `draft_status` should not be 'completed' until finalized
**Verify**: Access control in `app/dashboard/team/fantasy/draft/results/page.tsx`

---

## 📊 Database Quick Check

Run this to verify migration:
```bash
npx tsx scripts/verify-fantasy-leagues.ts
```

Expected output:
```
✅ Found 2 league(s)

📌 Season 17
   League ID: SSPSLFLS17
   Status: pending
   Finalization Mode: auto  ← Should see this!
   
📌 Season 16
   League ID: SSPSLFLS16
   Status: closed
   Finalization Mode: auto  ← Should see this!
```

---

## 🎮 Manual Testing Sequence

### Full Workflow Test (5 minutes)

1. **Setup** (30s)
   - Open admin draft process page
   - Ensure draft is in 'pending' or 'active' state
   - Set mode to **Auto**

2. **Test Auto Mode** (1 min)
   - Close the draft
   - ✅ Should finalize automatically
   - Check team page - results visible immediately
   - Reopen draft for next test

3. **Test Manual Mode** (3 min)
   - Switch to **Manual** mode
   - Close the draft
   - ✅ Preview button should appear
   - ✅ Finalize button should appear
   - Check team page - should show waiting message
   - Click preview - review results in blue card
   - Click finalize
   - Check team page - results now visible

4. **Verify** (30s)
   - Check database: `draft_status = 'completed'`
   - Check team access: Results visible
   - Check admin page: Shows finalized status

---

## 📝 Testing Checklist

Copy this for your test session:

```
[ ] Migration ran successfully
[ ] Database column exists
[ ] Toggle button visible
[ ] Toggle switches between auto/manual
[ ] Auto mode finalizes automatically
[ ] Manual mode requires confirmation
[ ] Preview button shows in manual + closed
[ ] Preview shows correct results
[ ] Finalize button shows in manual + closed
[ ] Finalize creates winners
[ ] Teams blocked when not finalized
[ ] Teams see results when finalized
[ ] No console errors
[ ] No API errors
```

---

## 🚀 Quick Commands

```bash
# Run migration
npx tsx scripts/add-draft-finalization-mode.ts

# Verify database
npx tsx scripts/verify-fantasy-leagues.ts

# Start dev server
npm run dev
```

---

## 📞 Need More Info?

Detailed documentation:
- `FANTASY_FINALIZATION_CURRENT_STATE.md` - Current state
- `FANTASY_FINALIZATION_MIGRATION_COMPLETE.md` - Migration report
- `FANTASY_DRAFT_FINALIZATION_QUICKSTART.md` - Full quick start
- `FANTASY_FINALIZATION_INDEX.md` - All documentation

---

**Ready?** Start with Test 1 (Toggle Mode) - it's the quickest! 🎉
