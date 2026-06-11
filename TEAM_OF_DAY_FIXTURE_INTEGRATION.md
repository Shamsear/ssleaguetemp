# Team of Day - Fixture Integration Guide

## Overview
This document explains how Team of Day (TOD) awards are enriched with match fixture data (opponent teams, scores) from the fixtures table.

## Implementation Complete ✅

### 1. Enrichment Library (`lib/enrich-team-awards.ts`)
Created a utility library that:
- Fetches fixture data for team-of-day awards
- Matches teams to their fixtures by tournament, round, and team_id
- Extracts home/away team information and scores
- Returns enriched award objects with complete match data

**Key Functions:**
- `enrichTeamAward()` - Enriches a single TOD award
- `enrichTeamAwards()` - Enriches multiple TOD awards
- `getEnrichedTeamOfDayAwards()` - Fetches and enriches all TOD awards for a tournament/season

### 2. Awards API Updated (`app/api/awards/route.ts`)
- Added automatic enrichment of TOD awards in the GET endpoint
- Awards API now returns TOD awards with fixture data included
- Non-TOD awards are returned unchanged
- Graceful fallback if enrichment fails

### 3. Frontend Integration
- `PosterStudio.tsx` - Updated to support team-of-day theme
- `PosterDesigns.tsx` - Added `TeamOfDayDesign` component
- `player-stats-by-round/page.tsx` - Updated award transformation to include fixture fields

## Data Flow

```
1. TOD Award Created
   ↓
   awards table: {
     award_type: 'TOD',
     team_id: 'xxx',
     season_id: 'zzz',
     round_number: 15,
     tournament_id: 'yyy',
     performance_stats: {...}
   }

2. API Request: GET /api/awards?tournament_id=yyy&season_id=zzz
   ↓
3. Awards API fetches TOD awards
   ↓
4. enrichTeamAwards() performs 3 queries:
   
   a) Get winning team logo from team_seasons:
      SELECT logo_url FROM team_seasons
      WHERE team_id = xxx AND season_id = zzz
   
   b) Look up fixture:
      SELECT * FROM fixtures
      WHERE tournament_id = yyy
        AND round_number = 15
        AND (home_team_id = xxx OR away_team_id = xxx)
        AND status = 'completed'
   
   c) Get home/away team logos from team_seasons:
      SELECT logo_url FROM team_seasons
      WHERE team_id IN (home_team_id, away_team_id)
        AND season_id = zzz
   ↓
5. Returns enriched award:
   {
     ...original_award_data,
     team_logo: 'https://... (from team_seasons)',
     home_team: 'Manchester United',
     home_team_id: 'xxx',
     home_team_logo: 'https://... (from team_seasons)',
     home_score: 3,
     away_team: 'Chelsea',
     away_team_id: 'yyy',
     away_team_logo: 'https://... (from team_seasons)',
     away_score: 1,
     fixture_id: 'zzz',
     match_date: '2024-10-15'
   }

6. Frontend transforms to poster format
   ↓
7. TeamOfDayDesign displays:
   - Large team logo (winning team) from team_seasons
   - Team name
   - Match score card with both teams (logos from team_seasons)
```

## Database Schema Requirements

### Awards Table
```sql
awards (
  id VARCHAR PRIMARY KEY,
  award_type VARCHAR,  -- 'TOD' for Team of Day
  tournament_id VARCHAR,
  season_id VARCHAR,
  round_number INTEGER,
  team_id VARCHAR,
  team_name VARCHAR,
  performance_stats JSONB,
  created_at TIMESTAMP
)
```

### Team Seasons Table (REQUIRED - for team logos)
```sql
team_seasons (
  id VARCHAR PRIMARY KEY,
  team_id VARCHAR,
  season_id VARCHAR,
  logo_url VARCHAR,  -- Team logo for this specific season
  created_at TIMESTAMP
)
```

### Fixtures Table (must have)
```sql
fixtures (
  id VARCHAR PRIMARY KEY,
  tournament_id VARCHAR,
  round_number INTEGER,
  home_team_id VARCHAR,
  away_team_id VARCHAR,
  home_score INTEGER,
  away_score INTEGER,
  status VARCHAR,  -- must be 'completed'
  match_date TIMESTAMP
)
```

### Teams Table (must have)
```sql
teams (
  id VARCHAR PRIMARY KEY,
  name VARCHAR
  -- Note: logo_url not used, fetched from team_seasons instead
)
```

## Usage Example

### Creating a TOD Award
```typescript
// POST /api/awards
{
  award_type: 'TOD',
  tournament_id: '2024-LEAGUE',
  season_id: '2024-25',
  round_number: 15,
  team_id: 'team-001',
  team_name: 'Manchester United',
  performance_stats: {
    wins: 1,
    draws: 0,
    losses: 0,
    goals_for: 3,
    goals_against: 1,
    clean_sheet: false,
    goal_difference: 2
  },
  selected_by: 'admin-123',
  selected_by_name: 'John Doe'
}
```

### Fetching Enriched Awards
```typescript
// GET /api/awards?tournament_id=2024-LEAGUE&season_id=2024-25

// Response includes enriched TOD awards:
{
  success: true,
  data: [
    {
      id: 'award_TOD_...',
      award_type: 'TOD',
      team_name: 'Manchester United',
      team_logo: 'https://...',
      round_number: 15,
      // Enriched fixture data:
      home_team: 'Manchester United',
      home_team_logo: 'https://...',
      home_score: 3,
      away_team: 'Chelsea',
      away_team_logo: 'https://...',
      away_score: 1,
      fixture_id: 'fixture-123',
      match_date: '2024-10-15T15:00:00Z'
    }
  ]
}
```

## Poster Display

The `TeamOfDayDesign` component displays:

1. **Title**: "TEAM OF THE DAY" with cyan gradient
2. **Matchday**: "MATCHDAY - 15"
3. **Large Team Logo**: 280px centered logo of winning team
4. **Team Name**: Large display name
5. **Match Score Card**:
   ```
   [Home Logo]      3  -  1      [Away Logo]
   Manchester United           Chelsea
   ```

## Configuration

### Environment Variables
```env
# Database connection (required)
DATABASE_URL=postgresql://...

# ImageKit for logos (optional, for background removal)
NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your-endpoint
```

## Troubleshooting

### Issue: No fixture data in award
**Cause**: Fixture not found for the team/round
**Solution**: 
- Check fixtures table has completed matches for that round
- Verify team_id matches between awards and fixtures
- Ensure fixture status is 'completed'

### Issue: Logo images not loading
**Cause**: Missing logo_url in team_seasons table or invalid URLs
**Solution**:
- Verify team_seasons.logo_url contains valid image URLs for the season
- Ensure team_seasons records exist for all teams in the season
- Check CORS if using external image hosts
- Add placeholder logo as fallback

### Issue: Performance concerns with many awards
**Solution**: 
- Add database indexes:
```sql
CREATE INDEX idx_fixtures_lookup ON fixtures(tournament_id, round_number, home_team_id, away_team_id);
CREATE INDEX idx_awards_tod ON awards(tournament_id, season_id, award_type, round_number);
```

## Future Enhancements

Potential improvements:
1. **Caching**: Cache enriched awards to reduce database queries
2. **Batch Processing**: Enrich multiple rounds of awards in one query
3. **Match Statistics**: Add additional match stats (possession, shots, etc.)
4. **Venue Information**: Include match venue and attendance
5. **Historical Comparison**: Show team's performance trends
6. **Real-time Updates**: Auto-refresh when fixtures are updated

## Testing Checklist

- [ ] TOD award created in awards table
- [ ] Corresponding completed fixture exists
- [ ] GET /api/awards returns enriched TOD with fixture data
- [ ] Team logos display correctly in poster
- [ ] Home/away teams and scores display correctly
- [ ] Poster downloads with all information
- [ ] Multiple TOD awards for different rounds work
- [ ] Fallback works when fixture not found

## Notes

- The enrichment happens server-side for security and performance
- Fixtures must have status='completed' to be included
- If multiple fixtures exist for same team/round, first one is used
- Enrichment errors are logged but don't fail the entire API request
- Frontend receives raw awards if enrichment is disabled/fails
