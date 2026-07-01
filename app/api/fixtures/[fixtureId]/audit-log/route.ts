import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

/**
 * GET - Fetch audit log/timeline for a specific fixture
 * Shows complete history: creation, edits, result submissions, WO/NULL declarations, etc.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { fixtureId } = await params;

    if (!fixtureId) {
      return NextResponse.json(
        { error: 'fixtureId is required' },
        { status: 400 }
      );
    }

    // Fetch fixture details (only valid columns)
    const fixtures = await sql`
      SELECT 
        id,
        season_id,
        round_number,
        match_number,
        home_team_name,
        away_team_name,
        status,
        notes,
        created_at,
        updated_at,
        matchups_created_by,
        matchups_created_at,
        lineup_last_edited_by,
        lineup_last_edited_at
      FROM fixtures
      WHERE id = ${fixtureId}
      LIMIT 1
    `;

    if (fixtures.length === 0) {
      return NextResponse.json(
        { error: 'Fixture not found' },
        { status: 404 }
      );
    }

    const fixture = fixtures[0];

    // Fetch complete audit log using correct columns
    const auditLogs = await sql`
      SELECT 
        id,
        change_type,
        changed_by,
        changes,
        timestamp
      FROM fixture_audit_log
      WHERE fixture_id = ${fixtureId}
      ORDER BY timestamp ASC
    `;

    // Build comprehensive timeline
    const timeline: any[] = [];

    // 1. Creation event
    const createdAt = fixture.matchups_created_at || fixture.created_at;
    if (createdAt) {
      timeline.push({
        id: 'created',
        type: 'created',
        action: 'Fixture Created',
        user: fixture.matchups_created_by || 'System',
        user_id: fixture.matchups_created_by || 'system',
        timestamp: createdAt,
        icon: '📅',
        color: 'blue',
        details: `Round ${fixture.round_number}, Match ${fixture.match_number} created`,
      });
    }

    // 2. Add all audit log entries
    auditLogs.forEach((log) => {
      let action = '';
      let icon = '';
      let color = '';
      let details = '';

      switch (log.change_type) {
        case 'updated':
          action = 'Fixture Updated';
          icon = '✏️';
          color = 'yellow';
          details = getUpdateDetails(log.changes);
          break;
        case 'result_submitted':
        case 'result_edited':
          action = log.change_type === 'result_submitted' ? 'Result Submitted' : 'Result Edited';
          icon = '📊';
          color = 'green';
          details = getResultEditDetails(log.changes);
          break;
        case 'wo_declared':
          action = 'Walkover Declared';
          icon = '⚠️';
          color = 'red';
          details = getWODetails(log.changes);
          break;
        case 'null_declared':
          action = 'Match Nullified';
          icon = '❌';
          color = 'gray';
          details = log.changes?.note || 'Both teams absent - match declared null';
          break;
        case 'matchups_marked_null':
          action = 'Matchups Null Status Changed';
          icon = '🚫';
          color = 'purple';
          details = log.changes?.note || 'Matchup null status modified';
          break;
        default:
          action = log.change_type || 'Activity';
          icon = '📝';
          color = 'slate';
          details = log.changes?.note || log.changes?.reason || '';
      }

      timeline.push({
        id: log.id,
        type: log.change_type,
        action,
        user: log.changed_by || 'Committee Admin',
        user_id: log.changed_by,
        timestamp: log.timestamp,
        icon,
        color,
        details,
        changes: log.changes,
      });
    });

    // Sort timeline by timestamp
    timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    return NextResponse.json({
      success: true,
      fixture: {
        id: fixture.id,
        season_id: fixture.season_id,
        round_number: fixture.round_number,
        match_number: fixture.match_number,
        home_team: fixture.home_team_name,
        away_team: fixture.away_team_name,
        status: fixture.status,
        notes: fixture.notes
      },
      timeline,
      totalEvents: timeline.length,
    });
  } catch (error) {
    console.error('Error fetching fixture audit log:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fixture audit log' },
      { status: 500 }
    );
  }
}

// Helper functions to extract details from changes safely
function getUpdateDetails(changes: any): string {
  if (!changes) return 'Fixture details updated';
  
  const changedFields: string[] = [];
  const old = changes.old || {};
  const newData = changes.new || {};

  if (old.home_team_name !== newData.home_team_name) {
    changedFields.push(`Home team: ${old.home_team_name} → ${newData.home_team_name}`);
  }
  if (old.away_team_name !== newData.away_team_name) {
    changedFields.push(`Away team: ${old.away_team_name} → ${newData.away_team_name}`);
  }
  if (old.scheduled_date !== newData.scheduled_date) {
    changedFields.push(`Date changed`);
  }
  if (old.status !== newData.status) {
    changedFields.push(`Status: ${old.status} → ${newData.status}`);
  }

  return changedFields.length > 0 ? changedFields.join(', ') : 'Fixture details updated';
}

function getResultEditDetails(changes: any): string {
  if (!changes) return 'Result was edited';
  
  const old = changes.old || {};
  const newData = changes.new || {};
  
  if (old.home_score !== undefined && newData.home_score !== undefined) {
    return `Score changed: ${old.home_score}-${old.away_score} → ${newData.home_score}-${newData.away_score}`;
  }
  return changes.note || 'Result submitted/edited';
}

function getWODetails(changes: any): string {
  if (!changes) return 'Walkover declared';
  
  const reason = changes.reason || (changes.new && changes.new.match_status_reason);
  if (reason === 'wo_home_absent') {
    return `Home team absent`;
  } else if (reason === 'wo_away_absent') {
    return `Away team absent`;
  }
  return changes.note || 'Walkover declared';
}
