# Fantasy League API Guide

## Quick Reference for Developers

---

## Table of Contents
1. [Draft Player](#draft-player)
2. [Remove Player](#remove-player)
3. [Get Available Players](#get-available-players)
4. [Error Handling](#error-handling)
5. [Code Examples](#code-examples)

---

## Draft Player

### Endpoint
```
POST /api/fantasy/draft/player
```

### Request Body
```json
{
  "user_id": "user_abc123",
  "real_player_id": "player_456",
  "player_name": "Cristiano Ronaldo",
  "position": "FWD",
  "team_name": "Al-Nassr",
  "draft_price": 40.0
}
```

### Success Response (200)
```json
{
  "success": true,
  "squad_id": "squad_team123_player456_1234567890",
  "player_name": "Cristiano Ronaldo",
  "position": "FWD",
  "purchase_price": 40.0,
  "remaining_budget": 60.0,
  "squad_size": 5,
  "max_squad_size": 15,
  "player_category": "A"
}
```

### Error Responses

**Player Already Drafted (400)**
```json
{
  "error": "PLAYER_ALREADY_DRAFTED",
  "message": "Cristiano Ronaldo has already been drafted by Manchester United",
  "details": {
    "player_name": "Cristiano Ronaldo",
    "drafted_by": {
      "team_id": "team123",
      "team_name": "Manchester United",
      "drafted_at": "2026-06-10T15:30:00Z"
    },
    "suggested_alternatives": [
      {
        "player_id": "p789",
        "player_name": "Lionel Messi",
        "category": "A",
        "draft_price": 40.0
      }
    ]
  }
}
```

**Squad Full (400)**
```json
{
  "error": "SQUAD_FULL",
  "message": "Squad is full. Manchester United already has 15 players (maximum: 15)",
  "details": {
    "current_size": 15,
    "max_size": 15,
    "remaining_slots": 0
  }
}
```

**Insufficient Budget (400)**
```json
{
  "error": "INSUFFICIENT_BUDGET",
  "message": "Insufficient budget to draft Cristiano Ronaldo. Required: €40M, Available: €30M",
  "details": {
    "required": 40.0,
    "available": 30.0,
    "shortfall": 10.0,
    "player_name": "Cristiano Ronaldo"
  }
}
```

**Invalid Price (400)**
```json
{
  "error": "INVALID_DRAFT_PRICE",
  "message": "Invalid draft price for Cristiano Ronaldo. Expected: €40M (Category A), Provided: €10M",
  "details": {
    "expected": 40.0,
    "provided": 10.0,
    "player_name": "Cristiano Ronaldo",
    "player_category": "A"
  }
}
```

**Draft Not Active (403)**
```json
{
  "error": "DRAFT_NOT_ACTIVE",
  "message": "Draft period has ended. Use transfer windows to modify your squad.",
  "details": {
    "current_status": "closed",
    "league_name": "Premier League Fantasy"
  }
}
```

**Validation Error (400)**
```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "details": [
    {
      "field": "draft_price",
      "message": "draft_price must be positive"
    }
  ]
}
```

---

## Remove Player

### Endpoint
```
DELETE /api/fantasy/draft/player?user_id=xxx&real_player_id=yyy
```

### Query Parameters
- `user_id` (required) - User's Firebase UID
- `real_player_id` (required) - Player ID to remove

### Success Response (200)
```json
{
  "success": true,
  "player_name": "Cristiano Ronaldo",
  "refunded_amount": 40.0,
  "new_budget": 100.0
}
```

### Error Responses

**Player Not In Squad (404)**
```json
{
  "error": "PLAYER_NOT_IN_SQUAD",
  "message": "Player is not in Manchester United's squad",
  "details": {
    "player_name": "Player",
    "team_name": "Manchester United"
  }
}
```

**Draft Not Active (403)**
```json
{
  "error": "DRAFT_NOT_ACTIVE",
  "message": "Draft has not started yet. Please wait for the draft to begin.",
  "details": {
    "current_status": "pending"
  }
}
```

---

## Get Available Players

### Endpoint
```
GET /api/fantasy/players/available?league_id=xxx
```

### Query Parameters
- `league_id` (required) - Fantasy league ID
- `cursor` (optional) - Player ID to start from (for pagination)
- `limit` (optional) - Number of results (1-100, default: 50)
- `category` (optional) - Filter by category (A, B, C, D, E)
- `search` (optional) - Search by player name or team

### Examples

**Basic Request**
```
GET /api/fantasy/players/available?league_id=SSPSLFLS16
```

**With Pagination**
```
GET /api/fantasy/players/available?league_id=SSPSLFLS16&limit=50&cursor=player_123
```

**Filter by Category**
```
GET /api/fantasy/players/available?league_id=SSPSLFLS16&category=A
```

**Search Players**
```
GET /api/fantasy/players/available?league_id=SSPSLFLS16&search=ronaldo
```

**Combined Filters**
```
GET /api/fantasy/players/available?league_id=SSPSLFLS16&category=A&search=ronaldo&limit=20
```

### Success Response (200)
```json
{
  "success": true,
  "available_players": [
    {
      "real_player_id": "player_001",
      "player_name": "Cristiano Ronaldo",
      "position": "FWD",
      "team": "Al-Nassr",
      "team_id": "team_123",
      "category": "A",
      "draft_price": 40.0,
      "points": 0,
      "is_available": true
    },
    {
      "real_player_id": "player_002",
      "player_name": "Lionel Messi",
      "position": "FWD",
      "team": "Inter Miami",
      "team_id": "team_456",
      "category": "A",
      "draft_price": 40.0,
      "points": 0,
      "is_available": true
    }
    // ... more players
  ],
  "pagination": {
    "next_cursor": "player_050",
    "has_more": true,
    "limit": 50,
    "total_in_page": 50
  },
  "filters_applied": {
    "category": "A",
    "search": "ronaldo"
  }
}
```

### Pagination Flow

**Step 1: First Page**
```javascript
const response = await fetch('/api/fantasy/players/available?league_id=xxx&limit=50');
const data = await response.json();

// data.pagination.next_cursor = "player_050"
// data.pagination.has_more = true
```

**Step 2: Next Page**
```javascript
const cursor = data.pagination.next_cursor; // "player_050"
const response = await fetch(`/api/fantasy/players/available?league_id=xxx&limit=50&cursor=${cursor}`);
const data = await response.json();

// Continue until has_more = false
```

**Step 3: Complete Example**
```javascript
async function loadAllPlayers(leagueId) {
  const allPlayers = [];
  let cursor = null;
  let hasMore = true;

  while (hasMore) {
    const url = cursor
      ? `/api/fantasy/players/available?league_id=${leagueId}&limit=50&cursor=${cursor}`
      : `/api/fantasy/players/available?league_id=${leagueId}&limit=50`;

    const response = await fetch(url);
    const data = await response.json();

    allPlayers.push(...data.available_players);
    cursor = data.pagination.next_cursor;
    hasMore = data.pagination.has_more;
  }

  return allPlayers;
}
```

---

## Error Handling

### Error Code Reference

| Code | Status | Description |
|------|--------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `PLAYER_ALREADY_DRAFTED` | 400 | Player has been drafted by another team |
| `SQUAD_FULL` | 400 | Team has reached maximum squad size |
| `INSUFFICIENT_BUDGET` | 400 | Not enough budget to draft player |
| `INVALID_DRAFT_PRICE` | 400 | Draft price doesn't match category price |
| `DRAFT_NOT_ACTIVE` | 403 | Draft is not currently active |
| `PLAYER_NOT_FOUND` | 404 | Player doesn't exist in season |
| `LEAGUE_NOT_FOUND` | 404 | Fantasy league not found |
| `TEAM_NOT_FOUND` | 404 | User doesn't have a fantasy team |
| `PLAYER_NOT_IN_SQUAD` | 404 | Player is not in team's squad |
| `DATABASE_ERROR` | 500 | Database operation failed |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected server error |

### Generic Error Handler

```typescript
async function handleFantasyRequest(requestFn: () => Promise<Response>) {
  try {
    const response = await requestFn();
    const data = await response.json();

    if (!response.ok) {
      switch (data.error) {
        case 'PLAYER_ALREADY_DRAFTED':
          // Show drafted by info + suggested alternatives
          showPlayerDraftedError(data);
          break;
        
        case 'SQUAD_FULL':
          // Show squad full message
          showSquadFullError(data);
          break;
        
        case 'INSUFFICIENT_BUDGET':
          // Show budget error with shortfall
          showBudgetError(data);
          break;
        
        case 'VALIDATION_ERROR':
          // Show validation errors
          showValidationErrors(data.details);
          break;
        
        default:
          // Generic error message
          showGenericError(data.message);
      }
      return null;
    }

    return data;
  } catch (error) {
    console.error('Request failed:', error);
    showGenericError('Network error occurred');
    return null;
  }
}
```

---

## Code Examples

### TypeScript Client

```typescript
interface DraftPlayerRequest {
  user_id: string;
  real_player_id: string;
  player_name: string;
  position?: string;
  team_name?: string;
  draft_price: number;
}

interface DraftPlayerResponse {
  success: true;
  squad_id: string;
  player_name: string;
  position: string;
  purchase_price: number;
  remaining_budget: number;
  squad_size: number;
  max_squad_size: number;
  player_category: string;
}

async function draftPlayer(request: DraftPlayerRequest): Promise<DraftPlayerResponse> {
  const response = await fetch('/api/fantasy/draft/player', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }

  return await response.json();
}

// Usage
try {
  const result = await draftPlayer({
    user_id: 'user123',
    real_player_id: 'player456',
    player_name: 'Cristiano Ronaldo',
    position: 'FWD',
    team_name: 'Al-Nassr',
    draft_price: 40.0,
  });

  console.log(`Drafted ${result.player_name}!`);
  console.log(`Budget remaining: €${result.remaining_budget}M`);
  console.log(`Squad: ${result.squad_size}/${result.max_squad_size}`);
} catch (error) {
  console.error('Draft failed:', error.message);
}
```

### React Hook

```typescript
import { useState } from 'react';

interface DraftPlayerParams {
  real_player_id: string;
  player_name: string;
  position: string;
  team_name: string;
  draft_price: number;
}

export function useDraftPlayer(userId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draftPlayer = async (params: DraftPlayerParams) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/fantasy/draft/player', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
          ...params,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Draft failed');
      }

      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { draftPlayer, loading, error };
}

// Usage in component
function DraftButton({ player, userId }) {
  const { draftPlayer, loading, error } = useDraftPlayer(userId);

  const handleDraft = async () => {
    try {
      const result = await draftPlayer({
        real_player_id: player.id,
        player_name: player.name,
        position: player.position,
        team_name: player.team,
        draft_price: player.price,
      });

      alert(`Successfully drafted ${result.player_name}!`);
    } catch (err) {
      // Error already set in hook
    }
  };

  return (
    <div>
      <button onClick={handleDraft} disabled={loading}>
        {loading ? 'Drafting...' : 'Draft Player'}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
```

### Pagination Hook

```typescript
import { useState, useEffect } from 'react';

interface Player {
  real_player_id: string;
  player_name: string;
  category: string;
  draft_price: number;
  // ... other fields
}

export function useAvailablePlayers(leagueId: string) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const loadMore = async () => {
    if (loading || !hasMore) return;

    setLoading(true);

    try {
      const url = cursor
        ? `/api/fantasy/players/available?league_id=${leagueId}&cursor=${cursor}&limit=50`
        : `/api/fantasy/players/available?league_id=${leagueId}&limit=50`;

      const response = await fetch(url);
      const data = await response.json();

      setPlayers(prev => [...prev, ...data.available_players]);
      setCursor(data.pagination.next_cursor);
      setHasMore(data.pagination.has_more);
    } catch (error) {
      console.error('Failed to load players:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMore();
  }, [leagueId]);

  return { players, loading, hasMore, loadMore };
}

// Usage in component
function PlayerList({ leagueId }) {
  const { players, loading, hasMore, loadMore } = useAvailablePlayers(leagueId);

  return (
    <div>
      {players.map(player => (
        <PlayerCard key={player.real_player_id} player={player} />
      ))}

      {hasMore && (
        <button onClick={loadMore} disabled={loading}>
          {loading ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
}
```

---

## Best Practices

### 1. Always Handle Errors
```typescript
try {
  const result = await draftPlayer(params);
  // Handle success
} catch (error) {
  // Handle error appropriately
  if (error.code === 'PLAYER_ALREADY_DRAFTED') {
    // Show alternatives
  } else if (error.code === 'INSUFFICIENT_BUDGET') {
    // Show budget error
  }
}
```

### 2. Use Pagination for Large Lists
```typescript
// ❌ Don't load all players at once
const response = await fetch('/api/fantasy/players/available?league_id=xxx');
const { available_players } = await response.json(); // Could be 1000+ players

// ✅ Use pagination
const response = await fetch('/api/fantasy/players/available?league_id=xxx&limit=50');
```

### 3. Display Helpful Error Messages
```typescript
if (error.code === 'PLAYER_ALREADY_DRAFTED') {
  showNotification({
    type: 'error',
    message: `${error.details.player_name} was drafted by ${error.details.drafted_by.team_name}`,
    action: 'View Alternatives',
    onAction: () => showAlternatives(error.details.suggested_alternatives),
  });
}
```

### 4. Validate Before Submitting
```typescript
function validateDraft(player, budget) {
  if (player.draft_price > budget) {
    return { valid: false, error: 'Insufficient budget' };
  }
  if (squadSize >= maxSquadSize) {
    return { valid: false, error: 'Squad is full' };
  }
  return { valid: true };
}

// Use before API call
const validation = validateDraft(player, budget);
if (!validation.valid) {
  showError(validation.error);
  return;
}
```

---

## Support

For issues or questions:
- Check error codes in this guide
- Review the detailed error response `details` field
- Contact support with the error code and details

**Last Updated:** June 11, 2026
