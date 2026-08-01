import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const mainConnectionString = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_8VjT5XvWkexd@ep-calm-sunset-a267j54f-pooler.eastus2.azure.neon.tech/neondb?sslmode=require';

const sql = neon(mainConnectionString) as any;

async function main() {
  const res = await sql.query("SELECT DISTINCT position_group FROM footballplayers WHERE position = 'CB'");
  console.log('DISTINCT POSITION GROUPS FOR CB:', res);
}

main().catch(console.error);
