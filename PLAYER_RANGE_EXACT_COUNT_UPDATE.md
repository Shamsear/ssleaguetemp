# Player Range Update - Exact Count Requirement

## Overview
Updated the committee real players page to enforce exactly 5 players per team instead of allowing a range of 5-7 players.

## Changes Made

### 1. Logic Updates
- **Before**: `maxPlayers = currentSeason?.max_real_players || 7`
- **After**: `maxPlayers = minPlayers` (max equals min for exact count)
- **Impact**: Teams must have exactly the minimum number of players

### 2. Validation Updates
- **Before**: `isValidCount = playerCount <= maxPlayers` (only checked maximum)
- **After**: `isValidCount = playerCount === maxPlayers` (must be exactly the required count)
- **Impact**: Teams with too few OR too many players are now invalid

### 3. UI Text Updates

#### Header Display
- **Before**: "5 - 7" (showing range)
- **After**: "5 exactly" (showing exact requirement)

#### Team Selection Dropdown
- **Before**: "- 2 slots" / "- FULL"
- **After**: "- 2 needed" / "- COMPLETE"

#### Add Player Section
- **Before**: "Maximum 7 players reached"
- **After**: "Need exactly 5 players (currently X)"

#### Save Button Messages
- **Before**: "Remove 2 players" (only handled excess)
- **After**: 
  - Too many: "Must have exactly 5 players (remove 2)"
  - Too few: "Must have exactly 5 players (add 2)"

### 4. Error Messages
- **Before**: "can have maximum 7 players"
- **After**: "must have exactly 5 players"

### 5. Color Coding Updates
- **Before**: Red text only when `playerCount > maxPlayers`
- **After**: Red text when `playerCount !== maxPlayers` (both too few and too many)

## Technical Implementation

### Key Functions Updated
1. `saveTeam()` - Updated validation message
2. Team display logic - Updated color coding and text
3. Quick assign dropdown - Updated slot terminology
4. Add player section - Updated availability check

### Validation Flow
1. **Exact Count Check**: `playerCount === maxPlayers`
2. **Budget Check**: `displayBudget >= 0`
3. **Save Enabled**: Only when both conditions are met

## Benefits

1. **Clear Requirements**: Teams know they need exactly 5 players
2. **Consistent Enforcement**: No ambiguity about player counts
3. **Better UX**: Clear messaging about what's needed
4. **Simplified Logic**: Single target number instead of range

## Files Modified
- `app/dashboard/committee/real-players/page.tsx` - Complete validation and UI updates

## Status
✅ **COMPLETE** - Player range changed from 5-7 to exactly 5:
- ✅ Logic updated to make max = min
- ✅ Validation checks for exact count
- ✅ UI text updated throughout
- ✅ Error messages clarified
- ✅ Color coding updated for both directions

## Testing Recommendations
1. Test with teams having < 5 players (should show "add X" message)
2. Test with teams having > 5 players (should show "remove X" message)  
3. Test with teams having exactly 5 players (should allow saving)
4. Verify quick assign dropdown shows correct "needed" counts
5. Check that save button is disabled unless exactly 5 players