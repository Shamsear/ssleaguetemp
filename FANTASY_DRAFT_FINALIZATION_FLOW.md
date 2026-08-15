# Fantasy Draft Finalization Flow Diagrams

Visual representation of the manual and automatic finalization workflows.

---

## 🤖 Auto Finalization Flow (Default)

```
┌─────────────────────────────────────────────────────────────────┐
│                     AUTO FINALIZATION MODE                      │
└─────────────────────────────────────────────────────────────────┘

Admin Opens Draft Page
        │
        ├─────> Mode Shows: ⚡ Auto (Green)
        │
        ├─────> Click "Start Round"
        │       └─> Draft Status: PENDING → ACTIVE
        │
Teams Submit Bids
        │
        ├─────> Admin Clicks "Close Round"
        │       └─> Draft Status: ACTIVE → CLOSED
        │
        ├─────> ✨ AUTOMATIC FINALIZATION TRIGGERED ✨
        │       │
        │       ├─> Process all bids slot-by-slot
        │       ├─> Resolve priority fallbacks
        │       ├─> Assign players to teams
        │       ├─> Update squad tables
        │       ├─> Deduct budgets
        │       └─> Generate results
        │
        └─────> Draft Status: CLOSED → COMPLETED
                │
                └─> Display Results Immediately


⏱️  Timeline: Start → Bid → Close → Auto-Finalize (instant) → Results
```

---

## ⚙️ Manual Finalization Flow (New)

```
┌─────────────────────────────────────────────────────────────────┐
│                    MANUAL FINALIZATION MODE                     │
└─────────────────────────────────────────────────────────────────┘

Admin Opens Draft Page
        │
        ├─────> Mode Shows: ⚡ Auto (Green)
        │
        ├─────> Admin Clicks Toggle Button
        │       └─> API Call: PATCH /api/fantasy/leagues/[id]
        │           └─> Body: { "draft_finalization_mode": "manual" }
        │
        ├─────> Mode Changes: ⚡ Auto → ⚙️ Manual (Amber)
        │       └─> Success Alert: "Mode changed to MANUAL"
        │
        ├─────> Click "Start Round"
        │       └─> Draft Status: PENDING → ACTIVE
        │
Teams Submit Bids
        │
        ├─────> Admin Clicks "Close Round"
        │       └─> Draft Status: ACTIVE → CLOSED
        │
        ├─────> ⏸️  NO AUTO-FINALIZATION
        │       │
        │       └─> "Run Resolution Engine & Finalize" Button Appears
        │
Admin Reviews Submissions (Optional)
        │
        ├─────> Admin Clicks "Run Resolution Engine & Finalize"
        │       │
        │       └─> Confirmation Dialog:
        │           "Are you sure? This cannot be undone!"
        │
        ├─────> Admin Confirms
        │       │
        │       ├─> Process all bids slot-by-slot
        │       ├─> Resolve priority fallbacks
        │       ├─> Assign players to teams
        │       ├─> Update squad tables
        │       ├─> Deduct budgets
        │       └─> Generate results
        │
        └─────> Draft Status: CLOSED → COMPLETED
                │
                └─> Display Results


⏱️  Timeline: Toggle → Start → Bid → Close → Review → Manual Finalize → Results
```

---

## 🔄 Mode Toggle Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                       MODE TOGGLE FLOW                          │
└─────────────────────────────────────────────────────────────────┘

User Clicks Toggle Button (⚡ Auto or ⚙️ Manual)
        │
        ├─────> UI: Show loading state "..."
        │
        ├─────> Frontend: Determine new mode
        │       └─> Current: Auto → New: Manual
        │       └─> Current: Manual → New: Auto
        │
        ├─────> API Call: PATCH /api/fantasy/leagues/[leagueId]
        │       │
        │       ├─> Body: { "draft_finalization_mode": "manual" }
        │       │
        │       └─> Response Cases:
        │           │
        │           ├─> ✅ Success (200)
        │           │   ├─> Update local state
        │           │   ├─> Update UI (⚡ ↔ ⚙️)
        │           │   └─> Show success alert
        │           │
        │           ├─> ❌ Invalid Value (400)
        │           │   ├─> Keep old mode
        │           │   └─> Show error: "Invalid mode"
        │           │
        │           └─> ❌ League Not Found (404)
        │               ├─> Keep old mode
        │               └─> Show error: "League not found"
        │
        └─────> UI: Hide loading state


Database Updates:
        │
        ├─────> UPDATE fantasy_leagues
        │       SET draft_finalization_mode = 'manual'
        │       WHERE league_id = 'SSPSLFLS20'
        │
        └─────> Mode persists for future sessions
```

---

## 📊 State Transitions

```
┌─────────────────────────────────────────────────────────────────┐
│                    DRAFT STATUS STATES                          │
└─────────────────────────────────────────────────────────────────┘

                        PENDING
                           │
                           │ [Start Round]
                           ▼
                        ACTIVE
                           │
                           │ [Close Round]
                           ▼
                        CLOSED
                           │
                ┌──────────┴──────────┐
                │                     │
        [Auto Mode]           [Manual Mode]
                │                     │
        Auto-Finalize          Wait for Admin
                │                     │
                │             [Click Finalize]
                │                     │
                └──────────┬──────────┘
                           ▼
                      COMPLETED
                           │
                    [Display Results]
```

---

## 🎯 Decision Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              WHEN DRAFT CLOSES - DECISION TREE                  │
└─────────────────────────────────────────────────────────────────┘

                    Draft Closed
                         │
                         │
            ┌────────────┴────────────┐
            │                         │
    Is Finalization Mode             │
         = 'auto'?                   │
            │                         │
     ┌──────┴──────┐                │
     │             │                 │
    YES           NO                 │
     │             │                 │
     │             └─────────────────┤
     │                               │
     ▼                               ▼
Finalize                    Show Finalize Button
Immediately                        │
     │                             │
     │                   Wait for Admin Click
     │                             │
     │                             │
     │                   Admin Clicks Button
     │                             │
     │                             │
     └─────────────┬───────────────┘
                   │
                   ▼
          Run Resolution Engine
                   │
                   ├─> Process Bids
                   ├─> Assign Players
                   ├─> Update Squads
                   └─> Show Results
```

---

## 🔐 Component Interaction

```
┌─────────────────────────────────────────────────────────────────┐
│                  SYSTEM COMPONENT INTERACTIONS                  │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│   Admin UI       │
│  (Process Page)  │
└────────┬─────────┘
         │
         │ [Toggle Mode]
         │ [Close Draft]
         │ [Finalize (Manual)]
         ▼
┌──────────────────┐
│   API Layer      │
│  (PATCH/POST)    │
└────────┬─────────┘
         │
         │ [Update Mode]
         │ [Update Status]
         │ [Process Draft]
         ▼
┌──────────────────┐
│   Database       │
│  (fantasy_*)     │
└────────┬─────────┘
         │
         │ [Read Mode]
         │ [Read Bids]
         │ [Write Results]
         ▼
┌──────────────────┐
│  Draft Processor │
│  (slot-based)    │
└────────┬─────────┘
         │
         │ [Process Each Slot]
         │ [Assign Winners]
         │ [Update Squads]
         ▼
┌──────────────────┐
│    Results       │
│   (Display)      │
└──────────────────┘
```

---

## 🎨 UI Component Structure

```
┌─────────────────────────────────────────────────────────────────┐
│              DRAFT PROCESS PAGE LAYOUT                          │
└─────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ [←] Back to Dashboard                            [👥 Users]  │
│                                                                │
│ FANTASY CONSOLE                                                │
│ Finalize Draft                                                 │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ 🎯 Draft Finalization Mode                                    │
│ Auto/Manual mode: Description text...                         │
│                                    Current Mode: [⚡ Auto]  │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ 🎮 Draft Round Controls              Current Status: [Active] │
│ Control the bidding window manually...                        │
│                                                                │
│ Select Draft Slot: [Slot 1 ▾]                                │
│                                                                │
│ [▶ Start Round]  [⏸ Close Round]  [🔄 Reset]                │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ [👥] Total: 10  [✓] Submitted: 8  [⏱] Pending: 2           │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ 🎯 Resolve Draft Bids                                         │
│ Process all blind bids...                                     │
│                                                                │
│ [IF AUTO MODE]                                                │
│ ℹ️  Auto-finalization enabled: Draft will finalize...        │
│                                                                │
│ [IF MANUAL MODE + CLOSED]                                     │
│ [▶️ Run Resolution Engine & Finalize]                         │
│                                                                │
│ ⚠️  Warning: X teams haven't submitted...                    │
└───────────────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ 📋 Manager Submissions Tracking                               │
│                                                                │
│ • Team A  [✓ Submitted]  [10 bids]  [Budget: 50 Left]       │
│ • Team B  [⏳ Pending]    [5 bids]   [Budget: 75 Left]       │
│ ...                                                            │
└───────────────────────────────────────────────────────────────┘

[IF RESULTS AVAILABLE]
┌───────────────────────────────────────────────────────────────┐
│ 📊 Draft Resolution Results                                   │
│                                                                │
│ Players: 45  Teams: 8  Budget: 400 Cr  Avg Squad: 5.6        │
│                                                                │
│ Slot 1: Forward (5 winners / 10 bids)                        │
│ Slot 2: Midfielder (6 winners / 12 bids)                     │
│ ...                                                            │
└───────────────────────────────────────────────────────────────┘
```

---

## 📱 Mobile View Flow

```
┌──────────────────────────┐
│ ☰ Menu          [Users] │
│                          │
│ Finalize Draft           │
└──────────────────────────┘

┌──────────────────────────┐
│ 🎯 Finalization Mode     │
│ [⚡ Auto]               │
│ Tap to toggle            │
└──────────────────────────┘

┌──────────────────────────┐
│ 🎮 Draft Controls        │
│ Status: [Active]         │
│                          │
│ [▶ Start]               │
│ [⏸ Close]               │
└──────────────────────────┘

[Scrollable Content]

┌──────────────────────────┐
│ 🎯 Finalize Bids        │
│                          │
│ [▶️ Finalize]           │
│  (manual mode only)      │
└──────────────────────────┘
```

---

## 🔄 Real-Time Update Flow

```
Admin Action → Database Update → State Refresh → UI Re-render

Example: Toggle Mode
        │
        ├─> PATCH /api/fantasy/leagues/[id]
        │   └─> UPDATE fantasy_leagues SET mode = 'manual'
        │
        ├─> Response: { success: true, league: {...} }
        │   └─> setFinalizationMode('manual')
        │
        └─> React re-renders with new mode
            ├─> Toggle button: ⚡ → ⚙️
            ├─> Color: Green → Amber
            └─> Description text updates
```

---

**Visual Guide Version:** 1.0  
**Last Updated:** 2026-08-15  
**Status:** ✅ Complete
