const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

async function fixHistory() {
  const auctionSql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
  
  try {
    console.log("=== 1. FETCHING CURRENT VIRTUAL PLAYER ASSIGNMENTS ===");
    const currentAssignments = new Map(); // player_id -> team_id
    
    // Fetch from footballplayers (virtual players)
    const fpRows = await auctionSql`
      SELECT id, player_id, team_id, status 
      FROM footballplayers
    `;
    console.log(`Fetched ${fpRows.length} virtual player records from footballplayers table.`);
    
    fpRows.forEach(row => {
      // Map both numeric id and string player_id to their team_id
      const teamId = row.team_id || null;
      if (row.player_id) {
        currentAssignments.set(row.player_id.toString().toLowerCase(), teamId);
      }
      currentAssignments.set(row.id.toString(), teamId);
    });

    console.log("\n=== 2. SCANNING ACTIVE VIRTUAL PLAYER HISTORY RECORDS ===");
    const activeHistory = await auctionSql`
      SELECT id, player_id, team_id, season_id, status 
      FROM player_history 
      WHERE status = 'active'
    `;
    console.log(`Found ${activeHistory.length} active player_history records.`);

    let closedCount = 0;
    for (const record of activeHistory) {
      const pId = record.player_id ? record.player_id.toString().toLowerCase() : '';
      
      // Get current team_id assigned to this virtual player
      const currentTeamId = currentAssignments.get(pId);
      
      // If the player is currently a free agent (null) or on a different team
      if (currentTeamId !== record.team_id) {
        console.log(`Mismatch for virtual player ID "${pId}": history has active for team "${record.team_id}", current is "${currentTeamId || 'FREE AGENT'}"`);
        
        await auctionSql`
          UPDATE player_history 
          SET 
            status = 'released',
            end_date = NOW(),
            end_reason = 'release',
            contract_end_season = ${record.season_id || 'SSPSLS18'},
            updated_at = NOW()
          WHERE player_id = ${record.player_id} AND team_id = ${record.team_id} AND status = 'active'
        `;
        closedCount++;
      }
    }
    console.log(`\n⭐ SWEEP COMPLETED: Closed ${closedCount} active history mismatch records for virtual players.`);
  } catch (err) {
    console.error(err);
  }
}
fixHistory();
