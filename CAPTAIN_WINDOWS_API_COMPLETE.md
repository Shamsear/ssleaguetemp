# ✅ Captain Windows API - Complete

**Status**: API Endpoints Complete  
**Date**: 2026-08-15

---

## 📋 API Endpoints Created

### 1. Create Captain Window ✅
```http
POST /api/fantasy/captain-windows

Body:
{
  "league_id": "SSPSLFLS17",
  "round_id": "round_1",
  "round_number": 1,
  "round_name": "Round 1",
  "opens_at": "2026-08-20T10:00:00Z",
  "closes_at": "2026-08-22T18:00:00Z",
  "notes": "Optional notes",
  "created_by_user_id": "user_123"
}
```

**Features**:
- Validates dates (closes_at must be after opens_at)
- Prevents duplicate windows for same round
- Auto-calculates total_teams count
- Generates unique window_id

---

### 2. List Captain Windows ✅
```http
GET /api/fantasy/captain-windows?league_id=SSPSLFLS17&status=open

Query Params:
- league_id: Required
- status: Optional filter (pending, open, closed, locked)
```

**Features**:
- Lists all windows for a league
- Optional status filter
- Ordered by round_number

---

### 3. Get Specific Window ✅
```http
GET /api/fantasy/captain-windows/[windowId]
```

**Features**:
- Get details of one window
- Includes teams_with_captain_set counter

---

### 4. Update Window Status ✅
```http
PATCH /api/fantasy/captain-windows/[windowId]

Body:
{
  "window_status": "open" | "closed" | "locked",
  "opens_at": "2026-08-20T11:00:00Z",  // optional
  "closes_at": "2026-08-22T19:00:00Z",  // optional
  "notes": "Updated notes"               // optional
}
```

**Features**:
- Change window status
- Update timing
- Add/update notes

---

### 5. Get Current Active Window ✅
```http
GET /api/fantasy/captain-windows/current?league_id=SSPSLFLS17&team_id=team_abc

Query Params:
- league_id: Required
- team_id: Optional (returns team's current selections)
```

**Response**:
```json
{
  "success": true,
  "current_window": {
    "window_id": "cw_...",
    "round_id": "round_1",
    "window_status": "open",
    "opens_at": "2026-08-20T10:00:00Z",
    "closes_at": "2026-08-22T18:00:00Z",
    "time_remaining_seconds": 172800,
    "is_open": true
  },
  "team_has_set_captain": true,
  "current_selections": {
    "captain_player_id": "player_123",
    "captain_player_name": "Messi",
    "vice_captain_player_id": "player_456",
    "vice_captain_player_name": "Ronaldo"
  }
}
```

**Features**:
- Finds current OPEN window
- Calculates time remaining
- Returns team's current captain/VC if team_id provided
- Handles no active window gracefully

---

### 6. Set Captain & Vice-Captain ✅
```http
POST /api/fantasy/captain-windows/set-captains

Body:
{
  "window_id": "cw_abc123",
  "team_id": "team_xyz",
  "captain_player_id": "player_123",
  "vice_captain_player_id": "player_456",
  "user_id": "user_abc"
}
```

**Features**:
- ✅ Validates window is OPEN
- ✅ Validates window hasn't expired
- ✅ Validates team belongs to league
- ✅ Validates both players are in squad
- ✅ Prevents same player as C and VC
- ✅ Creates fantasy_player_points entries if needed
- ✅ Resets previous captain/VC
- ✅ Sets new captain (2x multiplier)
- ✅ Sets new vice-captain
- ✅ Logs to fantasy_captain_history
- ✅ Updates teams_with_captain_set counter (first time only)

---

### 7. Delete Window ✅
```http
DELETE /api/fantasy/captain-windows/[windowId]
```

**Features**:
- Only allows deletion if no teams have set captains
- Returns 409 Conflict if teams have selections

---

## 🔐 Validation & Security

### Window Creation
- ✅ Required fields validated
- ✅ Date format validated
- ✅ Logical date order (closes after opens)
- ✅ Prevents duplicate windows per round

### Captain Selection
- ✅ Window must be OPEN
- ✅ Window must not be expired
- ✅ Team must exist in league
- ✅ Players must be in team's squad
- ✅ Captain ≠ Vice-Captain
- ✅ All changes logged to history

### Window Updates
- ✅ Only valid status values accepted
- ✅ Window existence checked
- ✅ Atomic updates with timestamps

---

## 📊 Database Operations

### Fantasy Player Points
```sql
-- Reset captains
UPDATE fantasy_player_points
SET is_captain = false, is_vice_captain = false, points_multiplier = 1
WHERE team_id = 'team_abc';

-- Set captain
UPDATE fantasy_player_points
SET is_captain = true, points_multiplier = 2
WHERE team_id = 'team_abc' AND real_player_id = 'player_123';

-- Set vice-captain
UPDATE fantasy_player_points
SET is_vice_captain = true
WHERE team_id = 'team_abc' AND real_player_id = 'player_456';
```

### Captain History Logging
```sql
INSERT INTO fantasy_captain_history (
  history_id, league_id, team_id, round_id, window_id,
  captain_player_id, vice_captain_player_id,
  changed_by_user_id, notes
) VALUES (...);
```

### Counter Update
```sql
-- Increment teams_with_captain_set (only first time)
UPDATE fantasy_captain_windows
SET teams_with_captain_set = teams_with_captain_set + 1
WHERE window_id = 'cw_abc123';
```

---

## 🧪 Testing Checklist

### Create Window
- [x] Create valid window → Success
- [x] Create with past dates → Validation error
- [x] Create duplicate for same round → Conflict error
- [x] Create with closes_at before opens_at → Validation error

### Update Window
- [x] Update status → Success
- [x] Update non-existent window → Not found error
- [x] Update with invalid status → Validation error

### Set Captains
- [x] Set when window open → Success
- [x] Set when window closed → Forbidden error
- [x] Set same player as C and VC → Validation error
- [x] Set player not in squad → Validation error
- [x] Change captain multiple times → All logged in history
- [x] First time sets → Counter incremented
- [x] Subsequent changes → Counter unchanged

### Get Current Window
- [x] Get with active window → Returns window
- [x] Get with no active window → Returns null
- [x] Get with team_id → Returns selections

---

## 📝 Next Steps: Admin UI

Now that APIs are complete, create admin UI:

### Captain Windows Management Page
**Location**: `/dashboard/committee/fantasy/[leagueId]/captain-windows`

**Features Needed**:
1. List all windows
2. Create new window button + modal
3. Status badges (pending/open/closed/locked)
4. Open/Close/Lock buttons
5. Teams counter (X / Y teams set)
6. Edit window timing
7. Delete window (if no selections)

---

## 📝 Next Steps: Team UI

### Captain Selection Page
**Location**: `/dashboard/team/fantasy/captain-selection`

**Features Needed**:
1. Check if window is open
2. Show window status (closed/open with countdown)
3. List squad players
4. Captain dropdown/selector
5. Vice-Captain dropdown/selector
6. Show current selections
7. Save button
8. Success/error messages
9. Disable when window closed

---

**Status**: ✅ ALL APIs COMPLETE - Ready for UI Implementation
