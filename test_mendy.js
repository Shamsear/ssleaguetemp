require('dotenv').config({ path: '.env.local' });
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);
async function run() {
  const result = await sql`SELECT id, name FROM footballplayers WHERE name = 'Ferland Mendy'`;
  console.log('Players named Ferland Mendy:', result);
  
  const gvardiol = await sql`SELECT id, name FROM footballplayers WHERE name = 'Joško Gvardiol'`;
  console.log('Players named Joško Gvardiol:', gvardiol);
}
run().catch(console.error);
