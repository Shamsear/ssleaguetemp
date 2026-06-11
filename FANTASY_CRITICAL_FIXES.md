# Fantasy League - Critical Fixes Required

## 🔴 IMMEDIATE ACTION REQUIRED

These fixes should be implemented **before** deploying to production.

---

## Fix #1: Add Database Transactions (Race Condition Prevention)

### File: `app/api/fantasy/draft/player/route.ts`

### Problem
Multiple database operations without transaction wrapping. Race condition allows two teams to draft same player simultaneously.

### Solution

Replace the draft logic (starting from line 95) with this transactional version:

```typescript
// ===== REPLACE ENTIRE DRAFT LOGIC WITH TRANSACTION =====

try {
  // Start transaction
  await fantasySql.begin(async (tx) => {
    // 1. Lock the player row to prevent concurrent drafts
    const playerCheck = await tx`
      SELECT drafted_by_team_id, is_available, category
      FROM fantasy_players
      WHERE league_id = ${leagueId} 
        AND real_player_id = ${real_player_id}
      FOR UPDATE  -- ⭐ This locks the row until transaction completes
    `;

    // 2. Validate player is available
    if (playerCheck.length > 0) {
      const playerData = playerCheck[0];
      if (!playerData.is_available || playerData.drafted_by_team_id) {
        throw new Error('PLAYER_ALREADY_DRAFTED');
      }
    }

    // 3. Validate budget (get fresh data within transaction)
    const currentSquad = await tx`
      SELECT * FROM fantasy_squad
      WHERE team_id = ${teamId}
    `;

    if (currentSquad.length >= maxSquadSize) {
      throw new Error('SQUAD_FULL');
    }

    const currentBudgetSpent = currentSquad.reduce(
      (sum: number, p: any) => sum + Number(p.purchase_price),
      0
    );
    const remainingBudget = budgetPerTeam - currentBudgetSpent;

    if (draft_price > remainingBudget) {
      throw new Error('INSUFFICIENT_BUDGET');
    }

    // 4. Get player category
    const tournamentSql = getTournamentDb();
    const playerData = await tournamentSql`
      SELECT category
      FROM player_seasons
      WHERE player_id = ${real_player_id}
        AND season_id = (
          SELECT season_id FROM fantasy_leagues WHERE league_id = ${leagueId}
        )
      LIMIT 1
    `;

    if (playerData.length === 0) {
      throw new Error('PLAYER_NOT_FOUND');
    }

    const playerCategory = playerData[0].category || 'A';

    // 5. Generate IDs
    const squad_id = `squad_${teamId}_${real_player_id}_${Date.now()}`;
    const draft_id = `draft_${teamId}_${real_player_id}_${Date.now()}`;

    // 6. INSERT into fantasy_squad
    await tx`
      INSERT INTO fantasy_squad (
        squad_id, team_id, league_id, real_player_id,
        player_name, position, real_team_name, category,
        purchase_price, current_value, acquisition_type
      ) VALUES (
        ${squad_id}, ${teamId}, ${leagueId}, ${real_player_id},
        ${player_name}, ${position || 'Unknown'}, ${team_name || 'Unknown'}, ${playerCategory},
        ${draft_price}, ${draft_price}, 'draft'
      )
    `;

    // 7. UPDATE or INSERT fantasy_players
    if (playerCheck.length > 0) {
      await tx`
        UPDATE fantasy_players
        SET 
          times_drafted = COALESCE(times_drafted, 0) + 1,
          is_available = false,
          drafted_by_team_id = ${teamId},
          category = ${playerCategory},
          updated_at = NOW()
        WHERE league_id = ${leagueId} AND real_player_id = ${real_player_id}
      `;
    } else {
      await tx`
        INSERT INTO fantasy_players (
          league_id, real_player_id, draft_price,
          times_drafted, total_points, is_available,
          drafted_by_team_id, category
        ) VALUES (
          ${leagueId}, ${real_player_id}, ${draft_price},
          1, 0, false,
          ${teamId}, ${playerCategory}
        )
      `;
    }

    // 8. INSERT into fantasy_drafts
    await tx`
      INSERT INTO fantasy_drafts (
        draft_id, league_id, team_id, real_player_id,
        player_name, position, real_team_name, draft_price,
        draft_order, category
      ) VALUES (
        ${draft_id}, ${leagueId}, ${teamId}, ${real_player_id},
        ${player_name}, ${position || 'Unknown'}, ${team_name || 'Unknown'},
        ${draft_price}, ${currentSquad.length + 1}, ${playerCategory}
      )
    `;

    // 9. UPDATE team budget
    const newBudgetRemaining = remainingBudget - draft_price;
    await tx`
      UPDATE fantasy_teams
      SET budget_remaining = ${newBudgetRemaining},
          updated_at = CURRENT_TIMESTAMP
      WHERE team_id = ${teamId}
    `;

    // Return data for response
    return {
      squad_id,
      newBudgetRemaining,
      squadSize: currentSquad.length + 1,
      playerCategory
    };
  });

  // Transaction succeeded - proceed with non-critical operations
  // (news, broadcasts, etc.)

} catch (error) {
  // Handle specific errors
  if (error instanceof Error) {
    if (error.message === 'PLAYER_ALREADY_DRAFTED') {
      return NextResponse.json(
        { error: 'Player already drafted by another team' },
        { status: 400 }
      );
    }
    if (error.message === 'SQUAD_FULL') {
      return NextResponse.json(
        { error: 'Squad is full', max_size: maxSquadSize },
        { status: 400 }
      );
    }
    if (error.message === 'INSUFFICIENT_BUDGET') {
      return NextResponse.json(
        { error: 'Insufficient budget' },
        { status: 400 }
      );
    }
    if (error.message === 'PLAYER_NOT_FOUND') {
      return NextResponse.json(
        { error: 'Player not found in current season' },
        { status: 404 }
      );
    }
  }
  
  throw error; // Re-throw unexpected errors
}
```

---

## Fix #2: Validate Draft Price Server-Side

### File: `app/api/fantasy/draft/player/route.ts`

### Problem
Client sends `draft_price` which isn't validated. Client could send €1 for a €40M player.

### Solution

Add this validation after getting league settings:

```typescript
// Get league category pricing
const categoryPrices = league.category_prices || [];

// Get player category
const tournamentSql = getTournamentDb();
const playerData = await tournamentSql`
  SELECT category
  FROM player_seasons
  WHERE player_id = ${real_player_id}
    AND season_id = ${league.season_id}
  LIMIT 1
`;

if (playerData.length === 0) {
  return NextResponse.json(
    { error: 'Player not found in current season' },
    { status: 404 }
  );
}

const playerCategory = playerData[0].category || 'A';

// Validate draft_price matches category pricing
const expectedPriceObj = categoryPrices.find((p: any) => p.category === playerCategory);
const expectedPrice = expectedPriceObj?.price || 40.00; // Default to Category A

if (Math.abs(draft_price - expectedPrice) > 0.01) { // Allow 0.01 difference for floating point
  return NextResponse.json(
    { 
      error: 'Invalid draft price',
      expected: expectedPrice,
      provided: draft_price,
      player_category: playerCategory
    },
    { status: 400 }
  );
}
```

---

## Fix #3: Fix Category Fallback Logic

### File: `app/api/fantasy/players/available/route.ts`

### Problem
When falling back to `star_rating_prices`, uses numeric keys but later accesses with string category keys.

### Solution

Replace lines 40-51 with:

```typescript
// Get category pricing for the league
const categoryPricing: Record<string, number> = {};

if (league.category_prices) {
  // Use category pricing
  league.category_prices.forEach((p: any) => {
    categoryPricing[p.category] = p.price;
  });
} else if (league.star_rating_prices) {
  // Fallback: Map star_rating to categories
  const starToCategoryMap: Record<number, string> = {
    10: 'A', 9: 'A',
    8: 'B', 7: 'B',
    6: 'C', 5: 'C',
    4: 'D', 3: 'D',
    2: 'E', 1: 'E'
  };
  
  // Convert star rating prices to category prices
  league.star_rating_prices.forEach((p: any) => {
    const category = starToCategoryMap[p.stars] || 'E';
    // If multiple star ratings map to same category, use highest price
    if (!categoryPricing[category] || p.price > categoryPricing[category]) {
      categoryPricing[category] = p.price;
    }
  });
}

// Default category prices if none set
if (Object.keys(categoryPricing).length === 0) {
  categoryPricing['A'] = 40.00;
  categoryPricing['B'] = 25.00;
  categoryPricing['C'] = 15.00;
  categoryPricing['D'] = 10.00;
  categoryPricing['E'] = 5.00;
}
```

---

## Fix #4: Add Database Constraints

### File: Create new migration script `scripts/add-fantasy-constraints.ts`

```typescript
import { fantasySql } from '../lib/neon/fantasy-config';

async function addConstraints() {
  console.log('Adding database constraints...\n');

  try {
    // 1. Prevent negative budget
    console.log('1. Adding budget constraint...');
    await fantasySql`
      ALTER TABLE fantasy_teams
      ADD CONSTRAINT chk_budget_non_negative 
      CHECK (budget_remaining >= 0)
    `;
    console.log('✅ Budget constraint added\n');

    // 2. Add unique constraint on drafted players
    console.log('2. Adding unique ownership constraint...');
    await fantasySql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fantasy_players_unique_owner
      ON fantasy_players(league_id, real_player_id)
      WHERE drafted_by_team_id IS NOT NULL
    `;
    console.log('✅ Unique ownership constraint added\n');

    // 3. Add missing indexes
    console.log('3. Adding missing indexes...');
    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_fantasy_players_available 
      ON fantasy_players(league_id, is_available);
    `;
    await fantasySql`
      CREATE INDEX IF NOT EXISTS idx_fantasy_squad_team
      ON fantasy_squad(team_id, league_id);
    `;
    console.log('✅ Indexes added\n');

    console.log('═══════════════════════════════════════════');
    console.log('✅ All constraints added successfully!');
    console.log('═══════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Failed to add constraints:', error);
    throw error;
  }
}

addConstraints()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
```

Run with:
```bash
npx ts-node scripts/add-fantasy-constraints.ts
```

---

## Fix #5: Optimize Migration Script (N+1 Query)

### File: `scripts/migrate-fantasy-to-category-pricing.ts`

### Problem
Step 7 updates players one-by-one in a loop.

### Solution

Replace Step 7 (lines 95-117) with:

```typescript
// Step 7: Migrate category data from player_seasons to fantasy_players
console.log('📊 Step 7: Migrating category data from player_seasons...');
const tournamentSql = getTournamentDb();

// Get all fantasy leagues
const leagues = await fantasySql`SELECT league_id, season_id FROM fantasy_leagues`;

for (const league of leagues) {
  console.log(`  Processing league ${league.league_id}...`);
  
  // Get players from player_seasons for this season
  const players = await tournamentSql`
    SELECT player_id, category
    FROM player_seasons
    WHERE season_id = ${league.season_id}
      AND category IS NOT NULL
  `;

  if (players.length === 0) {
    console.log(`  ⚠️ No players found for ${league.league_id}`);
    continue;
  }

  // Bulk update using CASE statement (much faster than loop)
  const playerIds = players.map((p: any) => p.player_id);
  const caseStatements = players
    .map((p: any) => `WHEN real_player_id = '${p.player_id}' THEN '${p.category}'`)
    .join(' ');

  await fantasySql`
    UPDATE fantasy_players
    SET category = CASE ${fantasySql.unsafe(caseStatements)} END
    WHERE league_id = ${league.league_id}
      AND real_player_id = ANY(${playerIds})
  `;
  
  console.log(`  ✅ Updated ${players.length} players in ${league.league_id}`);
}
console.log('✅ Category data migrated\n');
```

---

## Testing Checklist

After implementing fixes:

### Test 1: Race Condition
```bash
# Run two simultaneous draft requests for same player
curl -X POST http://localhost:3000/api/fantasy/draft/player \
  -H "Content-Type: application/json" \
  -d '{"user_id":"user1","real_player_id":"player1",...}' &
  
curl -X POST http://localhost:3000/api/fantasy/draft/player \
  -H "Content-Type: application/json" \
  -d '{"user_id":"user2","real_player_id":"player1",...}' &

# Expected: One succeeds, one fails with "Player already drafted"
```

### Test 2: Invalid Draft Price
```bash
curl -X POST http://localhost:3000/api/fantasy/draft/player \
  -H "Content-Type: application/json" \
  -d '{
    "user_id":"user1",
    "real_player_id":"player1",
    "draft_price": 1.00
  }'

# Expected: Error "Invalid draft price"
```

### Test 3: Budget Constraint
```sql
-- Try to set negative budget
UPDATE fantasy_teams SET budget_remaining = -10 WHERE team_id = 'team1';

-- Expected: ERROR - violates check constraint
```

---

## Deployment Order

1. **Run constraint migration:** `npx ts-node scripts/add-fantasy-constraints.ts`
2. **Deploy updated API code** with transaction fixes
3. **Test** using checklist above
4. **Monitor** for errors in first 24 hours

---

## Rollback Plan

If issues occur:

1. **Immediate:** Close all draft periods
```sql
UPDATE fantasy_leagues SET draft_status = 'closed';
```

2. **Revert code:** Deploy previous version

3. **Remove constraints** (if causing issues):
```sql
ALTER TABLE fantasy_teams DROP CONSTRAINT IF EXISTS chk_budget_non_negative;
DROP INDEX IF EXISTS idx_fantasy_players_unique_owner;
```

---

**Priority:** 🔴 CRITICAL - Implement before production deployment  
**Estimated Time:** 4-6 hours  
**Risk Level:** Medium (with proper testing)  
**Impact:** Prevents data corruption and race conditions
