import { neon } from '@neondatabase/serverless';
import { broadcastRoundUpdate } from '@/lib/realtime/broadcast';
import { sendNotificationToSeason } from '@/lib/notifications/send-notification';

const sql = neon(process.env.DATABASE_URL || process.env.NEON_DATABASE_URL!);

/**
 * Check for any scheduled rounds whose planned start time has passed,
 * and activate them automatically.
 * 
 * @param seasonId - Optional season ID to filter checks
 * @returns Array of activated rounds
 */
export async function checkAndStartScheduledRounds(seasonId?: string): Promise<any[]> {
  try {
    // Find all scheduled rounds that are due to start
    const roundsToStart = seasonId 
      ? await sql`
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
          WHERE r.status = 'scheduled'
            AND r.start_time <= NOW()
            AND r.season_id = ${seasonId}
        `
      : await sql`
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
          WHERE r.status = 'scheduled'
            AND r.start_time <= NOW()
        `;

    if (roundsToStart.length === 0) {
      return [];
    }

    console.log(`⏰ Found ${roundsToStart.length} scheduled round(s) ready to auto-start.`);

    const activatedRounds: any[] = [];

    for (const round of roundsToStart) {
      try {
        const scheduledStart = new Date(round.start_time).getTime();
        const scheduledEnd = new Date(round.end_time).getTime();
        const nowMs = Date.now();

        // Calculate expected duration
        const durationSeconds = round.duration_seconds || Math.round((scheduledEnd - scheduledStart) / 1000);
        
        // Late start Math: extend the deadline by the delayed start offset
        const newEndTime = new Date(nowMs + (durationSeconds * 1000));

        console.log(`🚀 Auto-activating round ${round.id} (${round.position}) - Late Start Math applied. New deadline: ${newEndTime.toISOString()}`);

        // Update round in database
        const updated = await sql`
          UPDATE rounds
          SET 
            status = 'active',
            start_time = NOW(),
            end_time = ${newEndTime.toISOString()},
            updated_at = NOW()
          WHERE id = ${round.id}
          RETURNING *
        `;

        // Send FCM notification
        try {
          const durationHours = durationSeconds / 3600;
          let durationText: string;
          if (durationHours >= 1) {
            durationText = `${durationHours.toFixed(1)} hour${durationHours !== 1 ? 's' : ''}`;
          } else {
            const durationMinutes = Math.round(durationSeconds / 60);
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
                roundId: round.id,
                position: round.position,
                endTime: newEndTime.toISOString()
              }
            },
            round.season_id
          );
        } catch (notifError) {
          console.error(`Failed to send auto-start notification for round ${round.id}:`, notifError);
        }

        // Send Firebase Realtime DB Broadcast
        try {
          await broadcastRoundUpdate(round.season_id, round.id, {
            type: 'round_started',
            status: 'active',
            round_id: round.id,
            position: round.position,
            end_time: newEndTime.toISOString(),
          });
        } catch (broadcastError) {
          console.error(`Firebase auto-start broadcast failed for round ${round.id}:`, broadcastError);
        }

        if (updated.length > 0) {
          activatedRounds.push(updated[0]);
        }
      } catch (roundError) {
        console.error(`Error activating scheduled round ${round.id}:`, roundError);
      }
    }

    return activatedRounds;
  } catch (error) {
    console.error('Error checking/starting scheduled rounds:', error);
    return [];
  }
}
