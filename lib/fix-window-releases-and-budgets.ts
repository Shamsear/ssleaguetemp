import { fantasySql } from './neon/fantasy-config';

async function main() {
  const currentWindowId = 'window_1790229971230_wtpw1uhf8'; // Round 18-22
  const leagueId = 'SSPSLFLS18';

  console.log('=== 1. UPDATING FANTASY_RELEASES WINDOW_ID FOR CURRENT WINDOW RELEASES ===\n');

  // Update window_id for releases created on/after Sept 22, 2026 to currentWindowId
  await fantasySql`
    UPDATE fantasy_releases
    SET window_id = ${currentWindowId}
    WHERE league_id = ${leagueId}
      AND released_at >= '2026-09-20T00:00:00.000Z'
  `;

  console.log('✅ Updated current window releases to window_id:', currentWindowId);

  console.log('\n=== 2. REMOVING INVALID BIDS FROM NON-PARTICIPATING TEAMS FOR PASSIVE TEAM ===\n');

  // Delete any post release bids for Passive Team submitted by teams with an active supported_team_id (like Red Hawks FC)
  const nonParticipatingTeams = await fantasySql`
    SELECT team_id FROM fantasy_teams
    WHERE league_id = ${leagueId}
      AND supported_team_id IS NOT NULL
      AND TRIM(supported_team_id) != ''
  `;

  const nonPartTeamIds = nonParticipatingTeams.map((t: any) => t.team_id);

  if (nonPartTeamIds.length > 0) {
    const deletedBids = await fantasySql`
      DELETE FROM fantasy_post_release_bids
      WHERE league_id = ${leagueId}
        AND (draft_round_id = ${currentWindowId} OR bid_id LIKE ${'%' + currentWindowId + '%'})
        AND (category ILIKE 'Passive Team' OR is_passive_team = true)
        AND team_id = ANY(${nonPartTeamIds})
      RETURNING bid_id, team_id, target_name, bid_amount
    `;
    console.log(`Deleted ${deletedBids.length} invalid passive team bids from non-participating teams:`, deletedBids);
  }

  console.log('\n=== 3. RESTORING 100% AUDITED BUDGET BALANCES ===\n');

  const updates = [
    { team_id: 'SSPSLT0021', name: 'Los Galacticos', budget: 232.00, clearPassive: true },
    { team_id: 'SSPSLT0015', name: 'Legends FC', budget: 206.00, clearPassive: true },
    { team_id: 'SSPSLT0003', name: 'RED PANTHER\'S', budget: 78.00, clearPassive: true },
    { team_id: 'SSPSLT0004', name: 'Red Hawks FC', budget: 267.00, clearPassive: false },
    { team_id: 'SSPSLT0027', name: 'PES GUARDIANS', budget: 250.00, clearPassive: false },
    { team_id: 'SSPSLT0005', name: 'TM ASGARDIANS', budget: 180.00, clearPassive: false },
    { team_id: 'SSPSLT0041', name: 'ANDIMUKK FC', budget: 60.00, clearPassive: true },
    { team_id: 'SSPSLT0001', name: 'CLASSIC TENS', budget: 143.00, clearPassive: false },
  ];

  for (const u of updates) {
    if (u.clearPassive) {
      await fantasySql`
        UPDATE fantasy_teams
        SET budget_remaining = ${u.budget},
            supported_team_id = NULL,
            supported_team_name = NULL,
            supported_team_price = NULL,
            updated_at = NOW()
        WHERE league_id = ${leagueId} AND team_id = ${u.team_id}
      `;
    } else {
      await fantasySql`
        UPDATE fantasy_teams
        SET budget_remaining = ${u.budget},
            updated_at = NOW()
        WHERE league_id = ${leagueId} AND team_id = ${u.team_id}
      `;
    }
  }

  console.log('✅ Budgets and passive states successfully restored!');

  console.log('\n=== 4. VERIFYING RELEASES FOR CURRENT WINDOW ===\n');
  const currentWindowReleases = await fantasySql`
    SELECT r.release_id, r.team_id, ft.team_name, r.player_name, r.category, r.is_passive_team, r.window_id, r.released_at
    FROM fantasy_releases r
    JOIN fantasy_teams ft ON r.team_id = ft.team_id
    WHERE r.league_id = ${leagueId} AND r.window_id = ${currentWindowId}
    ORDER BY r.released_at DESC
  `;
  console.table(currentWindowReleases);
}

main().catch(console.error);
