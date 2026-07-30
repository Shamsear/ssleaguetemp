const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function closeFreeAgents() {
  const sql = neon(process.env.NEON_AUCTION_DB_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
  try {
    console.log("=== CLOSING ACTIVE CONTRACTS FOR FREE AGENTS ===");
    // Fetch all current virtual players and their statuses
    const currentVirtuals = await sql`SELECT id, player_id, team_id, status FROM footballplayers`;
    const virtualStatusMap = new Map();
    currentVirtuals.forEach(v => {
      if (v.player_id) {
        const code = v.player_id.toString().toLowerCase();
        virtualStatusMap.set(code, { status: v.status, team_id: v.team_id });
      }
    });

    const activeHistoryRecords = await sql`
      SELECT id, player_id, team_id, season_id 
      FROM player_history 
      WHERE status = 'active' AND season_id IN ('SSPSLS16', 'SSPSLS17')
    `;
    console.log(`Found ${activeHistoryRecords.length} active player_history records in S16/S17.`);

    let closedFreeAgents = 0;
    for (const record of activeHistoryRecords) {
      const pCode = record.player_id ? record.player_id.toString().toLowerCase() : '';
      const current = virtualStatusMap.get(pCode);
      
      // If the player is currently a free agent in footballplayers, they are released
      if (current && (current.status === 'free_agent' || !current.team_id)) {
        const releaseDate = record.season_id === 'SSPSLS16' ? new Date('2026-02-28T23:59:59Z') : new Date('2026-07-29T23:59:59Z');
        await sql`
          UPDATE player_history
          SET status = 'released', end_date = ${releaseDate}, end_reason = 'release', contract_end_season = ${record.season_id}, updated_at = NOW()
          WHERE id = ${record.id}
        `;
        closedFreeAgents++;
      }
    }
    console.log(`Closed active contracts for ${closedFreeAgents} free agents.`);
  } catch (err) {
    console.error(err);
  }
}
closeFreeAgents();
