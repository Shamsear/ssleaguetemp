const { neon } = require('@neondatabase/serverless');
require('dotenv').config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL);

async function resetAcquisitionValue() {
  console.log('🔄 Resetting acquisition_value to 0 for all players in footballplayers table...');

  try {
    // 1. Get count before
    const beforeResult = await sql`
      SELECT COUNT(*) as cnt, COUNT(*) FILTER (WHERE acquisition_value != 0 OR acquisition_value IS NULL) as non_zero_cnt
      FROM footballplayers
    `;
    console.log(`📊 Total players: ${beforeResult[0].cnt}`);
    console.log(`📊 Players with non-zero/null acquisition_value: ${beforeResult[0].non_zero_cnt}`);

    // 2. Perform update
    const updateResult = await sql`
      UPDATE footballplayers
      SET acquisition_value = 0
    `;
    console.log(`✅ Successfully updated footballplayers table.`);

    // 3. Get count after to verify
    const afterResult = await sql`
      SELECT COUNT(*) as cnt, COUNT(*) FILTER (WHERE acquisition_value = 0) as zero_cnt
      FROM footballplayers
    `;
    console.log(`📊 Total players after: ${afterResult[0].cnt}`);
    console.log(`📊 Players with acquisition_value = 0: ${afterResult[0].zero_cnt}`);

    if (afterResult[0].cnt === afterResult[0].zero_cnt) {
      console.log('🎉 Verification SUCCESS: All players have acquisition_value set to 0!');
    } else {
      console.log('❌ Verification FAILED: Some players still do not have acquisition_value = 0.');
    }

  } catch (error) {
    console.error('❌ Error executing update:', error);
  }
}

resetAcquisitionValue();
