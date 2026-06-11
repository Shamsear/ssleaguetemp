# Team of the Week - Feature Specification

## Overview
Create a "Team of the Week" poster that displays multiple players (starting 11) selected by the admin. Similar to Player of the Week but shows a team formation with player photos.

## Design Requirements

### Layout (800x1000px)
```
┌─────────────────────────────────────┐
│     TEAM OF THE WEEK - WEEK 5       │ ← Header
├─────────────────────────────────────┤
│                                     │
│         ⚽  [GK Photo]  ⚽           │ ← Goalkeeper
│                                     │
│    [DEF]  [DEF]  [DEF]  [DEF]      │ ← Defenders (4)
│                                     │
│       [MID]  [MID]  [MID]          │ ← Midfielders (3)
│                                     │
│         [FWD]  [FWD]  [FWD]        │ ← Forwards (3)
│                                     │
│         Season ID borders           │
└─────────────────────────────────────┘
```

### Formation Options
- **4-3-3**: 1 GK, 4 DEF, 3 MID, 3 FWD (default)
- **4-4-2**: 1 GK, 4 DEF, 4 MID, 2 FWD
- **3-5-2**: 1 GK, 3 DEF, 5 MID, 2 FWD
- Admin selects formation when creating the award

### Player Cards
Each player card shows:
- Player photo (small, with background removal)
- Player name (below photo)
- Jersey number (top right corner of photo)
- Position badge (GK/DEF/MID/FWD)

### Visual Style
- Similar to Player of the Week (navy blue/gold theme)
- Formation layout (tactical view)
- Gold accents for selected players
- Season ID borders on right and bottom
- Background text: "TEAM", "WEEK", "FORMATION"

## Data Structure

### Team Award in Database
```typescript
interface TeamOfWeekAward {
  id: string;
  award_type: 'TOW';
  week_number: number;
  season_id: string;
  tournament_id: string;
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
}
```

## Admin Interface Changes

### Awards Page - TOW Tab
1. **Week Selector**: Choose week number
2. **Formation Selector**: Dropdown (4-3-3, 4-4-2, 3-5-2)
3. **Player Selection Grid**:
   - Show all players from all teams
   - Filter by position
   - Search by name/team
   - Click to add to formation
4. **Formation Preview**: Show selected players in formation
5. **Position Assignment**: Drag & drop or click to assign position
6. **Save Button**: Save the team award

### UI Mockup
```
┌─────────────────────────────────────────────┐
│  Team of the Week - Week 5                  │
├─────────────────────────────────────────────┤
│  Formation: [4-3-3 ▼]    [Save TOW]        │
├─────────────────────────────────────────────┤
│  Selected Players:                          │
│  ┌───────────────────────────────────────┐  │
│  │         GK: [Select Player ▼]        │  │
│  │  DEF: [Player 1] [Player 2] [+] [+]  │  │
│  │  MID: [Player 3] [Player 4] [+]      │  │
│  │  FWD: [Player 5] [Player 6] [+]      │  │
│  └───────────────────────────────────────┘  │
├─────────────────────────────────────────────┤
│  Available Players:                         │
│  🔍 Search: [_______]  Position: [All ▼]   │
│  ┌─────┬─────┬─────┬─────┐                 │
│  │ P1  │ P2  │ P3  │ P4  │                 │
│  │ GK  │ DEF │ MID │ FWD │                 │
│  └─────┴─────┴─────┴─────┘                 │
└─────────────────────────────────────────────┘
```

## Implementation Steps

### Phase 1: Database & API
1. ✅ Already exists: `award_type: 'TOW'` in awards table
2. Update awards API to handle TOW with multiple players
3. Create `/api/awards/team-of-week` endpoint
   - GET: Fetch TOW for a specific week
   - POST: Save TOW with 11 players
   - DELETE: Remove TOW

### Phase 2: Poster Design Component
1. Create `TeamOfWeekDesign` component in `PosterDesigns.tsx`
2. Implement formation layouts (4-3-3, 4-4-2, 3-5-2)
3. Player card component with photo, name, position
4. Add to `SinglePlayerDesign` routing
5. Handle in PosterStudio

### Phase 3: Admin Interface
1. Update `/dashboard/committee/awards/page.tsx`
2. Add TOW tab functionality
3. Create player selection UI
4. Formation selector
5. Position assignment logic
6. Save/update TOW awards

### Phase 4: Poster Studio Integration
1. Add 'team-of-week' theme to PosterStudio
2. Fetch TOW awards from API
3. Display in poster preview
4. Enable download/share

## API Endpoints Needed

### GET /api/awards/team-of-week
```typescript
// Query params: week_number, season_id, tournament_id
// Returns: TeamOfWeekAward | null
```

### POST /api/awards/team-of-week
```typescript
// Body: TeamOfWeekAward (without id)
// Returns: { success: boolean, id: string }
```

### GET /api/players/eligible
```typescript
// Query params: season_id, tournament_id, position?
// Returns: PlayerStats[]
// For player selection in admin UI
```

## Poster Studio Changes

### Add to THEMES
```typescript
'team-of-week': {
  label: 'Team of the Week',
  tagline: 'TEAM OF THE WEEK',
  emoji: '⚽',
  accent: '#d4a830',
  // ...
}
```

### Update getFilteredPlayers
```typescript
else if (activeTheme === 'team-of-week') {
  // Fetch TOW award for selected week
  const towAward = await fetchTOWAward(selectedWeek);
  filtered = towAward?.players || [];
}
```

## Technical Considerations

### Player Photos
- Small size (100x120px per player)
- Background removal still applies
- Fallback to placeholder if missing

### Performance
- 11 player photos to load
- Use lazy loading
- Cache player photos
- Preload on selection

### Responsive
- Poster is fixed 800x1000px
- Scale appropriately for download
- Maintain formation spacing

## Future Enhancements

1. **Multiple Formations**
   - 3-4-3, 5-3-2, 4-2-3-1
   - Custom formation editor

2. **Captain Badge**
   - Mark one player as captain
   - Show captain's armband

3. **Substitutes Bench**
   - Show 3-5 substitute players below

4. **Team Stats**
   - Show collective stats
   - Win rate, goals scored, etc.

5. **Animation**
   - Fade in players one by one
   - Formation transition animations

## Notes

- TOW is selected manually by admin (not auto-generated)
- Players can be from different teams
- No limit on players from same team
- Must have exactly 11 players
- Each position must be filled according to formation
- Week filter shows only weeks with TOW awards assigned
