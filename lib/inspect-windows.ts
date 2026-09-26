import { fantasySql } from './neon/fantasy-config';

async function main() {
  const windows = await fantasySql`
    SELECT window_id, window_name, status, is_active, opens_at, closes_at
    FROM fantasy_transfer_windows
    WHERE league_id = 'SSPSLFLS18'
  `;
  console.table(windows);
}

main().catch(console.error);
