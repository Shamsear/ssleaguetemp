# 🎯 Fantasy Captain Selection Windows - Implementation Plan

**Status**: 🔄 In Progress  
**Date**: 2026-08-15

---

## ✅ Completed: Database Migration

### New Fields in `fantasy_leagues` Table
```sql
captain_window_status VARCHAR(20) DEFAULT 'closed'
  -- Values: 'closed', 'open', 'locked'
  
captain_window_opens_at TIMESTAMP WITH TIME ZONE
  -- When teams can start selecting captain/VC
  
captain_window_closes_at TIMESTAMP WITH TIME ZONE
  -- Deadline for captain/VC selection
  
current_round_id VARCHAR(100)
  -- Current active round for captain selection
```

### New Table: `fantasy_captain_history`
```sql
CREATE TABLE fantasy_captain_history (
  id SERIAL PRIMARY KEY,
  history_id VARCHAR(100) UNIQUE,
  league_id VARCHAR(100),
  team_id VARCHAR(100),
  round_id VARCHAR(100),
  captain_player_id VARCHAR(100),
  vice_captain_player_id VARCHAR(100),
  changed_by_user_id VARCHAR(100),
  changed_at TIMESTAMP WITH TIME ZONE,
  window_opens_at TIMESTAMP WITH TIME ZONE,
  window_closes_at TIMESTAMP WITH TIME ZONE,
  notes TEXT
);
```

**Purpose**: Audit trail of all captain/VC changes

---

## 🎮 Feature Overview

### Window Statuses
```
┌──────────┬───────────────────────────────────────────┐
│ Status   │ Description                               │
├──────────┼───────────────────────────────────────────┤
│ closed   │ Teams CANNOT change captain/VC            │
│ open     │ Teams CAN change captain/VC               │
│ locked   │ Window closed, selections locked for round│
└──────────┴───────────────────────────────────────────┘
```

### Flow Diagram
```
CLOSED  →  Admin Opens  →  OPEN  →  Admin Closes/Timer Expires  →  LOCKED
  ↑                         ↓                                         ↓
  └─────────────────────  Teams Select Captain/VC  ─────────────────┘
                                                                      │
                                                          Round Completes
                                                                      │
                                                              Reset to CLOSED
```

---

## 📋 Implementation Checklist

### Phase 1: Database & API ✅
- [x] Create database migration
- [x] Add captain window fields to fantasy_leagues
- [x] Create fantasy_captain_history table
- [x] Run migration successfully
- [ ] Create API endpoint: `/api/fantasy/captain-window/control`
- [ ] Create API endpoint: `/api/fantasy/captain-window/status`
- [ ] Create API endpoint: `/api/fantasy/captain-window/set-captains`
- [ ] Create API endpoint: `/api/fantasy/captain-window/history`

### Phase 2: Admin UI
- [ ] Create captain window controls in fantasy console
- [ ] Add open/close window buttons
- [ ] Add date/time pickers for window
- [ ] Show current window status
- [ ] Show which teams have set captains
- [ ] Add window history view

### Phase 3: Team UI  
- [ ] Create captain selection page/modal
- [ ] Show only when window is OPEN
- [ ] List eligible players (in squad)
- [ ] Select captain dropdown/UI
- [ ] Select vice-captain dropdown/UI
- [ ] Show current selections
- [ ] Show window countdown timer
- [ ] Disable when window CLOSED/LOCKED

### Phase 4: Validation & Restrictions
- [ ] Enforce window timing (can only change when open)
- [ ] Validate captain is in squad
- [ ] Validate vice-captain is in squad
- [ ] Prevent same player as both C and VC
- [ ] Log all changes to history table
- [ ] Show error messages for invalid selections

### Phase 5: Points Calculation Integration
- [ ] Apply captain multiplier (2x) when calculating points
- [ ] Apply vice-captain multiplier if captain didn't play
- [ ] Show multiplied points in player points table
- [ ] Update points calculator to check captain/VC

---

## 🔌 API Endpoints Design

### 1. Control Captain Window
```http
POST /api/fantasy/captain-window/control

Request Body:
{
  "league_id": "SSPSLFLS17",
  "action": "open" | "close" | "lock",
  "round_id": "round_1",
  "opens_at": "2026-08-15T10:00:00Z",
  "closes_at": "2026-08-15T18:00:00Z"
}

Response:
{
  "success": true,
  "window_status": "open",
  "opens_at": "2026-08-15T10:00:00Z",
  "closes_at": "2026-08-15T18:00:00Z"
}
```

### 2. Get Window Status
```http
GET /api/fantasy/captain-window/status?league_id=SSPSLFLS17

Response:
{
  "success": true,
  "window_status": "open",
  "opens_at": "2026-08-15T10:00:00Z",
  "closes_at": "2026-08-15T18:00:00Z",
  "current_round_id": "round_1",
  "is_open": true,
  "time_remaining_seconds": 28800
}
```

### 3. Set Captains
```http
POST /api/fantasy/captain-window/set-captains

Request Body:
{
  "league_id": "SSPSLFLS17",
  "team_id": "team_abc",
  "captain_player_id": "player_123",
  "vice_captain_player_id": "player_456"
}

Response:
{
  "success": true,
  "captain": {
    "player_id": "player_123",
    "player_name": "Messi"
  },
  "vice_captain": {
    "player_id": "player_456",
    "player_name": "Ronaldo"
  },
  "recorded_at": "2026-08-15T12:30:00Z"
}
```

### 4. Get Captain History
```http
GET /api/fantasy/captain-window/history?league_id=SSPSLFLS17&team_id=team_abc

Response:
{
  "success": true,
  "history": [
    {
      "round_id": "round_1",
      "captain_player_id": "player_123",
      "vice_captain_player_id": "player_456",
      "changed_at": "2026-08-15T12:30:00Z"
    }
  ]
}
```

---

## 🎨 UI Design

### Admin: Fantasy Console - Captain Window Card
```
┌────────────────────────────────────────────────────┐
│  🎯 Captain Selection Window                       │
│                                                    │
│  Current Status: [CLOSED]                         │
│  Current Round:  [Not Set ▼]                      │
│                                                    │
│  Window Opens:   [2026-08-15 10:00] 📅           │
│  Window Closes:  [2026-08-15 18:00] 📅           │
│                                                    │
│  [▶ Open Window]  [⏸ Close Window]  [🔒 Lock]   │
│                                                    │
│  Teams with Captain Set: 5 / 12                   │
└────────────────────────────────────────────────────┘
```

### Team: Captain Selection Page
```
┌────────────────────────────────────────────────────┐
│  🎯 Select Captain & Vice-Captain                  │
│                                                    │
│  ⏰ Window Closes in: 5 hours 30 minutes          │
│                                                    │
│  Captain (2x Points):                             │
│  [Select Player ▼]                                │
│   Currently: Messi                                │
│                                                    │
│  Vice-Captain (2x if Captain doesn't play):       │
│  [Select Player ▼]                                │
│   Currently: Ronaldo                              │
│                                                    │
│  [Save Selections]                                │
│                                                    │
│  ℹ️ You can change your selections any time       │
│     before the window closes                       │
└────────────────────────────────────────────────────┘
```

### Team: Window Closed View
```
┌────────────────────────────────────────────────────┐
│  🔒 Captain Selection Locked                       │
│                                                    │
│  The captain selection window is currently closed. │
│                                                    │
│  Your Current Selections:                          │
│  👑 Captain: Messi (2x multiplier)                │
│  ⭐ Vice-Captain: Ronaldo (backup 2x)             │
│                                                    │
│  Next window opens: TBD                            │
└────────────────────────────────────────────────────┘
```

---

## 🔐 Validation Rules

### When Setting Captain/VC
1. ✅ Window must be OPEN
2. ✅ Player must be in team's squad
3. ✅ Player must not be suspended/injured (optional)
4. ✅ Captain and Vice-Captain must be different players
5. ✅ User must own the team
6. ✅ League must be active

### Window Opening
1. ✅ Must set round_id
2. ✅ Opens_at must be before closes_at
3. ✅ Cannot open if already open

### Window Closing
1. ✅ Must be currently open
2. ✅ Locks all captain selections for the round

---

## 📊 Database Queries

### Get Teams Without Captain Set
```sql
SELECT ft.team_id, ft.team_name
FROM fantasy_teams ft
WHERE ft.league_id = 'SSPSLFLS17'
  AND NOT EXISTS (
    SELECT 1 FROM fantasy_player_points fpp
    WHERE fpp.team_id = ft.team_id
      AND fpp.is_captain = true
      AND fpp.fantasy_round_id = 'round_1'
  );
```

### Get Captain History for Team
```sql
SELECT 
  round_id,
  captain_player_id,
  vice_captain_player_id,
  changed_at
FROM fantasy_captain_history
WHERE team_id = 'team_abc'
ORDER BY changed_at DESC;
```

### Update Captain in Player Points
```sql
-- Reset all captains for team in this round
UPDATE fantasy_player_points
SET is_captain = false, is_vice_captain = false
WHERE team_id = 'team_abc' 
  AND fantasy_round_id = 'round_1';

-- Set new captain
UPDATE fantasy_player_points
SET is_captain = true, points_multiplier = 2
WHERE team_id = 'team_abc' 
  AND real_player_id = 'player_123'
  AND fantasy_round_id = 'round_1';

-- Set new vice-captain  
UPDATE fantasy_player_points
SET is_vice_captain = true
WHERE team_id = 'team_abc' 
  AND real_player_id = 'player_456'
  AND fantasy_round_id = 'round_1';
```

---

## 🧪 Testing Scenarios

### Happy Path
1. Admin opens window with dates
2. Team selects captain and VC
3. Changes are saved
4. Admin closes window
5. Selections are locked

### Edge Cases
1. Try to set captain when window closed → Error
2. Try to set same player as C and VC → Error
3. Try to set player not in squad → Error
4. Window auto-closes after deadline
5. Multiple rapid changes (race conditions)

---

## 📝 Next Implementation Steps

1. **Create API endpoints** (all 4 endpoints)
2. **Create admin UI** (captain window controls card)
3. **Create team UI** (captain selection page)
4. **Add validation** (all rules enforced)
5. **Test thoroughly** (all scenarios)
6. **Integrate with points** (apply multipliers)

**Estimated Time**: 3-4 hours for complete implementation

---

**Status**: ✅ Migration Complete | 🔄 API & UI in Progress
