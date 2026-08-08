const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function main() {
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS unaccent;`;
    console.log('✅ Successfully created unaccent extension!');
    const result = await sql`SELECT unaccent('Özil') as test`;
    console.log('🎉 unaccent is now working! Result:', result[0].test);
  } catch (err) {
    console.log('❌ Failed to enable unaccent extension:', err.message);
  }
}

main().catch(console.error);
