# Real Player (SS Member) Registration Flow

## Overview
Real Players are actual SS Members (people) who register themselves for a season, then committee admins assign them to teams through an auction-based system. This is different from football players who are static game data.

## Key Concepts

### What is a Real Player?
- **Real Player** = SS Member (actual person, not a football player)
- Each real player has a unique `player_id` (format: `sspslpsl0001`, `sspslpsl0002`, etc.)
- Real players register once per season for themselves
- Players maintain permanent profile data in Firebase `realplayers` collection
- Season-specific data stored in Neon `realplayerstats` and `player_seasons` tables (S16+)

### Dual Currency System
- **SSCoin** ($1,000 budget): Used for purchasing real players (SS Members)
- **eCoin** (€10,000 budget): Used for purchasing football players
- Each team gets both budgets at season registration

### Single-Season Model
- Each season is independent - no contracts spanning multiple seasons
- Players register fresh each season
- Committee admins assign players to teams one season at a time
- No auto-registration, penalties, or multi-season commitments

---

## Registration Flow (7 Steps)

### **STEP 1: Player Self-Registration - Initial Sign-In**
**Page**: `app/register/player/page.tsx`


**User Actions:**
1. Player visits registration page for a specific season
2. Clicks "Sign in with Google" button
3. Authenticates using their Google account

**Technical Flow:**
- Uses Firebase Authentication with Google Sign-In
- `signInWithPopup(auth, GoogleAuthProvider)`
- On success, redirects to verify page with season parameter
- Season ID passed as query parameter: `?season=S18`

**Result:** User is authenticated and redirected to verification page

---

### **STEP 2: Player Verification - Search or New**
**Page**: `app/register/player/verify/page.tsx`

**User Actions:**
1. Player sees two options:
   - **Search for existing profile** by Player ID or name
   - **Register as new player**

**Option A: Existing Player**
- Player searches by their Player ID (`sspslpsl0001`) or name
- System searches Firebase `realplayers` collection
- Shows matching results with previous season data if available
- Player selects their profile

**Option B: New Player**
- Player clicks "Add New Player"
- System generates next available Player ID automatically
- Shows registration form with empty fields


**Previous Season Data Lookup:**
```typescript
// Query team_seasons for previous season
const previousSeasonQuery = query(
  collection(db, 'team_seasons'),
  where('season_number', '==', currentSeasonNumber - 1)
);

// Find team that has this player
const realPlayers = teamData.real_players || [];
const playerInTeam = realPlayers.find((p) => p.player_id === selectedPlayer.player_id);
```

Shows: Previous team name and category (if exists)

---

### **STEP 3: Complete Profile Information**
**Page**: `app/register/player/verify/page.tsx` (form section)

**Required Fields:**
- **Full Name** (locked if exists in database)
- **District** (Kerala districts dropdown with search - locked if exists)
- **Date of Birth** (editable if missing)
- **Email** (editable if missing, defaults to Google email)
- **Phone** (editable if missing)
- **Photo** (REQUIRED - must upload every season)

**Profile Update Rules:**
- Fields with existing database values **cannot be changed**
- Only missing fields can be filled
- Photo is always required (uploaded to ImageKit)


**Photo Upload:**
- Maximum 5MB file size
- Uploaded to ImageKit CDN
- Returns `photo_url` and `photo_file_id`
- Named by Player ID for easy management

---

### **STEP 4: Confirm Registration**
**API**: `POST /api/register/player/confirm`

**Request Body:**
```json
{
  "player_id": "sspslpsl0042",
  "season_id": "S18",
  "user_email": "player@example.com",
  "user_uid": "firebase-user-uid",
  "player_data": {
    "name": "John Doe",
    "place": "Ernakulam",
    "date_of_birth": "1995-06-15",
    "email": "player@example.com",
    "phone": "+919876543210",
    "photo_url": "https://ik.imagekit.io/...",
    "photo_file_id": "imagekit-file-id",
    "category": "A"
  }
}
```


**Backend Actions:**
1. **Check registration is open**: Verify `is_player_registration_open` flag in season
2. **Check duplicate**: Prevent duplicate registrations for same player + season
3. **Create Neon record**: Insert into `realplayerstats` table (season stats)
4. **Update Firebase**: Update or create record in `realplayers` collection (permanent profile)
5. **Add to Fantasy**: Auto-add player to fantasy league if exists
6. **Generate milestone news**: Trigger news if player count hits milestone (every 10 players)

**Database Structure:**

**Neon `realplayerstats` (Season-specific stats):**
```sql
CREATE TABLE realplayerstats (
  id VARCHAR(100) PRIMARY KEY, -- "sspslpsl0042_S18"
  player_id VARCHAR(50) NOT NULL,
  season_id VARCHAR(20) NOT NULL,
  tournament_id VARCHAR(50),
  player_name VARCHAR(100),
  category VARCHAR(10) DEFAULT 'A',
  points INT DEFAULT 100,
  matches_played INT DEFAULT 0,
  goals_scored INT DEFAULT 0,
  assists INT DEFAULT 0,
  wins INT DEFAULT 0,
  draws INT DEFAULT 0,
  losses INT DEFAULT 0,
  motm_awards INT DEFAULT 0,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(player_id, season_id)
);
```


**Firebase `realplayers` (Permanent profile):**
```typescript
{
  player_id: "sspslpsl0042",
  name: "John Doe",
  place: "Ernakulam",
  date_of_birth: "1995-06-15",
  email: "player@example.com",
  phone: "+919876543210",
  photo_url: "https://ik.imagekit.io/...",
  photo_file_id: "imagekit-file-id",
  category: "A",
  current_season_id: "S18",
  is_registered: true,
  is_active: true,
  role: "player",
  created_at: Timestamp,
  updated_at: Timestamp
}
```

**Result:** Player is registered and awaiting team assignment by committee admin

---

### **STEP 5: Committee Admin Views Available Players**
**Page**: `app/dashboard/committee/real-players/page.tsx`

**What Committee Admin Sees:**
- **Left Panel**: List of all unassigned players (available pool)
- **Right Panel**: List of all teams with their assigned players
- **Top Section**: Quick Assign feature for live auction


**Data Loading:**
```typescript
// Fetch from Neon API for modern seasons (S16+)
const response = await fetch(`/api/stats/players?seasonId=${userSeasonId}&limit=1000`);
const result = await response.json();

// Organize players by assignment status
realPlayersData.forEach((data) => {
  const player = {
    id: data.player_id,
    playerName: data.player_name,
    category: data.category || 'Bronze',
    auctionValue: data.auction_value || 250, // Minimum default
  };

  if (data.team_id && data.team_id !== '') {
    teamMap[data.team_id].push(player); // Assigned to team
  } else {
    unassignedPlayers.push(player); // Available pool
  }
});
```

**Team Budget Display:**
- Shows two modes: **Actual Balance** (from Firebase) or **Max Limit** (calculated locally)
- Uses dual currency system for real players: `real_player_budget` field
- Displays remaining budget and player count for each team

---

### **STEP 6: Committee Admin Assigns Players to Teams**
**Page**: `app/dashboard/committee/real-players/page.tsx`

**Two Assignment Methods:**


#### **Method A: Quick Assign (Live Auction Mode)**
Used during WhatsApp auction for instant assignments.

**Steps:**
1. Select player from dropdown
2. Select team from dropdown
3. Enter auction value (minimum $250)
4. Click "Assign Now!"

**UI Features:**
- Live indicator showing "LIVE" status
- Auto-fills minimum auction value ($250)
- Shows team budget remaining
- Shows team player slots remaining
- Instant assignment without page reload

**API Call:**
```typescript
await fetch('/api/contracts/assign-bulk', {
  method: 'POST',
  body: JSON.stringify({
    seasonId: userSeasonId,
    players: [{
      id: quickAssignPlayer.id,
      teamId: quickAssignTeam,
      playerName: quickAssignPlayer.playerName,
      auctionValue: auctionValue,
    }],
  }),
});
```


#### **Method B: Bulk Assignment**
Used for assigning multiple players at once or editing existing assignments.

**Steps:**
1. For each team, click to expand roster
2. Add players from available pool using dropdown
3. Set auction value for each player
4. Click "Save Team" to commit all changes

**Validation:**
- Exact player count must match season's required player count (typically 5)
- Cannot save until exact count is met
- Budget validation happens on backend

---

### **STEP 7: Backend Processing - Assign to Team**
**API**: `POST /api/contracts/assign-bulk`

**Request Body:**
```json
{
  "seasonId": "S18",
  "players": [
    {
      "id": "sspslpsl0042",
      "teamId": "team1",
      "playerName": "John Doe",
      "auctionValue": 350
    }
  ]
}
```

**Note**: In the single-season model, `startSeason` and `endSeason` are optional and default to `seasonId` if omitted.


**Backend Processing (Modern Seasons S16+):**

1. **Unassign Existing Players (Bulk Only)**
   - For bulk assignments, clear all players from team first
   - Quick assign skips this step (incremental update)

```typescript
// Clear existing assignments for bulk
await sql`
  UPDATE player_seasons
  SET team_id = NULL, team = NULL, auction_value = NULL,
      status = 'available', updated_at = NOW()
  WHERE team_id = ${teamId} AND season_id = ${startSeason}
`;
```

2. **Update Neon `player_seasons` Table**
   - Single-season contract: `contract_start_season` = `contract_end_season`
   - Generate unique `contract_id`
   - Set status to 'active'

```typescript
await sql`
  UPDATE player_seasons
  SET team_id = ${teamId},
      team = ${teamName},
      auction_value = ${auctionValue},
      contract_id = ${contractId},
      contract_start_season = ${startSeason},
      contract_end_season = ${startSeason}, // Single-season
      contract_length = 1,
      status = 'active',
      updated_at = NOW()
  WHERE id = ${seasonCompositeId}
`;
```


3. **Update Fantasy League**
   - Auto-add assigned players to fantasy league
   - Set draft price based on star rating

4. **Update Firebase `team_seasons` Budget**

**Dual Currency System:**
```typescript
// For bulk assignment - recalculate from scratch
const startingBalance = teamData.initial_real_player_budget || 1000;
const newBalance = startingBalance - totalSpent;

await teamSeasonRef.update({
  real_player_spent: totalSpent,
  real_player_budget: newBalance,
  players_count: playerCount,
});
```

**Quick Assign - Incremental:**
```typescript
// Incremental update for quick assign
const currentBudget = teamData.real_player_budget || 0;
const currentSpent = teamData.real_player_spent || 0;

await teamSeasonRef.update({
  real_player_spent: currentSpent + playerCost,
  real_player_budget: currentBudget - playerCost,
  players_count: currentCount + 1,
});
```


5. **Create Transaction Records**
   - Delete old `real_player_fee` transactions for the team
   - Create new transaction for each player assignment
   - Track progressive balance after each assignment

```typescript
// Create transaction for audit trail
await adminDb.collection('transactions').doc().set({
  team_id: teamId,
  season_id: startSeason,
  transaction_type: 'real_player_fee',
  currency_type: 'real_player',
  amount: -auctionValue,
  balance_after: runningBalance,
  reason: `Assigned real player: ${playerName} (${starRating}⭐)`,
  metadata: {
    player_id: playerId,
    player_name: playerName,
    star_rating: starRating,
    auction_value: auctionValue,
    contract_start: startSeason,
    contract_end: startSeason,
  },
  created_at: FieldValue.serverTimestamp(),
});
```

6. **Generate News Events**
   - Trigger news for partial roster: `team_players_assigned`
   - Trigger news for complete roster: `team_roster_complete` (when count >= 5)


---

## Database Schema Overview

### Firebase Collections

#### 1. `realplayers` (Permanent Player Profiles)
```typescript
{
  player_id: string,           // "sspslpsl0042"
  name: string,                 // "John Doe"
  place: string,                // "Ernakulam"
  date_of_birth: string,        // "1995-06-15"
  email: string,                // "player@example.com"
  phone: string,                // "+919876543210"
  photo_url: string,            // ImageKit URL
  photo_file_id: string,        // ImageKit file ID
  category: string,             // "A", "B", "Legend", "Classic"
  current_season_id: string,    // "S18"
  is_registered: boolean,
  is_active: boolean,
  role: string,                 // "player"
  created_at: Timestamp,
  updated_at: Timestamp
}
```

#### 2. `team_seasons` (Team Budget & Stats per Season)
```typescript
{
  id: string,                         // "team1_S18"
  team_id: string,
  season_id: string,
  team_name: string,
  
  // Dual Currency System
  currency_system: "dual",
  
  // Real Player Budget (SSCoin)
  initial_real_player_budget: 1000,   // Starting budget
  real_player_budget: 650,            // Remaining budget
  real_player_spent: 350,             // Total spent
  
  // Football Player Budget (eCoin)
  football_budget: 8500,              // Remaining
  initial_football_budget: 10000,
  
  players_count: 5,                   // Real players assigned
  status: "registered",
  created_at: Timestamp,
  updated_at: Timestamp
}
```


#### 3. `transactions` (Audit Trail)
```typescript
{
  team_id: string,
  season_id: string,
  transaction_type: "real_player_fee",
  currency_type: "real_player",      // vs "football"
  amount: -350,                      // Negative for expenses
  balance_after: 650,                // Balance after this transaction
  reason: "Assigned real player: John Doe (8⭐)",
  metadata: {
    player_id: string,
    player_name: string,
    star_rating: number,
    auction_value: number,
    contract_start: string,
    contract_end: string,
  },
  created_at: Timestamp,
  updated_at: Timestamp
}
```

### Neon Tables (PostgreSQL)

#### 1. `realplayerstats` (Season Registration & Stats)
```sql
CREATE TABLE realplayerstats (
  id VARCHAR(100) PRIMARY KEY,        -- "sspslpsl0042_S18"
  player_id VARCHAR(50) NOT NULL,     -- "sspslpsl0042"
  season_id VARCHAR(20) NOT NULL,     -- "S18"
  tournament_id VARCHAR(50),          -- "S18-LEAGUE"
  player_name VARCHAR(100),           -- "John Doe"
  category VARCHAR(10) DEFAULT 'A',
  
  -- Performance Stats
  points INT DEFAULT 100,
  matches_played INT DEFAULT 0,
  matches_won INT DEFAULT 0,
  matches_lost INT DEFAULT 0,
  matches_drawn INT DEFAULT 0,
  goals_scored INT DEFAULT 0,
  assists INT DEFAULT 0,
  wins INT DEFAULT 0,
  draws INT DEFAULT 0,
  losses INT DEFAULT 0,
  motm_awards INT DEFAULT 0,
  
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  
  UNIQUE(player_id, season_id)
);
```


#### 2. `player_seasons` (Team Assignment & Contract)
```sql
CREATE TABLE player_seasons (
  id VARCHAR(100) PRIMARY KEY,        -- "sspslpsl0042_S18"
  season_id VARCHAR(20) NOT NULL,
  player_id VARCHAR(50) NOT NULL,
  player_name VARCHAR(100),
  
  -- Team Assignment
  team_id VARCHAR(50),                -- NULL = unassigned
  team VARCHAR(100),
  auction_value INT,                  -- $350
  
  -- Player Attributes
  star_rating INT,                    -- 3-10
  category VARCHAR(20),               -- "Legend", "Classic", etc.
  points INT DEFAULT 100,
  
  -- Match Stats
  matches_played INT DEFAULT 0,
  goals_scored INT DEFAULT 0,
  assists INT DEFAULT 0,
  wins INT DEFAULT 0,
  draws INT DEFAULT 0,
  losses INT DEFAULT 0,
  clean_sheets INT DEFAULT 0,
  motm_awards INT DEFAULT 0,
  
  -- Contract (Single-Season)
  contract_id VARCHAR(100),
  contract_start_season VARCHAR(20),  -- "S18"
  contract_end_season VARCHAR(20),    -- "S18" (same as start)
  contract_length INT DEFAULT 1,
  status VARCHAR(20) DEFAULT 'available', -- 'active' when assigned
  
  registration_date TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  
  UNIQUE(player_id, season_id)
);
```

**Note**: No `salary_per_match` field - real players don't have per-match salaries in the single-season model.

---

## API Endpoints

### 1. Player Self-Registration
**POST** `/api/register/player/confirm`

**Request:**
```json
{
  "player_id": "sspslpsl0042",
  "season_id": "S18",
  "user_email": "player@example.com",
  "user_uid": "firebase-uid",
  "player_data": {
    "name": "John Doe",
    "place": "Ernakulam",
    "date_of_birth": "1995-06-15",
    "email": "player@example.com",
    "phone": "+919876543210",
    "photo_url": "https://ik.imagekit.io/...",
    "photo_file_id": "imagekit-id",
    "category": "A"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Player registration confirmed successfully",
  "data": {
    "player_id": "sspslpsl0042",
    "season_id": "S18",
    "registration_id": "sspslpsl0042_S18"
  }
}
```


### 2. Fetch Available Players
**GET** `/api/stats/players?seasonId=S18&limit=1000`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "player_id": "sspslpsl0042",
      "player_name": "John Doe",
      "category": "Legend",
      "star_rating": 8,
      "team_id": null,           // NULL = available
      "auction_value": null,
      "status": "available"
    },
    {
      "player_id": "sspslpsl0043",
      "player_name": "Jane Smith",
      "category": "Classic",
      "star_rating": 7,
      "team_id": "team1",        // Assigned to team
      "team": "FC Warriors",
      "auction_value": 350,
      "status": "active"
    }
  ]
}
```

### 3. Bulk Player Assignment
**POST** `/api/contracts/assign-bulk`

**Request:**
```json
{
  "seasonId": "S18",
  "players": [
    {
      "id": "sspslpsl0042",
      "teamId": "team1",
      "playerName": "John Doe",
      "auctionValue": 350
    }
  ]
}
```


**Response:**
```json
{
  "success": true,
  "message": "Successfully assigned 1 players and updated team budgets",
  "results": [
    {
      "playerId": "sspslpsl0042",
      "playerName": "John Doe",
      "teamId": "team1",
      "contractId": "contract_sspslpsl0042_S18_1704123456789",
      "database": "Neon"
    }
  ]
}
```

---

## Key Differences from Team Registration

| Aspect | Team Registration | Real Player Registration |
|--------|------------------|-------------------------|
| **Who Registers** | Committee admin | Player themselves |
| **Registration Type** | Admin-managed | Self-service with Google Sign-In |
| **Assignment** | Auto (instant) | Manual by committee admin |
| **Budget Source** | N/A (initial budget allocated) | Deducted from team's SSCoin budget |
| **Currency** | Both (eCoin + SSCoin) | SSCoin only ($1,000) |
| **Photo Required** | Team logo optional | Player photo mandatory |
| **Profile Updates** | Full edit access | Locked fields (only missing fillable) |
| **Verification** | Immediate | Two-step (register → assign) |

---

## User Roles & Permissions

### Real Player (SS Member)
**Can:**
- Register themselves for a season
- Upload their photo
- Fill missing profile information
- View their own dashboard

**Cannot:**
- Assign themselves to a team
- Change locked profile fields (name, district if set)
- Edit auction value
- Access other players' data


### Committee Admin
**Can:**
- View all registered players (assigned and available)
- Assign players to teams via Quick Assign or Bulk Assignment
- Set auction values for each player
- View team budgets and player counts
- Remove players from teams (unassign)
- Access real-time budget calculations

**Cannot:**
- Register on behalf of players (players must self-register)
- Edit player profile data (name, district, etc.)
- Override budget constraints
- Assign more than required player count

### Team User
**Can:**
- View their assigned real players
- See player stats and performance
- View remaining SSCoin budget
- View transaction history

**Cannot:**
- Assign or unassign players
- Change auction values
- Access other teams' player lists
- Register new players

---

## State Transitions

### Player States
```
[Unregistered] 
    ↓ (Player self-registers)
[Registered - Available] (team_id = NULL, status = 'available')
    ↓ (Committee assigns to team)
[Active - Assigned] (team_id = 'team1', status = 'active')
    ↓ (Committee unassigns - only in bulk mode)
[Available] (team_id = NULL, status = 'available')
```


### Budget States (Team Perspective)
```
[Team Registered] 
    Initial Budget: $1,000 SSCoin
    ↓
[Player 1 Assigned] (-$350)
    Remaining: $650
    ↓
[Player 2 Assigned] (-$300)
    Remaining: $350
    ↓
[Roster Complete] (5 players assigned)
    Final Budget: Varies based on auction values
```

---

## Validation & Business Rules

### Registration Phase
1. **Season must have `is_player_registration_open = true`**
2. **No duplicate registrations** - Unique constraint on `(player_id, season_id)`
3. **Photo is mandatory** - Cannot complete registration without photo upload
4. **Profile completeness** - Missing fields must be filled (place, DOB, email, phone)
5. **Existing fields locked** - Cannot change name or district if already in database

### Assignment Phase
1. **Budget validation** - Team must have sufficient SSCoin balance
2. **Exact player count** - Team must have exactly the required player count (typically 5, from season settings)
3. **Minimum auction value** - Default minimum is $250 per player
4. **No double assignment** - Player can only be assigned to one team per season
5. **Committee admin only** - Only users with `committee_admin` role can assign


### Single-Season Rules
1. **No multi-season contracts** - `contract_start_season` always equals `contract_end_season`
2. **No auto-registration** - Players must register fresh each season
3. **No penalties** - No penalty tracking for skipped seasons
4. **No contract carryover** - Each season is independent

---

## Error Handling

### Common Errors & Solutions

#### 1. Duplicate Registration
**Error:** "Player is already registered for this season"
**Cause:** Player trying to register twice for same season
**Solution:** Check `realplayerstats` table for existing record before registration

#### 2. Registration Closed
**Error:** "Registration is closed for this season"
**Cause:** `is_player_registration_open = false` in season document
**Solution:** Committee admin must open registration phase in season settings

#### 3. Budget Exceeded
**Error:** "Insufficient budget to assign player"
**Cause:** Team's `real_player_budget` is less than auction value
**Solution:** Reduce auction value or unassign other players to free budget

#### 4. Photo Upload Failed
**Error:** "Failed to upload photo"
**Cause:** ImageKit API error or file size > 5MB
**Solution:** Reduce file size, check ImageKit credentials, retry upload


#### 5. Roster Count Mismatch
**Error:** "Team must have exactly 5 players"
**Cause:** Trying to save team with wrong number of players
**Solution:** Add or remove players to match exact required count

#### 6. Race Condition
**Error:** Duplicate player registration during concurrent requests
**Solution:** Use `ON CONFLICT DO NOTHING` in SQL and check `insertResult.length`

---

## Performance Optimizations

### 1. Data Loading
- **Parallel fetching** - Season, player data, and stats loaded simultaneously
- **Limit queries** - Use `?limit=1000` to prevent excessive data transfer
- **Modern season detection** - Check `seasonNum >= 16` to route to Neon vs Firebase

### 2. Budget Calculations
- **Two modes** - Actual balance (from Firebase) vs Max limit (calculated locally)
- **Incremental updates** - Quick assign uses `+= playerCost` instead of full recalc
- **Bulk recalculation** - Only when clearing entire team roster

### 3. Real-Time Updates
- **Auto-refresh slots** - Poll registration stats every 5 seconds
- **Progressive balance** - Calculate running balance for each transaction
- **Optimistic UI updates** - Update local state immediately, sync with backend


---

## Transaction Audit Trail

Every player assignment creates a transaction record for financial tracking:

### Transaction Fields
```typescript
{
  team_id: "team1",
  season_id: "S18",
  transaction_type: "real_player_fee",
  currency_type: "real_player",        // SSCoin
  amount: -350,                         // Negative = expense
  balance_after: 650,                   // Running balance
  reason: "Assigned real player: John Doe (8⭐)",
  metadata: {
    player_id: "sspslpsl0042",
    player_name: "John Doe",
    star_rating: 8,
    auction_value: 350,
    contract_start: "S18",
    contract_end: "S18"
  },
  created_at: Timestamp,
  updated_at: Timestamp
}
```

### Transaction Lifecycle
1. **Delete old transactions** - Remove existing `real_player_fee` records for team
2. **Create new records** - One transaction per player assignment
3. **Calculate progressive balance** - Each transaction shows balance after that assignment
4. **Audit trail** - Full history of player assignments and budget usage


---

## News Generation

The system automatically generates news articles for key events:

### Event Types

#### 1. Player Milestone
**Trigger:** Every 10 players registered (10, 20, 30, etc.)
**Event:** `player_milestone`
**Example:** "Registration Milestone: 50 SS Members have registered for Season 18!"

#### 2. Team Players Assigned
**Trigger:** When players assigned but roster incomplete (< 5 players)
**Event:** `team_players_assigned`
**Example:** "FC Warriors signs 3 SS Members for $850 total"

#### 3. Team Roster Complete
**Trigger:** When team has 5+ players (full roster)
**Event:** `team_roster_complete`
**Example:** "FC Warriors completes roster with 5 SS Members for $2,500"

### News Context Data
```typescript
{
  season_id: "S18",
  season_name: "Season 18",
  team_id: "team1",
  team_name: "FC Warriors",
  player_count: 5,
  total_spent: 2500,
  starting_budget: 1000,
  remaining_budget: 0,
  players: [
    { name: "John Doe", star_rating: 8, auction_value: 350 },
    { name: "Jane Smith", star_rating: 7, auction_value: 300 }
  ]
}
```


---

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    REAL PLAYER REGISTRATION FLOW                │
└─────────────────────────────────────────────────────────────────┘

PLAYER SELF-REGISTRATION PHASE
═══════════════════════════════════════════════════════════════════

  [Player]                    [System]                  [Database]
     │                           │                           │
     │ 1. Visit /register/player │                           │
     │──────────────────────────>│                           │
     │                           │                           │
     │ 2. Sign in with Google    │                           │
     │──────────────────────────>│                           │
     │                           │                           │
     │                           │ 3. Authenticate           │
     │                           │──────────────────────────>│
     │                           │<──────────────────────────│
     │                           │   Firebase Auth Token     │
     │                           │                           │
     │ 4. Search for profile     │                           │
     │    OR create new          │ 5. Query realplayers      │
     │──────────────────────────>│──────────────────────────>│
     │                           │<──────────────────────────│
     │                           │   Player data (if exists) │
     │                           │                           │
     │ 6. Fill missing fields    │                           │
     │    + Upload photo         │                           │
     │──────────────────────────>│                           │
     │                           │                           │
     │ 7. Confirm registration   │                           │
     │──────────────────────────>│ 8. POST /api/register/    │
     │                           │    player/confirm         │
     │                           │                           │
     │                           │ 9. Upload to ImageKit     │
     │                           │───────────────────────►   │
     │                           │◄───────────────────────   │
     │                           │   photo_url + file_id     │
     │                           │                           │
     │                           │ 10. Insert realplayerstats│
     │                           │──────────────────────────>│
     │                           │    (Neon)                 │
     │                           │                           │
     │                           │ 11. Update realplayers    │
     │                           │──────────────────────────>│
     │                           │    (Firebase)             │
     │                           │                           │
     │ 12. Success! Redirect     │                           │
     │<──────────────────────────│                           │
     │                           │                           │

STATUS: Player registered, awaiting team assignment
        team_id = NULL, status = 'available'


COMMITTEE ADMIN ASSIGNMENT PHASE
═══════════════════════════════════════════════════════════════════

[Committee Admin]             [System]                  [Database]
     │                           │                           │
     │ 1. Open /dashboard/       │                           │
     │    committee/real-players │                           │
     │──────────────────────────>│                           │
     │                           │                           │
     │                           │ 2. GET /api/stats/players │
     │                           │──────────────────────────>│
     │                           │<──────────────────────────│
     │                           │   All players (assigned   │
     │                           │   + unassigned)           │
     │                           │                           │
     │                           │ 3. GET team_seasons       │
     │                           │──────────────────────────>│
     │                           │<──────────────────────────│
     │                           │   Team budgets            │
     │                           │                           │
     │ 4. View available players │                           │
     │    in left panel          │                           │
     │                           │                           │
     │ 5a. QUICK ASSIGN:         │                           │
     │    Select player, team,   │                           │
     │    enter auction value    │                           │
     │──────────────────────────>│                           │
     │                           │                           │
     │ 5b. BULK ASSIGN:          │                           │
     │    Add multiple players   │                           │
     │    to team, set values    │                           │
     │──────────────────────────>│                           │
     │                           │                           │
     │ 6. Click "Assign" or      │                           │
     │    "Save Team"            │                           │
     │──────────────────────────>│ 7. POST /api/contracts/   │
     │                           │    assign-bulk            │
     │                           │                           │
     │                           │ 8. Verify committee_admin │
     │                           │    role from JWT          │
     │                           │                           │
     │                           │ 9. (Bulk) Clear existing  │
     │                           │    team assignments       │
     │                           │──────────────────────────>│
     │                           │    UPDATE player_seasons  │
     │                           │    SET team_id = NULL     │
     │                           │                           │
     │                           │ 10. Assign players        │
     │                           │──────────────────────────>│
     │                           │    UPDATE player_seasons  │
     │                           │    SET team_id, auction   │
     │                           │                           │
     │                           │ 11. Update team budgets   │
     │                           │──────────────────────────>│
     │                           │    UPDATE team_seasons    │
     │                           │    real_player_budget     │
     │                           │                           │
     │                           │ 12. Create transactions   │
     │                           │──────────────────────────>│
     │                           │    INSERT transactions    │
     │                           │                           │
     │                           │ 13. Generate news         │
     │                           │──────────────────────────>│
     │                           │    Trigger news events    │
     │                           │                           │
     │ 14. Success! UI updates   │                           │
     │<──────────────────────────│                           │
     │    Show updated budgets   │                           │
     │    and player lists       │                           │

STATUS: Player assigned to team
        team_id = 'team1', status = 'active'
        Team budget updated, transactions recorded

═══════════════════════════════════════════════════════════════════
```


---

## File Structure Reference

### Frontend Pages
```
app/
├── register/
│   └── player/
│       ├── page.tsx              # Step 1: Google Sign-In
│       ├── verify/
│       │   └── page.tsx          # Step 2-3: Search/Form/Photo
│       └── success/
│           └── page.tsx          # Registration success
│
└── dashboard/
    ├── committee/
    │   └── real-players/
    │       ├── page.tsx          # Step 5-6: Assignment UI
    │       └── assign/           # Alternative assignment flow
    │
    └── team/
        └── real-players/
            └── page.tsx          # Team view of their players
```

### Backend API Routes
```
app/api/
├── register/
│   └── player/
│       └── confirm/
│           └── route.ts          # Step 4: Player registration
│
├── contracts/
│   └── assign-bulk/
│       └── route.ts              # Step 7: Player assignment
│
└── stats/
    └── players/
        └── route.ts              # Fetch player data
```


### Utilities & Libraries
```
lib/
├── firebase/
│   ├── config.ts                # Firebase auth & db config
│   ├── admin.ts                 # Admin SDK for backend
│   └── invites.ts               # Invite management
│
├── imagekit/
│   └── playerPhotos.ts          # Photo upload to ImageKit
│
├── neon/
│   ├── tournament-config.ts     # Neon DB connection
│   └── fantasy-config.ts        # Fantasy league DB
│
├── news/
│   └── trigger.ts               # News generation system
│
└── auth-helper.ts               # JWT verification
```

---

## Testing Checklist

### Player Self-Registration
- [ ] Player can sign in with Google
- [ ] Search finds existing player profiles
- [ ] New player ID auto-generates correctly
- [ ] Form validates all required fields
- [ ] Photo upload works (< 5MB)
- [ ] Photo preview displays correctly
- [ ] Existing fields are locked for returning players
- [ ] Missing fields can be filled
- [ ] Registration prevents duplicates for same season
- [ ] Success page redirects correctly


### Committee Admin Assignment
- [ ] Available players list loads correctly
- [ ] Team budget displays correctly (both modes)
- [ ] Quick Assign works for single player
- [ ] Bulk Assignment works for multiple players
- [ ] Budget validation prevents over-spending
- [ ] Exact player count validation works
- [ ] Minimum auction value enforced ($250)
- [ ] Player cannot be assigned to multiple teams
- [ ] Unassign returns player to available pool
- [ ] UI updates immediately after assignment
- [ ] Budget recalculates correctly (bulk vs quick)
- [ ] Transactions are created correctly
- [ ] News generation triggers appropriately

### Database Integrity
- [ ] `realplayerstats` has correct data after registration
- [ ] `player_seasons` updates with team assignment
- [ ] `realplayers` profile updates correctly
- [ ] `team_seasons` budget fields accurate
- [ ] `transactions` audit trail complete
- [ ] Fantasy league players added automatically
- [ ] UNIQUE constraints prevent duplicates
- [ ] NULL team_id for unassigned players

### Error Handling
- [ ] Duplicate registration prevented
- [ ] Closed registration blocked
- [ ] Budget exceeded error shown
- [ ] Photo upload failure handled gracefully
- [ ] Race conditions prevented
- [ ] Invalid auction value rejected
- [ ] Auth errors display correctly


---

## Troubleshooting Guide

### Issue: Player registration fails with "Season not found"
**Cause:** Invalid season_id in URL parameter
**Fix:** Verify season exists in Firebase `seasons` collection and `is_player_registration_open = true`

### Issue: Photo upload stuck at "Uploading..."
**Cause:** ImageKit API credentials missing or invalid
**Fix:** Check `.env` for `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`

### Issue: Budget shows $0 but should have balance
**Cause:** Missing `initial_real_player_budget` field in `team_seasons`
**Fix:** Ensure team registration creates both `initial_real_player_budget` and `real_player_budget` fields

### Issue: Quick Assign deducts wrong amount from budget
**Cause:** Using bulk logic instead of incremental update
**Fix:** Check `isBulkAssignment` flag - should be `false` for single player (line 172 in assign-bulk route)

### Issue: Player appears in multiple teams
**Cause:** Race condition in assignment or missing UNIQUE constraint
**Fix:** Add `UNIQUE(player_id, season_id)` to `player_seasons` table schema

### Issue: Transaction history missing or wrong balance
**Cause:** Old transactions not deleted before creating new ones
**Fix:** Ensure `DELETE FROM transactions WHERE team_id = X AND transaction_type = 'real_player_fee'` runs first


---

## Summary

The Real Player Registration flow is a **two-phase system**:

### Phase 1: Self-Registration (Player-driven)
- Players register themselves using Google Sign-In
- Fill profile information and upload photo
- System creates records in `realplayerstats` (Neon) and `realplayers` (Firebase)
- Player enters "available pool" awaiting assignment

### Phase 2: Team Assignment (Admin-driven)
- Committee admins view available players
- Assign players to teams with auction values
- System updates `player_seasons` with team assignment
- Deducts cost from team's SSCoin budget
- Creates transaction audit trail
- Generates news for milestones and roster completion

### Key Features
✅ **Single-season model** - No multi-season contracts  
✅ **Dual currency system** - SSCoin for real players, eCoin for football players  
✅ **Self-service registration** - Players register themselves  
✅ **Admin-controlled assignment** - Committee manages auction and assignments  
✅ **Budget enforcement** - Real-time validation prevents overspending  
✅ **Audit trail** - Complete transaction history for transparency  
✅ **Photo management** - ImageKit CDN for player photos  
✅ **News generation** - Automatic milestone and roster news  

---

## Related Documentation
- [Season Creation Flow](./SEASON_CREATION_FLOW_VERIFICATION_UPDATED.md)
- [Sub-Admin Creation Flow](./SUB_ADMIN_CREATION_FLOW_DOCUMENTATION.md)
- [Team Season Registration Flow](./TEAM_SEASON_REGISTRATION_FLOW.md)
- [Team Season Utils](./lib/team-season-utils.ts) - Budget helper functions

