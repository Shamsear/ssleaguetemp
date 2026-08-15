# ✅ Fantasy Draft - Add/Reduce Time Controls

**Feature**: Add or reduce time to active fantasy draft (like normal auction rounds)  
**Date Added**: 2026-08-15  
**Status**: ✅ COMPLETE

---

## What Was Added

### New Controls in Draft Process Page
**Location**: `/dashboard/committee/fantasy/[leagueId]/draft/process`

Added **"Adjust Time"** functionality that appears when draft is **ACTIVE**:

```
┌─────────────────────────────────────────────────────┐
│  Draft Round Controls                               │
│                                                     │
│  ▶ Close Round     [  10  min] Adjust Time  🔄 Reset│
└─────────────────────────────────────────────────────┘
```

---

## How It Works

### 1. Input Box
- Shows when draft status = 'active'
- Default value: 10 minutes
- Accepts positive or negative numbers:
  - **Positive** (e.g., `10`, `15`, `30`): ADDS time to deadline
  - **Negative** (e.g., `-5`, `-10`): REDUCES time from deadline

### 2. Adjust Time Button
- Located next to the input box
- Click to apply the time adjustment
- Updates `draft_closes_at` field in database
- Shows success/error message

### 3. Behavior

**Add Time Example**:
```
Current deadline: 2:00 PM
Input: 15
Action: Click "Adjust Time"
New deadline: 2:15 PM
Message: "Added 15 minutes to the draft deadline"
```

**Reduce Time Example**:
```
Current deadline: 2:30 PM
Input: -10
Action: Click "Adjust Time"
New deadline: 2:20 PM
Message: "Removed 10 minutes from the draft deadline"
```

---

## Comparison with Normal Auction

### Normal Auction Rounds
✅ Add/Reduce Time during active round  
✅ Finalize Round button (stops round early)  
✅ Auto/Manual finalization modes  
✅ Date/time window controls  

### Fantasy Draft (Now)
✅ Add/Reduce Time during active draft ← **NEW!**  
✅ Close Round button (locks bids)  
✅ Auto/Manual finalization modes  
✅ Date/time window controls  
✅ Preview results (manual mode)  
✅ Reset to Pending  

**Both systems now have feature parity for time management! 🎉**

---

## API Changes

### Endpoint Used
```http
POST /api/fantasy/draft/control
```

### Request Body
```json
{
  "league_id": "SSPSLFLS17",
  "draft_closes_at": "2026-08-15T14:30:00.000Z"
}
```

**Note**: Reuses existing draft control endpoint - no new API needed!

---

## UI Changes

### File Modified
`app/dashboard/committee/fantasy/[leagueId]/draft/process/page.tsx`

### Changes Made

1. **State Added**:
```typescript
const [addTimeMinutes, setAddTimeMinutes] = useState<string>('10');
```

2. **Handler Added**:
```typescript
const handleAddTime = async () => {
  const minutes = parseInt(addTimeMinutes || '0');
  // Validates input
  // Calculates new end time
  // Calls API to update draft_closes_at
  // Shows success/error message
}
```

3. **UI Added** (when draft is active):
```tsx
<div className="flex items-center gap-3 ml-auto">
  <div className="relative flex-1 max-w-[120px]">
    <input
      type="number"
      value={addTimeMinutes}
      onChange={(e) => setAddTimeMinutes(e.target.value)}
      className="..."
      placeholder="e.g. 10 or -10"
    />
    <span className="absolute right-3 ...">min</span>
  </div>
  <button onClick={handleAddTime} className="...">
    <Clock className="w-3 h-3 text-amber-400" /> Adjust Time
  </button>
</div>
```

---

## Validation & Error Handling

### Input Validation
- ✅ Checks if input is a valid number
- ✅ Rejects zero (0) - must add or subtract time
- ✅ Checks if deadline exists before adjusting

### Error Messages

**Invalid Input**:
```
⚠️ Invalid Duration
Please enter a valid number of minutes to add or subtract
```

**No Deadline**:
```
⚠️ No Deadline Set
Draft must have a deadline set before adjusting time
```

**API Failure**:
```
❌ Adjustment Failed
Failed to adjust time
```

---

## Visual Layout

### When Draft is Pending
```
┌─────────────────────────────────────────────┐
│  Draft Round Controls                       │
│  Status: [PENDING]                          │
│                                             │
│  [Select Draft Slot: ▼ Slot 1]            │
│  [Opens At:  2026-08-15 13:00]             │
│  [Closes At: 2026-08-15 14:00]             │
│                                             │
│  [▶ Start Round (Open Bids)]               │
└─────────────────────────────────────────────┘
```

### When Draft is Active (NEW!)
```
┌─────────────────────────────────────────────┐
│  Draft Round Controls                       │
│  Status: [ACTIVE]                           │
│                                             │
│  🎯 Active Slot: Players Slot 1            │
│  ⏳ Opened: 1:00 PM                        │
│  🏁 Deadline: 2:00 PM                      │
│                                             │
│  [⏸ Close Round]  [ 10 min] [Adjust Time] │
│  [🔄 Reset to Pending]                     │
└─────────────────────────────────────────────┘
```

### When Draft is Closed
```
┌─────────────────────────────────────────────┐
│  Draft Round Controls                       │
│  Status: [CLOSED]                           │
│                                             │
│  [🔄 Reset to Pending]                     │
│                                             │
│  (Preview and Finalize buttons below)       │
└─────────────────────────────────────────────┘
```

---

## Use Cases

### Scenario 1: Extend Draft Time
**Situation**: Teams requesting more time  
**Action**: Enter `15`, click "Adjust Time"  
**Result**: Deadline extended by 15 minutes  

### Scenario 2: Speed Up Draft
**Situation**: All teams submitted early  
**Action**: Enter `-10`, click "Adjust Time"  
**Result**: Deadline moved 10 minutes earlier  

### Scenario 3: Emergency Extension
**Situation**: Technical issue during draft  
**Action**: Enter `30`, click "Adjust Time"  
**Result**: Adds 30 minutes buffer time  

---

## Testing Checklist

### ✅ Functionality Tests
- [x] Input box appears when draft is active
- [x] Input accepts positive numbers (add time)
- [x] Input accepts negative numbers (reduce time)
- [x] Adjust button updates deadline
- [x] Success message shows correct adjustment
- [x] Deadline updates in UI immediately
- [x] Deadline persists after page refresh

### ✅ Validation Tests
- [x] Rejects zero (0) input
- [x] Rejects non-numeric input
- [x] Rejects empty input
- [x] Shows error when no deadline set
- [x] Shows error on API failure

### ✅ UI Tests
- [x] Input box hidden when draft not active
- [x] Input box appears when draft starts
- [x] Input box hidden when draft closed
- [x] Button styling matches design system
- [x] Responsive on mobile

---

## Documentation Updated

- ✅ `FANTASY_DRAFT_TIME_CONTROLS.md` (this file)
- ✅ Code implementation in draft process page
- ✅ Inline code comments added

---

## Quick Reference

### For Admins

**To Add Time**:
1. Ensure draft is ACTIVE
2. Enter positive number (e.g., `10`)
3. Click "Adjust Time"
4. Deadline extended ✅

**To Reduce Time**:
1. Ensure draft is ACTIVE
2. Enter negative number (e.g., `-5`)
3. Click "Adjust Time"
4. Deadline shortened ✅

**To Stop Round Early**:
1. Click "Close Round (Lock Bids)"
2. Bids are locked immediately
3. Proceed with finalization

---

## Technical Notes

### State Management
- Uses existing `closesAt` state for deadline
- Adds new `addTimeMinutes` state for input
- Updates both states on successful adjustment

### API Integration
- Reuses `/api/fantasy/draft/control` endpoint
- Sends updated `draft_closes_at` timestamp
- No breaking changes to existing API

### Time Calculations
```typescript
const currentEnd = new Date(closesAt);
const newEnd = new Date(currentEnd.getTime() + (minutes * 60 * 1000));
```

### Datetime Format
- API uses ISO 8601: `2026-08-15T14:30:00.000Z`
- Input uses HTML5: `2026-08-15T14:30`
- Conversion handled automatically

---

## Comparison Table

| Feature | Normal Auction | Fantasy Draft (Before) | Fantasy Draft (Now) |
|---------|---------------|------------------------|---------------------|
| Add Time | ✅ | ❌ | ✅ |
| Reduce Time | ✅ | ❌ | ✅ |
| Stop Early | ✅ Finalize | ✅ Close Round | ✅ Close Round |
| Preview Results | ✅ | ✅ (Manual mode) | ✅ (Manual mode) |
| Auto/Manual Mode | ✅ | ✅ | ✅ |
| Time Window | ✅ | ✅ | ✅ |

**Status**: 🟢 Feature parity achieved!

---

## Next Steps (Optional Enhancements)

### Potential Future Improvements
1. **Quick Time Buttons**: Add +5, +10, +30 minute buttons
2. **Time History**: Log all time adjustments
3. **Time Limits**: Set min/max deadline boundaries
4. **Countdown Display**: Real-time countdown timer
5. **Notification**: Alert teams when time is added/reduced

---

**Status**: ✅ COMPLETE - Fantasy draft now has full time control parity with normal auction rounds!
