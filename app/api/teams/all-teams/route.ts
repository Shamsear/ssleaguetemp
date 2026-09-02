import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';

export async function GET(request: NextRequest) {
  try {
    const sql = getTournamentDb();
    
    let neonTeams: any[] = [];
    try {
      neonTeams = await sql`
        SELECT id, name, logo_url FROM teams
      `;
    } catch (e) {
      console.error('Error fetching Neon teams:', e);
    }

    let fbTeams: any[] = [];
    try {
      const fbTeamsSnap = await adminDb.collection('teams').get();
      fbTeams = fbTeamsSnap.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          name: d.name || d.team_name || '',
          logo_url: d.logo_url || d.logoUrl || d.logoURL || d.team_logo || null
        };
      });
    } catch (e) {
      console.error('Error fetching Firebase teams:', e);
    }

    const teamsMap = new Map();
    neonTeams.forEach((t: any) => {
      if (t.id) teamsMap.set(t.id, t);
      if (t.name) teamsMap.set(t.name.toLowerCase(), t);
    });
    fbTeams.forEach((t: any) => {
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
