# Auction Round Balance Check System

## Overview

The auction round balance check system is a sophisticated three-phase budget management system that ensures teams maintain sufficient reserves throughout the auction process. It prevents teams from overspending early and ensures they can complete their squad building across all auction phases.

## System Architecture

### Core Components

1. **Reserve Calculator** (`lib/reserve-calculator.ts`)
   - Core calculation engine for budget reserves
   - Determines phase-based reserve requirements
   - Validates bid amounts against reserves

2. **Finalize Round** (`lib/finalize-round.ts`)
   - Applies reserve checks during round finalization
   - Handles automatic player allocation for non-participating teams
   - Adjusts allocation amounts based on team affordability

3. **Bid Routes** (API endpoints)
   - `/api/team/bids/route.ts` - Regular auction bids
   - `/api/team/bulk-tiebreakers/[id]/bid/route.ts` - Tiebreaker bids
   - Both enforce reserve requirements before accepting bids

4. **Auction Settings** (`lib/auction-settings.ts`)
   - Stores phase configuration
   - Defines round boundaries and minimum balances

---

## Three-Phase System

### Phase 1: Strict Reserve (Rounds 1-18)
**Enforcement Level:** STRICT - Hard limit enforced

**Purpose:** Ensure teams can participate in ALL future rounds and reach minimum squad size

**Reserve Calculation:**
```
Total Reserve = Phase 1 Remaining + Phase 2 Full + Phase 3 Slots

Phase 1 Reserve = (Phase 1 End Round - Current Round) × £30
Phase 2 Reserve = (Phase 2 End Round - Phase 1 End Round) × £30
Phase 3 Reserve = (Min Squad Size - Players After Phase 2) × £10

Maximum Bid = Team Balance - Total Reserve
```

**Important:** Reserve calculation uses **minimum squad size** to ensure teams can complete their mandatory squad.

**Example (Round 5, 3 players owned, 25 min / 30 max squad):**
```
Phase 1 Remaining: (18 - 5) = 13 rounds × £30 = £390
Phase 2 Full: (20 - 18) = 2 rounds × £30 = £60
Players after Phase 2: 3 + 1 + 13 + 2 = 19 players
Phase 3 Slots to Min: 25 - 19 = 6 slots × £10 = £60

Total Reserve: £390 + £60 + £60 = £510

If balance = £1000, Max Bid = £1000 - £510 = £490
```

**Note:** Teams can acquire up to 30 players (max squad size) but reserves are calculated based on 25 players (min squad size).

**Characteristics:**
- Cannot skip rounds
- Must maintain full reserve for all future phases
- Reserve based on minimum squad size (mandatory)
- Bid rejection if reserve violated
- Minimum £30 to participate

---

### Phase 2: Soft Reserve with Floor (Rounds 19-20)
**Enforcement Level:** SOFT - Floor enforced, recommendations provided

**Purpose:** Allow flexibility while protecting Phase 3 participation to reach minimum squad size

**Reserve Calculation:**
```
Floor Reserve (Enforced) = Phase 3 Slots After This Round × £10
Recommended Reserve = Phase 2 Remaining + Phase 3 Slots After Phase 2

Floor Calculation (Worst Case - Skip Remaining Phase 2):
  Players After This Round = Current Squad + 1
  Slots to Min Squad = Min Squad Size - Players After This Round
  Floor = Slots × £10

Recommended Calculation (Complete Phase 2):
  Phase 2 Reserve = (Phase 2 End - Current Round) × £30
  Players After Phase 2 = Current Squad + Phase 2 Remaining + 1
  Slots to Min Squad = Min Squad Size - Players After Phase 2
  Phase 3 Reserve = Slots × £10
  Recommended = Phase 2 Reserve + Phase 3 Reserve

Maximum Bid (Hard Limit) = Balance - Floor Reserve
Maximum Recommended Bid = Balance - Recommended Reserve
```

**Important:** Floor and recommended reserves use **minimum squad size** to ensure mandatory squad completion.

**Example (Round 19, 18 players owned, 25 min / 30 max squad):**
```
Floor (if skip Round 20):
  Players after this round: 18 + 1 = 19
  Slots to min squad: 25 - 19 = 6
  Floor Reserve: 6 × £10 = £60

Recommended (complete Phase 2):
  Phase 2 remaining: (20 - 19) = 1 round × £30 = £30
  Players after Phase 2: 18 + 1 + 1 = 20
  Slots to min squad: 25 - 20 = 5
  Phase 3 Reserve: 5 × £10 = £50
  Recommended Reserve: £30 + £50 = £80

If balance = £500:
  Max Bid (Hard): £500 - £60 = £440
  Max Recommended: £500 - £80 = £420
  
Bid £430: ✅ Allowed (above floor) but ⚠️ Warning (exceeds recommended)
Bid £450: ❌ Rejected (violates floor)
```

**Note:** Once minimum squad size (25) is reached, teams can optionally acquire up to 5 more players (max 30) without reserve restrictions.

**Characteristics:**
- Can skip rounds (if balance < £30)
- Floor enforced (must maintain Phase 3 minimum to reach min squad)
- Warnings for bids exceeding recommended limit
- Minimum £30 to participate
- After reaching min squad size, no reserves needed for optional players

---

### Phase 3: Flexible Floor (Rounds 21-25)
**Enforcement Level:** MINIMAL - Only minimum bid enforced (until min squad reached)

**Purpose:** Final phase flexibility to complete minimum squad and optionally expand to max squad

**Reserve Calculation:**
```
If Current Squad < Min Squad Size:
  Slots to Min = Min Squad Size - Current Squad
  Reserve = Slots to Min × £10
  Floor Reserve = Reserve
  Maximum Bid = Balance - Reserve

If Current Squad >= Min Squad Size:
  Reserve = £0 (minimum squad complete)
  Floor Reserve = £0
  Maximum Bid = Full Team Balance
  
Minimum Bid = £10
```

**Example 1 (Round 23, 22 players owned, 25 min / 30 max squad):**
```
Current squad (22) < Min squad (25)
Slots to min: 25 - 22 = 3
Reserve: 3 × £10 = £30

If balance = £200:
  Max Bid = £200 - £30 = £170
```

**Example 2 (Round 24, 25 players owned, 25 min / 30 max squad):**
```
Current squad (25) >= Min squad (25)
Reserve: £0 (minimum complete, can acquire optional players)

If balance = £150:
  Max Bid = £150 (can spend entire balance on optional players)
```

**Characteristics:**
- Can skip rounds (if balance < £10)
- Reserve enforced ONLY until minimum squad size reached
- After reaching min squad, no reserves needed
- Teams can acquire up to max squad size (30) without restrictions
- Only minimum £10 bid enforced
- Teams can spend entire remaining balance once min squad is complete

---

## Configuration

### Auction Settings Table Schema
```sql
CREATE TABLE auction_settings (
  id SERIAL PRIMARY KEY,
  season_id VARCHAR(50) NOT NULL,
  auction_window VARCHAR(50) DEFAULT 'season_start',
  
  -- Phase boundaries
  phase_1_end_round INTEGER DEFAULT 18,
  phase_2_end_round INTEGER DEFAULT 20,
  
  -- Minimum balances per phase
  phase_1_min_balance INTEGER DEFAULT 30,
  phase_2_min_balance INTEGER DEFAULT 30,
  phase_3_min_balance INTEGER DEFAULT 10,
  
  -- Squad limits (NEW: min/max system)
  min_squad_size INTEGER DEFAULT 25,  -- Mandatory minimum
  max_squad_size INTEGER DEFAULT 30,  -- Optional maximum
  max_rounds INTEGER DEFAULT 25,
  
  -- Other settings
  contract_duration INTEGER DEFAULT 2,
  min_balance_per_round INTEGER DEFAULT 30,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Default Configuration
```typescript
{
  phase_1_end_round: 18,      // Rounds 1-18
  phase_1_min_balance: 30,    // £30 per round
  phase_2_end_round: 20,      // Rounds 19-20
  phase_2_min_balance: 30,    // £30 per round
  phase_3_min_balance: 10,    // £10 per slot
  min_squad_size: 25,         // Minimum squad size (mandatory)
  max_squad_size: 30          // Maximum squad size (optional)
}
```

**Key Changes:**
- `min_squad_size`: Mandatory minimum players (used for reserve calculations)
- `max_squad_size`: Optional maximum players (teams can acquire up to this limit)
- Reserve calculations use `min_squad_size` to ensure mandatory squad completion
- After reaching `min_squad_size`, teams can acquire additional players up to `max_squad_size` without reserve restrictions

---

## Implementation Details

### 1. Reserve Calculator Core Function

**Location:** `lib/reserve-calculator.ts`

**Function:** `calculateReserveCore()`

**Inputs:**
- `currentRoundNumber` - Current auction round (1-25)
- `teamBalance` - Team's available budget
- `teamSquadSize` - Current number of players owned
- `config` - Phase configuration (ReserveConfig)

**Outputs:**
```typescript
interface ReserveInfo {
  reserve: number;                 // Recommended reserve
  floorReserve: number;            // Minimum enforced reserve
  maxBid: number;                  // Hard limit (balance - floor)
  maxRecommendedBid: number;       // Soft limit (balance - reserve)
  phase: 'phase_1' | 'phase_2' | 'phase_3';
  enforceStrict: boolean;          // Whether to strictly enforce
  allowSkip: boolean;              // Can team skip this round
  minimumToParticipate: number;    // Minimum balance needed
  calculation: string;             // Human-readable explanation
  breakdown: {
    phase1Reserve?: number;
    phase2Reserve?: number;
    phase3Reserve?: number;
  };
}
```

**Phase Detection Logic:**
```typescript
if (currentRoundNumber <= config.phase_1_end_round) {
  phase = 'phase_1';
} else if (currentRoundNumber <= config.phase_2_end_round) {
  phase = 'phase_2';
} else {
  phase = 'phase_3';
}
```

---

### 2. Bid Validation Flow

**Location:** `app/api/team/bids/route.ts`

**Validation Steps:**

1. **Basic Validation**
   ```typescript
   if (amount < 10) {
     return error('Minimum bid is £10');
   }
   ```

2. **Balance Check**
   ```typescript
   if (amount > teamBalance) {
     return error('Insufficient team balance');
   }
   ```

3. **Reserve Check**
   ```typescript
   const reserve = await calculateReserve(teamId, roundId, seasonId);
   
   // Phase 1: Strict enforcement
   if (reserve.requiresReserve) {
     const availableForBid = teamBalance - reserve.minimumReserve;
     if (amount > availableForBid) {
       return error(`Must maintain £${reserve.minimumReserve} reserve`);
     }
   }
   
   // Phase 2: Floor enforcement
   if (reserve.phase === 'phase_2' && reserve.minimumReserve > 0) {
     const availableForBid = teamBalance - reserve.minimumReserve;
     if (amount > availableForBid) {
       return error(`Must maintain £${reserve.minimumReserve} for Phase 3`);
     }
   }
   ```

4. **Bid Placement**
   ```typescript
   // Encrypt bid data for blind bidding
   const encryptedBidData = encryptBidData({
     player_id,
     amount
   });
   
   // Store in database
   await sql`INSERT INTO bids (...)`;
   ```

---

### 3. Round Finalization with Balance Checks

**Location:** `lib/finalize-round.ts`

**Process:**

1. **Determine Current Phase**
   ```typescript
   const settings = await sql`
     SELECT phase_1_end_round, phase_2_end_round, ...
     FROM auction_settings WHERE season_id = ${seasonId}
   `;
   
   let currentPhase: 'phase_1' | 'phase_2' | 'phase_3';
   if (roundNumber <= settings.phase_1_end_round) {
     currentPhase = 'phase_1';
   } else if (roundNumber <= settings.phase_2_end_round) {
     currentPhase = 'phase_2';
   } else {
     currentPhase = 'phase_3';
   }
   ```

2. **Handle Non-Submitted Teams**
   ```typescript
   // Phase 2: Teams can skip
   if (currentPhase === 'phase_2') {
     console.log('Phase 2: Non-submitted teams can skip');
     // No forced allocation
   }
   
   // Phase 1 & 3: Force allocation
   else {
     for (const teamId of nonSubmittedTeams) {
       // Calculate allocation amount
       let allocationAmount = currentPhase === 'phase_1' 
         ? avgAmount 
         : minAllocation;
       
       // Check if team can afford
       const reserveInfo = calculateReserveCore(...);
       const maxAffordable = teamBalance - reserveInfo.floorReserve;
       
       if (maxAffordable >= minAllocation) {
         // Adjust if needed
         if (allocationAmount > maxAffordable) {
           allocationAmount = maxAffordable;
         }
         // Allocate player
       }
     }
   }
   ```

3. **Team-Specific Slot Limits**
   ```typescript
   // Fetch team-specific max squad size
   const teamSlotResult = await sql`
     SELECT football_total_slots
     FROM teams
     WHERE id = ${teamId} AND season_id = ${seasonId}
   `;
   
   const maxSquadSize = teamSlotResult[0]?.football_total_slots || 25;
   ```

---

## API Endpoints

### 1. Place Regular Bid
**Endpoint:** `POST /api/team/bids`

**Request:**
```json
{
  "player_id": "FP001",
  "round_id": "R001",
  "amount": 150
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Bid placed successfully",
  "bid": {
    "id": "TEAM001_R001_FP001",
    "team_id": "TEAM001",
    "round_id": "R001",
    "status": "active"
  }
}
```

**Response (Reserve Violation):**
```json
{
  "success": false,
  "error": "Bid exceeds reserve. You must maintain £510 for future rounds (Phase 1: 13×£30 + Phase 2: 2×£30 + Phase 3: 6×£10 = £510). Maximum safe bid: £490"
}
```

---

### 2. Place Tiebreaker Bid
**Endpoint:** `POST /api/team/bulk-tiebreakers/:id/bid`

**Request:**
```json
{
  "bid_amount": 200
}
```

**Validation:**
- Same reserve checks as regular bids
- Additional tiebreaker-specific validations
- Must be higher than current highest bid

---

### 3. Get Auction Settings
**Endpoint:** `GET /api/auction-settings?season_id=S001`

**Response:**
```json
{
  "success": true,
  "data": {
    "settings": {
      "phase_1_end_round": 18,
      "phase_1_min_balance": 30,
      "phase_2_end_round": 20,
      "phase_2_min_balance": 30,
      "phase_3_min_balance": 10,
      "max_squad_size": 25,
      "max_rounds": 25
    },
    "stats": {
      "total_rounds": 10,
      "completed_rounds": 5,
      "remaining_rounds": 15
    }
  }
}
```

---

### 4. Update Auction Settings
**Endpoint:** `POST /api/auction-settings`

**Request:**
```json
{
  "season_id": "S001",
  "auction_window": "season_start",
  "phase_1_end_round": 18,
  "phase_1_min_balance": 30,
  "phase_2_end_round": 20,
  "phase_2_min_balance": 30,
  "phase_3_min_balance": 10,
  "max_squad_size": 25,
  "max_rounds": 25
}
```

---

## Usage Examples

### Example 1: Phase 1 Bid Validation

**Scenario:**
- Round 5 (Phase 1)
- Team balance: £1000
- Current squad: 3 players
- Min squad: 25 players
- Max squad: 30 players

**Calculation:**
```typescript
const reserve = calculateReserveCore(5, 1000, 3, {
  phase_1_end_round: 18,
  phase_1_min_balance: 30,
  phase_2_end_round: 20,
  phase_2_min_balance: 30,
  phase_3_min_balance: 10,
  min_squad_size: 25,
  max_squad_size: 30
});

// Result:
{
  reserve: 510,
  floorReserve: 510,
  maxBid: 490,
  maxRecommendedBid: 490,
  phase: 'phase_1',
  enforceStrict: true,
  allowSkip: false,
  minimumToParticipate: 30,
  calculation: "Phase 1: 13×£30 + Phase 2: 2×£30 + Phase 3: 6×£10 = £510 (to reach min squad 25)"
}
```

**Bid Outcomes:**
- Bid £400: ✅ Accepted
- Bid £490: ✅ Accepted (at limit)
- Bid £500: ❌ Rejected (exceeds reserve)

**Note:** Reserve calculated to ensure team reaches minimum 25 players. Team can optionally acquire up to 30 players later.

---

### Example 2: Phase 2 Bid with Warning

**Scenario:**
- Round 19 (Phase 2)
- Team balance: £500
- Current squad: 18 players
- Min squad: 25 players
- Max squad: 30 players

**Calculation:**
```typescript
const reserve = calculateReserveCore(19, 500, 18, config);

// Result:
{
  reserve: 80,           // Recommended (complete Phase 2)
  floorReserve: 60,      // Floor (skip remaining Phase 2)
  maxBid: 440,           // Hard limit
  maxRecommendedBid: 420, // Soft limit
  phase: 'phase_2',
  enforceStrict: false,
  allowSkip: true,
  minimumToParticipate: 30
}
```

**Bid Outcomes:**
- Bid £400: ✅ Accepted (within recommended)
- Bid £430: ✅ Accepted with ⚠️ Warning (exceeds recommended but within floor)
- Bid £450: ❌ Rejected (violates floor reserve)

**Note:** Floor ensures team can reach minimum 25 players even if they skip Round 20.

---

### Example 3: Phase 3 Flexibility

**Scenario A: Below Minimum Squad**
- Round 23 (Phase 3)
- Team balance: £200
- Current squad: 22 players
- Min squad: 25 players
- Max squad: 30 players

**Calculation:**
```typescript
const reserve = calculateReserveCore(23, 200, 22, config);

// Result:
{
  reserve: 30,           // Need 3 more players to reach min
  floorReserve: 30,
  maxBid: 170,           // Must maintain reserve
  maxRecommendedBid: 170,
  phase: 'phase_3',
  enforceStrict: true,   // Enforce until min squad reached
  allowSkip: true,
  minimumToParticipate: 10,
  calculation: "Phase 3: 3 slots to min squad × £10 = £30"
}
```

**Bid Outcomes:**
- Bid £170: ✅ Accepted (at limit)
- Bid £180: ❌ Rejected (violates reserve to reach min squad)

---

**Scenario B: Minimum Squad Reached**
- Round 24 (Phase 3)
- Team balance: £150
- Current squad: 25 players (min reached)
- Min squad: 25 players
- Max squad: 30 players

**Calculation:**
```typescript
const reserve = calculateReserveCore(24, 150, 25, config);

// Result:
{
  reserve: 0,            // Min squad complete
  floorReserve: 0,
  maxBid: 150,           // Can spend entire balance
  maxRecommendedBid: 150,
  phase: 'phase_3',
  enforceStrict: false,  // No enforcement needed
  allowSkip: true,
  minimumToParticipate: 10,
  calculation: "Phase 3: Min squad reached (25), no reserve needed. Can acquire up to 30 players."
}
```

**Bid Outcomes:**
- Bid £150: ✅ Accepted (can spend entire balance on optional players)
- Bid £10: ✅ Accepted (minimum)
- Bid £5: ❌ Rejected (below minimum)

**Note:** Once minimum squad (25) is reached, teams can freely acquire up to 5 more optional players (max 30) without reserve restrictions.

---

## Error Messages

### Phase 1 Errors
```
"Bid exceeds reserve. You must maintain £510 for future rounds 
(Phase 1: 13×£30 + Phase 2: 2×£30 + Phase 3: 6×£10 = £510 to reach min squad 25). 
Maximum safe bid: £490"
```

### Phase 2 Errors
```
"Bid violates Phase 3 floor reserve. Maximum allowed: £440 
(must maintain £60 for remaining slots to reach min squad 25)"
```

### Phase 2 Warnings
```
"⚠️ Bid exceeds recommended limit (£420). You may not have 
enough for upcoming Phase 2 rounds to reach minimum squad size."
```

### Phase 3 Errors (Below Min Squad)
```
"Bid exceeds reserve. You must maintain £30 to reach minimum squad size (25). 
Maximum allowed: £170"
```

### Phase 3 Errors (Min Squad Reached)
```
"Minimum bid in Phase 3 is £10"
```

---

## Database Schema

### Teams Table (Balance Storage)
```sql
CREATE TABLE teams (
  id VARCHAR(50) PRIMARY KEY,
  season_id VARCHAR(50),
  football_budget INTEGER DEFAULT 1000,
  football_spent INTEGER DEFAULT 0,
  football_players_count INTEGER DEFAULT 0,
  football_min_slots INTEGER DEFAULT 25,    -- Minimum squad size (mandatory)
  football_max_slots INTEGER DEFAULT 30,    -- Maximum squad size (optional)
  ...
);
```

**Note:** Each team can have different min/max squad sizes configured per season.

### Rounds Table
```sql
CREATE TABLE rounds (
  id VARCHAR(50) PRIMARY KEY,
  season_id VARCHAR(50),
  round_number INTEGER,
  position VARCHAR(50),
  status VARCHAR(50),
  auction_settings_id INTEGER REFERENCES auction_settings(id),
  ...
);
```

### Bids Table
```sql
CREATE TABLE bids (
  id VARCHAR(100) PRIMARY KEY,
  team_id VARCHAR(50),
  player_id VARCHAR(50),
  round_id VARCHAR(50),
  amount INTEGER,  -- NULL until finalization (blind bidding)
  encrypted_bid_data TEXT,  -- Encrypted bid details
  status VARCHAR(50),
  ...
);
```

---

## Key Features

### 1. Team-Specific Slot Limits
Each team can have different min/max squad sizes:
```typescript
const teamSlotResult = await sql`
  SELECT football_min_slots, football_max_slots
  FROM teams
  WHERE id = ${teamId} AND season_id = ${seasonId}
`;
const minSquadSize = teamSlotResult[0]?.football_min_slots || 25;
const maxSquadSize = teamSlotResult[0]?.football_max_slots || 30;
```

**Reserve Calculation Logic:**
- Reserves are calculated based on `min_squad_size` (mandatory)
- Once `min_squad_size` is reached, no reserves needed for additional players
- Teams can acquire up to `max_squad_size` without restrictions after reaching minimum

### 2. Blind Bidding
Bid amounts are encrypted until round finalization:
```typescript
const encryptedBidData = encryptBidData({
  player_id,
  amount
});
// Amount column stays NULL until finalization
```

### 3. Automatic Allocation
Non-participating teams get automatic allocations with affordability checks:
```typescript
const maxAffordable = teamBalance - reserveInfo.floorReserve;
if (allocationAmount > maxAffordable) {
  allocationAmount = maxAffordable;
}
```

### 4. Phase-Based Skipping
- Phase 1: Cannot skip (strict participation to reach min squad)
- Phase 2: Can skip if balance < £30 (floor ensures min squad reachable)
- Phase 3: Can skip if balance < £10 (until min squad reached)
- Phase 3 (after min squad): Can skip freely, optional players only

---

## Testing Scenarios

### Test Case 1: Phase 1 Reserve Enforcement
```typescript
// Setup
const teamBalance = 1000;
const currentRound = 5;
const squadSize = 3;
const minSquad = 25;
const maxSquad = 30;

// Expected
const reserve = 510;  // Based on min squad (25)
const maxBid = 490;

// Test
const result = calculateReserveCore(5, 1000, 3, {
  ...config,
  min_squad_size: 25,
  max_squad_size: 30
});
assert(result.maxBid === 490);
assert(result.enforceStrict === true);
assert(result.calculation.includes('to reach min squad 25'));
```

### Test Case 2: Phase 2 Floor vs Recommended
```typescript
// Setup
const teamBalance = 500;
const currentRound = 19;
const squadSize = 18;
const minSquad = 25;
const maxSquad = 30;

// Expected
const floorReserve = 60;  // To reach min squad if skip Round 20
const recommendedReserve = 80;

// Test
const result = calculateReserveCore(19, 500, 18, {
  ...config,
  min_squad_size: 25,
  max_squad_size: 30
});
assert(result.floorReserve === 60);
assert(result.reserve === 80);
assert(result.maxBid === 440);
assert(result.maxRecommendedBid === 420);
```

### Test Case 3: Phase 3 No Reserve (Min Squad Reached)
```typescript
// Setup
const teamBalance = 200;
const currentRound = 23;
const squadSize = 25;  // Min squad reached
const minSquad = 25;
const maxSquad = 30;

// Expected
const reserve = 0;  // Min squad complete
const maxBid = 200;

// Test
const result = calculateReserveCore(23, 200, 25, {
  ...config,
  min_squad_size: 25,
  max_squad_size: 30
});
assert(result.reserve === 0);
assert(result.maxBid === 200);
assert(result.allowSkip === true);
assert(result.enforceStrict === false);
assert(result.calculation.includes('Min squad reached'));
```

### Test Case 4: Phase 3 With Reserve (Below Min Squad)
```typescript
// Setup
const teamBalance = 200;
const currentRound = 23;
const squadSize = 22;  // Below min squad
const minSquad = 25;
const maxSquad = 30;

// Expected
const reserve = 30;  // Need 3 more players
const maxBid = 170;

// Test
const result = calculateReserveCore(23, 200, 22, {
  ...config,
  min_squad_size: 25,
  max_squad_size: 30
});
assert(result.reserve === 30);
assert(result.maxBid === 170);
assert(result.enforceStrict === true);
assert(result.calculation.includes('3 slots to min squad'));
```

---

## Best Practices

### 1. Always Check Reserves Before Bidding
```typescript
const reserve = await calculateReserve(teamId, roundId, seasonId);
if (bidAmount > reserve.maxBid) {
  showError(reserve.calculation);
}
```

### 2. Display Reserve Information to Users
```typescript
// Show in UI
Reserve Required: £510
Available for Bid: £490
Phase: Phase 1 (Strict)
Squad Progress: 3/25 (min) - 3/30 (max)
Explanation: "13 rounds × £30 + 2 rounds × £30 + 6 slots × £10 (to reach min squad 25)"
```

### 3. Handle Phase Transitions
```typescript
if (reserve.phase === 'phase_2' && bidAmount > reserve.maxRecommendedBid) {
  showWarning('Bid exceeds recommended limit');
}
```

### 4. Validate on Both Frontend and Backend
- Frontend: Prevent invalid bids (UX)
- Backend: Enforce rules (security)

---

## Troubleshooting

### Issue: "Reserve calculation unavailable"
**Cause:** Missing auction settings for season
**Solution:** Create auction settings via POST /api/auction-settings

### Issue: Bid rejected despite sufficient balance
**Cause:** Reserve requirement not met
**Solution:** Check reserve calculation and adjust bid amount

### Issue: Different min/max squad sizes per team
**Cause:** Team-specific slot limits
**Solution:** Ensure `football_min_slots` and `football_max_slots` are set in teams table

### Issue: Reserve still enforced after reaching 25 players
**Cause:** System checking against max squad instead of min squad
**Solution:** Verify reserve calculation uses `min_squad_size` not `max_squad_size`

---

---

## Implementation Requirements for New Website

### 1. Super Admin Season Creation

**Requirement:** Add min/max squad size configuration when creating a season

**UI Fields Needed:**
```typescript
interface SeasonCreationForm {
  season_id: string;
  season_name: string;
  // ... other fields
  
  // NEW: Squad size configuration
  min_squad_size: number;  // Default: 25
  max_squad_size: number;  // Default: 30
  
  // Auction settings
  phase_1_end_round: number;
  phase_1_min_balance: number;
  phase_2_end_round: number;
  phase_2_min_balance: number;
  phase_3_min_balance: number;
}
```

**Validation Rules:**
- `min_squad_size` must be > 0
- `max_squad_size` must be >= `min_squad_size`
- Recommended: `max_squad_size` should be at least 5 more than `min_squad_size`
- Both values should be stored in `auction_settings` table

**Database Update:**
```sql
-- When season is created, insert into auction_settings
INSERT INTO auction_settings (
  season_id,
  auction_window,
  min_squad_size,
  max_squad_size,
  phase_1_end_round,
  phase_1_min_balance,
  phase_2_end_round,
  phase_2_min_balance,
  phase_3_min_balance,
  max_rounds
) VALUES (
  'S001',
  'season_start',
  25,  -- min_squad_size
  30,  -- max_squad_size
  18,
  30,
  20,
  30,
  10,
  25
);
```

---

### 2. Bulk Round Page Validations

**Requirement:** Enforce min/max squad size limits when teams submit bids in bulk rounds

#### 2.1 Minimum Squad Size Validation

**Rule:** Teams MUST select exactly `min_squad_size` number of players if they haven't reached minimum yet

**Implementation:**
```typescript
// Frontend validation (bulk round submission page)
async function validateBulkRoundSubmission(
  teamId: string,
  selectedPlayers: string[],
  seasonId: string
) {
  // Get team's current squad size
  const teamData = await getTeamSeasonData(teamId, seasonId);
  const currentSquadSize = teamData.players_count || 0;
  
  // Get season's min/max squad settings
  const auctionSettings = await getAuctionSettings(seasonId);
  const minSquad = auctionSettings.min_squad_size;
  const maxSquad = auctionSettings.max_squad_size;
  
  // Calculate how many players team needs
  const slotsToMin = Math.max(0, minSquad - currentSquadSize);
  const slotsToMax = Math.max(0, maxSquad - currentSquadSize);
  
  // VALIDATION 1: If below min squad, must select exactly slotsToMin
  if (currentSquadSize < minSquad) {
    if (selectedPlayers.length !== slotsToMin) {
      return {
        valid: false,
        error: `You must select exactly ${slotsToMin} players to reach minimum squad size (${minSquad}). Currently: ${currentSquadSize}/${minSquad}`
      };
    }
  }
  
  // VALIDATION 2: If at or above min squad, can select 0 to slotsToMax
  else {
    if (selectedPlayers.length > slotsToMax) {
      return {
        valid: false,
        error: `You can select maximum ${slotsToMax} players. Your squad: ${currentSquadSize}/${maxSquad}`
      };
    }
    // Allow 0 selections (team can skip if they've reached min squad)
  }
  
  // VALIDATION 3: Cannot exceed max squad size
  if (currentSquadSize + selectedPlayers.length > maxSquad) {
    return {
      valid: false,
      error: `Selection would exceed maximum squad size (${maxSquad}). Current: ${currentSquadSize}, Selected: ${selectedPlayers.length}`
    };
  }
  
  return { valid: true };
}
```

**UI Display:**
```typescript
// Show squad status in bulk round page
<div className="squad-status">
  <h3>Squad Status</h3>
  <p>Current Squad: {currentSquadSize}/{maxSquad}</p>
  <p>Minimum Required: {minSquad}</p>
  
  {currentSquadSize < minSquad ? (
    <div className="alert alert-warning">
      ⚠️ You must select exactly {slotsToMin} players to reach minimum squad size
    </div>
  ) : (
    <div className="alert alert-info">
      ✅ Minimum squad reached. You can select 0-{slotsToMax} players (optional)
    </div>
  )}
  
  <p>Selected: {selectedPlayers.length}</p>
</div>
```

#### 2.2 Backend Validation (API Route)

**Location:** `app/api/team/bulk-rounds/[id]/bids/route.ts`

```typescript
export async function POST(request: NextRequest) {
  // ... existing auth code
  
  const { player_bids } = await request.json();
  
  // Get team's current squad size
  const teamSeasonDoc = await adminDb
    .collection('team_seasons')
    .doc(`${teamId}_${seasonId}`)
    .get();
  
  const currentSquadSize = teamSeasonDoc.data()?.players_count || 0;
  
  // Get auction settings
  const settingsResult = await sql`
    SELECT min_squad_size, max_squad_size
    FROM auction_settings
    WHERE season_id = ${seasonId}
  `;
  
  const minSquad = settingsResult[0]?.min_squad_size || 25;
  const maxSquad = settingsResult[0]?.max_squad_size || 30;
  
  // VALIDATION: Check min/max squad constraints
  const slotsToMin = Math.max(0, minSquad - currentSquadSize);
  const slotsToMax = Math.max(0, maxSquad - currentSquadSize);
  
  if (currentSquadSize < minSquad) {
    // Must select exactly slotsToMin
    if (player_bids.length !== slotsToMin) {
      return NextResponse.json(
        { 
          success: false, 
          error: `You must select exactly ${slotsToMin} players to reach minimum squad size (${minSquad})` 
        },
        { status: 400 }
      );
    }
  } else {
    // Can select 0 to slotsToMax
    if (player_bids.length > slotsToMax) {
      return NextResponse.json(
        { 
          success: false, 
          error: `You can select maximum ${slotsToMax} players. Your squad: ${currentSquadSize}/${maxSquad}` 
        },
        { status: 400 }
      );
    }
  }
  
  // Check if would exceed max squad
  if (currentSquadSize + player_bids.length > maxSquad) {
    return NextResponse.json(
      { 
        success: false, 
        error: `Selection would exceed maximum squad size (${maxSquad})` 
        },
      { status: 400 }
    );
  }
  
  // ... continue with bid processing
}
```

---

### 3. Bulk Tiebreaker Balance Check

**Requirement:** Enforce balance checks in bulk tiebreaker rounds to prevent overbidding

**Current Issue:** Tiebreaker bids may not properly check reserves

**Solution:** Add comprehensive balance and reserve checks

#### 3.1 Enhanced Tiebreaker Bid Validation

**Location:** `app/api/team/bulk-tiebreakers/[id]/bid/route.ts`

**Add these validations:**

```typescript
export async function POST(request: NextRequest) {
  // ... existing auth and tiebreaker checks
  
  const { bid_amount } = await request.json();
  
  // VALIDATION 1: Get team balance from Neon
  const balanceData = await sql`
    SELECT football_budget, football_players_count
    FROM teams
    WHERE id = ${teamId} AND season_id = ${seasonId}
  `;
  
  if (balanceData.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Team not found' },
      { status: 404 }
    );
  }
  
  const teamBalance = parseInt(balanceData[0].football_budget) || 0;
  const currentSquadSize = parseInt(balanceData[0].football_players_count) || 0;
  
  // VALIDATION 2: Basic balance check
  if (bid_amount > teamBalance) {
    return NextResponse.json(
      { 
        success: false, 
        error: `Insufficient balance. Bid: £${bid_amount}, Available: £${teamBalance}` 
      },
      { status: 400 }
    );
  }
  
  // VALIDATION 3: Get auction settings for reserve calculation
  const settingsResult = await sql`
    SELECT min_squad_size, max_squad_size,
           phase_1_end_round, phase_1_min_balance,
           phase_2_end_round, phase_2_min_balance,
           phase_3_min_balance
    FROM auction_settings
    WHERE season_id = ${seasonId}
  `;
  
  if (settingsResult.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Auction settings not found' },
      { status: 400 }
    );
  }
  
  const settings = settingsResult[0];
  
  // VALIDATION 4: Get bulk round details to determine current round number
  const bulkRoundResult = await sql`
    SELECT round_number
    FROM rounds
    WHERE id = ${tiebreaker.bulk_round_id}
  `;
  
  const currentRoundNumber = bulkRoundResult[0]?.round_number || 1;
  
  // VALIDATION 5: Calculate reserve requirement
  const reserveConfig = {
    phase_1_end_round: settings.phase_1_end_round,
    phase_1_min_balance: settings.phase_1_min_balance,
    phase_2_end_round: settings.phase_2_end_round,
    phase_2_min_balance: settings.phase_2_min_balance,
    phase_3_min_balance: settings.phase_3_min_balance,
    min_squad_size: settings.min_squad_size,
    max_squad_size: settings.max_squad_size,
  };
  
  const reserveInfo = calculateReserveCore(
    currentRoundNumber,
    teamBalance,
    currentSquadSize,
    reserveConfig
  );
  
  // VALIDATION 6: Check if bid violates reserve
  if (reserveInfo.enforceStrict && bid_amount > reserveInfo.maxBid) {
    return NextResponse.json(
      {
        success: false,
        error: `Bid exceeds maximum allowed (£${reserveInfo.maxBid}). ${reserveInfo.calculation}`,
        reserve_info: {
          required_reserve: reserveInfo.floorReserve,
          max_bid: reserveInfo.maxBid,
          explanation: reserveInfo.calculation
        }
      },
      { status: 400 }
    );
  }
  
  // VALIDATION 7: Phase 2 floor check
  if (reserveInfo.phase === 'phase_2' && reserveInfo.floorReserve > 0) {
    const maxAllowedBid = teamBalance - reserveInfo.floorReserve;
    
    if (bid_amount > maxAllowedBid) {
      return NextResponse.json(
        {
          success: false,
          error: `Bid violates Phase 3 floor reserve. Maximum allowed: £${maxAllowedBid} (must maintain £${reserveInfo.floorReserve} for remaining slots to reach min squad)`,
          reserve_info: {
            floor_reserve: reserveInfo.floorReserve,
            max_bid: maxAllowedBid,
            explanation: reserveInfo.calculation
          }
        },
        { status: 400 }
      );
    }
  }
  
  // VALIDATION 8: Minimum bid check
  if (bid_amount < 10) {
    return NextResponse.json(
      { success: false, error: 'Minimum bid is £10' },
      { status: 400 }
    );
  }
  
  // ALL VALIDATIONS PASSED - Place bid
  // ... continue with existing bid placement logic
}
```

#### 3.2 Frontend Tiebreaker Bid Form

**Display reserve information to users:**

```typescript
// Tiebreaker bid page component
function TiebreakerBidForm({ tiebreakerId, teamId, seasonId }) {
  const [bidAmount, setBidAmount] = useState(0);
  const [reserveInfo, setReserveInfo] = useState(null);
  
  // Fetch reserve info on mount
  useEffect(() => {
    async function fetchReserveInfo() {
      const response = await fetch(
        `/api/team/reserve-info?team_id=${teamId}&season_id=${seasonId}&tiebreaker_id=${tiebreakerId}`
      );
      const data = await response.json();
      setReserveInfo(data);
    }
    fetchReserveInfo();
  }, [teamId, seasonId, tiebreakerId]);
  
  return (
    <div className="tiebreaker-bid-form">
      <h3>Place Your Bid</h3>
      
      {reserveInfo && (
        <div className="reserve-info">
          <h4>Budget Information</h4>
          <p>Available Balance: £{reserveInfo.balance}</p>
          <p>Required Reserve: £{reserveInfo.reserve}</p>
          <p>Maximum Bid: £{reserveInfo.maxBid}</p>
          <p className="text-sm text-gray-600">{reserveInfo.explanation}</p>
          
          {reserveInfo.phase === 'phase_2' && (
            <div className="alert alert-warning">
              ⚠️ Phase 2: Recommended max bid is £{reserveInfo.maxRecommendedBid}
            </div>
          )}
        </div>
      )}
      
      <input
        type="number"
        value={bidAmount}
        onChange={(e) => setBidAmount(Number(e.target.value))}
        min={10}
        max={reserveInfo?.maxBid || 0}
        placeholder="Enter bid amount"
      />
      
      {bidAmount > reserveInfo?.maxBid && (
        <div className="alert alert-error">
          ❌ Bid exceeds maximum allowed (£{reserveInfo.maxBid})
        </div>
      )}
      
      <button 
        onClick={handleSubmitBid}
        disabled={bidAmount > reserveInfo?.maxBid || bidAmount < 10}
      >
        Submit Bid
      </button>
    </div>
  );
}
```

---

### 4. Round-by-Round Squad Size Checks

**Requirement:** Every round should validate squad size constraints

**Implementation:** Add middleware/helper function for all round operations

```typescript
// lib/squad-size-validator.ts

export interface SquadSizeValidation {
  valid: boolean;
  error?: string;
  currentSquadSize: number;
  minSquadSize: number;
  maxSquadSize: number;
  slotsToMin: number;
  slotsToMax: number;
  canSkip: boolean;
  requiredSelections: number;
}

export async function validateSquadSizeForRound(
  teamId: string,
  seasonId: string,
  proposedSelections: number
): Promise<SquadSizeValidation> {
  
  // Get team's current squad size
  const teamSeasonDoc = await adminDb
    .collection('team_seasons')
    .doc(`${teamId}_${seasonId}`)
    .get();
  
  const currentSquadSize = teamSeasonDoc.data()?.players_count || 0;
  
  // Get season's min/max squad settings
  const settingsResult = await sql`
    SELECT min_squad_size, max_squad_size
    FROM auction_settings
    WHERE season_id = ${seasonId}
  `;
  
  const minSquad = settingsResult[0]?.min_squad_size || 25;
  const maxSquad = settingsResult[0]?.max_squad_size || 30;
  
  const slotsToMin = Math.max(0, minSquad - currentSquadSize);
  const slotsToMax = Math.max(0, maxSquad - currentSquadSize);
  
  // Check if team has reached min squad
  const hasReachedMin = currentSquadSize >= minSquad;
  
  // Validation logic
  if (!hasReachedMin) {
    // Below min squad - must select to reach minimum
    if (proposedSelections === 0) {
      return {
        valid: false,
        error: `You must select at least ${slotsToMin} players to reach minimum squad size (${minSquad})`,
        currentSquadSize,
        minSquadSize: minSquad,
        maxSquadSize: maxSquad,
        slotsToMin,
        slotsToMax,
        canSkip: false,
        requiredSelections: slotsToMin
      };
    }
    
    if (proposedSelections < slotsToMin) {
      return {
        valid: false,
        error: `Insufficient selections. You need ${slotsToMin} more players to reach minimum squad size (${minSquad})`,
        currentSquadSize,
        minSquadSize: minSquad,
        maxSquadSize: maxSquad,
        slotsToMin,
        slotsToMax,
        canSkip: false,
        requiredSelections: slotsToMin
      };
    }
  }
  
  // Check max squad limit
  if (currentSquadSize + proposedSelections > maxSquad) {
    return {
      valid: false,
      error: `Selection would exceed maximum squad size (${maxSquad}). Current: ${currentSquadSize}, Proposed: ${proposedSelections}`,
      currentSquadSize,
      minSquadSize: minSquad,
      maxSquadSize: maxSquad,
      slotsToMin,
      slotsToMax,
      canSkip: hasReachedMin,
      requiredSelections: hasReachedMin ? 0 : slotsToMin
    };
  }
  
  return {
    valid: true,
    currentSquadSize,
    minSquadSize: minSquad,
    maxSquadSize: maxSquad,
    slotsToMin,
    slotsToMax,
    canSkip: hasReachedMin,
    requiredSelections: hasReachedMin ? 0 : slotsToMin
  };
}
```

**Usage in API routes:**

```typescript
// In any round submission endpoint
const validation = await validateSquadSizeForRound(
  teamId,
  seasonId,
  selectedPlayers.length
);

if (!validation.valid) {
  return NextResponse.json(
    { success: false, error: validation.error },
    { status: 400 }
  );
}
```

---

### 5. Summary of Implementation Checklist

#### Super Admin Features
- [ ] Add min/max squad size fields to season creation form
- [ ] Validate min < max constraint
- [ ] Store values in `auction_settings` table
- [ ] Display current settings in season management page

#### Bulk Round Page
- [ ] Display current squad status (X/min - Y/max)
- [ ] Show required selections based on min squad
- [ ] Disable submit if selections don't meet requirements
- [ ] Add frontend validation before API call
- [ ] Add backend validation in API route
- [ ] Show clear error messages for violations

#### Bulk Tiebreaker Page
- [ ] Add balance check before bid submission
- [ ] Calculate and display reserve requirements
- [ ] Show max allowed bid amount
- [ ] Validate bid against reserves (Phase 1/2/3 rules)
- [ ] Add backend validation in tiebreaker bid API
- [ ] Display reserve explanation to users

#### Round Validation
- [ ] Create `validateSquadSizeForRound()` helper function
- [ ] Use in all round submission endpoints
- [ ] Check min squad requirement for teams below minimum
- [ ] Allow skipping for teams at or above minimum
- [ ] Enforce max squad limit for all teams

#### Database Updates
- [ ] Add `min_squad_size` column to `auction_settings` (default 25)
- [ ] Add `max_squad_size` column to `auction_settings` (default 30)
- [ ] Add `football_min_slots` column to `teams` table
- [ ] Add `football_max_slots` column to `teams` table
- [ ] Update existing records with default values

---

## Summary

The auction round balance check system provides:

1. **Three-phase budget management** with varying enforcement levels
2. **Automatic reserve calculations** based on remaining rounds and slots to reach minimum squad
3. **Min/Max squad size system** - reserves based on minimum (25), optional expansion to maximum (30)
4. **Team-specific configurations** for min/max squad sizes
5. **Flexible enforcement** (strict in Phase 1, soft in Phase 2, conditional in Phase 3)
6. **Comprehensive validation** at bid placement and round finalization
7. **Automatic affordability adjustments** for non-participating teams
8. **No reserve restrictions** once minimum squad size is reached
9. **Super admin controls** for season-level min/max squad configuration
10. **Bulk round validations** enforcing min squad requirements
11. **Tiebreaker balance checks** preventing overbidding with reserve enforcement

This ensures fair and sustainable squad building throughout the entire auction process, with mandatory minimum squad completion and optional expansion capabilities.
