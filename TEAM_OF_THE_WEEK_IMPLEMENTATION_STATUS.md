# Team of the Week - Implementation Status

## Overview
Team of the Week (TOW) poster feature to display 11 players selected by admin in a formation layout.

## ✅ COMPLETED

### 1. PosterStudio Updates
- ✅ Added 'team-of-week' theme to THEMES
- ✅ Updated ThemeKey type to include 'team-of-week'
- ✅ Added TeamOfWeekPlayer and updated PlayerAward interfaces
- ✅ Added `getTeamOfWeekAward()` function
- ✅ Updated `availableWeeksFromAwards` to handle TOW
- ✅ Updated `getFilteredPlayers()` to handle TOW
- ✅ Updated filter display UI for TOW (week-based)
- ✅ Updated dropdown options to show TOW weeks
- ✅ Updated PosterSnapshot to accept and render TOW data
- ✅ Fixed TypeScript errors (undefined values)

**File**: `components/PosterStudio.tsx`

### 2. TeamOfWeekDesign Component
- ✅ Created `TeamOfWeekDesign` component in PosterDesigns.tsx
- ✅ Designed formation layout (4-3-3, 4-4-2, 3-5-2)
- ✅ Created PlayerCard sub-component with:
  - Player photo with background removal
  - Jersey number badge
  - Position badge (GK/DEF/MID/FWD)
  - Player name and team name
- ✅ Added gold/navy color scheme matching Player of Week
- ✅ Added season ID borders (right and bottom)
- ✅ Added background text elements
- ✅ Added formation display (Week X • Formation)
- ✅ Grouped players by position (GK, DEF, MID, FWD)
- ✅ Responsive gap spacing between players
- ✅ Gold gradient overlay
- ✅ Logo branding placement

**File**: `components/PosterDesigns.tsx`

### 3. Awards Data Fetching
- ✅ Updated player-stats-by-round page to fetch TOW awards
- ✅ Transform award_type 'TOW' to 'team_of_week'
- ✅ Include players array and formation in transformed data

**File**: `app/dashboard/committee/team-management/player-stats-by-round/page.tsx`

## 🚧 TODO - Admin Interface

### Awards Management Page Updates
**File**: `app/dashboard/committee/awards/page.tsx`

#### Required Changes:

1. **TOW Tab Functionality**
   - Currently has 'TOW' in the AwardTab type
   - Need to add TOW-specific UI in the tab content
   - Show week selector (not round)
   - Add formation selector dropdown

2. **Multi-Player Selection UI**
   ```typescript
   // State needed:
   const [selectedFormation, setSelectedFormation] = useState<'4-3-3' | '4-4-2' | '3-5-2'>('4-3-3');
   const [selectedPlayers, setSelectedPlayers] = useState<{
     gk: string[];
     def: string[];
     mid: string[];
     fwd: string[];
   }>({ gk: [], def: [], mid: [], fwd: [] });
   ```

3. **Player Selection Grid**
   - Fetch all players for the season
   - Filter by position
   - Search by name/team
   - Click to add to formation
   - Visual indicator for selected players

4. **Formation Preview**
   - Show selected players in formation layout
   - Allow removal/reordering
   - Validate 11 players selected

5. **Save TOW Award**
   - POST to `/api/awards` with award_type 'TOW'
   - Include all 11 players with positions
   - Include formation type
   - Include week_number

#### UI Mockup Structure:
```jsx
{activeTab === 'TOW' && (
  <div>
    {/* Week Selector */}
    <select value={currentWeek} onChange={...}>
      {weeks.map(w => <option key={w}>Week {w}</option>)}
    </select>

    {/* Formation Selector */}
    <select value={selectedFormation} onChange={...}>
      <option value="4-3-3">4-3-3</option>
      <option value="4-4-2">4-4-2</option>
      <option value="3-5-2">3-5-2</option>
    </select>

    {/* Formation Builder */}
    <div className="formation-builder">
      {/* GK (1 player) */}
      <div>
        <h3>Goalkeeper (1)</h3>
        {selectedPlayers.gk.map(id => <PlayerChip player={players.find(p => p.id === id)} />)}
        {selectedPlayers.gk.length < 1 && <button>+ Add GK</button>}
      </div>

      {/* DEF (based on formation) */}
      <div>
        <h3>Defenders ({formationDef})</h3>
        {/* Similar structure */}
      </div>

      {/* MID (based on formation) */}
      <div>
        <h3>Midfielders ({formationMid})</h3>
        {/* Similar structure */}
      </div>

      {/* FWD (based on formation) */}
      <div>
        <h3>Forwards ({formationFwd})</h3>
        {/* Similar structure */}
      </div>
    </div>

    {/* Player Selection Grid */}
    <div className="player-grid">
      <input 
        type="text" 
        placeholder="Search players..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <select value={positionFilter} onChange={...}>
        <option value="all">All Positions</option>
        <option value="GK">Goalkeepers</option>
        <option value="DEF">Defenders</option>
        <option value="MID">Midfielders</option>
        <option value="FWD">Forwards</option>
      </select>

      <div className="grid">
        {filteredPlayers.map(player => (
          <div 
            key={player.id} 
            onClick={() => handleAddPlayer(player)}
            className={isSelected(player.id) ? 'selected' : ''}
          >
            <img src={player.photo} alt={player.name} />
            <div>{player.name}</div>
            <div>{player.team}</div>
            <div>{player.position}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Save Button */}
    <button 
      onClick={handleSaveTOW}
      disabled={!isValid()}
    >
      Save Team of the Week
    </button>
  </div>
)}
```

## 🔧 NEXT STEPS

1. **Implement TOW Tab UI in Awards Page**
   - Add formation selector
   - Create multi-player selection grid
   - Add formation builder/preview
   - Add validation logic

2. **Player Position Data**
   - Ensure players have position field (GK/DEF/MID/FWD)
   - If not available, add position assignment in selection UI
   - May need to update player data structure

3. **API Endpoint Updates**
   - Verify `/api/awards` POST handles TOW format
   - Ensure players array is properly stored
   - Test with 11 players + formation

4. **Testing**
   - Test TOW creation in awards page
   - Test TOW display in poster studio
   - Test all formations (4-3-3, 4-4-2, 3-5-2)
   - Test week filtering
   - Test with/without player photos

## Database Schema

### Awards Table Structure for TOW
```typescript
{
  id: string;
  award_type: 'TOW';
  tournament_id: string;
  season_id: string;
  week_number: number;
  formation: '4-3-3' | '4-4-2' | '3-5-2';
  players: Array<{
    player_id: string;
    player_name: string;
    team_name: string;
    position: 'GK' | 'DEF' | 'MID' | 'FWD';
    jersey_number?: number;
    player_photo?: string;
    team_logo?: string;
  }>;
  selected_by: string;
  selected_by_name: string;
  selected_at: timestamp;
  notes?: string;
}
```

## Formation Configurations

### 4-3-3 (Default)
- 1 GK
- 4 DEF
- 3 MID
- 3 FWD

### 4-4-2
- 1 GK
- 4 DEF
- 4 MID
- 2 FWD

### 3-5-2
- 1 GK
- 3 DEF
- 5 MID
- 2 FWD

## Visual Design Notes

- **Theme**: Gold (#d4a830) and Navy (#1a1a2e)
- **Layout**: 800x1000px poster
- **Player Cards**: 100x120px with 12px border radius
- **Spacing**: 40px gap between player cards
- **Typography**: Anton (italic) for headers, DM Sans for names
- **Background**: Gradient from navy to darker navy
- **Season IDs**: Right border (vertical) and bottom border (horizontal)
- **Logo**: Bottom left corner at 48px

## Files Modified

1. ✅ `components/PosterStudio.tsx`
2. ✅ `components/PosterDesigns.tsx`
3. ✅ `app/dashboard/committee/team-management/player-stats-by-round/page.tsx`
4. 🚧 `app/dashboard/committee/awards/page.tsx` (TODO)

## Success Criteria

- [ ] Admin can select 11 players for Team of the Week
- [ ] Admin can choose formation (4-3-3, 4-4-2, 3-5-2)
- [ ] Admin can assign players to positions
- [ ] TOW award is saved to database
- [ ] TOW poster displays correctly in Poster Studio
- [ ] Week filter shows only weeks with TOW awards
- [ ] All player photos load with background removal
- [ ] Formation layout matches selected formation
- [ ] Download and share work correctly
