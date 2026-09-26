import { fantasySql } from './neon/fantasy-config';

async function main() {
  const windowId = 'window_1790229971230_wtpw1uhf8';
  const leagueId = 'SSPSLFLS18';

  await fantasySql`
    UPDATE fantasy_transfer_windows
    SET is_active = false
    WHERE league_id = ${leagueId} AND window_id != ${windowId}
  `;

  await fantasySql`
    UPDATE fantasy_transfer_windows
    SET is_active = true, status = 'active'
    WHERE league_id = ${leagueId} AND window_id = ${windowId}
  `;

  console.log('✅ Window 2 marked as is_active = true, status = active');

  const windows = await fantasySql`
    SELECT window_id, window_name, status, is_active
    FROM fantasy_transfer_windows
    WHERE league_id = ${leagueId}
  `;
  console.table(windows);
}

main().catch(console.error);
