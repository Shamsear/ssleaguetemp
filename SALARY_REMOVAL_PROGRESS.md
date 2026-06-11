# Salary Removal Progress

## ✅ COMPLETED - Team Side

### 1. RegisteredTeamDashboard.tsx
- ✅ Removed `salaryPerMatch` from Player interface
- ✅ Removed salary display from player cards grid

### 2. players-database/page.tsx  
- ✅ Removed `salary_per_match` from TournamentPlayer interface
- ✅ Removed "Salary/Match" column header from desktop table
- ✅ Removed salary display from mobile card view
- ✅ Removed salary data cell from desktop table rows

### 3. contracts/page.tsx
- ✅ Removed `salary_per_match` from PlayerData interface
- ✅ Removed salary display under auction value
- ✅ Removed `salary_per_match` from all data assignments (2 locations)

### 4. player-stats/page.tsx
- ✅ Removed `salary_per_match` from PlayerStat interface

## 🔄 IN PROGRESS - Committee Admin Side

### Files needing updates:
1. `app/dashboard/committee/real-players/page.tsx` - MAJOR FILE (many references)
2. `app/dashboard/committee/real-players/[id]/page.tsx` - Player detail page
3. `app/dashboard/committee/player-stats/page.tsx` - Stats management

## ⏳ REMAINING - Team Side (Small Updates)

### Files with minor references:
1. `app/dashboard/team/real-players-planner/page.tsx` - Planning tool
2. `app/dashboard/team/RegisteredTeamDashboard-old.tsx` - Old version (may be deprecated)
3. `app/dashboard/team/transactions/page.tsx` - Just icon reference
4. `app/dashboard/team/fixture/[fixtureId]/page.tsx` - Just tooltip mention
5. `app/dashboard/team/budget-planner/page.tsx` - Just comment

## 📋 Strategy for Large Files

For `app/dashboard/committee/real-players/page.tsx` (largest file with ~15 salary references):

**Changes needed:**
1. Remove `import { calculateRealPlayerSalary } from '@/lib/salary-utils';`
2. Remove `salaryPerMatch: number;` from AssignedPlayer interface
3. Remove salary calculations in data fetching
4. Remove salary from player assignments
5. Remove salary display in quick assign section
6. Remove salary display in assigned players list
7. Remove salary display in edit modal

**Approach:** Use editCode tool for complete function/section replacements

---

## Next Steps

1. Complete committee admin pages (priority)
2. Clean up remaining team side files
3. Test all pages to ensure no errors
4. Update any remaining TypeScript types
