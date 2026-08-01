import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

const tempConnectionString = process.env.TEMP_DATABASE_URL || process.env.NEON_DATABASE_URL || 'postgresql://neondb_owner:npg_8VjT5XvWkexd@ep-calm-sunset-a267j54f-pooler.eastus2.azure.neon.tech/neondb?sslmode=require';

const tempSql = neon(tempConnectionString) as any;

async function main() {
  const res = await tempSql.query("SELECT player_id, name, nationality FROM footballplayers WHERE name ILIKE '%Sanches%' OR name ILIKE '%Thiam%'");
  console.log('MATCHED PLAYERS:', res);
}

main().catch(console.error);
