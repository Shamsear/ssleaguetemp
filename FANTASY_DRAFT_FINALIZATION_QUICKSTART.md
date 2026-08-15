# Fantasy Draft Manual/Auto Finalization - Quick Start Guide

## 🎯 What's New?

Fantasy draft now supports **two finalization modes**, just like the normal auction system:

| Mode | Behavior | Use Case |
|------|----------|----------|
| **⚡ Auto** (Default) | Draft finalizes automatically when closed | Quick drafts, time-sensitive events |
| **⚙️ Manual** | Requires admin to click finalize button | Needs review before finalizing |

---

## 🚀 Quick Setup

### Step 1: Run Database Migration

```bash
psql $NEON_DATABASE_URL -f migrations/add_draft_finalization_mode_to_fantasy_leagues.sql
```

This adds the `draft_finalization_mode` column to `fantasy_leagues` table.

### Step 2: Access Draft Process Page

Navigate to: `/dashboard/committee/fantasy/[leagueId]/draft/process`

### Step 3: Choose Your Mode

Click the mode toggle button to switch between:
- **⚡ Auto** (green) - Automatic finalization
- **⚙️ Manual** (amber) - Manual finalization

---

## 📋 Using Auto Mode (Default)

1. Mode shows as **⚡ Auto** (no action needed)
2. Click **"Start Round"** to open bidding
3. Teams submit their bids
4. Click **"Close Round"** to lock bids
5. **Draft automatically finalizes** ✨
6. View results immediately

**Best for:** Normal draft operations, time-sensitive events

---

## 📋 Using Manual Mode

1. Click **⚡ Auto** button to switch to **⚙️ Manual**
2. Click **"Start Round"** to open bidding
3. Teams submit their bids
4. Click **"Close Round"** to lock bids
5. Review submissions (optional)
6. Click **"Run Resolution Engine & Finalize"** button
7. Confirm the finalization
8. View results

**Best for:** When you need to verify submissions before finalizing

---

## 🔍 Visual Guide

### Finalization Mode Card

```
┌─────────────────────────────────────────────────┐
│ Draft Finalization Mode                         │
│ Automatic mode: Draft finalizes when closed     │
│                                                  │
│ Current Mode: [⚡ Auto]  ← Click to toggle      │
└─────────────────────────────────────────────────┘
```

### Actions Panel (Auto Mode)

```
┌─────────────────────────────────────────────────┐
│ Resolve Draft Bids                              │
│                                                  │
│ [ℹ️  Auto-finalization enabled: Draft will     │
│     finalize automatically when closed]         │
└─────────────────────────────────────────────────┘
```

### Actions Panel (Manual Mode - After Closing)

```
┌─────────────────────────────────────────────────┐
│ Resolve Draft Bids                              │
│                                                  │
│ [▶️  Run Resolution Engine & Finalize]          │
└─────────────────────────────────────────────────┘
```

---

## ⚡ API Usage

### Change Finalization Mode

```bash
curl -X PATCH https://your-domain.com/api/fantasy/leagues/SSPSLFLS20 \
  -H "Content-Type: application/json" \
  -d '{"draft_finalization_mode": "manual"}'
```

**Valid values:** `"auto"` or `"manual"`

### Check Current Mode

```bash
curl https://your-domain.com/api/fantasy/leagues/SSPSLFLS20
```

Look for `draft_finalization_mode` in the response.

---

## ⚠️ Important Notes

1. **Cannot change mode after finalization** - Toggle is disabled once draft is completed
2. **Default is Auto** - All existing leagues use auto mode
3. **Backward compatible** - System works exactly as before unless you switch to manual
4. **Per-league setting** - Each fantasy league has its own finalization mode

---

## 🆘 Troubleshooting

### Mode toggle doesn't appear
- **Check:** Database migration ran successfully
- **Check:** You're on the draft process page (`/draft/process`)
- **Check:** You're logged in as committee admin

### Can't click toggle button
- **Reason:** Draft is already completed
- **Solution:** Mode can only be changed before finalization

### Finalize button doesn't appear (Manual mode)
- **Check:** Draft status is "closed" (not "pending" or "active")
- **Check:** Mode is set to "manual" (not "auto")

### Auto mode isn't finalizing
- **Check:** Draft status successfully changed to "closed"
- **Check:** Mode is actually set to "auto"
- **Solution:** Check browser console for errors

---

## 📚 Related Documentation

- **Full Implementation Guide:** `FANTASY_DRAFT_MANUAL_AUTO_FINALIZATION.md`
- **Normal Auction Finalization:** Similar pattern in `app/dashboard/committee/rounds/page.tsx`
- **Database Schema:** `fantasy_database_schema.sql`

---

## 🎓 Examples

### Example 1: Switch to Manual Mode

```typescript
const response = await fetch('/api/fantasy/leagues/SSPSLFLS20', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ draft_finalization_mode: 'manual' }),
});

const data = await response.json();
console.log(data.league.draft_finalization_mode); // "manual"
```

### Example 2: Check Mode Before Actions

```typescript
const league = await fetch('/api/fantasy/leagues/SSPSLFLS20').then(r => r.json());

if (league.league.draft_finalization_mode === 'manual') {
  console.log('Remember to manually finalize after closing!');
}
```

---

**Last Updated:** 2026-08-15  
**Status:** ✅ Ready to use
