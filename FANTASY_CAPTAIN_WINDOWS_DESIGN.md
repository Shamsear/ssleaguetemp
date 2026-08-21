# 🎯 Fantasy Captain Windows - Final Design

**Status**: ✅ Database Ready | 🔄 API & UI Pending  
**Date**: 2026-08-15

---

## ✅ Database Structure

### Table: `fantasy_captain_windows`
**Purpose**: Track captain selection windows per round (admin creates one for each round)

```sql
CREATE TABLE fantasy_captain_windows (
  id SERIAL PRIMARY KEY,
  window_id VARCHAR(100) UNIQUE,        -- Unique ID for this window
  league_id VARCHAR(100) NOT NULL,       -- Which league
  round_id VARCHAR(100) NOT NULL,        -- Which round
  round_number INTEGER,                  -- Round number (e.g., 1, 2, 3)
  round_name VARCHAR(255),               -- Round name (e.g., "Round 1")
  
  window_status VARCHAR(20) DEFAULT 'pending',
  -- Values: pending | open | closed | locked
  
  opens_at TIMESTAMP WITH TIME ZONE NOT NULL,
  closes_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  created_by_user_id VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  total_teams INTEGER DEFAULT 0,
  teams_with_captain_set INTEGER DEFAULT 0,
  
  notes TEXT,
  
  UNIQUE(league_id, round_id)  -- One window per round per league
);
```

### Table: `fantasy_captain_history`
**Purpose**: Audit trail of all captain/VC changes

```sql
CREATE TABLE fantasy_captain_history (
  id SERIAL PRIMARY KEY,
  history_id VARCHAR(100) UNIQUE,
  league_id VARCHAR(100),
  team_id VARCHAR(100),
  round_id VARCHAR(100),
  window_id VARCHAR(100),              -- Link to captain window
  captain_player_id VARCHAR(100),
  vice_captain_player_id VARCHAR(100),
  changed_by_user_id VARCHAR(100),
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT
);
```

---

## 🎮 How It Works

### Admin Workflow
```
1. Create Captain Window for Round 1
   ├─ Set League: Season 17
   ├─ Set Round: Round 1  
   ├─ Set Opens: 2026-08-20 10:00
   └─ Set Closes: 2026-08-22 18:00
   
2. Window created with status: PENDING

3. Admin opens window (or auto-opens at opens_at time)
   └─ Status: PENDING → OPEN
   
4. Teams select their captain/VC
   └─ teams_with_captain_set counter increments
   
5. Window closes (manually or auto at closes_at time)
   └─ Status: OPEN → CLOSED
   
6. Admin finalizes/locks window
   └─ Status: CLOSED → LOCKED
   
7. Repeat for Round 2, Round 3, etc.
```

### Team Workflow
```
1. Check if captain window is OPEN
   └─ If closed: Show "Window closed" message
   
2. If OPEN: Show captain selection UI
   ├─ List all players in squad
   ├─ Select Captain (gets 2x points multiplier)
   └─ Select Vice-Captain (backup if captain doesn't play)
   
3. Submit selections
   └─ Saved to fantasy_player_points table
   └─ Logged in fantasy_captain_history
   
4. Can change anytime while window is OPEN
   └─ Each change logged in history
```

---

## 📊 Window Status Flow

```
┌─────────┐
│ PENDING │  Window created but not started
└────┬────┘
     │ opens_at reached OR admin opens
     ▼
┌─────────┐
│  OPEN   │  Teams CAN select captain/VC
└────┬────┘
     │ closes_at reached OR admin closes
     ▼
┌─────────┐
│ CLOSED  │  Window ended, selections locked
└────┬────┘
     │ admin finalizes (optional)
     ▼
┌─────────┐
│ LOCKED  │  Finalized for points calculation
└─────────┘
```

---

## 🔌 API Endpoints (To Be Created)

### 1. Create Captain Window
```http
POST /api/fantasy/captain-windows

Request:
{
  "league_id": "SSPSLFLS17",
  "round_id": "round_1",
  "round_number": 1,
  "round_name": "Round 1",
  "opens_at": "2026-08-20T10:00:00Z",
  "closes_at": "2026-08-22T18:00:00Z",
  "notes": "First round captain selection"
}

Response:
{
  "success": true,
  "window": {
    "window_id": "cw_abc123",
    "league_id": "SSPSLFLS17",
    "round_id": "round_1",
    "window_status": "pending",
    "opens_at": "2026-08-20T10:00:00Z",
    "closes_at": "2026-08-22T18:00:00Z"
  }
}
```

### 2. List Captain Windows
```http
GET /api/fantasy/captain-windows?league_id=SSPSLFLS17

Response:
{
  "success": true,
  "windows": [
    {
      "window_id": "cw_abc123",
      "round_id": "round_1",
      "round_name": "Round 1",
      "window_status": "open",
      "opens_at": "2026-08-20T10:00:00Z",
      "closes_at": "2026-08-22T18:00:00Z",
      "teams_with_captain_set": 8,
      "total_teams": 12
    },
    {
      "window_id": "cw_def456",
      "round_id": "round_2",
      "round_name": "Round 2",
      "window_status": "pending",
      "opens_at": "2026-08-27T10:00:00Z",
      "closes_at": "2026-08-29T18:00:00Z",
      "teams_with_captain_set": 0,
      "total_teams": 12
    }
  ]
}
```

### 3. Update Window Status
```http
PATCH /api/fantasy/captain-windows/[windowId]

Request:
{
  "window_status": "open" | "closed" | "locked"
}

Response:
{
  "success": true,
  "window": {
    "window_id": "cw_abc123",
    "window_status": "open",
    "updated_at": "2026-08-20T10:05:00Z"
  }
}
```

### 4. Set Captain/Vice-Captain (Team Action)
```http
POST /api/fantasy/captain-windows/set-captains

Request:
{
  "window_id": "cw_abc123",
  "team_id": "team_xyz",
  "captain_player_id": "player_123",
  "vice_captain_player_id": "player_456"
}

Response:
{
  "success": true,
  "captain": {
    "player_id": "player_123",
    "player_name": "Messi",
    "multiplier": 2
  },
  "vice_captain": {
    "player_id": "player_456",
    "player_name": "Ronaldo",
    "multiplier": 2
  },
  "recorded_at": "2026-08-20T12:30:00Z"
}
```

### 5. Get Window Status (Team Check)
```http
GET /api/fantasy/captain-windows/current?league_id=SSPSLFLS17

Response:
{
  "success": true,
  "current_window": {
    "window_id": "cw_abc123",
    "round_id": "round_1",
    "round_name": "Round 1",
    "window_status": "open",
    "is_open": true,
    "opens_at": "2026-08-20T10:00:00Z",
    "closes_at": "2026-08-22T18:00:00Z",
    "time_remaining_seconds": 172800
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

---

## 🎨 UI Design

### Admin: Captain Windows Management Page
```
┌────────────────────────────────────────────────────────┐
│  🎯 Captain Selection Windows                          │
│                                                        │
│  [+ Create New Window]                                │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Round 1 - Opens: Aug 20 10:00                   │ │
│  │ Status: [OPEN] 🟢                                │ │
│  │ Teams Set: 8 / 12                                │ │
│  │ Closes: Aug 22 18:00 (in 2 days)               │ │
│  │ [View Details] [Close Window] [Lock]            │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │ Round 2 - Opens: Aug 27 10:00                   │ │
│  │ Status: [PENDING] ⏸️                              │ │
│  │ Teams Set: 0 / 12                                │ │
│  │ Closes: Aug 29 18:00 (in 9 days)               │ │
│  │ [View Details] [Open Window]                     │ │
│  └──────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### Admin: Create Captain Window Modal
```
┌────────────────────────────────────────────────────────┐
│  📝 Create Captain Selection Window                    │
│                                                        │
│  Round: [Select Round ▼]                              │
│         └─ Round 1, Round 2, Round 3...               │
│                                                        │
│  Opens At:  [2026-08-20] [10:00] 📅                  │
│  Closes At: [2026-08-22] [18:00] 📅                  │
│                                                        │
│  Notes (optional):                                     │
│  [                                                  ]  │
│                                                        │
│  [Cancel]  [Create Window]                            │
└────────────────────────────────────────────────────────┘
```

### Team: Captain Selection (When Window OPEN)
```
┌────────────────────────────────────────────────────────┐
│  👑 Select Captain & Vice-Captain - Round 1            │
│                                                        │
│  ⏰ Window closes in: 2 days 6 hours                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 75%       │
│                                                        │
│  Captain (2x Points):                                 │
│  ┌─────────────────────────────────────────────────┐  │
│  │ [●] Messi  (FWD) - Team A                       │  │
│  │ [ ] Ronaldo (FWD) - Team B                      │  │
│  │ [ ] Neymar (MID) - Team C                       │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  Vice-Captain (Backup 2x if Captain doesn't play):   │
│  ┌─────────────────────────────────────────────────┐  │
│  │ [ ] Messi (FWD) - Team A                        │  │
│  │ [●] Ronaldo (FWD) - Team B                      │  │
│  │ [ ] Neymar (MID) - Team C                       │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  [Save Selections]                                    │
│                                                        │
│  ℹ️ You can change your selections anytime before     │
│     the window closes                                  │
└────────────────────────────────────────────────────────┘
```

### Team: Window Closed View
```
┌────────────────────────────────────────────────────────┐
│  🔒 Captain Selection Window Closed                    │
│                                                        │
│  The captain selection window for Round 1 is closed.  │
│                                                        │
│  Your Selections:                                      │
│  👑 Captain: Messi (2x multiplier)                    │
│  ⭐ Vice-Captain: Ronaldo (backup 2x)                 │
│                                                        │
│  Next window: Round 2 opens Aug 27 at 10:00 AM       │
└────────────────────────────────────────────────────────┘
```

---

## ✅ Advantages of Separate Table

### ❌ Old Approach (in fantasy_leagues)
- Only one set of captain window dates
- Can't track multiple rounds
- Can't see history of past windows
- Would need complex workarounds

### ✅ New Approach (fantasy_captain_windows table)
- Create unlimited windows (one per round)
- Track status of each window independently
- View history of all windows
- Easy to query "which windows are open now"
- Can create windows in advance
- Clear audit trail

---

## 📋 Implementation Checklist

### Database ✅
- [x] Create fantasy_captain_windows table
- [x] Update fantasy_captain_history with window_id
- [x] Add indexes
- [x] Add constraints (one window per round per league)

### API (Next)
- [ ] POST /api/fantasy/captain-windows (create)
- [ ] GET /api/fantasy/captain-windows (list)
- [ ] GET /api/fantasy/captain-windows/current (check status)
- [ ] PATCH /api/fantasy/captain-windows/[id] (update status)
- [ ] POST /api/fantasy/captain-windows/set-captains (team action)
- [ ] GET /api/fantasy/captain-windows/history (audit trail)

### Admin UI (Next)
- [ ] Captain windows management page
- [ ] Create window form
- [ ] List all windows
- [ ] Open/close/lock buttons
- [ ] View teams with captain set

### Team UI (Next)
- [ ] Check if window is open
- [ ] Captain selection interface
- [ ] Show countdown timer
- [ ] Show locked status when closed
- [ ] View current selections

---

**Status**: ✅ Database Complete | Ready for API & UI implementation

Would you like me to continue with the API endpoints next?
