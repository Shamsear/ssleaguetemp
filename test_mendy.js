require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);
async function run() {
  const tp = await sql`
    SELECT t.name, t.season_id, tp.purchase_price, tp.round_id, tp.acquired_at
    FROM team_players tp 
    JOIN teams t ON tp.team_id = t.id 
    JOIN footballplayers p ON tp.player_id = p.id 
    WHERE p.name = 'Ferland Mendy'
  `;
  console.log('Ferland Mendy ownership:', tp);
  
  const bids = await sql`
    SELECT t.name as team_name, b.amount, b.status, b.round_id, b.created_at
    FROM bids b
    JOIN teams t ON b.team_id = t.id
    JOIN footballplayers p ON b.player_id = p.id
    WHERE p.name = 'Ferland Mendy'
  `;
  console.log('Ferland Mendy bids:', bids);
}
run().catch(console.error);
