# Committee Dashboard Pages - Contract Display Audit

## Overview
Audit of committee dashboard pages to identify any contract-related displays that should be removed or updated after contract removal from finalization.

## Pages Checked

### ✅ Bulk Rounds Management
**File:** `app/dashboard/committee/bulk-rounds/[id]/page.tsx`
**Status:** No contract display
**Notes:** Page focuses on bid management, player allocation, and tiebreakers. No contract fields displayed.

### ✅ Tiebreakers Management  
**File:** `app/dashboard/committee/tiebreakers/page.tsx`
**Status:** No contract display
**Notes:** Page shows tiebreaker status, bids, and resolution. No contract information displayed.

### ✅ Rounds Management
**File:** `app/dashboard/committee/rounds/[id]/page.tsx`
**Status:** No contract display
**Notes:** Uses auto-finalize hook but doesn't display contract information.

### ⚠️ Team Members Page
**File:** `app/dashboard/committee/team-management/team-members/page.tsx`
**Status:** DISPLAYS CONTRACT INFO
**Lines:** 1022-1045
**Issue:** Shows contract_id, contract_start_season, contract_end_season for players

```typescript
{(player as any).contract_id ? (
  <div className="text-sm">
    <div className="flex items-center">
      {(player as any).contract_id.startsWith('auto_') ? (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          Auto (S{(player as any).contract_start_season?.replace(/\D/g, '')})
        </span>
      ) : (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          2-Season Contract
        </span>
      )}
    </div>
    <div className="text-xs text-gray-500 mt-1">
      S{(player as any).contract_start_season?.replace(/\D/g, '')} - S{(player as any).contract_end_season?.replace(/\D/g, '')}
    </div>
  </div>
) : (
  <span className="text-gray-400 italic text-sm">No contract</span>
)}
```

**Recommendation:** Remove contract column or update to show "Single Season" for all players

### ⚠️ Teams Page (Old)
**File:** `app/dashboard/committee/teams/page_old.tsx`
**Status:** DISPLAYS CONTRACT INFO
**Lines:** 139, 180-189
**Issue:** Has contract column and uses ContractInfo component

**Recommendation:** Remove contract column (file appears to be old version)

### ✅ Teams Page (Current)
**File:** `app/dashboard/committee/teams/page.tsx`
**Status:** Contract display removed
**Line:** 372
**Notes:** Has comment "Contract Info - Removed for single season"

### ⚠️ Real Players Detail Page
**File:** `app/dashboard/committee/real-players/[id]/page.tsx`
**Status:** DISPLAYS CONTRACT INFO
**Lines:** 223-240
**Issue:** Shows contract_start_season and contract_end_season if present

```typescript
{/* Contract Info */}
{(playerData.contract_start_season || playerData.contract_end_season) && (
  <div className="glass rounded-xl p-4 shadow-lg border border-white/30 mb-6">
    <h2 className="text-lg font-bold text-gray-800 mb-3">Contract Information</h2>
    <div className="space-y-2">
      {playerData.contract_start_season && (
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Start Season:</span>
          <span className="font-semibold text-gray-800">{playerData.contract_start_season}</span>
        </div>
      )}
      {playerData.contract_end_season && (
        <div className="flex items-center justify-between">
          <span className="text-gray-600">End Season:</span>
          <span className="font-semibold text-gray-800">{playerData.contract_end_season}</span>
        </div>
      )}
    </div>
  </div>
)}
```

**Recommendation:** Remove contract info section or hide for auction-acquired players

### ⚠️ Bulk Release Form
**File:** `app/dashboard/committee/players/transfers/BulkReleaseFootballPlayerForm.tsx`
**Status:** DISPLAYS CONTRACT INFO
**Lines:** 16-17, 76-77, 210, 479
**Issue:** Shows contract_start_season and contract_end_season in player list and release summary

**Recommendation:** This is for player release functionality - may still need contract info for release calculations. Review if contract fields are needed for release logic.

## Summary

### Pages That Need Updates

1. **Team Members Page** - Remove or update contract column
2. **Real Players Detail Page** - Remove contract info section for auction players
3. **Bulk Release Form** - Review if contract fields needed for release logic

### Pages Already Clean

1. Bulk Rounds Management ✅
2. Tiebreakers Management ✅
3. Rounds Management ✅
4. Teams Page (current) ✅
5. Teams Detail Page ✅

## Recommendations

### High Priority
- Update Team Members page to remove contract display
- Update Real Players detail page to hide contract section

### Medium Priority  
- Review Bulk Release form - determine if contract fields needed for release calculations
- Remove old teams page file if no longer used

### Low Priority
- Add consistent messaging across all pages: "Single Season Model - No Contracts"
- Update any remaining references to multi-season contracts in UI text

## Next Steps

1. Remove contract display from Team Members page
2. Remove contract display from Real Players detail page
3. Test all committee pages to ensure no contract references remain
4. Update any help text or tooltips that mention contracts
