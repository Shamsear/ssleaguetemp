# Fantasy Base Points - System Flow Diagram

## 📊 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          ADMIN TRIGGERS CALCULATION                      │
│                   POST /api/fantasy/calculate-points                     │
│                   { league_id, round_id }                                │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  calculateLineupPoints(leagueId, roundId)                │
│                   lib/fantasy/points-calculator-v2.ts                    │
└───────────┬────────────────────────────────────┬────────────────────────┘
            │                                    │
            ▼                                    ▼
┌───────────────────────────┐       ┌──────────────────────────────────┐
│  DRAFTED PLAYERS          │       │  ALL PLAYERS (NEW!)              │
│  (Existing Logic)         │       │  calculateAllPlayersBasePoints()  │
└───────────┬───────────────┘       └────────────┬─────────────────────┘
            │                                    │
            ▼                                    ▼
┌───────────────────────────┐       ┌──────────────────────────────────┐
│ Process Lineups:          │       │ Get All League Players:          │
│ - Starting 5 players      │       │ - Query fantasy_players table    │
│ - Apply multipliers:      │       │ - Filter out drafted players     │
│   • Captain: 2x           │       │ - Get performance from           │
│   • Vice-Captain: 1.5x    │       │   round_players table            │
│ - Bench: 0 or 1x          │       │                                  │
└───────────┬───────────────┘       └────────────┬─────────────────────┘
            │                                    │
            ▼                                    ▼
┌───────────────────────────┐       ┌──────────────────────────────────┐
│ Store in DB:              │       │ Store in DB:                     │
│ ┌─────────────────────┐   │       │ ┌────────────────────────────┐   │
│ │ fantasy_player_     │   │       │ │ fantasy_player_points      │   │
│ │ points              │   │       │ │                            │   │
│ │ - team_id: SET      │   │       │ │ - team_id: NULL ← KEY!    │   │
│ │ - base_points: 15   │   │       │ │ - base_points: 15         │   │
│ │ - multiplier: 2.0   │   │       │ │ - multiplier: 1.0         │   │
│ │ - total: 30         │   │       │ │ - total: 15               │   │
│ │ - is_captain: true  │   │       │ │ - is_captain: false       │   │
│ └─────────────────────┘   │       │ └────────────────────────────┘   │
└───────────────────────────┘       └──────────────────────────────────┘
```

---

## 🔍 Database Schema Comparison

### BEFORE (Old Schema)
```
fantasy_player_points
┌──────────────┬──────────────┬────────────┐
│ Column       │ Type         │ Nullable   │
├──────────────┼──────────────┼────────────┤
│ team_id      │ VARCHAR(100) │ NOT NULL ❌│
│ player_id    │ VARCHAR(100) │ NOT NULL   │
│ base_points  │ INTEGER      │ NULL       │
│ multiplier   │ INTEGER      │ NULL       │
│ total_points │ INTEGER      │ NULL       │
└──────────────┴──────────────┴────────────┘

Problem: Can only store points for DRAFTED players!
```

### AFTER (New Schema)
```
fantasy_player_points
┌──────────────┬──────────────┬────────────┐
│ Column       │ Type         │ Nullable   │
├──────────────┼──────────────┼────────────┤
│ team_id      │ VARCHAR(100) │ YES ✅     │
│ player_id    │ VARCHAR(100) │ NOT NULL   │
│ base_points  │ INTEGER      │ NULL       │
│ multiplier   │ INTEGER      │ NULL       │
│ total_points │ INTEGER      │ NULL       │
└──────────────┴──────────────┴────────────┘

Solution: team_id = NULL means undrafted player's base points!

UNIQUE CONSTRAINT:
  (league_id, player_id, round_id) WHERE team_id IS NULL
  Prevents duplicate base point records ✅
```

---

## 🎯 User Interaction Flow

### Team Manager Journey

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. TEAM MANAGER LOGS IN                                                 │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. NAVIGATES TO: /dashboard/team/fantasy/all-players-points            │
│                                                                          │
│    [League automatically detected from their team]                      │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. PAGE LOADS - API CALL                                                │
│    GET /api/fantasy/players/all-base-points?league_id=xxx              │
│                                                                          │
│    Response includes ALL players:                                       │
│    ├─ Available players (is_available = true)                          │
│    └─ Drafted players (acquired_by_team_name set)                      │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. TEAM VIEWS TABLE                                                     │
│                                                                          │
│  ┌────────────┬──────────┬──────────┬──────────────┬────────┐         │
│  │ Player     │ Status   │ Owner    │ Total Points │ Action │         │
│  ├────────────┼──────────┼──────────┼──────────────┼────────┤         │
│  │ John Doe   │ 🟢 Avail │ -        │ 250          │ 📊     │         │
│  │ Jane Smith │ 🟣 Draft │ My Team  │ 180          │ 📊     │         │
│  │ Bob Wilson │ 🟢 Avail │ -        │ 220          │ 📊     │         │
│  └────────────┴──────────┴──────────┴──────────────┴────────┘         │
│                                                                          │
│  Filters: [All] [Available] [Drafted]                                  │
│  Sort: [Total Points ▼] [Round Points] [Name] [Owner]                  │
│  Search: [_______________________]                                      │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 5. TEAM MANAGER ACTIONS                                                 │
│                                                                          │
│  ├─ Filter "Available" → Shows only undrafted players                  │
│  ├─ Sort by "Total Points" → Identifies top performers                 │
│  ├─ Select Round 5 → Views per-round breakdown                         │
│  └─ Search "Striker" → Finds specific positions/teams                  │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 6. PLANNING ACQUISITIONS                                                │
│                                                                          │
│  "Bob Wilson has 220 base points and is available!"                    │
│  "I should release low-performer and acquire him"                      │
│  "Let me check his per-round consistency..."                           │
│                                                                          │
│  [Round Selector: Round 5 ▼]                                           │
│                                                                          │
│  Bob Wilson's Round 5:                                                 │
│  ⚽ 2 Goals | 🎯 1 Assist | ⭐ MOTM | 18 points                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### Committee Admin Journey

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 1. ADMIN LOGS IN                                                        │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 2. NAVIGATES TO: /dashboard/committee/fantasy/all-players-points       │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 3. SELECTS LEAGUE                                                       │
│                                                                          │
│    League: [Fantasy League 2025 ▼]                                     │
│            [Fantasy League 2024  ]                                      │
│            [Training League      ]                                      │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 4. VIEWS ALL PLAYERS ACROSS LEAGUE                                      │
│                                                                          │
│  Can see:                                                               │
│  ├─ All player performance                                             │
│  ├─ Which teams acquired which players                                 │
│  ├─ Available player pool                                              │
│  └─ Cross-team comparisons                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Point Calculation Workflow

```
BEFORE IMPLEMENTATION:
═════════════════════
Round Completed
    │
    ▼
Calculate Points
    │
    ├─→ Drafted Players (with multipliers) ✅
    │   Stored in fantasy_player_points
    │
    └─→ Undrafted Players ❌
        [NO DATA RECORDED]


AFTER IMPLEMENTATION:
════════════════════
Round Completed
    │
    ▼
Calculate Points
    │
    ├─→ Drafted Players (with multipliers) ✅
    │   team_id = 'team_xxx'
    │   multiplier = 1.0 / 1.5 / 2.0
    │   Stored in fantasy_player_points
    │
    └─→ ALL Players (base points only) ✅ NEW!
        team_id = NULL
        multiplier = 1.0
        Stored in fantasy_player_points
        │
        └─→ Enables:
            ├─ Acquisition planning
            ├─ Player comparison
            ├─ Market analysis
            └─ Performance tracking
```

---

## 📈 Example Data States

### Example 1: Popular Striker (Drafted)

```
Player: "John Striker" (ID: player_001)
Round: 5

fantasy_player_points records:
┌──────────────┬───────────┬────────────┬───────────┬───────────┐
│ Record Type  │ team_id   │ base_pts   │ multiplier│ total_pts │
├──────────────┼───────────┼────────────┼───────────┼───────────┤
│ Base (Undra.)│ NULL      │ 15         │ 1.0       │ 15        │ ← NEW!
│ Team A (Cap.)│ team_a    │ 15         │ 2.0       │ 30        │ ← Existing
└──────────────┴───────────┴────────────┴───────────┴───────────┘

Page Views:
  Team Manager: Sees player with "Acquired by: Team A" + 15 base points
  Team A: Sees 30 points (with captain bonus) in their lineup
```

### Example 2: Available Defender (Undrafted)

```
Player: "Bob Defender" (ID: player_002)
Round: 5

fantasy_player_points records:
┌──────────────┬───────────┬────────────┬───────────┬───────────┐
│ Record Type  │ team_id   │ base_pts   │ multiplier│ total_pts │
├──────────────┼───────────┼────────────┼───────────┼───────────┤
│ Base (Undra.)│ NULL      │ 12         │ 1.0       │ 12        │ ← NEW!
└──────────────┴───────────┴────────────┴───────────┴───────────┘

Page Views:
  Team Manager: Sees player with "Available" status + 12 base points
  Can plan acquisition based on performance
```

---

## 🎨 UI State Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ALL PLAYERS - BASE POINTS                         │
│                                                                          │
│  Round: [Round 5 ▼]      Search: [_____________]  🔍                   │
│                                                                          │
│  Filters: [All] [Available 🟢] [Drafted 🟣]                            │
│  Sort: [Total Points ▼] [Round Points] [Name] [Owner]                  │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐│
│  │ Player        │ Team  │ Status    │ Owner      │ Total │ Round │ │ ││
│  ├───────────────┼───────┼───────────┼────────────┼───────┼───────┼─┤ ││
│  │ John Striker  │ FC A  │ 🟣 Drafted│ My Team FC │ 250   │ 15    │⚽││
│  │ Bob Defender  │ FC B  │ 🟢 Avail. │ -          │ 220   │ 12    │🛡││
│  │ Jane Mid      │ FC C  │ 🟢 Avail. │ -          │ 180   │ 10    │🎯││
│  │ Tim Keeper    │ FC D  │ 🟣 Drafted│ Other FC   │ 160   │ 8     │ ⭐││
│  └────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ℹ️  Base Points (without captain/vice-captain multipliers)            │
└─────────────────────────────────────────────────────────────────────────┘

Legend:
  🟢 Available = Undrafted, can be acquired
  🟣 Drafted = Already acquired by a team
  ⚽ Goals | 🎯 Assists | ⭐ MOTM | 🛡️ Clean Sheet
```

---

## ✅ Verification Checklist Visual

```
DATABASE SCHEMA
  ├─ [✅] team_id is NULLABLE
  ├─ [✅] Unique constraint added
  └─ [✅] Foreign key allows NULL

POINTS CALCULATION
  ├─ [✅] calculateAllPlayersBasePoints() added
  ├─ [✅] Called during calculateLineupPoints()
  ├─ [✅] Records created with team_id = NULL
  └─ [✅] Skips already drafted players

API ENDPOINT
  ├─ [✅] /api/fantasy/players/all-base-points exists
  ├─ [✅] Returns all players
  ├─ [✅] Shows acquisition status
  └─ [✅] Supports round filtering

TEAM PAGE
  ├─ [✅] /dashboard/team/fantasy/all-players-points exists
  ├─ [✅] Filters work (All/Available/Drafted)
  ├─ [✅] Sorting works
  ├─ [✅] Search works
  └─ [✅] Round selector works

ADMIN PAGE
  ├─ [✅] /dashboard/committee/fantasy/all-players-points exists
  ├─ [✅] League selector works
  ├─ [✅] Multi-league support
  └─ [✅] All team features work
```

---

## 🚀 Deployment Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Apply Migration                                                 │
│ $ psql -f migrations/make_team_id_nullable_fantasy_player_points.sql   │
│ Result: ✅ team_id is now nullable                                      │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Verify Migration                                                │
│ $ psql -f scripts/verify-base-points-implementation.sql                │
│ Result: ✅ Schema updated, constraint exists                            │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Calculate Points                                                │
│ Admin UI: Click "Calculate Points" for any round                       │
│ Result: ✅ Base points recorded for all players                         │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 4: Test Pages                                                      │
│ Team: /dashboard/team/fantasy/all-players-points                       │
│ Admin: /dashboard/committee/fantasy/all-players-points                 │
│ Result: ✅ Pages load with all player data                              │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ STEP 5: Production Ready! 🎉                                            │
│ ✅ Teams can view all players' base points                              │
│ ✅ Teams can plan acquisitions                                          │
│ ✅ Admins can monitor league-wide performance                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

**Total Implementation Time**: 2-3 hours of development + 10-15 minutes deployment
**Breaking Changes**: None - Fully backward compatible ✅
