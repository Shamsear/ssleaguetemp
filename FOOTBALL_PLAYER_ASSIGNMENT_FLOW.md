# Football Player Assignment Flow Report

## Overview
This document traces how football players (real players) are assigned to teams through the auction/bidding system and all database updates that occur.

---

## Flow Summary

```
1. Bulk Round Created → 2. Teams Place Bids → 3. Round Finalized → 4. Players Assigned
```

---

## Detailed Flow

### 1. **Bulk Round Creation**
**API:** `POST /api/admin/bulk-rounds`

**What Happens:**
- Committee admin creates a bulk auction round
- Round is stored in `rounds` table with type='bulk'
- Players are added to `round_players` table with status='pending'

**Database Updates:**
- **`rounds` table** (PostgreSQL/Neon):
  - Inserts new round with `round_type='bulk'`, `status='draft'`, `base_price`
  
- **`round_players` table** (PostgreSQL/Neon):
  - Inserts each player in the round with `status='pending'`

---

### 2. **Teams Place Bids**
**API:** `POST /api/team/bulk-rounds/:id/bids`

**What Happens:**
- Team users select players and place bids
- All bids are stored at fixed `base_price` from round

**Database Updates:**
- **`round_bids` table** (PostgreSQL/Neon):
  ```sql
  INSERT INTO round_bids (
    round_id,
    season_id,
    player_id,
    team_id,
    team_name,
    bid_amount,  -- Always round.base_price
    bid_time
  )
  ```

---

### 3. **Round Finalization**
**API:** `POST /api/admin/bulk-rounds/:id/finalize`

**Who Calls It:** Committee admin

**What Happens:**
This is the **KEY ENDPOINT** where players get assigned to teams. Here's the detailed process:

#### Step 3.1: Analyze Bids
- Fetches all bids from `round_bids` table
- Groups bids by player_id
- Categorizes into:
  - **Single bidders** (1 team bid) → immediate assignment
  - **Conflicts** (2+ teams bid) → manual tiebreaker needed

#### Step 3.2: Assign Single-Bidder Players
For each player with only 1 bid:

**Database Updates:**

1. **`round_players` table** (PostgreSQL/Neon):
   ```sql
   UPDATE round_players
   SET 
     winning_team_id = team_id,
     winning_bid = base_price,
     status = 'sold',
     bid_count = 1
   WHERE round_id = ? AND player_id = ?
   ```

2. **`round_bids` table** (PostgreSQL/Neon):
   ```sql
   UPDATE round_bids
   SET is_winning = true
   WHERE round_id = ? AND player_id = ? AND team_id = ?
   ```

3. **`team_players` table** (PostgreSQL/Neon):
   ```sql
   INSERT INTO team_players (
     team_id,
     player_id,
     season_id,
     round_id,
     purchase_price,
     acquired_at
   ) VALUES (...)
   ON CONFLICT (player_id, season_id) DO UPDATE
   ```

4. **`footballplayers` table** (PostgreSQL/Neon):
   ```sql
   UPDATE footballplayers
   SET 
     is_sold = true,
     team_id = team_id,
     acquisition_value = base_price,
     status = 'active',
     season_id = season_id,
     round_id = round_id,
     contract_start_season = season_id,
     contract_end_season = season_id,
     contract_length = 1,
     updated_at = NOW()
   WHERE id = player_id
   ```

5. **`teams` table** (PostgreSQL/Neon):
   ```sql
   UPDATE teams 
   SET 
     football_spent = football_spent + base_price,
     football_budget = football_budget - base_price,
     football_players_count = football_players_count + 1,
     updated_at = NOW()
   WHERE id = team_id AND season_id = season_id
   ```

6. **`team_seasons` collection** (Firestore):
   - Document: `{team_id}_{season_id}`
   - Updates:
     ```javascript
     {
       football_budget: current - base_price,
       football_spent: current + base_price,
       total_spent: current + base_price,
       players_count: current + 1,
       position_counts: { [position]: count + 1 },
       updated_at: new Date()
     }
     ```

7. **`transactions` collection** (Firestore):
   - Creates transaction log via `logAuctionWin()`
   - Document ID: Generated unique ID
   - Fields:
     ```javascript
     {
       user_id: firebase_uid,
       season_id: season_id,
       type: 'player_purchase',
       player_name: player_name,
       player_id: player_id,
       currency_type: 'football',
       amount: -base_price,
       balance_after: new_balance,
       round_id: round_id,
       description: "Won auction for {player_name}",
       created_at: timestamp
     }
     ```

8. **`notifications` collection** (Firestore):
   - Notification sent to season
   - Document ID: Generated unique ID  
   - Fields:
     ```javascript
     {
       title: "✅ Bulk Round Results!",
       body: "Round {N} finalized! {X} players assigned...",
       season_id: season_id,
       type: 'bulk_round_finalized',
       created_at: timestamp,
       data: { roundId, roundNumber, assignedCount }
     }
     ```

#### Step 3.3: Mark Conflicts
For players with multiple bids:

**Database Updates:**
- **`round_players` table** (PostgreSQL/Neon):
  ```sql
  UPDATE round_players
  SET 
    bid_count = number_of_bids,
    status = 'pending'
  WHERE round_id = ? AND player_id = ?
  ```

Committee must manually create tiebreakers for these.

#### Step 3.4: Mark Unsold Players
**Database Updates:**
- **`round_players` table** (PostgreSQL/Neon):
  ```sql
  UPDATE round_players
  SET status = 'unsold'
  WHERE round_id = ? 
  AND status = 'pending'
  AND player_id NOT IN (players_with_bids)
  ```

#### Step 3.5: Update Round Status
**Database Updates:**
- **`rounds` table** (PostgreSQL/Neon):
  ```sql
  UPDATE rounds
  SET status = 'completed', updated_at = NOW()
  WHERE id = round_id
  ```

#### Step 3.6: Real-time Broadcasts
- Broadcasts squad update to team via Firebase Realtime Database
- Broadcasts wallet update to team via Firebase Realtime Database
- Broadcasts round completion status

---

## Summary of All Database Tables Updated

### PostgreSQL/Neon Tables:
1. ✅ **`rounds`** - Round status updated to 'completed'
2. ✅ **`round_players`** - Player status, winning team, winning bid updated
3. ✅ **`round_bids`** - Winning bid marked with `is_winning=true`
4. ✅ **`team_players`** - Player ownership recorded
5. ✅ **`footballplayers`** - Player assigned to team, marked as sold
6. ✅ **`teams`** - Team budget, spent, player count updated

### Firestore Collections:
7. ✅ **`team_seasons/{team_id}_{season_id}`** - Budget, spent, player count updated
8. ✅ **`transactions`** - Transaction log created for purchase
9. ✅ **`notifications`** - Notification sent about round completion

### Firebase Realtime Database:
10. ✅ **Live updates** - Squad and wallet updates broadcast to teams

---

## Key Files

### API Endpoints:
- **Create Round:** `app/api/admin/bulk-rounds/route.ts`
- **Place Bids:** `app/api/team/bulk-rounds/[id]/bids/route.ts`
- **Finalize Round:** `app/api/admin/bulk-rounds/[id]/finalize/route.ts`

### Helper Functions:
- **Transaction Logger:** `lib/transaction-logger.ts` (`logAuctionWin()`)
- **Notifications:** `lib/notifications/send-notification.ts`
- **Broadcasts:** `lib/realtime/broadcast.ts`

---

## Important Notes

1. **Idempotency:** The finalize endpoint can be called multiple times safely. It checks for:
   - Players already allocated in `round_players.status='sold'`
   - Players already in `team_players` table
   - Only updates budgets for NEW assignments

2. **Slot Checking:** Before assigning, checks if team has available slots:
   - `football_total_slots` vs `football_players_count`
   - Skips assignment if team is full

3. **Transaction Logging:** Every player assignment creates a transaction record in Firestore

4. **Notifications:** Teams receive notifications about:
   - Player assignments
   - Budget changes
   - Round completion

5. **Conflict Resolution:** Players with multiple bids are marked as 'pending' and require manual tiebreaker creation by committee

---

## Example Data Flow

### Before Assignment:
```
Player: "Aashiq"
- footballplayers.is_sold = false
- footballplayers.team_id = null

Team: "Los Galacticos"  
- teams.football_budget = 1000
- teams.football_spent = 0
- teams.football_players_count = 0
```

### After Assignment (Base Price: 25):
```
Player: "Aashiq"
- footballplayers.is_sold = true
- footballplayers.team_id = "los_galacticos"
- footballplayers.acquisition_value = 25
- round_players.status = "sold"
- round_players.winning_team_id = "los_galacticos"
- team_players row created

Team: "Los Galacticos"
- teams.football_budget = 975
- teams.football_spent = 25
- teams.football_players_count = 1
- team_seasons.football_budget = 975
- team_seasons.football_spent = 25
- Transaction created in Firestore
- Notification sent
```

---

## End of Report
