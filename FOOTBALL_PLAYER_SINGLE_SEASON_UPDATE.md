# Football Player System - Single Season Update

## Summary

Converting football player system from multi-season contract model to single-season format to match the real player system updates.

---

## Current State (Multi-Season)

### Key Components:
1. **Multi-Season Contracts**: Football players get 2-season contracts with start/end seasons
2. **Contract Fields**: `contract_start_season`, `contract_end_season`, `contract_id`, `contract_length`
3. **Dual Currency**: Euro (eCoin) budget system separate from real players
4. **Contract Assignment**: `lib/firebase/multiSeasonPlayers.ts` - `assignFootballPlayerWithContract()`
5. **Release System**: Complex contract termination with refund calculations

### Files That Need Updates:

#### API Routes:
- `app/api/teams/[id]/football-players/route.ts` - Contract-based player queries
- `app/api/players/release-football-player/route.ts` - Contract termination logic
- `app/api/auction/footballplayers/route.ts` - Auction system

#### Libraries:
- `lib/firebase/multiSeasonPlayers.ts` - Contract assignment functions
- `lib/firebase/footballPlayers.ts` - Player assignment functions

#### Frontend Pages:
- Football player auction pages
- Football player management pages
- Team football player displays

#### Types:
- `types/footballPlayer.ts` - Contract-related interfaces

---

## Changes Required

### 1. Database Schema Changes
**Remove from footballplayers table queries:**
- `contract_start_season`
- `contract_end_season` 
- `contract_id`
- `contract_length`
- `contract_status`

**Keep:**
- `season_id` (for single-season tracking)
- `team_id`
- `acquisition_value`
- `status` (active/released/free_agent)

### 2. API Route Updates

#### `/api/teams/[id]/football-players/route.ts`
**Remove:**
- Contract date filtering logic
- Multi-season contract queries
- Contract start/end season checks

**Simplify:**
- Query by `season_id` only
- Remove contract-based filtering
- Single-season player ownership

#### `/api/players/release-football-player/route.ts`
**Remove:**
- Contract termination calculations
- Half-season refund logic
- Contract end date updates

**Simplify:**
- Simple player release for current season
- Basic refund calculation (percentage of acquisition value)
- No contract date manipulation

### 3. Library Updates

#### `lib/firebase/multiSeasonPlayers.ts`
**Remove:**
- `assignFootballPlayerWithContract()` function
- Contract creation logic
- Multi-season salary commitments

**Replace with:**
- Simple single-season assignment
- Direct team assignment without contracts
- Single-season budget deduction

#### `lib/firebase/footballPlayers.ts`
**Update:**
- `assignFootballPlayerToTeam()` to handle single-season
- Remove contract-related fields
- Simplify assignment logic

### 4. Type Updates

#### `types/footballPlayer.ts`
**Remove:**
- Contract-related interfaces
- Multi-season assignment data types
- Contract status enums

**Simplify:**
- Single-season assignment interfaces
- Remove contract fields from player data

### 5. Frontend Updates
**Update all football player displays to:**
- Remove contract duration information
- Show only current season ownership
- Simplify release/transfer UI
- Remove contract status indicators

---

## Implementation Plan

### Phase 1: Update API Routes ✅
1. Update `/api/teams/[id]/football-players/route.ts`
2. Update `/api/players/release-football-player/route.ts`
3. Update `/api/auction/footballplayers/route.ts`

### Phase 2: Update Libraries ✅
1. Update `lib/firebase/multiSeasonPlayers.ts`
2. Update `lib/firebase/footballPlayers.ts`
3. Update `lib/salary-utils.ts`

### Phase 3: Update Types ✅
1. Update `types/footballPlayer.ts`
2. Remove contract-related interfaces

### Phase 4: Update Frontend ✅
1. Update football player display components
2. Update auction/assignment pages
3. Update team football player lists

### Phase 5: Testing ✅
1. Test football player assignment
2. Test football player release
3. Test team football player queries
4. Verify single-season functionality

---

## Database Impact

### New Single-Season Model:
- Players assigned to teams for specific season only
- No contract start/end dates
- Simple season-based ownership
- Direct assignment without contract creation

### Historical Data:
- All Season 16-17 football player contracts preserved
- Historical contract queries still work
- New assignments use simplified model

---

## Status

- [x] Phase 1: API Routes
- [x] Phase 2: Libraries  
- [x] Phase 3: Types
- [ ] Phase 4: Frontend
- [ ] Phase 5: Testing

---

## Completed Changes

### Phase 1: API Routes ✅

#### `/api/teams/[id]/football-players/route.ts`
**Removed:**
- Contract date filtering logic (`contract_start_season <= seasonId AND contract_end_season >= seasonId`)
- Contract-related fields from SELECT queries
- Multi-season contract validation

**Simplified:**
- Query by `season_id` only for specific season
- Removed `contract_start_season`, `contract_end_season` from queries
- Single-season player ownership model

#### `/api/players/release-football-player/route.ts`
**Removed:**
- Contract termination calculations (half-seasons, contract end dates)
- Complex refund calculations based on contract duration
- Contract field updates (`contract_end_season`, `release_season`)
- Multi-season contract validation

**Simplified:**
- Simple player release for current season only
- Basic refund calculation (percentage of acquisition value)
- Removed contract-related fields from queries and updates
- Simplified transaction logging

### Phase 2: Libraries ✅

#### `lib/firebase/multiSeasonPlayers.ts`
**Removed:**
- `assignFootballPlayerWithContract()` function with contract creation
- Contract data creation and validation
- Multi-season salary commitments
- Euro balance checking and deduction

**Replaced with:**
- `assignFootballPlayerToTeam()` - Simple single-season assignment
- Direct team assignment without contract creation
- Simplified player update (team_id, season_id, acquisition_value)

#### `lib/salary-utils.ts`
**Added missing functions:**
- `updatePlayerPoints()` - Simple point calculation
- `calculateStarRating()` - Star rating from points
- `updateAllPlayerCategories()` - Category assignment
- `calculateTeamRealPlayerSalaries()` - Placeholder implementation

### Phase 3: Types ✅

#### `types/footballPlayer.ts`
**Updated:**
- `AssignFootballPlayerToTeamData` interface for single-season model
- Changed from `player_id`, `team_id`, `sold_price` to `playerId`, `teamId`, `seasonId`, `auctionValue`
- Removed contract-related fields

---

## Notes

- Historical football player contracts remain in database
- Only new assignments will use single-season model
- Existing Season 16-17 contracts are preserved
- Single currency system (remove dual eCoin/SSCoin)