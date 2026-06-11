import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { triggerNews } from '@/lib/news/trigger';
import { broadcastFantasyDraftUpdate } from '@/lib/realtime/broadcast';
import { FantasyDraftService } from '@/lib/fantasy/draft-service';
import { validateBody, DraftPlayerSchema, formatValidationErrors } from '@/lib/fantasy/validation';
import { formatErrorResponse } from '@/lib/fantasy/errors';

/**
 * POST /api/fantasy/draft/player
 * Draft a player for a fantasy team
 */
export async function POST(request: NextRequest) {
  try {
    // Validate request body
    const validation = await validateBody(request, DraftPlayerSchema);
    
    if (!validation.success) {
      return NextResponse.json(
        formatValidationErrors(validation.errors),
        { status: 400 }
      );
    }

    const body = validation.data;

    // Use draft service
    const draftService = new FantasyDraftService(fantasySql, getTournamentDb());
    
    const result = await draftService.draftPlayer({
      user_id: body.user_id,
      real_player_id: body.real_player_id,
      player_name: body.player_name,
      position: body.position,
      team_name: body.team_name,
      draft_price: body.draft_price,
    });

    // Get team and league info for news trigger
    const team = await fantasySql`
      SELECT ft.team_id, ft.team_name, ft.league_id, fl.season_id
      FROM fantasy_teams ft
      JOIN fantasy_leagues fl ON ft.league_id = fl.league_id
      WHERE ft.owner_uid = ${body.user_id}
      LIMIT 1
    `;
    
    const teamData = team[0];

    // Trigger news for fantasy draft milestone (every 10 drafts)
    if (result.squad_size % 10 === 0) {
      try {
        await triggerNews('fantasy_draft', {
          season_id: teamData.season_id || null,
          league_id: teamData.league_id,
          total_drafted: result.squad_size,
          player_name: body.player_name,
          team_name: teamData.team_name,
        });
      } catch (newsError) {
        console.error('Failed to generate fantasy draft news:', newsError);
      }
    }

    // Broadcast to Firebase Realtime DB
    await broadcastFantasyDraftUpdate(teamData.league_id, {
      type: 'player_drafted',
      team_id: teamData.team_id,
      player_name: body.player_name,
      position: body.position,
      draft_price: body.draft_price,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error drafting player:', error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      {
        error: errorResponse.code,
        message: errorResponse.message,
        details: errorResponse.details,
      },
      { status: errorResponse.statusCode }
    );
  }
}

/**
 * DELETE /api/fantasy/draft/player
 * Remove a drafted player from squad (during draft period only)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const user_id = searchParams.get('user_id');
    const real_player_id = searchParams.get('real_player_id');

    if (!user_id || !real_player_id) {
      return NextResponse.json(
        { 
          error: 'VALIDATION_ERROR',
          message: 'Missing required parameters: user_id, real_player_id',
          code: 'VALIDATION_ERROR'
        },
        { status: 400 }
      );
    }

    // Use draft service
    const draftService = new FantasyDraftService(fantasySql, getTournamentDb());
    
    const result = await draftService.removePlayer({
      user_id,
      real_player_id,
    });

    // Get team info for broadcast
    const team = await fantasySql`
      SELECT team_id, league_id
      FROM fantasy_teams
      WHERE owner_uid = ${user_id}
      LIMIT 1
    `;

    if (team.length > 0) {
      // Broadcast to Firebase Realtime DB
      await broadcastFantasyDraftUpdate(team[0].league_id, {
        type: 'player_undrafted',
        team_id: team[0].team_id,
        player_name: result.player_name,
        refunded_amount: result.refunded_amount,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error removing player:', error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      {
        error: errorResponse.code,
        message: errorResponse.message,
        details: errorResponse.details,
      },
      { status: errorResponse.statusCode }
    );
  }
}
