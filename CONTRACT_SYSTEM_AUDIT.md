# Contract System Audit & Removal Plan

## Overview
The current system implements a **2-season contract** model for both teams and players. Since you're moving to a **single-season** model, all contract-related displays and logic should be removed.

---

## 🔍 Contract References Found

### 1. **Dedicated Contracts Page** ❌ REMOVE ENTIRE PAGE
**Location:** `app/dashboard/team/contracts/page.tsx`

**What it shows:**
- Team contract status (2-season commitment)
- Contract period display (S1 - S2)
- Real player contracts table with:
  - Contract Period column (start-end seasons)
  - "2 Seasons" label
  - Contract status badges (Active, Future Auto)
  - Description: "2-season commitments"
  - Info banner: "All real player contracts are 2-season commitments"

**Recommendation:** ❌ **DELETE THIS ENTIRE PAGE** - Not needed for single-season model

---

### 2. **ContractInfo Component** ⚠️ REMOVE OR SIMPLIFY
**Location:** `components/ContractInfo.tsx`

**What it shows:**
- "2-Season Contract Active" badge
- "Auto-registered (2-season contract)" badge  
- Contract period (S1 - S2)
- Penalty information for contract breach
- Skipped seasons warning

**Recommendation:** 
- **Option A:** ❌ Delete entirely (if penalties not needed)
- **Option B:** ⚠️ Keep only penalty/budget info, remove all contract period references

---

### 3. **Dashboard - Contract Section** ❌ REMOVE
**Location:** `app/dashboard/team/RegisteredTeamDashboard.tsx`

**References:**
- Line 10: `import ContractInfo` component
- Line 44-46: Contract fields in interface (`contract_id`, `contract_start_season`, `contract_end_season`)
- Line 770-782: "Contract Info Banner" section displaying ContractInfo
- Line 991: Navigation link to "📄 Contracts" page
- Line 1537-1539: Player card showing "Contract: S1-S2"

**Recommendation:** ❌ Remove all these sections

---

### 4. **Player Detail Page - Contract History Tab** ❌ REMOVE
**Location:** `app/dashboard/team/player/[id]/page.tsx`

**What it shows:**
- "Contract History" tab button (line 493)
- Entire contract timeline section (lines 977-1080+)
- Contract cards showing:
  - Team names and contract status
  - Release/Swap/Takeover indicators
  - Contract period for each team

**Recommendation:** ❌ Remove entire "Contract History" tab

---

### 5. **Budget Planner Info** ✅ SIMPLIFY
**Location:** `app/dashboard/team/budget-planner/page.tsx`

**Reference:**
- Line 518: `<li>• <strong>Contract:</strong> 2 seasons for both player types</li>`

**Recommendation:** ✅ Remove this line (already has no contracts in single-season)

---

### 6. **Squad Page** ⚠️ CHECK
**Location:** `app/dashboard/team/squad/[teamId]/page.tsx`

**References:**
- Lines 21-23: Contract fields in interface
- Lines 175-177: Contract data assignments

**Recommendation:** ⚠️ Remove contract fields from interface

---

### 7. **All Teams Page** ⚠️ CHECK
**Location:** `app/dashboard/team/all-teams/page.tsx`

**References:**
- Lines 28-29: Contract fields in interface
- Lines 219-220: Contract data assignments
- Lines 447-448: ContractInfo component usage

**Recommendation:** ⚠️ Remove contract references

---

### 8. **Committee Team Members** ⚠️ CHECK
**Location:** `app/dashboard/committee/team-management/team-members/page.tsx`

**References:**
- Line 1030: Shows "Auto (S1)" for auto-registered players
- Line 1034: Shows "2-Season Contract" badge
- Line 1039: Shows contract period "S1 - S2"

**Recommendation:** ⚠️ Remove contract period displays

---

## 📊 Summary of Changes Needed

### HIGH PRIORITY - User-Facing Pages
| File | Action | Impact |
|------|--------|--------|
| `contracts/page.tsx` | ❌ DELETE ENTIRE FILE | High - dedicated contract page |
| `ContractInfo.tsx` | ❌ DELETE or ⚠️ SIMPLIFY | High - used in multiple places |
| `RegisteredTeamDashboard.tsx` | ❌ REMOVE sections | High - main dashboard |
| `player/[id]/page.tsx` | ❌ REMOVE tab | Medium - player detail |
| `budget-planner/page.tsx` | ✅ REMOVE 1 line | Low - just info text |

### MEDIUM PRIORITY - Support Pages
| File | Action | Impact |
|------|--------|--------|
| `squad/[teamId]/page.tsx` | ⚠️ REMOVE fields | Medium - team view |
| `all-teams/page.tsx` | ⚠️ REMOVE sections | Medium - team list |
| `team-members/page.tsx` | ⚠️ REMOVE badges | Low - committee view |

---

## 🎯 Recommended Removal Order

### Phase 1: Remove Navigation & Pages
1. ✅ Remove "Contracts" link from dashboard (RegisteredTeamDashboard.tsx line 991)
2. ❌ Delete entire `contracts/page.tsx` file
3. ❌ Remove "Contract History" tab from player detail page

### Phase 2: Remove Contract Displays
4. ❌ Remove ContractInfo banner from dashboard (RegisteredTeamDashboard.tsx lines 770-782)
5. ❌ Remove contract period from player cards (RegisteredTeamDashboard.tsx lines 1537-1539)
6. ⚠️ Remove contract badges from committee team members page
7. ✅ Remove "2 seasons" text from budget planner

### Phase 3: Clean Up Components & Interfaces
8. ❌ Delete or simplify `ContractInfo.tsx` component
9. ⚠️ Remove contract fields from all interfaces
10. ⚠️ Remove contract data assignments from all pages

### Phase 4: Verify & Test
11. Search for remaining "contract" references
12. Check for broken imports
13. Test all pages that were modified

---

## 🔧 Implementation Strategy

### Option A: Complete Removal (Recommended)
**Best for:** Clean single-season system with no contract tracking

**Remove:**
- All contract pages and tabs
- All contract displays and badges
- ContractInfo component entirely
- All contract-related interfaces
- All navigation links to contracts

**Result:** Zero contract references anywhere

---

### Option B: Keep Penalties Only
**Best for:** If you need to track team penalties from previous seasons

**Remove:**
- Contract pages and tabs
- Contract period displays (S1-S2)
- "2-season" language

**Keep:**
- Budget penalty logic
- Skipped season tracking
- Simplified ContractInfo showing only penalties

**Result:** Minimal contract tracking for penalties only

---

## 📝 Files to Modify/Delete

### DELETE Entirely (2 files)
```
app/dashboard/team/contracts/page.tsx (delete entire file)
components/ContractInfo.tsx (delete or heavily simplify)
```

### MODIFY - Remove Contract Sections (6 files)
```
app/dashboard/team/RegisteredTeamDashboard.tsx
app/dashboard/team/player/[id]/page.tsx
app/dashboard/team/budget-planner/page.tsx
app/dashboard/team/squad/[teamId]/page.tsx
app/dashboard/team/all-teams/page.tsx
app/dashboard/committee/team-management/team-members/page.tsx
```

---

## ⚠️ Important Considerations

### Database Fields
The following database fields may still exist but won't be displayed:
- `contract_id`
- `contract_start_season`
- `contract_end_season`
- `contract_length`
- `is_auto_registered`

**Decision needed:** 
- Keep in database for historical data?
- Remove from database schema?
- Just hide from UI? (easiest)

### Navigation Links
Current dashboard has "📄 Contracts" link that needs removal.

### Team Registration
Contract logic may affect team registration flow - verify this doesn't break registration.

---

## 🚀 Next Steps

**Ready to proceed with contract removal?**

1. Confirm removal strategy (Option A or B)
2. Start with Phase 1 (navigation & pages)
3. Progress through phases 2-4
4. Verify no broken references
5. Test all affected pages

**Estimated changes:** 8 files, ~500+ lines of contract-related code

---

*Status: Audit Complete - Awaiting Confirmation to Proceed*
