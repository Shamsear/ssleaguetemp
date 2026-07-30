import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local or .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

async function unretireEveryone() {
  try {
    console.log('🔄 Resetting retired column to false for all players...');
    const { sql } = await import('../lib/neon/config');
    const result = await sql`
      UPDATE footballplayers 
      SET retired = false
      RETURNING id
    `;
    console.log(`✅ Success! Updated ${result.length} players to be unretired.`);
  } catch (error) {
    console.error('❌ Error updating database:', error);
  }
}

unretireEveryone();
