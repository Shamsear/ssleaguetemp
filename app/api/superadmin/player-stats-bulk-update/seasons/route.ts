import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sql = getTournamentDb();

    // Get all unique seasons from realplayerstats table
    // This ensures we get all seasons that have player data, including historical ones
    const seasons = await sql`
      SELECT 
        season_id,
        COUNT(player_id) as player_count
      FROM realplayerstats
      WHERE season_id IS NOT NULL
      GROUP BY season_id
      ORDER BY 
        CASE 
          WHEN season_id ~ '^SSPSLS[0-9]+$' 
          THEN CAST(SUBSTRING(season_id FROM 'SSPSLS([0-9]+)') AS INTEGER)
          ELSE 0
        END DESC,
        season_id DESC
    `;

    // Format seasons to match expected structure
    const formattedSeasons = seasons.map((season: any) => {
      // Extract season number from ID (e.g., SSPSLS6 -> 6)
      const seasonNumber = season.season_id.match(/SSPSLS(\d+)/)?.[1];
      
      return {
        id: season.season_id,
        name: seasonNumber ? `Season ${seasonNumber}` : season.season_id,
        season_number: seasonNumber ? parseInt(seasonNumber) : null,
        player_count: parseInt(season.player_count) || 0
      };
    });

    return NextResponse.json({
      success: true,
      seasons: formattedSeasons
    });

  } catch (error: any) {
    console.error('Error fetching seasons from realplayerstats:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch seasons' },
      { status: 500 }
    );
  }
}
