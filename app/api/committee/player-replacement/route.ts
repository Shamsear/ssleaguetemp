import { getTournamentDb } from '@/lib/neon/tournament-config';
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { getMainDb, isMainDbAvailable } from '@/lib/neon/main-config';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { logAuditAction } from '@/lib/audit-logger';

export async function POST(request: NextRequest) {
  try {
    // 1. Verify committee admin or superadmin authentication
    const auth = await verifyAuth(['committee_admin', 'committee', 'admin', 'super_admin', 'superadmin'], request);
    if (!auth.authenticated) {
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
    const cleanDepartingId = departing_player_id.split('_')[0];
    const cleanIncomingId = incoming_player_id.split('_')[0];

    // 3. Fetch departing player details
    let departingPlayer: any = null;
    const departingResult = await sql`
      SELECT * FROM realplayers
      WHERE id = ${departing_player_id} OR player_id = ${departing_player_id}
         OR id = ${cleanDepartingId} OR player_id = ${cleanDepartingId}
      LIMIT 1
    `;

    if (departingResult.length > 0) {
      departingPlayer = departingResult[0];
    } else {
      try {
        const { getTournamentDb } = await import('@/lib/neon/tournament-config');
        const tourneySql = getTournamentDb();
        const rpsRows = await tourneySql`
          SELECT id, player_id, player_name as name, team_id, category as category_id
          FROM realplayerstats
          WHERE (id = ${departing_player_id} OR player_id = ${departing_player_id} OR player_id = ${cleanDepartingId})
            AND season_id = ${season_id}
          LIMIT 1
        `;
        if (rpsRows.length > 0) {
          departingPlayer = rpsRows[0];
        }
      } catch (rpsErr) {
        console.warn('Fallback lookup in realplayerstats failed:', rpsErr);
      }
    }

    if (!departingPlayer) {
      return NextResponse.json(
        { success: false, error: 'Departing player not found' },
        { status: 404 }
      );
    }

    // 4. Fetch incoming player details
    let incomingPlayer: any = null;
    const incomingResult = await sql`
      SELECT * FROM realplayers
      WHERE id = ${incoming_player_id} OR player_id = ${incoming_player_id}
         OR id = ${cleanIncomingId} OR player_id = ${cleanIncomingId}
      LIMIT 1
    `;

    if (incomingResult.length > 0) {
      incomingPlayer = incomingResult[0];
    } else {
      try {
        const { getTournamentDb } = await import('@/lib/neon/tournament-config');
        const tourneySql = getTournamentDb();
        const rpsRows = await tourneySql`
          SELECT id, player_id, player_name as name, team_id, category as category_id
          FROM realplayerstats
          WHERE (id = ${incoming_player_id} OR player_id = ${incoming_player_id} OR player_id = ${cleanIncomingId})
            AND season_id = ${season_id}
          LIMIT 1
        `;
        if (rpsRows.length > 0) {
          incomingPlayer = rpsRows[0];
        }
      } catch (rpsErr) {
        console.warn('Fallback lookup for incoming player failed:', rpsErr);
      }
    }

    if (!incomingPlayer) {
      return NextResponse.json(
        { success: false, error: 'Incoming replacement player not found' },
        { status: 404 }
      );
    }

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
      WHERE (ts.team_id = ${team_id} OR ts.id = ${`${team_id}_${season_id}`}) AND ts.season_id = ${season_id}
      LIMIT 1
    `;
    const teamName = teamResult[0]?.team_name || team_id;

    const assignedCategory = category_id || departingPlayer.category_id || null;

    // 6. Update database - Departing Player becomes Free Agent
    try {
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
           OR id = ${cleanDepartingId} OR player_id = ${cleanDepartingId}
      `;
    } catch (realplayersErr) {
      console.warn('Error updating realplayers table for departing player:', realplayersErr);
    }

    // 7. Update database - Incoming Player assigned to Team
    try {
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
           OR id = ${cleanIncomingId} OR player_id = ${cleanIncomingId}
      `;
    } catch (realplayersErr) {
      console.warn('Error updating realplayers table for incoming player:', realplayersErr);
    }

    // 7b. Update Tournament DB realplayerstats, matchups, and lineups
    try {
      const { getTournamentDb } = await import('@/lib/neon/tournament-config');
      const tourneySql = getTournamentDb();
      const depId = departingPlayer.player_id || departingPlayer.id || cleanDepartingId;
      const incId = incomingPlayer.player_id || incomingPlayer.id || cleanIncomingId;
      const incName = incomingPlayer.name || incomingPlayer.player_name || 'Replacement Player';

      await tourneySql`
        UPDATE realplayerstats
        SET team_id = NULL, team = NULL, updated_at = NOW()
        WHERE (id = ${departing_player_id} OR player_id = ${depId} OR id = ${depId}) AND season_id = ${season_id}
      `;
      await tourneySql`
        UPDATE realplayerstats
        SET team_id = ${team_id}, team = ${teamName}, updated_at = NOW()
        WHERE (id = ${incoming_player_id} OR player_id = ${incId} OR id = ${incId}) AND season_id = ${season_id}
      `;

      // Update existing matchups for this season
      await tourneySql`
        UPDATE matchups
        SET home_player_id = ${incId}, home_player_name = ${incName}, updated_at = NOW()
        WHERE season_id = ${season_id} AND (home_player_id = ${depId} OR home_player_id = ${departing_player_id})
      `;
      await tourneySql`
        UPDATE matchups
        SET away_player_id = ${incId}, away_player_name = ${incName}, updated_at = NOW()
        WHERE season_id = ${season_id} AND (away_player_id = ${depId} OR away_player_id = ${departing_player_id})
      `;

      // Update starting_xi in lineups for this season
      const lineups = await tourneySql`SELECT id, starting_xi FROM lineups WHERE season_id = ${season_id}`;
      for (const l of lineups) {
        let xi = Array.isArray(l.starting_xi) ? [...l.starting_xi] : JSON.parse(l.starting_xi || '[]');
        if (xi.includes(depId) || xi.includes(departing_player_id)) {
          xi = xi.map((id: string) => (id === depId || id === departing_player_id ? incId : id));
          await tourneySql`
            UPDATE lineups
            SET starting_xi = ${JSON.stringify(xi)}::jsonb, updated_at = NOW()
            WHERE id = ${l.id}
          `;
        }
      }
    } catch (tourneyErr) {
      console.error('[player-replacement] Error updating realplayerstats/matchups/lineups:', tourneyErr);
    }

    // 8. Log audit trail to Firestore
    try {
      const currentUserId = auth.userId || auth.uid || 'system';
      await logAuditAction({
        action_type: 'apply_pending_allocations',
        user_id: currentUserId,
        user_email: 'committee@ssleague.com',
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
        user_id: currentUserId,
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
