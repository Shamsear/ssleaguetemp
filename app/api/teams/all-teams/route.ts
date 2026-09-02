import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

export async function GET(request: NextRequest) {
  try {
    const sql = getTournamentDb();
    
    let neonTeams: any[] = [];
    try {
      neonTeams = await sql`SELECT id, name FROM teams`;
    } catch (e) {}

    let fbTeams: any[] = [];
    try {
      const fbTeamsSnap = await adminDb.collection('teams').get();
      fbTeamsSnap.docs.forEach(doc => {
        const d = doc.data();
        fbTeams.push({
          id: doc.id,
          name: d.name || d.team_name || '',
          logo_url: d.logo_url || d.logoUrl || d.logoURL || d.team_logo || null
        });
      });
    } catch (e) {}

    let fbTS: any[] = [];
    try {
      const fbTSSnap = await adminDb.collection('team_seasons').get();
      fbTSSnap.docs.forEach(doc => {
        const d = doc.data();
        fbTS.push({
          id: d.team_id || doc.id,
          name: d.team_name || d.name || '',
          logo_url: d.team_logo || d.logo_url || d.logoUrl || null
        });
      });
    } catch (e) {}

    const teamsMap = new Map();

    fbTeams.forEach((t: any) => {
      if (t.id && t.logo_url) teamsMap.set(t.id, t);
      if (t.name && t.logo_url) teamsMap.set(t.name.toLowerCase(), t);
    });

    fbTS.forEach((t: any) => {
      if (t.id && t.logo_url && !teamsMap.has(t.id)) teamsMap.set(t.id, t);
      if (t.name && t.logo_url && !teamsMap.has(t.name.toLowerCase())) teamsMap.set(t.name.toLowerCase(), t);
    });

    neonTeams.forEach((t: any) => {
      if (t.id && !teamsMap.has(t.id)) teamsMap.set(t.id, t);
      if (t.name && !teamsMap.has(t.name.toLowerCase())) teamsMap.set(t.name.toLowerCase(), t);
    });

    const data = Array.from(new Set(Array.from(teamsMap.values())));

    return NextResponse.json({
      success: true,
      data
    });
  } catch (error: any) {
    console.error('Error in /api/teams/all-teams:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
