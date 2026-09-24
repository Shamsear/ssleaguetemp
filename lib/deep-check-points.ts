import { fantasySql } from './neon/fantasy-config';

async function main() {
  const leagueId = 'SSPSLFLS18';

  console.log('=== DISTINCT ROUNDS IN FANTASY_PLAYER_POINTS ===');
  const distinctRounds = await fantasySql`
    SELECT round_number, COUNT(*) as record_count, COUNT(DISTINCT team_id) as team_count
    FROM fantasy_player_points
    WHERE league_id = ${leagueId}
    GROUP BY round_number
    ORDER BY round_number ASC
  `;
  console.log(JSON.stringify(distinctRounds, null, 2));

  console.log('\n=== PASSIVE TEAM BONUS RECORDS IN FANTASY_PLAYER_POINTS ===');
  const passiveRecords = await fantasySql`
    SELECT round_number, team_id, real_player_id, player_name, base_points, total_points
    FROM fantasy_player_points
    WHERE league_id = ${leagueId}
      AND (real_player_id LIKE 'SSPSLT%' OR player_name LIKE '%FC%' OR player_name LIKE '%TENS%' OR player_name LIKE '%GUARDIANS%' OR player_name LIKE '%PANTHERS%' OR player_name LIKE '%HAWKS%' OR player_name LIKE '%BARCELONA%' OR player_name LIKE '%ASGARDIANS%')
    ORDER BY round_number ASC
    LIMIT 20
  `;
  console.log(JSON.stringify(passiveRecords, null, 2));
}

main().catch(console.error);
