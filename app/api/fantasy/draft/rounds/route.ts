import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { broadcastFantasyDraftUpdate } from '@/lib/realtime/broadcast';

/**
 * GET /api/fantasy/draft/rounds?league_id=xxx
 * Fetch all draft rounds for a league.
 */
export async function GET(request: NextRequest) {
  try {
    const league_id = request.nextUrl.searchParams.get('league_id');
    if (!league_id) {
      return NextResponse.json({ error: 'Missing league_id' }, { status: 400 });
    }

    const rounds = await fantasySql`
      SELECT id, league_id, slot_index, slot_name, opens_at, closes_at, status, updated_at
      FROM fantasy_draft_rounds
      WHERE league_id = ${league_id}
      ORDER BY slot_index ASC
    `;

    return NextResponse.json({ success: true, rounds });
  } catch (error) {
    console.error('Error fetching draft rounds:', error);
    return NextResponse.json(
      { error: 'Failed to fetch draft rounds', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/fantasy/draft/rounds
 * Start / stop / adjust a specific slot's round.
 *
 * Body:
 *   league_id  – required
 *   slot_index – required
 *   action     – "start" | "close" | "adjust" | "reset"
 *   opens_at   – ISO string (for start / adjust)
 *   closes_at  – ISO string (for start / adjust)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { league_id, slot_index, action, opens_at, closes_at } = body;

    if (!league_id || slot_index === undefined || !action) {
      return NextResponse.json(
        { error: 'league_id, slot_index, and action are required' },
        { status: 400 }
      );
    }

    await fantasySql`SET timezone = 'UTC'`;

    const slotIdx = Number(slot_index);

    // Fetch existing round (or null)
    const existing = await fantasySql`
      SELECT * FROM fantasy_draft_rounds
      WHERE league_id = ${league_id} AND slot_index = ${slotIdx}
      LIMIT 1
    `;

    const currentStatus = existing[0]?.status || 'pending';

    // Build the new values
    let newStatus: string;
    let newOpensAt: string | null = null;
    let newClosesAt: string | null = null;

    switch (action) {
      case 'start':
        newStatus = 'active';
        newOpensAt = opens_at || null;
        newClosesAt = closes_at || null;
        break;
      case 'close':
        newStatus = 'closed';
        // Keep existing times unless overridden
        newOpensAt = opens_at || existing[0]?.opens_at || null;
        newClosesAt = closes_at || existing[0]?.closes_at || null;
        break;
      case 'adjust':
        // Only adjust times, keep current status
        newStatus = currentStatus;
        newOpensAt = opens_at || existing[0]?.opens_at || null;
        newClosesAt = closes_at || existing[0]?.closes_at || null;
        break;
      case 'reset':
        newStatus = 'pending';
        newOpensAt = null;
        newClosesAt = null;
        break;
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // Upsert the round row
    const queries: any[] = [];

    queries.push(fantasySql`
      INSERT INTO fantasy_draft_rounds (league_id, slot_index, slot_name, opens_at, closes_at, status)
      VALUES (
        ${league_id}, ${slotIdx},
        ${existing[0]?.slot_name || `Slot ${slotIdx}`},
        ${fantasySql.unsafe(newOpensAt ? `'${newOpensAt}'::timestamp AT TIME ZONE 'UTC'` : 'NULL')},
        ${fantasySql.unsafe(newClosesAt ? `'${newClosesAt}'::timestamp AT TIME ZONE 'UTC'` : 'NULL')},
        ${newStatus}
      )
      ON CONFLICT (league_id, slot_index) DO UPDATE SET
        opens_at = EXCLUDED.opens_at,
        closes_at = EXCLUDED.closes_at,
        status = EXCLUDED.status,
        updated_at = NOW()
      RETURNING *
    `);

    // If starting a round: reset team submissions and clear bids for this slot
    if (action === 'start' && currentStatus !== 'active') {
      queries.push(fantasySql`
        UPDATE fantasy_teams
        SET draft_submitted = false
        WHERE league_id = ${league_id}
      `);
      queries.push(fantasySql`
        DELETE FROM fantasy_draft_bids
        WHERE league_id = ${league_id} AND slot_index = ${slotIdx}
      `);
    }

    const results = await fantasySql.transaction(queries);
    const round = results[0]?.[0];

    console.log(`✅ Slot ${slotIdx} round ${action} → ${newStatus} for league ${league_id}`);

    // Broadcast
    await broadcastFantasyDraftUpdate(league_id, {
      draft_status: newStatus,
      slot_index: slotIdx,
      opens_at: newOpensAt,
      closes_at: newClosesAt,
    });

    return NextResponse.json({
      success: true,
      message: `Slot ${slotIdx} round ${action} successfully`,
      round,
    });
  } catch (error) {
    console.error('Error updating draft round:', error);
    return NextResponse.json(
      { error: 'Failed to update draft round', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
