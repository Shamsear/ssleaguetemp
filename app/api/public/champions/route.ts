import { NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // Cache for 5 minutes

export async function GET() {
  try {
    const sql = getTournamentDb();
    
    // Get all league/shield champions:
    //  - S1-S16 historical: trophy_type='league', trophy_name='League', position=1
    //  - S17+ committee/auto-awarded: identified by trophy_position='Shield Winner'
    const champions = await sql`
      SELECT 
        tt.team_id,
        tt.team_name,
        COUNT(DISTINCT tt.season_id) as championship_count,
        ARRAY_AGG(DISTINCT tt.season_id ORDER BY tt.season_id) as seasons_won,
        MAX(ts.points) as best_points,
        SUM(ts.wins) as total_wins,
        SUM(ts.goals_for) as total_goals
      FROM team_trophies tt
      LEFT JOIN (
        SELECT team_id, season_id, MAX(points) as points, SUM(wins) as wins, SUM(goals_for) as goals_for
        FROM teamstats
        GROUP BY team_id, season_id
      ) ts ON tt.team_id = ts.team_id AND tt.season_id = ts.season_id
      WHERE (
          -- S1-S16 historical: league type + league name + winner position
          (tt.trophy_type ILIKE 'league' AND tt.trophy_name ILIKE 'league' AND tt.position = 1)
          OR
          -- S17+ auto/committee awarded: trophy_position explicitly says 'Shield Winner'
          (tt.trophy_position ILIKE 'Shield Winner')
        )
      GROUP BY tt.team_id, tt.team_name
      ORDER BY championship_count DESC, tt.team_name ASC
    `;

    // Get cup/knockout tournament winners:
    //  - S1-S16 historical: trophy_type='cup', trophy_name='Cup', position=1
    //  - S17+ committee/auto-awarded: trophy_position='Knockout Winner' or 'Winner' (pure knockout, non-shield)
    const cupWinners = await sql`
      SELECT 
        team_id,
        team_name,
        COUNT(DISTINCT season_id) as cup_count,
        ARRAY_AGG(DISTINCT season_id ORDER BY season_id) as seasons
      FROM team_trophies
      WHERE (
          -- S1-S16 historical: exact cup type + cup name match (NOT league type)
          (trophy_type ILIKE 'cup' AND trophy_name ILIKE 'cup' AND position = 1)
          OR
          -- S17+ explicitly named knockout winner
          (trophy_position ILIKE 'Knockout Winner')
          OR
          -- S17+ pure knockout 'Winner' — exclude historical league trophies that also have position='Winner'
          (
            trophy_position ILIKE 'winner'
            AND trophy_position NOT ILIKE 'Shield%'
            AND NOT (trophy_type ILIKE 'league' AND trophy_name ILIKE 'league')
          )
        )
      GROUP BY team_id, team_name
      ORDER BY cup_count DESC, team_name ASC
    `;

    // Count total unique champions
    const totalChampionsCount = champions.length;

    return NextResponse.json({
      success: true,
      data: {
        champions,
        cupWinners,
        totalChampions: totalChampionsCount
      }
    });
  } catch (error: any) {
    console.error('Error fetching champions:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
