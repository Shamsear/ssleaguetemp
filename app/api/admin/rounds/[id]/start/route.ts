import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { verifyAuth } from '@/lib/auth-helper';
import { broadcastRoundUpdate } from '@/lib/realtime/broadcast';
import { sendNotificationToSeason } from '@/lib/notifications/send-notification';

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL!);

/**
 * POST /api/admin/rounds/[id]/start
 * Manually activate a scheduled round.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Verify authorization
    const auth = await verifyAuth(['admin', 'committee_admin']);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: roundId } = await params;

    // 2. Fetch round details
    const roundResult = await sql`
      SELECT 
        r.id,
        r.season_id,
        r.position,
        r.start_time,
        r.end_time,
        r.duration_seconds,
        r.status,
        s.auction_window
      FROM rounds r
      LEFT JOIN auction_settings s ON r.auction_settings_id = s.id
      WHERE r.id = ${roundId}
    `;

    if (roundResult.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Round not found' },
        { status: 404 }
      );
    }

    const round = roundResult[0];

    if (round.status !== 'scheduled') {
      return NextResponse.json(
        { success: false, error: `Only scheduled rounds can be started. Current status: ${round.status}` },
        { status: 400 }
      );
    }

    const scheduledStart = new Date(round.start_time).getTime();
    const scheduledEnd = new Date(round.end_time).getTime();
    const actualStart = Date.now();

    // Default duration is from database or calculated from end - start
    const durationSeconds = round.duration_seconds || Math.round((scheduledEnd - scheduledStart) / 1000);
    
    let newEndTime: Date;

    if (actualStart < scheduledStart && scheduledEnd > actualStart) {
      // --- Option C: Round started sooner than planned ---
      // The deadline remains fixed at the originally scheduled end_time.
      newEndTime = new Date(scheduledEnd);
      console.log(`⏰ Round ${roundId} started early. Keeping original end_time: ${newEndTime.toISOString()}`);
    } else {
      // --- Round started late or original end_time has already passed ---
      // Shift deadline forward to preserve full planned duration.
      newEndTime = new Date(actualStart + (durationSeconds * 1000));
      console.log(`⏰ Round ${roundId} started late or early with past end_time. Setting/Extending end_time to preserve duration: ${newEndTime.toISOString()}`);
    }

    // 3. Update the round in Neon
    const updatedRound = await sql`
      UPDATE rounds
      SET 
        status = 'active',
        start_time = NOW(),
        end_time = ${newEndTime.toISOString()},
        updated_at = NOW()
      WHERE id = ${roundId}
      RETURNING *
    `;

    // 4. Send FCM notification to all teams in the season
    try {
      console.log(`📣 Sending start notification for manually activated round: ${roundId}`);
      
      const actualDurationSeconds = Math.round((newEndTime.getTime() - actualStart) / 1000);
      const durationHours = actualDurationSeconds / 3600;
      let durationText: string;
      if (durationHours >= 1) {
        durationText = `${durationHours.toFixed(1)} hour${durationHours.toFixed(1) !== '1.0' ? 's' : ''}`;
        durationText = durationText.replace('.0', ''); // Clean up trailing .0 for whole hours
      } else {
        const durationMinutes = Math.round(actualDurationSeconds / 60);
        durationText = `${durationMinutes} minute${durationMinutes !== 1 ? 's' : ''}`;
      }

      const windowName = (round.auction_window || 'auction').replace('_', ' ').toUpperCase();

      await sendNotificationToSeason(
        {
          title: `🎯 New ${windowName} Round!`,
          body: `${round.position} bidding is now open. Duration: ${durationText}. Place your bids now!`,
          url: `/dashboard/team`,
          icon: '/logo.png',
          data: {
            type: 'round_started',
            roundId: roundId,
            position: round.position,
            endTime: newEndTime.toISOString()
          }
        },
        round.season_id
      );
    } catch (notifError) {
      console.error('Failed to send activation notification:', notifError);
    }

    // 5. Broadcast round started via Firebase Realtime DB
    try {
      await broadcastRoundUpdate(round.season_id, roundId, {
        type: 'round_started',
        status: 'active',
        round_id: roundId,
        position: round.position,
        end_time: newEndTime.toISOString(),
      });
      console.log(`✅ Round activated broadcast sent for round ${roundId}`);
    } catch (broadcastError) {
      console.error('❌ Firebase activation broadcast failed:', broadcastError);
    }

    return NextResponse.json({
      success: true,
      data: updatedRound[0],
      message: 'Round started successfully',
    });

  } catch (error: any) {
    console.error('Error starting scheduled round:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
