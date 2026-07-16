import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const sql = neon(process.env.NEON_TOURNAMENT_DB_URL!);

async function listConstraints() {
  try {
    const constraints = await sql`
      SELECT 
        conname AS constraint_name, 
        contype AS constraint_type,
        pg_get_constraintdef(c.oid) AS constraint_definition
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE conrelid = 'realplayerstats'::regclass
    `;

    console.log('\n🔒 Constraints on realplayerstats:');
    constraints.forEach(con => {
      console.log(`  - Name: ${con.constraint_name}`);
      console.log(`    Type: ${con.constraint_type}`);
      console.log(`    Definition: ${con.constraint_definition}`);
    });
  } catch (error) {
    console.error('Error listing constraints:', error);
  }
}

listConstraints()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
