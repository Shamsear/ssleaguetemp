import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
        process.env[key] = val;
      }
    }
  });
}

async function main() {
  const { getMainDb } = await import('../lib/neon/main-config');
  const { adminDb } = await import('../lib/neon/admin-db-wrapper');
  const sql = getMainDb();

  // Check categories table
  try {
    const cats = await sql`SELECT * FROM categories`;
    console.log('Categories count in Neon SQL:', cats.length);
    console.log('Categories:', cats);
  } catch (e: any) {
    console.log('Categories err:', e.message);
  }

  // Check realplayers table
  try {
    const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'realplayers'`;
    console.log('realplayers columns:', cols.map((p: any) => p.column_name));
    const sample = await sql`SELECT * FROM realplayers LIMIT 5`;
    console.log('realplayers sample:', sample);
    const count = await sql`SELECT COUNT(*) FROM realplayers`;
    console.log('realplayers count in Neon SQL:', count[0].count);
  } catch (e: any) {
    console.log('realplayers err:', e.message);
  }

  // Check firestore realplayers / categories
  try {
    const fbCats = await adminDb.collection('categories').get();
    console.log('Firestore categories count:', fbCats.docs.length);
    fbCats.docs.forEach((d: any) => console.log('FB Cat:', d.id, d.data()));

    const fbPlayers = await adminDb.collection('realplayers').limit(5).get();
    console.log('Firestore realplayers sample count:', fbPlayers.docs.length);
    fbPlayers.docs.forEach((d: any) => console.log('FB Player:', d.id, d.data().name, d.data().category, d.data().categoryId));
  } catch (e: any) {
    console.log('FB err:', e.message);
  }

  process.exit(0);
}

main().catch(console.error);
