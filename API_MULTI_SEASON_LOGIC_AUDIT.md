# API Multi-Season Logic Audit

## Overview
Found multiple API routes and backend logic that **CREATE and ENFORCE** 2-season contracts through database operations.

---

## 🔴 CRITICAL - APIs That Create Multi-Season Contracts

### 1. **Email Request Approval API** ⚠️ CREATES 2-SEASON CONTRACTS
**Location:** `app/api/telegram/email-requests/[id]/route.ts`

**What it does (Lines 68-115):**
```typescript
// Calculate next season for 2-season contract
const seasonNumber = parseInt(requestData.season_id.replace(/\D/g, ''));
const nextSeasonId = `${seasonPrefix}${seasonNumber + 1}`;

// Create player registration for CURRENT season
INSERT INTO player_seasons (
  contract_id, contract_start_season, contract_end_season, contract_length,
  is_auto_registered, ...
) VALUES (
  ${contractId}, ${requestData.season_id}, ${nextSeasonId}, 2,
  false, ...  // Current season
)

// Create player registration for NEXT season (auto-registered)
INSERT INTO player_seasons (
  contract_id, contract_start_season, contract_end_season, contract_length,
  is_auto_registered, ...
) VALUES (
  ${contractId}, ${requestData.season_id}, ${nextSeasonId}, 2,
  true, ...  // Next season - AUTO REGISTERED
)
```

**Impact:** 🔴 **CRITICAL**
- Automatically creates player record for NEXT season
- Sets `is_auto_registered = true` for next season
- Creates 2-season contract in database
- **This is THE main backend enforcement of 2-season contracts**

**Action Needed:** ❌ **MUST REMOVE** next season creation

---

### 2. **Bulk Contract Assignment API** ⚠️ CREATES AUTO-REGISTRATIONS
**Location:** `app/api/contracts/assign-bulk/route.ts`

**What it does (Lines 257-269, 376-400):**
```typescript
// Creates new entry for season with contract_length: 2
contract_end_season: endSeason,
contract_id: contractId,
contract_length: 2,  // TWO-SEASON CONTRACT

// Sets is_auto_registered: true for future seasons
is_auto_registered: true,
```

**Impact:** 🟡 **MEDIUM-HIGH**
- Bulk assigns contracts to multiple players
- Sets `contract_length = 2`
- Marks future registrations as `is_auto_registered = true`

**Action Needed:** ⚠️ **UPDATE** to single-season logic

---

## 🟡 MEDIUM PRIORITY - Contract Query/Display APIs

### 3. **Stats Players API** - Queries Contract Fields
**Location:** `app/api/stats/players/route.ts`

**What it does (Lines 417, 494):**
```typescript
SELECT 
  contract_id, contract_start_season, contract_end_season,
  is_auto_registered, registration_date
FROM player_seasons
```

**Impact:** 🟢 **LOW** - Just reads existing data
**Action Needed:** ✅ **KEEP** (reads data, doesn't enforce)

---

### 4. **Team Players APIs** - Queries Contract Fields
**Locations:**
- `app/api/teams/[id]/real-players/route.ts` (Lines 53-55)
- `app/api/team/[teamId]/route.ts` (Lines 81-82, 180-183)
- `app/api/team/[teamId]/players/route.ts` (Lines 104-105)

**What they do:**
```typescript
SELECT 
  contract_id,
  contract_start_season,
  contract_end_season,
  is_auto_registered
FROM player_seasons / footballplayers
WHERE contract_start_season <= ${seasonId} 
  AND contract_end_season >= ${seasonId}
```

**Impact:** 🟢 **LOW** - Query historical contract data
**Action Needed:** ✅ **KEEP** (for historical data)

---

### 5. **Football Players API** - Returns Contract Fields
**Location:** `app/api/football-players/route.ts`

**What it does (Lines 29, 50, 67, 84):**
```typescript
SELECT 
  contract_id, contract_start_season, contract_end_season, contract_length,
  status, is_auto_registered
FROM footballplayers
```

**Impact:** 🟢 **LOW** - Returns existing data
**Action Needed:** ✅ **KEEP** (data retrieval only)

---

### 6. **Transfer History API** - Records Contract Info
**Location:** `app/api/transfers/history/route.ts`

**What it does (Lines 100-101):**
```typescript
// Records original contract info in transfer history
original_contract_start: data.original_contract_start,
original_contract_end: data.original_contract_end,
```

**Impact:** 🟢 **LOW** - Historical record keeping
**Action Needed:** ✅ **KEEP** (audit trail)

---

## 📊 Summary by Action Priority

### 🔴 MUST REMOVE (Creates Multi-Season):
| API | File | Action | Impact |
|-----|------|--------|--------|
| Email Request Approval | telegram/email-requests/[id]/route.ts | ❌ Remove next season creation | CRITICAL |

### 🟡 SHOULD UPDATE (Contract Length):
| API | File | Action | Impact |
|-----|------|--------|--------|
| Bulk Contract Assignment | contracts/assign-bulk/route.ts | ⚠️ Change to single-season | MEDIUM |

### 🟢 KEEP AS-IS (Query Only):
| API | Files | Reason |
|-----|-------|--------|
| Stats/Players | stats/players/route.ts | Reads historical data |
| Team Players | teams/[id]/real-players/route.ts | Query existing records |
| Team Data | team/[teamId]/route.ts | Display contract info |
| Football Players | football-players/route.ts | Data retrieval |
| Transfer History | transfers/history/route.ts | Audit trail |

---

## 🎯 Critical Changes Needed

### 1. Email Request Approval API (CRITICAL)
**File:** `app/api/telegram/email-requests/[id]/route.ts`

**Current Logic:**
```typescript
// Creates CURRENT season registration
INSERT INTO player_seasons (contract_length = 2) ...

// Creates NEXT season registration (auto-registered)
INSERT INTO player_seasons (is_auto_registered = true) ...
```

**Required Change:**
```typescript
// Create ONLY CURRENT season registration
INSERT INTO player_seasons (
  contract_length = 1,  // Changed from 2
  is_auto_registered = false,
  contract_start_season = ${requestData.season_id},
  contract_end_season = ${requestData.season_id},  // Same season
  ...
)

// REMOVE: Second INSERT for next season
```

**Impact:**
- ✅ No auto-registration for next season
- ✅ Single-season contract only
- ✅ Database reflects single-season model

---

### 2. Bulk Contract Assignment API
**File:** `app/api/contracts/assign-bulk/route.ts`

**Current Logic:**
```typescript
contract_length: 2,
contract_end_season: endSeason,  // Different from start
is_auto_registered: true,
```

**Required Change:**
```typescript
contract_length: 1,  // Changed from 2
contract_end_season: startSeason,  // Same as start
is_auto_registered: false,  // No auto-registration
```

---

## 🔍 Database Impact

### Current Database State (2-Season):
```sql
-- Player registration creates TWO records:

-- Record 1: Current season
player_seasons:
  id: "PLAYER123_SEASON16"
  season_id: "SEASON16"
  contract_start_season: "SEASON16"
  contract_end_season: "SEASON17"
  contract_length: 2
  is_auto_registered: false

-- Record 2: Next season (auto-registered)
player_seasons:
  id: "PLAYER123_SEASON17"
  season_id: "SEASON17"
  contract_start_season: "SEASON16"
  contract_end_season: "SEASON17"
  contract_length: 2
  is_auto_registered: true  ← AUTO REGISTERED!
```

### Target Database State (Single-Season):
```sql
-- Player registration creates ONE record only:

player_seasons:
  id: "PLAYER123_SEASON16"
  season_id: "SEASON16"
  contract_start_season: "SEASON16"
  contract_end_season: "SEASON16"  ← Same season
  contract_length: 1
  is_auto_registered: false

-- NO second record for next season
```

---

## 🚨 Impact of Current System

### What Happens Now:
1. Committee approves player email request
2. **API creates 2 database records** (current + next season)
3. Next season record has `is_auto_registered = true`
4. When next season starts, player is already registered
5. **2-season contract enforced at database level**

### What Should Happen:
1. Committee approves player email request
2. **API creates 1 database record** (current season only)
3. No auto-registration flag
4. When next season starts, player must register again
5. **Single-season model enforced at database level**

---

## 📋 Implementation Checklist

### Phase 1: Email Request API (CRITICAL)
- [ ] Remove next season calculation (line 69-71)
- [ ] Remove second INSERT for next season (lines 95-115)
- [ ] Change `contract_length` from 2 to 1
- [ ] Set `contract_end_season` to same as `contract_start_season`
- [ ] Remove auto-registration logic

### Phase 2: Bulk Contract API (MEDIUM)
- [ ] Update `contract_length` from 2 to 1
- [ ] Set `contract_end_season` equal to `contract_start_season`
- [ ] Remove `is_auto_registered: true` assignments
- [ ] Update bulk processing logic

### Phase 3: Testing & Verification
- [ ] Test player registration creates single record
- [ ] Verify no next season records created
- [ ] Check `is_auto_registered` is always false
- [ ] Confirm contract_length = 1 in database
- [ ] Test existing historical data still readable

---

## 💡 Important Notes

### Historical Data:
- ✅ **Keep query APIs** - They read historical contract data
- ✅ **Don't break existing records** - Old 2-season contracts remain in DB
- ✅ **New registrations only** - Changes affect new registrations only

### Data Consistency:
- Existing player records with `contract_length = 2` will remain
- New registrations will have `contract_length = 1`
- System can handle both (backward compatible)

### No Breaking Changes:
- Query APIs continue to work
- Historical data preserved
- Frontend already updated (previous work)
- Only creation logic changes

---

## 🎯 Recommendation

**Priority Order:**
1. 🔴 **CRITICAL:** Fix Email Request Approval API (creates auto-registrations)
2. 🟡 **MEDIUM:** Update Bulk Contract API (assigns contracts)
3. 🟢 **LOW:** Keep all query/display APIs as-is

**Estimated Impact:**
- 2 API files need updates
- ~30 lines of code changes
- No breaking changes to existing data
- Full single-season model achieved

---

*Status: Audit Complete - Ready for Implementation*
