import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

/**
 * GET /api/fantasy/teams/[teamId]/transferred-players
 * Get all players that were transferred out from this team with their points earned while on the team
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;

    if (!teamId) {
      return NextResponse.json(
        { error: 'Missing team_id parameter' },
        { status: 400 }
      );
    }

    // Get all transfers where a player was transferred out
    const transfers = await fantasySql`
      SELECT 
        ft.transfer_id,
        ft.player_out_id,
        ft.player_out_name,
        ft.transferred_at,
        ft.window_id
      FROM fantasy_transfers ft
      WHERE ft.team_id = ${teamId}
        AND ft.player_out_id IS NOT NULL
      ORDER BY ft.transferred_at DESC
    `;

    // Get historical players who earned points for this team but are no longer in squad
    const historicalTransfers = await fantasySql`
      SELECT DISTINCT fpp.real_player_id as player_out_id, fpp.player_name as player_out_name
      FROM fantasy_player_points fpp
      LEFT JOIN fantasy_squad fs ON (fpp.team_id = fs.team_id AND fpp.real_player_id = fs.real_player_id)
      WHERE fpp.team_id = ${teamId}
        AND fs.squad_id IS NULL
    `;

    // Combine player IDs
    const allOutMap = new Map();
    transfers.forEach((t: any) => {
      if (t.player_out_id) {
        allOutMap.set(t.player_out_id, {
          player_id: t.player_out_id,
          player_name: t.player_out_name,
          transferred_at: t.transferred_at,
          window_id: t.window_id,
        });
      }
    });

    historicalTransfers.forEach((ht: any) => {
      if (ht.player_out_id && !allOutMap.has(ht.player_out_id)) {
        allOutMap.set(ht.player_out_id, {
          player_id: ht.player_out_id,
          player_name: ht.player_out_name,
          transferred_at: null,
          window_id: null,
        });
      }
    });

    // For each transferred player, get their total points earned while on this team
    const transferredPlayers = await Promise.all(
      Array.from(allOutMap.values()).map(async (item: any) => {
        const pointsData = await fantasySql`
          SELECT 
            COALESCE(SUM(fpp.total_points), 0) as total_points,
            COUNT(fpp.id) as matches_played,
            COALESCE(SUM(fpp.goals_scored), 0) as total_goals,
            COALESCE(SUM(CASE WHEN fpp.is_clean_sheet THEN 1 ELSE 0 END), 0) as clean_sheets,
            COALESCE(SUM(CASE WHEN fpp.is_motm THEN 1 ELSE 0 END), 0) as motm_count,
            MIN(fpp.round_number) as min_round,
            MAX(fpp.round_number) as max_round
          FROM fantasy_player_points fpp
          WHERE fpp.team_id = ${teamId}
            AND fpp.real_player_id = ${item.player_id}
        `;

        const stats = pointsData[0] || {};
        const matchesPlayed = Number(stats.matches_played || 0);
        const totalPoints = Number(stats.total_points || 0);

        return {
          player_id: item.player_id,
          player_name: item.player_name,
          transferred_at: item.transferred_at,
          window_id: item.window_id,
          total_points: totalPoints,
          matches_played: matchesPlayed,
          total_goals: Number(stats.total_goals || 0),
          clean_sheets: Number(stats.clean_sheets || 0),
          motm_count: Number(stats.motm_count || 0),
          min_round: stats.min_round,
          max_round: stats.max_round,
          average_points: matchesPlayed > 0 
            ? Math.round((totalPoints / matchesPlayed) * 10) / 10
            : 0,
        };
      })
    );

    return NextResponse.json({
      success: true,
      transferred_players: transferredPlayers,
    });
  } catch (error: any) {
    console.error('Error fetching transferred players:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transferred players', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
