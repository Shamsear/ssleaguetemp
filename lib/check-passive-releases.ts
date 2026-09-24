import { fantasySql } from './neon/fantasy-config';

async function main() {
  const leagueId = 'SSPSLFLS18';
  const passiveReleases = await fantasySql`
    SELECT r.*, ft.team_name as releasing_team_name
    FROM fantasy_releases r
    JOIN fantasy_teams ft ON ft.team_id = r.team_id
    WHERE r.league_id = ${leagueId} AND r.is_passive_team = true
    ORDER BY r.released_at ASC
  `;

  console.log('=== LOGGED PASSIVE REAL TEAM RELEASES ===\n');
  console.table(passiveReleases.map((r: any) => ({
    releasing_fantasy_team: r.releasing_team_name,
    released_real_team_id: r.real_player_id,
    released_real_team_name: r.player_name,
    refund_amount: r.refund_amount,
    released_at: r.released_at
  })));
}

main().catch(console.error);
