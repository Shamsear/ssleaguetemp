# ✅ Fantasy Captain Windows - API Complete

**Status**: ✅ All API Endpoints Created  
**Date**: 2026-08-15

---

## 📍 API Endpoints Summary

### 1. List Captain Windows ✅
```http
GET /api/fantasy/captain-windows?league_id=SSPSLFLS17
```
**Returns**: All captain windows for a league

### 2. Create Captain Window ✅
```http
POST /api/fantasy/captain-windows
Body: {
  league_id, round_id, round_number, round_name,
  opens_at, closes_at, notes
}
```
**Returns**: Newly created window

### 3. Update Window Status ✅
```http
PATCH /api/fantasy/captain-windows/[windowId]
Body: { window_status: "open" | "closed" | "locked" }
```
**Returns**: Updated window

### 4. Delete Window ✅
```http
DELETE /api/fantasy/captain-windows/[windowId]
```
**Returns**: Success (only if no teams have set captains)

### 5. Get Current Window ✅
```http
GET /api/fantasy/captain-windows/current?league_id=X&team_id=Y
```
**Returns**: Current active window + team's selections

### 6. Set Captain/Vice-Captain ✅
```http
POST /api/fantasy/captain-windows/set-captains
Body: {
  window_id, team_id,
  captain_player_id, vice_captain_player_id,
  user_id
}
```
**Returns**: Saved captain selections

---

## 🔐 Validation Rules Implemented

### Window Creation
- ✅ opens_at must be before closes_at
- ✅ Cannot create duplicate window for same round
- ✅ Auto-calculates total_teams from fantasy_teams

### Setting Captains
- ✅ Window must be "open" status
- ✅ Captain must be in team's squad
- ✅ Vice-captain must be in team's squad
- ✅ Captain ≠ Vice-captain
- ✅ Logs all changes to history
- ✅ Updates counter on first selection

### Window Update
- ✅ Valid status transitions only
- ✅ Window must exist

### Window Deletion
- ✅ Only if teams_with_captain_set = 0
- ✅ Cleans up associated history

---

## 📊 Database Operations

### When Captain is Set
```sql
-- 1. Reset all captains for team
UPDATE fantasy_team_players
SET is_captain = false, is_vice_captain = false
WHERE team_id = 'team_xyz';

-- 2. Set new captain
UPDATE fantasy_team_players
SET is_captain = true
WHERE team_id = 'team_xyz' AND real_player_id = 'player_123';

-- 3. Set new vice-captain
UPDATE fantasy_team_players
SET is_vice_captain = true
WHERE team_id = 'team_xyz' AND real_player_id = 'player_456';

-- 4. Log to history
INSERT INTO fantasy_captain_history (...) VALUES (...);

-- 5. Increment counter (if first time)
UPDATE fantasy_captain_windows
SET teams_with_captain_set = teams_with_captain_set + 1
WHERE window_id = 'cw_abc';
```

---

## 🧪 Testing Examples

### Create Window
```bash
curl -X POST http://localhost:3000/api/fantasy/captain-windows \
  -H "Content-Type: application/json" \
  -d '{
    "league_id": "SSPSLFLS17",
    "round_id": "round_1",
    "round_number": 1,
    "round_name": "Round 1",
    "opens_at": "2026-08-20T10:00:00Z",
    "closes_at": "2026-08-22T18:00:00Z"
  }'
```

### Open Window
```bash
curl -X PATCH http://localhost:3000/api/fantasy/captain-windows/cw_abc123 \
  -H "Content-Type: application/json" \
  -d '{ "window_status": "open" }'
```

### Set Captain
```bash
curl -X POST http://localhost:3000/api/fantasy/captain-windows/set-captains \
  -H "Content-Type: application/json" \
  -d '{
    "window_id": "cw_abc123",
    "team_id": "team_xyz",
    "captain_player_id": "player_123",
    "vice_captain_player_id": "player_456",
    "user_id": "user_abc"
  }'
```

### Check Current Window
```bash
curl "http://localhost:3000/api/fantasy/captain-windows/current?league_id=SSPSLFLS17&team_id=team_xyz"
```

---

## 📝 Files Created

1. `app/api/fantasy/captain-windows/route.ts` - List & Create
2. `app/api/fantasy/captain-windows/[windowId]/route.ts` - Update & Delete
3. `app/api/fantasy/captain-windows/set-captains/route.ts` - Team selection
4. `app/api/fantasy/captain-windows/current/route.ts` - Current status

---

## ✅ Next: UI Implementation

**Admin UI** (To Create):
- Captain windows management page
- Create window form
- Open/close/lock buttons
- View teams with captain set
- Window list with stats

**Team UI** (To Create):
- Check current window status
- Captain selection page (when open)
- Show countdown timer
- Display locked status (when closed)
- View current selections

---

**API Status**: 🟢 COMPLETE & READY FOR TESTING
