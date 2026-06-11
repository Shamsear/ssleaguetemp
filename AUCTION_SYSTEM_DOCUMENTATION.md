# Complete Auction System Documentation

## Overview
This system implements a fantasy football auction mechanism with two types of rounds (Normal and Bulk) and sophisticated tiebreaker resolution systems.

---

## 1. AUCTION TYPES

### A. Normal Rounds (Traditional Auction)
- **Concept**: Teams bid on individual players in a specific position
- **Bidding**: Encrypted blind bidding (teams can't see others' bids)
- **Allocation**: ONE player per team maximum
- **Process**:
  1. Admin creates round for specific position (e.g., "Striker")
  2. Teams submit encrypted bids (up to `max_bids_per_team` players)
  3. Teams click "Submit" to finalize their bids
  4. Round expires or admin manually finalizes
  5. Highest bidder wins each player

### B. Bulk Rounds (Multi-Player Auction)
- **Concept**: All eligible players auctioned simultaneously at fixed base price
- **Bidding**: Open bidding at base price (e.g., £10)
- **Allocation**: Multiple players per team possible
- **Process**:
  1. Admin creates bulk round with base price
  2. System auto-adds ALL eligible players (`is_auction_eligible=true`, `is_sold=false`)
  3. Teams select which players they want at base price
  4. Round expires or admin finalizes
  5. Single bidders get players immediately, multiple bidders go to tiebreaker

---

## 2. NORMAL ROUND FINALIZATION

### Phase System
The auction has 3 phases with different rules:

**Phase 1** (Early rounds):
- Non-submitted teams: Forced random allocation at average price
- Purpose: Ensure all teams build squads

**Phase 2** (Middle rounds):
- Non-submitted teams: Can skip (no forced allocation)
- Purpose: Allow strategic skipping

**Phase 3** (Late rounds):
- Non-submitted teams: Forced random allocation at £10 minimum
- Purpose: Ensure squads are completed

### Finalization Algorithm (`lib/finalize-round.ts`)

```
1. CHECK PREREQUISITES
   - No active tiebreakers exist
   - Get resolved tiebreaker results (if any)

2. DECRYPT ALL BIDS
   - Decrypt encrypted bid data
   - Apply tiebreaker winning amounts (if resolved)
   - Fetch team names from Firebase

3. SEPARATE TEAMS
   - Submitted teams: Clicked "Submit" button
   - Non-submitted teams: Didn't submit

4. ALLOCATE TO SUBMITTED TEAMS (1 player per team max)
   While (bids exist AND teams need players):
     a. Sort bids by amount (highest first)
     b. Get top bid
     c. Check for ties:
        - If TIE: Create tiebreaker, STOP finalization
        - If NO TIE: Allocate player to team
     d. Remove allocated player AND team from pool
     e. Repeat

5. HANDLE NON-SUBMITTED TEAMS
   Phase 1 & 3:
     - Calculate average price or use minimum (£10)
     - Check team balance and reserve requirements
     - Randomly allocate from their bids
     - If no bids: Randomly allocate from position pool
   
   Phase 2:
     - Skip (no forced allocation)

6. UPDATE DATABASE
   - Mark winning/losing bids
   - Update team_players, footballplayers tables
   - Deduct budgets in Firebase and Neon
   - Log transactions
   - Mark round as 'completed'

7. BROADCAST & NOTIFY
   - Real-time updates via Firebase
   - FCM notifications to winners
   - Generate news articles
```

### Key Features
- **Reserve Calculator**: Ensures teams maintain minimum balance for future rounds
- **Slot Validation**: Checks team has available squad slots
- **Idempotent**: Can be called multiple times safely (prevents double-deduction)
- **Dual Currency Support**: Handles both single and dual currency systems

---

## 3. NORMAL ROUND TIEBREAKERS

### When Created
- 2+ teams bid the **exact same amount** on the **same player**

### Characteristics
- **No time limit** (`duration_minutes = NULL`)
- Runs until all tied teams submit new bids
- Can create **recursive tiebreakers** (if new bids also tie)

### Process (`lib/tiebreaker.ts`)

```
1. CREATE TIEBREAKER
   - Generate readable ID (SSPSLTR00001)
   - Store original amount and tied teams
   - Create team_tiebreaker records for each team
   - Mark round as 'tiebreaker_pending'

2. TEAMS SUBMIT NEW BIDS
   - Each team submits higher bid
   - Stored in team_tiebreakers.new_bid_amount
   - No time pressure (runs indefinitely)

3. RESOLUTION (when all teams submit)
   a. Get all new bids
   b. Find highest bid
   c. Check for another tie:
      - If TIE AGAIN: Create new tiebreaker (recursive)
      - If NO TIE: Mark winner
   d. Update tiebreaker status to 'resolved'
   e. Store winning_team_id and winning_bid

4. FINALIZATION USES TIEBREAKER RESULT
   - When round finalizes again
   - Uses winning_bid instead of original bid
   - Allocates player to winning team
```

### Database Tables
```sql
tiebreakers:
  - id (SSPSLTR00001)
  - round_id
  - player_id
  - original_amount
  - tied_teams (count)
  - status (active/resolved/excluded/tied_again)
  - winning_team_id
  - winning_bid
  - duration_minutes (NULL = no limit)

team_tiebreakers:
  - id (SSPSLT0001_SSPSLTR00001)
  - tiebreaker_id
  - team_id
  - old_bid_amount (original)
  - new_bid_amount (new bid)
  - submitted (boolean)
  - status (pending/resolved/excluded)
```

---

## 4. BULK ROUND FINALIZATION

### Process (`app/api/admin/bulk-rounds/[id]/finalize/route.ts`)

```
1. ANALYZE ALL BIDS
   - Get all bids from round_bids table
   - Group by player_id
   - Count bids per player

2. SEPARATE PLAYERS
   Single bidders: Only 1 team bid on player
   Conflicts: 2+ teams bid on player

3. IMMEDIATE ALLOCATION (Single Bidders)
   For each single-bidder player:
     a. Check team has available slots
     b. Assign player at base_price
     c. Update round_players (status='sold')
     d. Update footballplayers (is_sold=true)
     e. Insert into team_players
     f. Deduct budget from teams table (Neon)
     g. Deduct budget from team_seasons (Firebase)
     h. Log transaction
     i. Broadcast updates

4. MARK CONFLICTS
   For each contested player:
     - Update round_players.bid_count
     - Set status='pending'
     - Admin must manually create bulk tiebreaker

5. MARK UNSOLD
   - Players with no bids: status='unsold'

6. COMPLETE ROUND
   - Set round status='completed'
   - Broadcast completion
   - Generate news
   - Send notifications
```

### Key Differences from Normal Rounds
- **Fixed price**: All players at base_price (e.g., £10)
- **No automatic tiebreaker creation**: Admin creates manually
- **Multiple players per team**: No 1-player limit
- **Slot validation**: Critical to prevent over-allocation

---

## 5. BULK TIEBREAKERS (Last Person Standing)

### Concept
Open auction where teams bid against each other until only 1 team remains.

### Characteristics
- **Open bidding**: All bids visible to all teams
- **No time limit**: Runs until 1 team left
- **Safety limit**: 24-hour maximum (`max_end_time`)
- **Withdrawal**: Teams can withdraw anytime

### Process

```
1. ADMIN CREATES BULK TIEBREAKER
   - Select contested player
   - System creates bulk_tiebreaker record
   - Add all tied teams to bulk_tiebreaker_teams
   - Set status='active'
   - Start auction

2. TEAMS BID (Open Auction)
   POST /api/team/bulk-tiebreakers/:id/bid
   
   For each bid:
     a. Validate bid > current_highest_bid
     b. Check team balance
     c. Insert into bulk_tiebreaker_bids (history)
     d. Update bulk_tiebreaker_teams.current_bid
     e. Update bulk_tiebreaker.current_highest_bid
     f. Update bulk_tiebreaker.current_highest_team_id
     g. Broadcast update to all teams

3. TEAMS CAN WITHDRAW
   POST /api/team/bulk-tiebreakers/:id/withdraw
   
   - Set team status='withdrawn'
   - Decrement teams_remaining
   - Broadcast update

4. AUTO-FINALIZE (When 1 team left)
   Trigger: teams_remaining = 1
   
   a. Get winner (last active team)
   b. Call finalizeBulkTiebreaker()

5. FINALIZATION (lib/finalize-bulk-tiebreaker.ts)
   a. Validate winner has slots
   b. Update round_players (status='sold')
   c. Update footballplayers (is_sold=true, team_id)
   d. Insert/update team_players
   e. Mark bulk_tiebreaker as 'resolved'
   f. Mark tiebreakers table as 'resolved'
   g. Mark winning bid in round_bids
   h. Deduct budget (Neon + Firebase)
   i. Log transaction
   j. Broadcast updates
   k. Generate news
   l. Send notifications
   m. Check if all tiebreakers resolved → mark round 'completed'
```

### Database Tables
```sql
bulk_tiebreakers:
  - id (serial)
  - round_id
  - player_id
  - player_name
  - base_price
  - status (pending/active/resolved/cancelled)
  - current_highest_bid
  - current_highest_team_id
  - teams_remaining
  - start_time
  - last_activity_time
  - max_end_time (start + 24 hours)

bulk_tiebreaker_teams:
  - id (serial)
  - tiebreaker_id
  - team_id
  - status (active/withdrawn)
  - current_bid
  - joined_at
  - withdrawn_at

bulk_tiebreaker_bids:
  - id (serial)
  - tiebreaker_id
  - team_id
  - bid_amount
  - bid_time
  (Complete audit trail)
```

---

## 6. KEY DATABASE MODELS

### rounds
```sql
- id (SSPSLFR00001 = normal, SSPSLFBR00001 = bulk)
- season_id
- position (e.g., "ST", "LB,LWF")
- round_number
- round_type ('normal' | 'bulk')
- max_bids_per_team (normal rounds)
- base_price (bulk rounds)
- duration_seconds
- start_time, end_time
- status (draft/active/expired/tiebreaker_pending/completed)
```

### bids (Normal Rounds)
```sql
- id (SSPSLT0001_SSPSLFR00001)
- round_id
- team_id
- encrypted_bid_data (contains player_id, amount)
- status (pending/active/won/lost)
- phase (open/regular/incomplete)
```

### round_bids (Bulk Rounds)
```sql
- id (serial)
- round_id
- season_id
- player_id
- team_id
- bid_amount (always base_price)
- bid_time
- is_winning (boolean)
```

### round_players (Bulk Rounds)
```sql
- round_id
- player_id
- player_name
- position
- status (pending/sold/unsold)
- bid_count
- winning_team_id
- winning_bid
```

### team_players (Final Ownership)
```sql
- team_id
- player_id
- season_id
- round_id
- purchase_price
- acquired_at
```

---

## 7. IMPORTANT FEATURES

### Encryption (Normal Rounds)
- Bids encrypted using AES-256-GCM
- Prevents bid snooping before finalization
- Decrypted only during finalization

### Reserve Calculator
```typescript
calculateReserveCore(
  round_number,
  current_balance,
  current_squad_size,
  config: {
    phase_1_end_round,
    phase_1_min_balance,
    phase_2_end_round,
    phase_2_min_balance,
    phase_3_min_balance,
    max_squad_size
  }
)
```
- Ensures teams maintain minimum balance
- Prevents teams from spending all money early
- Calculates required reserve based on remaining slots

### Slot Validation
```typescript
// Check available slots
total_slots = football_total_slots (from teams table)
current_count = football_players_count
available_slots = total_slots - current_count

if (available_slots <= 0) {
  // Reject allocation
}
```

### Idempotency
- All finalization functions check existing allocations
- Prevents double-deduction on re-finalization
- Safe to call multiple times

### Real-time Broadcasting
```typescript
// Firebase Realtime Database
broadcastRoundUpdate(season_id, round_id, data)
broadcastSquadUpdate(season_id, team_id, data)
broadcastWalletUpdate(season_id, team_id, data)
```

### Dual Currency Support
```typescript
if (currency_system === 'dual') {
  // Use football_budget, football_spent
} else {
  // Use budget, total_spent
}
```

---

## 8. API ROUTES SUMMARY

### Normal Rounds
- `POST /api/admin/rounds` - Create round
- `POST /api/admin/rounds/:id/finalize` - Finalize round
- `POST /api/auction/bids` - Place bid
- `GET /api/admin/tiebreakers` - List tiebreakers
- `POST /api/tiebreakers/:id/submit` - Submit tiebreaker bid

### Bulk Rounds
- `POST /api/admin/bulk-rounds` - Create bulk round
- `POST /api/admin/bulk-rounds/:id/start` - Start round
- `POST /api/admin/bulk-rounds/:id/finalize` - Finalize round
- `POST /api/team/bulk-rounds/:id/bids` - Place bid
- `DELETE /api/team/bulk-rounds/:id/bids` - Remove bid

### Bulk Tiebreakers
- `POST /api/admin/bulk-rounds/:id/create-tiebreaker` - Create tiebreaker
- `GET /api/admin/bulk-tiebreakers` - List tiebreakers
- `POST /api/team/bulk-tiebreakers/:id/bid` - Place bid
- `POST /api/team/bulk-tiebreakers/:id/withdraw` - Withdraw
- `POST /api/admin/bulk-tiebreakers/:id/finalize` - Finalize

---

## 9. WORKFLOW EXAMPLES

### Normal Round Complete Flow
```
1. Admin creates round (position="ST", max_bids=5)
2. Teams place encrypted bids on 5 strikers
3. Teams click "Submit"
4. Round expires
5. System decrypts bids
6. Team A bid £100 on Player X (highest)
7. Team B & C both bid £80 on Player Y (TIE!)
8. System allocates Player X to Team A
9. System creates tiebreaker for Player Y
10. Round marked 'tiebreaker_pending'
11. Team B submits £90, Team C submits £85
12. System resolves: Team B wins
13. Admin finalizes round again
14. System allocates Player Y to Team B at £90
15. Round marked 'completed'
```

### Bulk Round Complete Flow
```
1. Admin creates bulk round (base_price=£10)
2. System auto-adds 50 eligible players
3. Admin starts round
4. Team A bids on Players 1, 2, 3
5. Team B bids on Players 2, 4, 5
6. Team C bids on Players 3, 6, 7
7. Round expires
8. Admin finalizes:
   - Player 1: Only Team A → Assigned immediately
   - Player 2: Team A & B → Conflict (manual tiebreaker)
   - Player 3: Team A & C → Conflict (manual tiebreaker)
   - Player 4: Only Team B → Assigned immediately
   - Player 5: Only Team B → Assigned immediately
   - Player 6: Only Team C → Assigned immediately
   - Player 7: Only Team C → Assigned immediately
9. Admin creates bulk tiebreaker for Player 2
10. Team A bids £15, Team B bids £20, Team A withdraws
11. System auto-finalizes: Team B wins at £20
12. Admin creates bulk tiebreaker for Player 3
13. Team C bids £12, Team A withdraws
14. System auto-finalizes: Team C wins at £12
15. All tiebreakers resolved → Round marked 'completed'
```

---

## 10. KEY IMPLEMENTATION FILES

### Core Logic
- `lib/finalize-round.ts` - Normal round finalization algorithm
- `lib/tiebreaker.ts` - Normal tiebreaker creation and resolution
- `lib/finalize-bulk-tiebreaker.ts` - Bulk tiebreaker finalization
- `lib/reserve-calculator.ts` - Budget reserve calculations
- `lib/encryption.ts` - Bid encryption/decryption

### API Routes - Normal Rounds
- `app/api/admin/rounds/route.ts` - Create/list rounds
- `app/api/admin/rounds/[id]/finalize/route.ts` - Finalize round
- `app/api/auction/bids/route.ts` - Place bids
- `app/api/admin/tiebreakers/route.ts` - Manage tiebreakers

### API Routes - Bulk Rounds
- `app/api/admin/bulk-rounds/route.ts` - Create bulk rounds
- `app/api/admin/bulk-rounds/[id]/start/route.ts` - Start round
- `app/api/admin/bulk-rounds/[id]/finalize/route.ts` - Finalize bulk round
- `app/api/team/bulk-rounds/[id]/bids/route.ts` - Place/remove bids

### API Routes - Bulk Tiebreakers
- `app/api/admin/bulk-rounds/[id]/create-tiebreaker/route.ts` - Create tiebreaker
- `app/api/admin/bulk-tiebreakers/route.ts` - List tiebreakers
- `app/api/team/bulk-tiebreakers/[id]/bid/route.ts` - Place bid
- `app/api/team/bulk-tiebreakers/[id]/withdraw/route.ts` - Withdraw
- `app/api/admin/bulk-tiebreakers/[id]/finalize/route.ts` - Finalize

### Database Migrations
- `database/migrations/readable-ids-migration.sql` - ID format setup
- `database/migrations/bulk-tiebreaker-tables.sql` - Bulk tiebreaker schema

---

## 11. BUSINESS RULES SUMMARY

### Normal Rounds
1. **One player per team** - Each team gets maximum 1 player per round
2. **Encrypted bids** - Bids hidden until finalization
3. **Highest bid wins** - Unless there's a tie
4. **Tiebreakers mandatory** - Must be resolved before round completes
5. **Phase-based allocation** - Different rules for non-submitted teams

### Bulk Rounds
1. **Fixed base price** - All players same price
2. **Multiple players allowed** - Teams can get multiple players
3. **First-come allocation** - Single bidders get immediate allocation
4. **Manual tiebreaker creation** - Admin creates for conflicts
5. **Slot validation critical** - Prevents over-allocation

### Tiebreakers (Normal)
1. **No time limit** - Runs until all teams submit
2. **Recursive** - Can create new tiebreakers if tied again
3. **Higher bids required** - Must bid more than original
4. **Automatic resolution** - When all teams submit

### Bulk Tiebreakers
1. **Open bidding** - All bids visible
2. **Last person standing** - Runs until 1 team left
3. **Withdrawal allowed** - Teams can exit anytime
4. **Auto-finalize** - When only 1 team remains
5. **24-hour safety limit** - Maximum duration

---

## 12. ROUND TIMER AND AUTO-FINALIZATION SYSTEM

### Timer Mechanism

#### Round Creation with Timer
When a round is created, the system calculates the end time:

```typescript
// Normal Rounds
const now = new Date();
const endTime = new Date(now.getTime() + (duration_hours * 3600 * 1000));

// Bulk Rounds
const startTime = new Date();
const endTime = new Date(startTime.getTime() + (duration_seconds * 1000));

// Store in database (UTC)
await sql`
  INSERT INTO rounds (
    id,
    start_time,
    end_time,
    status,
    ...
  ) VALUES (
    ${roundId},
    ${startTime.toISOString()},
    ${endTime.toISOString()},
    'active',
    ...
  )
`;
```

**Key Points:**
- All times stored in UTC (PostgreSQL `TIMESTAMPTZ`)
- `start_time`: When round becomes active
- `end_time`: When round should expire
- `duration_seconds` or `duration_hours`: Original duration for reference

### Auto-Finalization Methods

The system uses **3 different methods** to detect and finalize expired rounds:

#### Method 1: Lazy Finalization (Primary)
**Trigger**: When any user accesses a round
**File**: `lib/lazy-finalize-round.ts`

```typescript
// Called in these endpoints:
// - GET /api/team/round/:id
// - GET /api/team/round/:id/status
// - GET /api/team/dashboard

export async function checkAndFinalizeExpiredRound(roundId: string) {
  // 1. Get round details
  const round = await sql`SELECT * FROM rounds WHERE id = ${roundId}`;
  
  // 2. Check if expired
  const now = new Date();
  const endTime = new Date(round.end_time);
  
  if (now <= endTime) {
    return { finalized: false }; // Not expired yet
  }
  
  // 3. Check finalization mode
  if (round.finalization_mode === 'manual') {
    // Manual mode: Mark as expired_pending_finalization
    await sql`
      UPDATE rounds 
      SET status = 'expired_pending_finalization'
      WHERE id = ${roundId}
    `;
    return { pendingManualFinalization: true };
  }
  
  // 4. Auto mode: Acquire lock
  const lockResult = await sql`
    UPDATE rounds 
    SET status = 'finalizing'
    WHERE id = ${roundId} AND status = 'active'
    RETURNING id
  `;
  
  if (lockResult.length === 0) {
    return { alreadyFinalized: true }; // Another request got it
  }
  
  // 5. Run finalization
  const result = await finalizeRound(roundId);
  
  // 6. Apply results
  if (result.success) {
    await applyFinalizationResults(roundId, result.allocations);
    return { finalized: true };
  }
  
  // 7. Handle ties
  if (result.tieDetected) {
    // Status remains 'finalizing' until tiebreaker resolved
    return { finalized: true, error: 'Tiebreaker required' };
  }
}
```

**Advantages:**
- No external dependencies
- Immediate response when users access rounds
- Works even without cron jobs

**Disadvantages:**
- Requires user activity to trigger
- May delay finalization if no one accesses the round

#### Method 2: Cron Job (Scheduled)
**Trigger**: Every 5 minutes (configurable)
**File**: `app/api/cron/finalize-rounds/route.ts`
**Configuration**: `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/finalize-rounds",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

**Process:**
```typescript
export async function GET(request: NextRequest) {
  // 1. Security check
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return { error: 'Unauthorized' };
  }
  
  // 2. Find all expired active rounds
  const expiredRounds = await sql`
    SELECT id, position, end_time
    FROM rounds
    WHERE status = 'active'
    AND end_time < NOW()
    ORDER BY end_time ASC
  `;
  
  // 3. Process each round
  for (const round of expiredRounds) {
    // Run finalization
    const result = await finalizeRound(round.id);
    
    if (result.success) {
      // Apply results
      await applyFinalizationResults(round.id, result.allocations);
    } else if (result.tieDetected) {
      // Mark as tiebreaker_pending
      await sql`
        UPDATE rounds
        SET status = 'tiebreaker_pending'
        WHERE id = ${round.id}
      `;
    }
  }
  
  return { success: true, finalized: results };
}
```

**Advantages:**
- Guaranteed execution every 5 minutes
- Works even when no users are active
- Centralized finalization logic

**Disadvantages:**
- Requires Vercel Cron or external cron service
- May have up to 5-minute delay

#### Method 3: On-Demand Check (Public Endpoint)
**Trigger**: Called from public pages (e.g., homepage)
**File**: `app/api/public/check-rounds/route.ts`

```typescript
export async function GET() {
  // Find expired active rounds
  const activeRounds = await sql`
    SELECT id FROM rounds
    WHERE status = 'active'
    AND end_time < NOW()
  `;
  
  // Check and finalize each
  const results = await Promise.all(
    activeRounds.map(round => checkAndFinalizeExpiredRound(round.id))
  );
  
  return { success: true, results };
}
```

**Usage:**
```typescript
// Called from homepage or public pages
useEffect(() => {
  fetch('/api/public/check-rounds');
}, []);
```

**Advantages:**
- Works without authentication
- Can be called from any public page
- Provides redundancy

### Finalization Modes

#### Auto Mode (Default/Legacy)
```typescript
finalization_mode: 'auto'
```

**Flow:**
```
1. Round created with end_time
2. Timer expires (end_time < NOW())
3. System detects expiration (lazy/cron/public)
4. Status: active → finalizing
5. Run finalization algorithm
6. Apply results immediately
7. Status: finalizing → completed
```

**No preview, no approval needed**

#### Manual Mode (Committee Approval)
```typescript
finalization_mode: 'manual'
```

**Flow:**
```
1. Round created with end_time
2. Timer expires (end_time < NOW())
3. System detects expiration
4. Status: active → expired_pending_finalization
5. Committee sees "Preview Results" button
6. Committee clicks "Preview Results"
7. Status: expired_pending_finalization → pending_finalization
8. System calculates allocations (preview only)
9. Committee reviews results
10. Committee clicks "Finalize for Real"
11. Apply results to database
12. Status: pending_finalization → completed

Alternative: Committee clicks "Finalize Immediately"
- Skip preview step
- Status: expired_pending_finalization → completed
```

**Allows preview and approval before applying**

### Round Status Lifecycle

```
NORMAL ROUNDS (Auto Mode):
draft → active → finalizing → completed
                      ↓
                tiebreaker_pending → (resolve) → finalizing → completed

NORMAL ROUNDS (Manual Mode):
draft → active → expired_pending_finalization → pending_finalization → completed
                                    ↓
                              tiebreaker_pending → (resolve) → pending_finalization → completed

BULK ROUNDS:
draft → active → expired → completed
                    ↓
              (conflicts) → pending_tiebreakers → (resolve all) → completed
```

### Timer Display (Frontend)

```typescript
// Calculate time remaining
const now = new Date();
const endTime = new Date(round.end_time);
const diffMs = endTime.getTime() - now.getTime();

if (diffMs <= 0) {
  return 'EXPIRED';
}

const hours = Math.floor(diffMs / (1000 * 60 * 60));
const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

return `${hours}h ${minutes}m ${seconds}s`;
```

**Real-time Updates:**
```typescript
// Update every second
useEffect(() => {
  const interval = setInterval(() => {
    setTimeRemaining(calculateTimeRemaining(round.end_time));
  }, 1000);
  
  return () => clearInterval(interval);
}, [round.end_time]);
```

### Bulk Tiebreaker Timer

Bulk tiebreakers have a **24-hour safety limit**:

```typescript
// When creating bulk tiebreaker
const startTime = new Date();
const maxEndTime = new Date(startTime.getTime() + (24 * 60 * 60 * 1000));

await sql`
  INSERT INTO bulk_tiebreakers (
    start_time,
    max_end_time,
    ...
  ) VALUES (
    ${startTime.toISOString()},
    ${maxEndTime.toISOString()},
    ...
  )
`;
```

**Auto-finalize when:**
1. Only 1 team remains active (primary trigger)
2. 24 hours elapsed (safety limit)

### Expiration Detection Query

```sql
-- Find expired active rounds
SELECT id, position, end_time
FROM rounds
WHERE status = 'active'
AND end_time < NOW()
ORDER BY end_time ASC;
```

**PostgreSQL automatically handles:**
- Timezone conversions (TIMESTAMPTZ)
- NOW() returns current UTC time
- Comparison works correctly across timezones

### Race Condition Prevention

**Problem:** Multiple requests try to finalize the same round simultaneously

**Solution:** Optimistic locking with status update

```typescript
// Try to acquire lock
const lockResult = await sql`
  UPDATE rounds 
  SET status = 'finalizing', updated_at = NOW()
  WHERE id = ${roundId} AND status = 'active'
  RETURNING id
`;

// Only one request will succeed
if (lockResult.length === 0) {
  // Another request already got it
  return { alreadyFinalized: true };
}

// This request has the lock - proceed with finalization
```

**Key Points:**
- Atomic operation (UPDATE with WHERE condition)
- Only first request changes status from 'active' to 'finalizing'
- Other requests see 0 rows updated and abort
- No explicit locks needed (database handles it)

### Notification System

When round expires and finalizes:

```typescript
// 1. Broadcast via Firebase Realtime DB
await broadcastRoundUpdate(seasonId, roundId, {
  status: 'completed',
  finalized: true,
});

// 2. Send FCM push notifications
await sendNotificationToSeason(
  {
    title: '✅ Round Finalized!',
    body: `Round ${roundNumber} results are in!`,
    url: `/dashboard/team/auction-results`,
    data: {
      type: 'round_finalized',
      roundId,
      roundNumber
    }
  },
  seasonId
);

// 3. Generate news article
await triggerNews('auction_highlights', {
  season_id: seasonId,
  round_id: roundId,
  allocations: results
});
```

### Summary

**Timer System:**
- Rounds have `end_time` (UTC timestamp)
- System checks `end_time < NOW()` to detect expiration
- No active polling - relies on lazy evaluation + cron

**Auto-Finalization:**
1. **Lazy** (primary): Triggered when users access rounds
2. **Cron** (backup): Runs every 5 minutes via Vercel Cron
3. **Public** (redundancy): Called from public pages

**Finalization Modes:**
- **Auto**: Immediate finalization (legacy)
- **Manual**: Preview + approval workflow

**Race Conditions:**
- Prevented by optimistic locking
- Status update with WHERE condition
- Only one request succeeds

---

This comprehensive auction system ensures fairness, transparency, and data integrity while providing flexibility for different auction scenarios.
