require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);
async function run() {
  const result = await sql`SELECT id, name, team_id, team_name, is_sold, contract_start_season, contract_end_season FROM footballplayers WHERE name IN ('Vitinha', 'Jorrel Hato', 'Eduardo Camavinga')`;
  console.log(result);
  
  const tpResult = await sql`SELECT * FROM team_players WHERE player_id IN (SELECT id FROM footballplayers WHERE name IN ('Vitinha', 'Jorrel Hato', 'Eduardo Camavinga'))`;
  console.log('team_players records:', tpResult);
}
run().catch(console.error);
