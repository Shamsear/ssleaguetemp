import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { getMainDb, isMainDbAvailable } from '@/lib/neon/main-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { logAuditAction } from '@/lib/audit-logger';

export async function POST(request: NextRequest) {
  try {
    // 1. Verify committee admin or superadmin authentication
    const auth = await verifyAuth(['committee_admin', 'superadmin'], request);
    if (!auth.authenticated || !auth.user) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = await request.json();
    const { season_id, team_id, departing_player_id, incoming_player_id, category_id, reason } = body;

    if (!season_id || !team_id || !departing_player_id || !incoming_player_id) {
      return NextResponse.json(
        {
          success: false,
          error: 'season_id, team_id, departing_player_id, and incoming_player_id are required',
        },
        { status: 400 }
      );
    }

    if (!isMainDbAvailable()) {
      return NextResponse.json(
        { success: false, error: 'Database connection unavailable' },
        { status: 500 }
      );
    }

    const sql = getMainDb();
    const now = new Date().toISOString();

    // 3. Fetch departing player details
    const departingResult = await sql`
      SELECT * FROM realplayers
      WHERE id = ${departing_player_id} OR player_id = ${departing_player_id}
      LIMIT 1
    `;

    if (departingResult.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Departing player not found' },
        { status: 404 }
      );
    }

    const departingPlayer = departingResult[0];

    // 4. Fetch incoming player details
    const incomingResult = await sql`
      SELECT * FROM realplayers
      WHERE id = ${incoming_player_id} OR player_id = ${incoming_player_id}
      LIMIT 1
    `;

    if (incomingResult.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Incoming replacement player not found' },
        { status: 404 }
      );
    }

    const incomingPlayer = incomingResult[0];

    // Verify incoming player is not already on another team in this season
    if (incomingPlayer.team_id && incomingPlayer.team_id !== team_id && incomingPlayer.is_available === false) {
      return NextResponse.json(
        {
          success: false,
          error: `Replacement player ${incomingPlayer.name} is already assigned to another team`,
        },
        { status: 400 }
      );
    }

    // 5. Fetch team details for naming
    const teamResult = await sql`
      SELECT ts.team_name, ts.team_code
      FROM team_seasons ts
      WHERE ts.team_id = ${team_id} AND ts.season_id = ${season_id}
      LIMIT 1
    `;
    const teamName = teamResult[0]?.team_name || team_id;

    const assignedCategory = category_id || departingPlayer.category_id || null;

    // 6. Update database - Departing Player becomes Free Agent
    await sql`
      UPDATE realplayers
      SET
        team_id = NULL,
        team = NULL,
        is_available = true,
        updated_at = ${now},
        notes = CASE 
          WHEN notes IS NULL OR notes = '' THEN ${`Replaced by ${incomingPlayer.name} mid-season (${reason || 'No reason provided'})`}
          ELSE notes || ${` | Replaced by ${incomingPlayer.name} mid-season (${reason || 'No reason provided'})`}
        END
      WHERE id = ${departingPlayer.id} OR player_id = ${departingPlayer.player_id}
    `;

    // 7. Update database - Incoming Player assigned to Team
    await sql`
      UPDATE realplayers
      SET
        team_id = ${team_id},
        team = ${teamName},
        season_id = ${season_id},
        category_id = ${assignedCategory},
        is_available = false,
        is_active = true,
        updated_at = ${now},
        notes = CASE
          WHEN notes IS NULL OR notes = '' THEN ${`Replaced ${departingPlayer.name} mid-season (${reason || 'No reason provided'})`}
          ELSE notes || ${` | Replaced ${departingPlayer.name} mid-season (${reason || 'No reason provided'})`}
        END
      WHERE id = ${incomingPlayer.id} OR player_id = ${incomingPlayer.player_id}
    `;

    // 8. Log audit trail to Firestore
    try {
      await logAuditAction({
        action_type: 'apply_pending_allocations',
        user_id: auth.user.uid,
        user_email: auth.user.email,
        resource_type: 'player',
        resource_id: incomingPlayer.id || incomingPlayer.player_id,
        season_id: season_id,
        description: `Mid-season player swap: ${incomingPlayer.name} replaced ${departingPlayer.name} for team ${teamName}`,
        metadata: {
          team_id,
          team_name: teamName,
          departing_player_id: departingPlayer.player_id || departingPlayer.id,
          departing_player_name: departingPlayer.name,
          incoming_player_id: incomingPlayer.player_id || incomingPlayer.id,
          incoming_player_name: incomingPlayer.name,
          category_id: assignedCategory,
          reason: reason || 'Mid-season replacement',
        },
      });

      // Log transaction log entry
      await adminDb.collection('transactions').add({
        team_id: team_id,
        season_id: season_id,
        transaction_type: 'player_swap',
        description: `Mid-season swap: ${incomingPlayer.name} replaced ${departingPlayer.name}`,
        metadata: {
          departing_player_id: departingPlayer.player_id || departingPlayer.id,
          departing_player_name: departingPlayer.name,
          incoming_player_id: incomingPlayer.player_id || incomingPlayer.id,
          incoming_player_name: incomingPlayer.name,
          reason: reason || 'Mid-season replacement',
        },
        user_id: auth.user.uid,
        created_at: new Date(),
      });
    } catch (logErr) {
      console.error('[player-replacement] Error logging audit action/transaction:', logErr);
    }

    return NextResponse.json({
      success: true,
      message: `Successfully replaced ${departingPlayer.name} with ${incomingPlayer.name} on ${teamName}`,
      data: {
        departing_player: {
          id: departingPlayer.id,
          name: departingPlayer.name,
          status: 'Free Agent',
        },
        incoming_player: {
          id: incomingPlayer.id,
          name: incomingPlayer.name,
          team_id,
          team_name: teamName,
        },
      },
    });
  } catch (error: any) {
    console.error('[player-replacement] Error handling swap:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process player replacement' },
      { status: 500 }
    );
  }
}
