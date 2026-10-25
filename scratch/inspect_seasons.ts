import fs from 'fs';
import path from 'path';

const envFile = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf-8');
envFile.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[trimmed.substring(0, idx).trim()] = val;
    }
  }
});

import { getTournamentDb } from '../lib/neon/tournament-config';
import { adminDb } from '../lib/neon/admin-db-wrapper';

async function run() {
  const db = getTournamentDb();
  try {
    const seasons = await db`
      SELECT id, name, season_number, status, is_active, registration_open
      FROM seasons
      ORDER BY season_number DESC
    `;
    console.log('--- Seasons in TournamentDb ---');
    console.table(seasons);
  } catch (err: any) {
    console.log('TournamentDb seasons error:', err.message);
  }

  try {
    const snapshot = await adminDb.collection('seasons').get();
    console.log('--- Seasons in Firestore count:', snapshot.docs.length);
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      console.log(`Doc ID: ${doc.id} | name: ${data.name} | is_active: ${data.is_active} | isActive: ${data.isActive} | status: ${data.status} | totalTeams: ${data.totalTeams}`);
    });
  } catch (err: any) {
    console.log('Firestore seasons error:', err.message);
  }
}

run().catch(console.error);
