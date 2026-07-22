import { NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

export const dynamic = 'force-dynamic';
export const revalidate = 300; // Cache for 5 minutes

function isIndividualAward(type: string): boolean {
  if (!type) return false;
  const t = type.trim().toUpperCase();
  // Exclude team-based awards
  const teamAwards = [
    'TOD', 'TEAM OF THE DAY', 
    'TOW', 'TEAM OF THE WEEK',
    'WHITE CHAMPION', 'BLACK CHAMPION', 'RED 2 CHAMPION', 'BLUE CHAMPION',
    'DEVELOPMENT LEAGUE CHAMPION', 'DEVELOPMENT LEAGUE RUNNERS UP'
  ];
  return !teamAwards.includes(t);
}

function normalizeAwardType(type: string): string {
  if (!type) return 'Unknown Award';
  const t = type.trim().toUpperCase();
  if (t === 'GOLDEN BALL' || t === 'GOLDENBALL' || t === 'BEST PLAYER' || t === 'BEST ACTIVE PLAYER') {
    return 'Golden Ball / MVP';
  }
  if (t === 'GOLDEN BOOT' || t === 'GOLDENBOOT') {
    return 'Golden Boot';
  }
  if (t === 'GOLDEN GLOVE' || t === 'GOLDENGLOVE') {
    return 'Golden Glove';
  }
  if (t === 'POTW' || t === 'PLAYER OF THE WEEK') {
    return 'Player of the Week (POTW)';
  }
  if (t === 'POTD' || t === 'PLAYER OF THE DAY') {
    return 'Player of the Day (POTD)';
  }
  if (t === 'MANAGER OF THE SEASON' || t === 'MANAGER OF SEASON') {
    return 'Manager of the Season';
  }
  
  // Title case formatting
  return type.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

export async function GET() {
  const sql = getTournamentDb();
  try {
    // Query awards from both tables, including legacy and modern records
    const rawAwards = await sql`
      WITH combined_awards AS (
        SELECT 
          award_type,
          player_id,
          player_name,
          season_id,
          award_position as position,
          player_category as category,
          notes,
          NULL as round_number,
          NULL as team_name
        FROM player_awards
        WHERE award_position = 'Winner' OR award_position IS NULL
        
        UNION ALL
        
        SELECT 
          award_type,
          player_id,
          player_name,
          season_id,
          'Winner' as position,
          NULL as category,
          notes,
          round_number,
          team_name
        FROM awards
      )
      SELECT 
        a.*,
        COALESCE(
          a.team_name,
          (SELECT team FROM player_seasons ps WHERE ps.player_id = a.player_id AND ps.season_id = a.season_id LIMIT 1),
          (SELECT team FROM realplayerstats rps WHERE rps.player_id = a.player_id AND rps.season_id = a.season_id LIMIT 1)
        ) as team_name
      FROM combined_awards a
    `;

    // Group by normalized award type
    const groupedByAward: Record<string, any[]> = {};
    
    rawAwards.forEach((award: any) => {
      if (!isIndividualAward(award.award_type)) return;
      const normalizedType = normalizeAwardType(award.award_type);
      if (!groupedByAward[normalizedType]) {
        groupedByAward[normalizedType] = [];
      }
      
      groupedByAward[normalizedType].push({
        player_id: award.player_id,
        player_name: award.player_name,
        team_name: award.team_name,
        season_id: award.season_id,
        position: award.position,
        category: award.category,
        notes: award.notes || '',
        round_number: award.round_number
      });
    });

    // Sort awards within each category by season_id DESC, round_number DESC, player_name ASC
    Object.keys(groupedByAward).forEach((awardName) => {
      groupedByAward[awardName].sort((a: any, b: any) => {
        const getSeasonNum = (id: string) => {
          const m = id.match(/\d+/);
          return m ? parseInt(m[0]) : 0;
        };
        const numA = getSeasonNum(a.season_id);
        const numB = getSeasonNum(b.season_id);
        if (numB !== numA) {
          return numB - numA;
        }
        
        const roundA = a.round_number ? parseInt(a.round_number) : 0;
        const roundB = b.round_number ? parseInt(b.round_number) : 0;
        if (roundB !== roundA) {
          return roundB - roundA;
        }
        
        return (a.player_name || '').localeCompare(b.player_name || '');
      });
    });

    // Get combined award type statistics
    const awardStats = await sql`
      WITH combined_awards AS (
        SELECT award_type, player_id, season_id FROM player_awards WHERE award_position = 'Winner' OR award_position IS NULL
        UNION ALL
        SELECT award_type, player_id, season_id FROM awards
      )
      SELECT 
        award_type,
        COUNT(DISTINCT player_id) as unique_winners,
        COUNT(*) as total_awards_given,
        ARRAY_AGG(DISTINCT season_id) as seasons
      FROM combined_awards
      GROUP BY award_type
      ORDER BY total_awards_given DESC
    `;

    // Sort seasons array inside stats and filter individual awards
    const formattedStats = awardStats
      .filter((stat: any) => isIndividualAward(stat.award_type))
      .map((stat: any) => ({
        ...stat,
        seasons: Array.isArray(stat.seasons) 
          ? stat.seasons.sort((a: any, b: any) => {
              const numA = parseInt(String(a).replace(/\D/g, '')) || 0;
              const numB = parseInt(String(b).replace(/\D/g, '')) || 0;
              return numA - numB;
            }) 
          : []
      }));

    return NextResponse.json({
      success: true,
      data: {
        awardWinners: groupedByAward,
        awardStats: formattedStats
      }
    });
  } catch (error: any) {
    console.error('Error fetching award winners:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
