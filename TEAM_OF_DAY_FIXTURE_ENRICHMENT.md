# Team of Day - Fixture Data Enrichment

## Overview
The Team of Day (TOD) awards now automatically fetch match opponent and score information from the fixtures table, eliminating the need to manually store this data in the awards table.

## How It Works

### 1. Award Storage (Minimal Data)
When a TOD award is created, only basic information is stored in the `awards` table:
```json
{
  "award_type": "TOD",
  "team_id": "team-001",
  "team_name": "Manchester United",
  "team_logo": "https://...",
  "tournament_id": "tournament-id",
  "season_id": "2024-25",
  "round_number": 15,
  "performance_stats": {
    "wins": 1,
    "draws": 0,
    "losses": 0,
    "goals_for": 14,
    "clean_sheet": false,
    "goals_against": 9,
    "goal_difference": 5
  }
}
```

### 2. Automatic Enrichment (Match Data Added)
When the awards are fetched via `/api/awards`, the system automatically:

1. **Identifies TOD Awards**: Filters awards where `award_type = 'TOD'`

2. **Looks Up Fixture**: Queries the `fixtures` table to find the match where:
   - `tournament_id` matches
   - `round_number` matches
   - Team played (either home or away)
   - Match status is `'completed'`

3. **Enriches Award Data**: Adds opponent and score information:
```json
{
  // ... original award data ...
  "fixture_id": "fixture-123",
  "match_date": "2024-06-15",
  "home_team": "Manchester United",
  "home_team_id": "team-001",
  "home_team_logo": "https://...",
  "home_score": 3,
  "away_team": "Chelsea",
  "away_team_id": "team-002",
  "away_team_logo": "https://...",
  "away_score": 1
}
```

## Implementation Files

### Core Enrichment Logic
**File**: `lib/enrich-team-awards.ts`

**Functions**:
- `enrichTeamAward(award)` - Enriches a single TOD award with fixture data
- `enrichTeamAwards(awards[])` - Batch enriches multiple TOD awards
- `getEnrichedTeamOfDayAwards(tournamentId, seasonId)` - Fetches and enriches TOD awards

**SQL Query**:
```sql
SELECT 
  f.id as fixture_id,
  f.home_team_id,
  f.away_team_id,
  f.home_score,
  f.away_score,
  f.match_date,
  ht.name as home_team_name,
  ht.logo_url as home_team_logo,
  at.name as away_team_name,
  at.logo_url as away_team_logo
FROM fixtures f
LEFT JOIN teams ht ON f.home_team_id = ht.id
LEFT JOIN teams at ON f.away_team_id = at.id
WHERE f.tournament_id = $tournamentId
  AND f.round_number = $roundNumber
  AND (f.home_team_id = $teamId OR f.away_team_id = $teamId)
  AND f.status = 'completed'
LIMIT 1
```

### API Integration
**File**: `app/api/awards/route.ts`

**Changes**:
```typescript
import { enrichTeamAwards } from '@/lib/enrich-team-awards';

export async function GET(request: NextRequest) {
  // ... fetch awards from database ...
  
  // Enrich TOD awards
  const todAwards = awards.filter(a => a.award_type === 'TOD');
  const enrichedTodAwards = await enrichTeamAwards(todAwards);
  
  // Merge back with other awards
  const allAwards = [...enrichedTodAwards, ...nonTodAwards];
  
  return NextResponse.json({ success: true, data: allAwards });
}
```

### Frontend Integration
**File**: `app/dashboard/committee/team-management/player-stats-by-round/page.tsx`

**Award Transformation**:
```typescript
const transformedAwards = result.data.map((award: any) => ({
  ...award,
  award_type: award.award_type === 'TOD' ? 'team_of_day' : ...,
  matchday: award.round_number,
  // Pass through enriched fixture data
  home_team: award.home_team,
  home_team_logo: award.home_team_logo,
  home_score: award.home_score,
  away_team: award.away_team,
  away_team_logo: award.away_team_logo,
  away_score: award.away_score,
}));
```

## Benefits

### 1. Data Consistency
- Match data always comes from the single source of truth (fixtures table)
- No need to duplicate home/away team and score data in awards table
- Automatic updates if fixture data is corrected

### 2. Storage Efficiency
- Awards table stores only award-specific data
- Reduces database storage and redundancy
- Cleaner data model

### 3. Maintainability
- Changes to fixture data automatically reflect in TOD displays
- No need to update awards when fixture data changes
- Single place to manage match information

### 4. Flexibility
- Can enrich with additional fixture data (venue, referee, etc.) without schema changes
- Easy to add more match context in the future

## Database Schema

### Awards Table (Required Fields for TOD)
```sql
CREATE TABLE awards (
  id TEXT PRIMARY KEY,
  award_type TEXT NOT NULL,           -- 'TOD'
  tournament_id TEXT NOT NULL,
  season_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,      -- Used to lookup fixture
  team_id TEXT NOT NULL,              -- Used to lookup fixture
  team_name TEXT,
  team_logo TEXT,
  performance_stats JSONB,            -- Team's performance stats
  selected_by TEXT,
  selected_by_name TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Fixtures Table (Required for Enrichment)
```sql
CREATE TABLE fixtures (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  home_team_id TEXT NOT NULL,
  away_team_id TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  match_date TIMESTAMP,
  status TEXT,                        -- Must be 'completed'
  ...
);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  ...
);
```

## Error Handling

### No Fixture Found
If no matching fixture is found:
- Award data is returned without enrichment
- Warning logged to console
- Poster still displays with whatever data is available

### Multiple Fixtures Found
- Query uses `LIMIT 1` to prevent issues
- Takes the first matching completed fixture
- Log warning if this occurs (shouldn't happen in normal operation)

### Database Query Fails
- Error logged but doesn't crash the API
- Returns unenriched awards
- Graceful degradation

## Testing

### Verify Enrichment Works
1. Create a TOD award for a completed fixture
2. Fetch awards via `/api/awards?tournament_id=xxx&season_id=xxx`
3. Check response includes:
   - `home_team`, `away_team`
   - `home_score`, `away_score`
   - `home_team_logo`, `away_team_logo`

### Test Poster Display
1. Navigate to player stats page
2. Select "Team of Day" theme in Poster Studio
3. Select a matchday with a TOD award
4. Verify match score card displays correctly with:
   - Both team logos
   - Team names
   - Correct scores

### Test Missing Fixture
1. Create a TOD award without a corresponding fixture
2. Verify API still returns the award (without fixture data)
3. Check console for warning message
4. Verify poster displays gracefully

## Future Enhancements

### Additional Fixture Data
Could easily add:
- Match venue/location
- Referee name
- Match attendance
- Match highlights URL
- Weather conditions

### Performance Optimization
- Cache enriched awards
- Batch lookup for multiple awards
- Add database index on (tournament_id, round_number, team_id)

### Extended Match Context
- Include team form (last 5 matches)
- Head-to-head record
- League position at time of match
- Key match events (red cards, penalties, etc.)
