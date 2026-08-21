# ⚡ Captain Windows - Quick Start Guide

**Feature**: Time-controlled captain selection windows  
**Status**: ✅ Ready to Use

---

## 🎯 What This Does

Allows admins to create windows where teams can select captain (2x points) and vice-captain (backup 2x) for specific rounds.

---

## 🚀 Quick Start

### For Admins (5 minutes)

1. **Go to Captain Windows page**
   ```
   /dashboard/committee/fantasy/[leagueId]/captain-windows
   ```

2. **Click "Create Window"**

3. **Fill the form:**
   - Round ID: `round_1`
   - Round Number: `1`
   - Round Name: `Round 1`
   - Opens At: `2026-08-20 10:00`
   - Closes At: `2026-08-22 18:00`

4. **Click "Create Window"**

5. **Click "Open"** to let teams select

6. **Monitor**: See how many teams have selected

7. **Click "Close"** when deadline reached

8. **Click "Lock"** to finalize (optional)

---

### For Teams (2 minutes)

1. **Go to Captain Selection page**
   ```
   /dashboard/team/fantasy/captain-selection
   ```

2. **If window is OPEN:**
   - Select your captain (click radio button)
   - Select your vice-captain (click radio button)
   - Click "Save Captain & Vice-Captain"

3. **Done!** You can change anytime before window closes

---

## 📋 Window States

```
PENDING → Admin hasn't opened yet
OPEN → Teams CAN select captain/VC
CLOSED → Window ended, selections locked
LOCKED → Finalized for points calculation
```

---

## 🎮 Features

✅ Create unlimited windows (one per round)  
✅ Set custom opening/closing times  
✅ Real-time countdown timer  
✅ Progress tracking (X / Y teams set)  
✅ Audit trail (all changes logged)  
✅ Captain gets 2x points  
✅ Vice-captain gets 2x if captain doesn't play  

---

## 📍 URLs

**Admin Page**:
```
/dashboard/committee/fantasy/[leagueId]/captain-windows
```

**Team Page**:
```
/dashboard/team/fantasy/captain-selection
```

---

## 🔧 Need to Add Navigation

### Add to Fantasy Console
```tsx
<Link href={`/dashboard/committee/fantasy/${leagueId}/captain-windows`}>
  Captain Windows
</Link>
```

### Add to Team Dashboard
```tsx
<Link href="/dashboard/team/fantasy/captain-selection">
  Select Captain
</Link>
```

---

## ✅ Testing

1. Create a window
2. Open it
3. Go to team page as a team
4. Select captain and vice-captain
5. Save
6. Go back to admin page
7. See counter: 1 / 12 teams set
8. Close window
9. Team page shows "Window Closed"

---

## 🎉 That's It!

**Everything is ready to use!** Just add navigation links and you're good to go.

---

**Full Documentation**: See `CAPTAIN_WINDOWS_COMPLETE.md`
