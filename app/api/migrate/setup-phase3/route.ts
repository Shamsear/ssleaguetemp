/**
 * POST /api/migrate/setup-phase3
 * Creates fixture_lineups table in tournament Neon DB + seeds from Firebase
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/firebase/admin';

export async function POST(request: NextRequest) {
  try {
    const sql = getTournamentDb();
    const results: string[] = [];

    // Create fixture_lineups table
    const statements = [
      `CREATE TABLE IF NOT EXISTS fixture_lineups (
        id VARCHAR(255) PRIMARY KEY,
        fixture_id VARCHAR(255) NOT NULL,
        team_id VARCHAR(255) NOT NULL,
        season_id VARCHAR(255),
        selected_players JSONB DEFAULT '[]',
        is_locked BOOLEAN DEFAULT false,
        submitted_by VARCHAR(255),
        submitted_at TIMESTAMP,
        auto_populated BOOLEAN DEFAULT false,
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_fl_fixture_team ON fixture_lineups(fixture_id, team_id)`,
      `CREATE INDEX IF NOT EXISTS idx_fl_fixture_id ON fixture_lineups(fixture_id)`,
      `CREATE INDEX IF NOT EXISTS idx_fl_team_id ON fixture_lineups(team_id)`,
    ];

    for (const stmt of statements) {
      try {
        await sql.query(stmt);
        results.push(`✅ Table/index created`);
      } catch (e: any) {
        if (e.message?.includes('already exists')) results.push(`✅ Already exists`);
        else results.push(`❌ ${e.message?.substring(0, 80)}`);
      }
    }

    // Seed from Firebase
    console.log('🔄 Migrating fixture_lineups from Firebase...');
    const snapshot = await adminDb.collection('fixture_lineups').get();
    console.log(`📋 Found ${snapshot.size} fixture_lineups in Firebase`);
    let migrated = 0;

    for (const doc of snapshot.docs) {
      try {
        const data = doc.data();
        const id = doc.id;
        await sql`
          INSERT INTO fixture_lineups (
            id, fixture_id, team_id, season_id, selected_players,
            is_locked, submitted_by, submitted_at, auto_populated,
            raw_data, created_at, updated_at
          ) VALUES (
            ${id}, ${data.fixture_id || ''}, ${data.team_id || ''}, ${data.season_id || null},
            ${JSON.stringify(data.selected_players || [])}, ${data.is_locked || false},
            ${data.submitted_by || null},
            ${data.submitted_at?.toDate?.() ? data.submitted_at.toDate().toISOString() : (data.submitted_at || null)},
            ${data.auto_populated || false}, ${JSON.stringify(data)},
            ${data.created_at?.toDate?.() ? data.created_at.toDate().toISOString() : new Date().toISOString()},
            ${data.updated_at?.toDate?.() ? data.updated_at.toDate().toISOString() : new Date().toISOString()}
          )
          ON CONFLICT (id) DO UPDATE SET
            selected_players = EXCLUDED.selected_players,
            is_locked = EXCLUDED.is_locked,
            raw_data = EXCLUDED.raw_data,
            updated_at = NOW()
        `;
        migrated++;
      } catch (e: any) {
        console.error(`❌ Error migrating ${doc.id}:`, e.message);
      }
    }

    results.push(`✅ Seeded ${migrated}/${snapshot.size} fixture_lineups`);

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
