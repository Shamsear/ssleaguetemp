const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function checkFK() {
  console.log('🔍 Checking for foreign key constraints on the teams table...');

  try {
    // Check bids count for SSPSLS17
    const bidsCount = await sql`SELECT COUNT(*) as cnt FROM bids WHERE season_id = 'SSPSLS17'`;
    console.log(`- Table "bids" has ${bidsCount[0].cnt} records for SSPSLS17`);

    // Check football_slot_purchases
    const slotPurchasesCount = await sql`SELECT COUNT(*) as cnt FROM football_slot_purchases`;
    console.log(`- Table "football_slot_purchases" has ${slotPurchasesCount[0].cnt} total records`);

    // Check team_tiebreakers
    const teamTiebreakersCount = await sql`SELECT COUNT(*) as cnt FROM team_tiebreakers`;
    console.log(`- Table "team_tiebreakers" has ${teamTiebreakersCount[0].cnt} total records`);

    // Check tiebreakers
    const tiebreakersCount = await sql`SELECT COUNT(*) as cnt FROM tiebreakers`;
    console.log(`- Table "tiebreakers" has ${tiebreakersCount[0].cnt} total records`);

  } catch (error) {
    console.error('❌ Error checking FKs:', error);
  }
}

checkFK();
