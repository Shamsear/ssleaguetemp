const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function main() {
  try {
    const result = await sql`SELECT unaccent('Özil') as test`;
    console.log('✅ unaccent extension is enabled. Result:', result[0].test);
  } catch (err) {
    console.log('❌ unaccent extension is NOT enabled or failed:', err.message);
  }
}

main().catch(console.error);
