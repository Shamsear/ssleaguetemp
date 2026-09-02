import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

export async function GET(request: NextRequest) {
  try {
    const sql = getTournamentDb();
    
    // Fetch all teams from Neon teams & team_seasons tables
    let neonTeams: any[] = [];
    try {
      neonTeams = await sql`
        SELECT id, name, logo_url
        FROM teams
      `;
    } catch (e) {
      console.error('Error fetching Neon teams:', e);
    }

    let neonTeamSeasons: any[] = [];
    try {
      neonTeamSeasons = await sql`
        SELECT team_id as id, team_name as name, team_logo as logo_url
        FROM team_seasons
      `;
    } catch (e) {
      console.error('Error fetching Neon team_seasons:', e);
    }

    const teamsMap = new Map();

    neonTeams.forEach((t: any) => {
      if (t.id) teamsMap.set(t.id, t);
      if (t.name) teamsMap.set(t.name.toLowerCase(), t);
    });

    neonTeamSeasons.forEach((ts: any) => {
      if (ts.id && !teamsMap.has(ts.id)) {
        teamsMap.set(ts.id, ts);
      }
      if (ts.name && !teamsMap.has(ts.name.toLowerCase())) {
        teamsMap.set(ts.name.toLowerCase(), ts);
      }
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
