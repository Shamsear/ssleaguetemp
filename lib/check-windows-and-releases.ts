import { fantasySql } from './neon/fantasy-config';

async function main() {
  const leagueId = 'SSPSLFLS18';

  const windows = await fantasySql`
    SELECT * FROM fantasy_transfer_windows
    WHERE league_id = ${leagueId}
    ORDER BY created_at DESC
  `;

  console.log('=== FANTASY TRANSFER WINDOWS ===');
  console.table(windows);

  const releases = await fantasySql`
    SELECT release_id, team_id, player_name, category, is_passive_team, window_id, released_at
    FROM fantasy_releases
    WHERE league_id = ${leagueId}
    ORDER BY released_at DESC
  `;

  console.log('\n=== LOGGED RELEASES IN FANTASY_RELEASES ===');
  console.table(releases);
}

main().catch(console.error);
