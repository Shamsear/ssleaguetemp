import { NextResponse } from 'next/server';
import { getMainDb, isMainDbAvailable } from '@/lib/neon/main-config';
import { getTournamentDb, isTournamentDbAvailable } from '@/lib/neon/tournament-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let maxId = 0;
    const prefix = 'sspslpsl';

    // 1. Query Main DB realplayers
    if (isMainDbAvailable()) {
      try {
        const mainSql = getMainDb();
        const mainRows = await mainSql`
          SELECT player_id FROM realplayers WHERE player_id LIKE ${prefix + '%'}
        `;
        for (const row of mainRows) {
          if (row.player_id && row.player_id.startsWith(prefix)) {
            const num = parseInt(row.player_id.slice(prefix.length), 10);
            if (!isNaN(num) && num > maxId) {
              maxId = num;
            }
          }
        }
      } catch (e: any) {
        console.warn('Error querying realplayers for max ID:', e.message);
      }
    }

    // 2. Query Tournament DB realplayerstats & player_seasons
    if (isTournamentDbAvailable()) {
      try {
        const tourSql = getTournamentDb();
        const [tourRows, psRows] = await Promise.all([
          tourSql`SELECT player_id FROM realplayerstats WHERE player_id LIKE ${prefix + '%'}`,
          tourSql`SELECT player_id FROM player_seasons WHERE player_id LIKE ${prefix + '%'}`.catch(() => []),
        ]);

        for (const row of [...tourRows, ...psRows]) {
          if (row.player_id && row.player_id.startsWith(prefix)) {
            const num = parseInt(row.player_id.slice(prefix.length), 10);
            if (!isNaN(num) && num > maxId) {
              maxId = num;
            }
          }
        }
      } catch (e: any) {
        console.warn('Error querying tournament DB for max ID:', e.message);
      }
    }

    const nextNumber = maxId + 1;
    const paddedId = String(nextNumber).padStart(4, '0');
    const nextPlayerId = `${prefix}${paddedId}`;

    return NextResponse.json({
      success: true,
      nextPlayerId,
      nextNumber,
      currentMaxId: maxId,
    });
  } catch (error: any) {
    console.error('Error generating next player ID:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to determine next player ID' },
      { status: 500 }
    );
  }
}
