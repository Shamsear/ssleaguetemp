# Salary Display Audit - Team & Committee Admin Sides

## 📊 Executive Summary

**Status:** ✅ Salary is displayed in multiple places across both team and committee admin interfaces

**Key Finding:** The `salary_per_match` field is calculated and shown in several pages, even though you mentioned "no salary" in requirements.

---

## 🏢 TEAM SIDE - Salary Displays

### 1. **Team Dashboard** (Main Dashboard)
**Files:**
- `app/dashboard/team/RegisteredTeamDashboard.tsx` (current)
- `app/dashboard/team/RegisteredTeamDashboard-old.tsx` (old version)

**Display:**
```tsx
<div className="text-gray-600">Salary/Match</div>
<div className="font-bold text-gray-900">${player.salaryPerMatch.toLocaleString()}</div>
```

**Location:** Player cards in squad section

---

### 2. **Players Database Page**
**File:** `app/dashboard/team/players-database/page.tsx`

**Displays:**
- Mobile view: "Salary per Match" label with value
- Desktop table: "Salary/Match" column
- Shows: `₹{(Number(player.salary_per_match) || 0).toFixed(2)}`

**Location:** `/dashboard/team/players-database`

---

### 3. **Real Players Planner Page**
**File:** `app/dashboard/team/real-players-planner/page.tsx`

**Displays:**
- Summary card: "Salary" - Total salary per match
- Per player: "💰 Per Match Salary" with value
- Per player: "📊 Total Salary (X matches)" with season total
- Formula: `salaryPerMatch = (bidAmount / 100) × finalStars / 10`

**Location:** `/dashboard/team/real-players-planner`

**Calculations:**
- Per match salary
- Total season salary (salary × matches)
- Aggregate totals across all planned players

---

### 4. **Contracts Page**
**File:** `app/dashboard/team/contracts/page.tsx`

**Display:**
```tsx
{firstDoc.salary_per_match && (
  <div className="text-gray-500 text-xs">${firstDoc.salary_per_match}/match</div>
)}
```

**Location:** `/dashboard/team/contracts`

---

### 5. **Player Stats Page**
**File:** `app/dashboard/team/player-stats/page.tsx`

**Data:** Fetches `salary_per_match` from database

**Location:** `/dashboard/team/player-stats`

---

### 6. **Transactions Page**
**File:** `app/dashboard/team/transactions/page.tsx`

**Display:** Transaction type icon for salary transactions
```tsx
case 'salary': return '💰';
```

**Location:** `/dashboard/team/transactions`

---

### 7. **Fixture Detail Page**
**File:** `app/dashboard/team/fixture/[fixtureId]/page.tsx`

**Mentions:**
- NULL matchup tooltip: "Won't count in player stats but will count for salary & team stats"
- `is_null` field affects salary calculations

**Location:** `/dashboard/team/fixture/[fixtureId]`

---

### 8. **Budget Planner Page**
**File:** `app/dashboard/team/budget-planner/page.tsx`

**Mentions:**
- `customMatches` field: "Custom match count for salary calculation"
- `MATCH_MILESTONES`: [1, 5, 10, 15, 20, 25, 30, 38] for salary calculations

**Location:** `/dashboard/team/budget-planner`

---

## 🎯 COMMITTEE ADMIN SIDE - Salary Displays

### 1. **Real Players Management Page**
**File:** `app/dashboard/committee/real-players/page.tsx`

**Displays:**
- Quick assign section: Shows calculated salary when entering auction value
  - `💰{calculateRealPlayerSalary(parseInt(quickAssignAuction) || 0, 5).toFixed(2)}/match`
- Assigned players list: Shows salary per match for each player
  - `💰{player.salaryPerMatch.toFixed(2)}/match`
- Edit mode: Shows updated salary when auction value changes

**Calculation:**
```tsx
import { calculateRealPlayerSalary } from '@/lib/salary-utils';
const salaryPerMatch = calculateRealPlayerSalary(auctionValue, 5);
```

**Location:** `/dashboard/committee/real-players`

---

### 2. **Real Player Detail Page**
**File:** `app/dashboard/committee/real-players/[id]/page.tsx`

**Display:**
```tsx
{playerData.salary_per_match !== undefined && (
  <div className="glass rounded-xl p-4 shadow-lg border border-white/30">
    <div className="text-xs text-gray-500 mb-1">Salary/Match</div>
    <div className="text-2xl font-bold text-blue-600">
      ${playerData.salary_per_match?.toLocaleString() ?? '0'}
    </div>
  </div>
)}
```

**Location:** `/dashboard/committee/real-players/[id]`

---

### 3. **Player Stats Management Page**
**File:** `app/dashboard/committee/player-stats/page.tsx`

**Displays:**
- Salary predictions when updating stats
- Shows old salary → new salary when star rating changes
- Calculation formula: `(auctionValue / 100) × starRating / 10`

**Display:**
```tsx
`${update.player_name}: ${result.oldStarRating}⭐ → ${result.newStarRating}⭐ 
(Salary: ${result.oldSalary} → ${result.newSalary})`
```

**Function:**
```tsx
const calculateSalary = (auctionValue: number, starRating: number): number => {
  return (auctionValue / 100) * starRating / 10;
};
```

**Location:** `/dashboard/committee/player-stats`

---

## 💾 Database Storage

### Tables with Salary Fields:

#### `player_seasons` table:
```sql
salary_per_match DECIMAL(10, 2) DEFAULT 0.00
```

#### Query Example:
```sql
SELECT 
  player_id,
  player_name,
  auction_value,
  salary_per_match,
  star_rating
FROM player_seasons
WHERE season_id = 'SSPSLS16';
```

---

## 🔧 Salary Calculation Logic

### Real Players:
**File:** `lib/salary-utils.ts`

**Formula:**
```typescript
SALARY_RATES = {
  real: 0.007,      // 0.7% of auction value
  football: 0.003   // 0.3% of auction value
}

calculateRealPlayerSalary(auctionValue, starRating) {
  return auctionValue * 0.007; // For real players
}
```

**Example:**
- Auction value: £390
- Real player salary: £390 × 0.007 = £2.73/match

---

### Alternative Formula (Used in some pages):
```typescript
salary = (auctionValue / 100) × starRating / 10
```

**Example:**
- Auction value: £390
- Star rating: 5
- Salary: (390 / 100) × 5 / 10 = 1.95/match

---

## 📋 Summary Table

| Page/Feature | Team Side | Committee Side | Display Type |
|--------------|-----------|----------------|--------------|
| **Main Dashboard** | ✅ Shows | ❌ N/A | Per player card |
| **Players Database** | ✅ Shows | ❌ N/A | Table column |
| **Real Players Management** | ❌ N/A | ✅ Shows | Multiple locations |
| **Real Player Detail** | ❌ N/A | ✅ Shows | Stats card |
| **Player Stats** | ✅ Fetches | ✅ Shows + Calculates | Predictions |
| **Contracts Page** | ✅ Shows | ❌ N/A | Under auction value |
| **Planner Pages** | ✅ Shows | ❌ N/A | Summary totals |
| **Transactions** | ✅ Icon only | ❌ N/A | Transaction type |
| **Fixtures** | ✅ Mentions | ❌ N/A | Tooltip/logic |

---

## 🎯 Detailed Locations List

### Team Side:
1. `/dashboard/team` - Main dashboard (squad section)
2. `/dashboard/team/players-database` - Full table
3. `/dashboard/team/real-players-planner` - Planning tool
4. `/dashboard/team/contracts` - Contract details
5. `/dashboard/team/player-stats` - Stats page
6. `/dashboard/team/transactions` - Transaction history
7. `/dashboard/team/fixture/[fixtureId]` - Fixture logic
8. `/dashboard/team/budget-planner` - Budget planning

### Committee Admin Side:
1. `/dashboard/committee/real-players` - Player management
2. `/dashboard/committee/real-players/[id]` - Player detail
3. `/dashboard/committee/player-stats` - Stats management

---

## 🔴 CRITICAL FINDING

**Your Requirement:** "No salary, no contracts"

**Current Reality:** Salary (`salary_per_match`) is:
1. ✅ Stored in database (`player_seasons` table)
2. ✅ Calculated automatically from auction values
3. ✅ Displayed in **at least 11 different pages**
4. ✅ Used in transaction tracking
5. ✅ Used in player stat calculations
6. ✅ Integrated into fixture logic

---

## 💡 Recommendations

### Option 1: Keep Salary (Simplest)
**Action:** No changes needed
**Reason:** Salary is deeply integrated and provides useful information

### Option 2: Hide Salary Display (Medium Effort)
**Action:** Remove salary displays from UI, keep in database
**Files to modify:** ~11 pages listed above
**Keep:** Database fields for historical data
**Remove:** All UI displays of `salary_per_match`

### Option 3: Complete Salary Removal (High Effort)
**Action:** Remove from both UI and logic
**Impact:**
- Modify ~11 page files
- Update calculation functions
- Remove from database queries
- Update transaction types
- Modify fixture logic
- Remove from player stats calculations

**Risk:** May break existing features that depend on salary

---

## 📊 Impact Analysis

### If You Remove Salary:

**Pages that need updates:**
- ✅ 8 team-side pages
- ✅ 3 committee-side pages
- ✅ Transaction system
- ✅ Player stats system
- ✅ Fixture system
- ✅ Database queries

**Functions that need updates:**
- `calculateRealPlayerSalary()` in `lib/salary-utils.ts`
- `calculateSalary()` in multiple pages
- Player stat update logic
- Transaction processing

**Database impact:**
- `salary_per_match` column in `player_seasons` table
- Historical data would remain but not be used

---

## ❓ Question for You

**You said "no salary" but the system has extensive salary integration. Do you want to:**

**A)** Keep salary as-is (it's useful and already implemented)

**B)** Hide salary from UI but keep calculations in background

**C)** Completely remove salary from system (requires significant work)

**D)** Something else?

---

## 📁 Files Reference

### Salary Calculation Files:
- `lib/salary-utils.ts` - Main salary calculation logic
- `lib/player-transfers-v2-utils.ts` - Transfer salary calculations

### Team Side Files (8):
1. `app/dashboard/team/RegisteredTeamDashboard.tsx`
2. `app/dashboard/team/players-database/page.tsx`
3. `app/dashboard/team/real-players-planner/page.tsx`
4. `app/dashboard/team/contracts/page.tsx`
5. `app/dashboard/team/player-stats/page.tsx`
6. `app/dashboard/team/transactions/page.tsx`
7. `app/dashboard/team/fixture/[fixtureId]/page.tsx`
8. `app/dashboard/team/budget-planner/page.tsx`

### Committee Admin Files (3):
1. `app/dashboard/committee/real-players/page.tsx`
2. `app/dashboard/committee/real-players/[id]/page.tsx`
3. `app/dashboard/committee/player-stats/page.tsx`

### Test Files:
- `tests/player-transfers-v2-utils.test.ts`
- `tests/player-transfers-v2-rollback.test.ts`

---

**Status:** ⚠️ AWAITING DECISION - Salary is extensively used throughout the system despite "no salary" requirement
