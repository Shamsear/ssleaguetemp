# Team Season Registration Flow Documentation

**Status**: ✅ Complete Analysis
**Date**: June 4, 2026

---

## Overview

This document explains how teams register for seasons in the Football Auction system. Unlike committee admin creation (which is invite-based), **team season registration is managed by the committee administrator** and happens **after** the team user has created their account.

**Currency System**: All seasons use a **dual currency model**:
- **eCoin** (€) - For football players (default: €10,000)
- **SSCoin** ($) - For real players (default: $1,000)

---

## Key Concepts

### 1. **Two-Step Process**
1. **Team User Registration** - Team creates account (covered in separate doc)
2. **Season Registration** - Committee admin registers team for a season

### 2. **Season Binding**
- Teams register **per season** (not globally)
- Each season is independent
- Each season registration creates a `team_seasons` document

### 3. **Registration Authority**
- **Committee Admins**: Register teams for their season
- **Super Admins**: Can register teams for any season
- **Teams**: CANNOT self-register (must wait for admin)

---

## Architecture Overview

### Database Collections

#### 1. **`teams`** (Firebase)
```typescript
{
  id: "SSPSLT0001",                    // Team document ID
  team_name: "Manchester Warriors",
  owner_uid: "user_123",               // User who owns the team
  userId: "user_123",                  // Same as owner_uid
  uid: "user_123",                     // Legacy field
  logo_url: "https://...",
  created_at: Timestamp,
  updated_at: Timestamp,
  
  // Optional fields
  owner_name: "John Doe",
  display_name: "Warriors",
  is_active: true
}
```

#### 2. **`team_seasons`** (Firebase)
```typescript
{
  id: "{teamId}_{seasonId}",           // e.g., "SSPSLT0001_SSPSLS16"
  team_id: "SSPSLT0001",
  team_name: "Manchester Warriors",
  season_id: "SSPSLS16",
  season_name: "Season 16",
  user_id: "user_123",                 // Owner's user ID
  username: "john_warriors",
  
  // Registration info
  status: "registered",                // or "pending", "inactive"
  registered_at: Timestamp,
  
  // Financial tracking (Dual Currency System)
  currency_system: "dual",
  football_budget: 10000,              // eCoin (€) for football players
  football_spent: 0,
  real_player_budget: 1000,            // SSCoin ($) for real players
  real_player_spent: 0,
  
  // Slot management
  football_base_slots: 25,
  football_purchased_slots: 0,
  football_total_slots: 25,
  
  // Transfer tracking
  transfer_count: 0,                   // Max 2 per season
}
```

#### 3. **`teamstats`** (Neon PostgreSQL)
```sql
CREATE TABLE teamstats (
  id SERIAL PRIMARY KEY,
  team_id VARCHAR(20),
  season_id VARCHAR(20),
  team_name VARCHAR(100),
  
  -- Statistics
  matches_played INT DEFAULT 0,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  draws INT DEFAULT 0,
  points INT DEFAULT 0,
  
  -- Financial
  budget INT,
  spent INT DEFAULT 0,
  balance INT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Step-by-Step Registration Flow

### Step 1: Team User Creates Account

**Already covered in team registration doc**, but summary:
- User registers as role `team`
- Account requires super admin approval
- Creates document in `users` collection
- Creates document in `teams` collection
- **NOT YET** registered for any season

### Step 2: Committee Admin Registers Team for Season

**Who Can Do This**:
- Committee admin for their assigned season
- Super admin for any season

**Method**: Committee admin uses admin panel

**Location**: `/dashboard/committee/team-management`

**Process**:
```typescript
// Admin selects team from approved teams list
// Admin clicks "Register for Season"

// API Call: POST /api/team/register-season
{
  team_id: "SSPSLT0001",
  season_id: "SSPSLS16",
  football_budget: 10000,       // eCoin (€) for football players
  real_player_budget: 1000,     // SSCoin ($) for real players
  currency_system: "dual"       // Always dual currency
}
```

**Backend Processing**:
1. Validate team exists and is approved
2. Validate season exists and is active
3. Check if team already registered for season
4. Get season configuration (budget, currency system)
5. Create `team_seasons` document
6. Create `teamstats` record in Neon
7. Initialize team's starting budget

**Document IDs**:
```typescript
// team_seasons document ID format
const teamSeasonId = `${teamId}_${seasonId}`;
// Example: "SSPSLT0001_SSPSLS16"
```

---

### Step 3: Team Sees Active Season Dashboard

**Check Flow** (`app/api/team/season-status/route.ts`):

```typescript
export async function GET(request) {
  // 1. Get user ID
  const userId = auth.userId;
  
  // 2. Check if user has any team_seasons registration
  const teamSeasonsQuery = query(
    collection(db, 'team_seasons'),
    where('user_id', '==', userId),
    where('status', '==', 'registered')
  );
  
  const teamSeasonsSnapshot = await getDocs(teamSeasonsQuery);
  
  if (teamSeasonsSnapshot.empty) {
    // Not registered for any season
    
    // Check if there's an active season available
    const activeSeason = await getActiveSeason();
    
    if (activeSeason) {
      return {
        hasActiveSeason: true,
        isRegistered: false,
        seasonName: activeSeason.name,
        seasonId: activeSeason.id
      };
    }
    
    return {
      hasActiveSeason: false,
      isRegistered: false
    };
  }
  
  // Team is registered - get season details
  const teamSeasonData = teamSeasonsSnapshot.docs[0].data();
  const seasonId = teamSeasonData.season_id;
  
  return {
    hasActiveSeason: true,
    isRegistered: true,
    seasonName: teamSeasonData.season_name,
    seasonId: seasonId
  };
}
```

**Team Dashboard** (`app/dashboard/team/page.tsx`):

```typescript
useEffect(() => {
  const checkRegistrationStatus = async () => {
    // Get active season
    const activeSeason = await getActiveSeason();
    
    if (!activeSeason) {
      // Show "No Active Season" message
      setSeasonStatus({ hasActiveSeason: false, isRegistered: false });
      return;
    }
    
    // Check if registered in Neon (teamstats)
    const registeredInNeon = teamHistory?.find(
      ts => ts.season_id === activeSeason.id
    );
    
    // Also check Firebase team_seasons as fallback
    if (!registeredInNeon) {
      const teamSeasonId = `${userId}_${activeSeason.id}`;
      const teamSeasonDoc = await getDoc(doc(db, 'team_seasons', teamSeasonId));
      
      if (teamSeasonDoc.exists()) {
        isRegistered = teamSeasonDoc.data().status === 'registered';
      }
    }
    
    if (isRegistered) {
      // Show full dashboard
      setSeasonStatus({
        hasActiveSeason: true,
        isRegistered: true,
        seasonName: activeSeason.name,
        seasonId: activeSeason.id
      });
    } else {
      // Show "Registration Available" message
      setSeasonStatus({
        hasActiveSeason: true,
        isRegistered: false,
        seasonName: activeSeason.name,
        seasonId: activeSeason.id
      });
    }
  };
  
  checkRegistrationStatus();
}, [user, teamHistory, activeSeasons]);
```

---

## UI States for Teams

### State 1: No Active Season
```jsx
<div className="glass rounded-3xl p-6 mb-8">
  <h3>No Active Season</h3>
  <p>There is currently no active season. The committee will start a new season soon.</p>
  <span className="badge">WAITING</span>
  <button onClick={refresh}>Refresh Status</button>
</div>
```

### State 2: Season Available, Not Registered
```jsx
<div className="glass rounded-3xl p-6 mb-8 border-green-200">
  <h3>Season Registration Available!</h3>
  <h4>{seasonStatus.seasonName}</h4>
  <p>An active season is available for registration</p>
  <span className="badge">ACTIVE</span>
  
  <div className="alert-warning">
    <h3>Action Required</h3>
    <p>Please contact the committee administrator to register your team for this season.</p>
  </div>
  
  <button onClick={checkRegistration}>Check Registration Status</button>
</div>
```

### State 3: Registered - Show Full Dashboard
```jsx
<RegisteredTeamDashboard 
  seasonStatus={seasonStatus}
  user={user}
/>
```

**Full Dashboard Includes**:
- Team info with logo
- Budget/balance display (single or dual currency)
- Squad count and average rating
- Active auction rounds
- Current bids
- Squad overview
- Auction results
- Transaction history

---

## Currency System

### Dual Currency Model
All teams use the **dual currency system**:

```typescript
{
  currency_system: "dual",
  football_budget: 10000,      // eCoin (€) for football players
  football_spent: 0,
  real_player_budget: 1000,    // SSCoin ($) for real players
  real_player_spent: 0
}
```

**Budget Display**:
```
eCoin (€): 10,000    |  SSCoin ($): 1,000
```

**Default Budgets** (configurable per season):
- **eCoin**: €10,000 for football players
- **SSCoin**: $1,000 for real players

**Usage**:
- **eCoin**: Used in regular auction rounds for football players
- **SSCoin**: Used for real player acquisitions (legends/classics)

---

## Slot Management

### Base Slots
Default: **25 players** per team

### Purchased Slots
Teams can buy additional slots:
```typescript
{
  football_base_slots: 25,
  football_purchased_slots: 3,      // Bought 3 extra
  football_total_slots: 28          // Total available
}
```

**Purchase Cost**: Typically 100 eCoin per slot

### Squad Check
```typescript
const canAddPlayer = 
  currentSquadSize < team.football_total_slots;
```

---

## Registration Validation

### Checks Before Registration

1. **Team Existence**
```typescript
const teamDoc = await getDoc(doc(db, 'teams', teamId));
if (!teamDoc.exists()) {
  throw new Error('Team not found');
}
```

2. **Team Approval**
```typescript
const userData = await getUserDocument(team.owner_uid);
if (!userData.isApproved) {
  throw new Error('Team owner account not approved');
}
```

3. **Season Existence & Status**
```typescript
const season = await getSeasonById(seasonId);
if (!season) {
  throw new Error('Season not found');
}
if (season.status !== 'active') {
  throw new Error('Season is not active');
}
```

4. **Duplicate Registration**
```typescript
const teamSeasonId = `${teamId}_${seasonId}`;
const existing = await getDoc(doc(db, 'team_seasons', teamSeasonId));
if (existing.exists()) {
  throw new Error('Team already registered for this season');
}
```

5. **Registration Phase**
```typescript
if (!season.registrationOpen) {
  throw new Error('Registration is closed for this season');
}
```

---

## Real-Time Updates

### Firebase Realtime Database Listeners

**Team Dashboard** listens to:

1. **Round Updates**
```typescript
listenToSeasonRoundUpdates(seasonId, (message) => {
  if (message.type === 'round_finalized') {
    fetchDashboard(false, true);  // Refresh with cache bust
  }
});
```

2. **Squad Updates**
```typescript
listenToSquadUpdates(seasonId, (event) => {
  if (event.team_id === myTeamId) {
    fetchDashboard(false, true);
  }
});
```

3. **Wallet Updates**
```typescript
listenToWalletUpdates(seasonId, (event) => {
  if (event.team_id === myTeamId) {
    fetchDashboard(false, true);
  }
});
```

### Events Triggering Updates
- Player acquired in auction
- Bid placed/deleted
- Balance changed
- Round started/finalized
- Transfer completed

---

## API Endpoints

### Team Registration
```typescript
POST /api/team/register-season
Body: {
  team_id: string,
  season_id: string,
  football_budget: number,      // eCoin (€)
  real_player_budget: number,   // SSCoin ($)
  currency_system: 'dual'       // Always dual
}
```

### Check Season Status
```typescript
GET /api/team/season-status
Returns: {
  hasActiveSeason: boolean,
  isRegistered: boolean,
  seasonName?: string,
  seasonId?: string
}
```

### Get Dashboard Data
```typescript
GET /api/team/dashboard?season_id={seasonId}
Returns: {
  team: TeamData,
  activeRounds: Round[],
  players: Player[],
  activeBids: Bid[],
  stats: Stats,
  ...
}
```

### Get Team History
```typescript
GET /api/team/historical-stats?season_id={seasonId}
Returns: {
  seasons: SeasonStats[],
  totalSeasons: number,
  totalTrophies: number
}
```

---

## Permission Checks

### Committee Admin
```typescript
// Can only register teams for their assigned season
if (user.role === 'committee_admin') {
  if (user.seasonId !== seasonId) {
    throw new Error('Cannot register teams for other seasons');
  }
}
```

### Super Admin
```typescript
// Can register teams for any season
if (user.role === 'super_admin') {
  // No restrictions
}
```

### Team
```typescript
// Teams cannot self-register
if (user.role === 'team') {
  throw new Error('Teams cannot register themselves');
}
```

---

## Testing Checklist

- [ ] Team can see "No Active Season" when no season is active
- [ ] Team sees "Registration Available" when season active but not registered
- [ ] Committee admin can register team for their season
- [ ] Super admin can register team for any season
- [ ] Cannot register same team twice for same season
- [ ] Dual currency budgets display correctly (eCoin + SSCoin)
- [ ] Real-time updates work on dashboard

- [ ] Slot management works (base + purchased)
- [ ] Team dashboard only shows after registration

---

## Common Issues & Solutions

### Issue 1: Team Not Showing Registered
**Cause**: Document ID mismatch (userId vs teamId)
**Solution**: Check both `{userId}_{seasonId}` and `{teamId}_{seasonId}`

### Issue 2: Balance Not Updating
**Cause**: Cache not invalidated
**Solution**: Pass `bust_cache=true` to API after transactions

### Issue 3: Dashboard Shows Wrong Season
**Cause**: Multiple registrations exist
**Solution**: Query by active season ID, not just any registration

### Issue 4: Dual Currency Not Displaying
**Cause**: UI checking for single currency system
**Solution**: Remove single currency checks - all teams use dual currency

---

## Conclusion

The team season registration flow is a **committee-managed process** where:
1. ✅ Teams create accounts (require approval)
2. ✅ Committee admins register teams for seasons
3. ✅ Teams see dashboard only after registration
4. ✅ Each season registration is tracked separately
5. ✅ All teams use dual currency (eCoin + SSCoin)
6. ✅ Real-time updates keep dashboard fresh
7. ✅ Each season is independent (no auto-registration)

**Key Difference from Sub-Admin**:
- Sub-admins: **Invite-based**, self-registration
- Teams: **Admin-managed**, manual registration

**Currency System**:
- All seasons use **dual currency** (eCoin for football, SSCoin for real players)
- Default budgets: €10,000 eCoin + $1,000 SSCoin

This ensures committee has full control over which teams participate in their season.