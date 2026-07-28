import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';
import { adminDb } from '@/lib/firebase/admin';

const sql = neon(process.env.NEON_TOURNAMENT_DB_URL!);

/**
 * Get all users who have enabled notifications
 * GET /api/notifications/users
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication (only committee/admin can view notification users)
    const auth = await verifyAuth(['admin', 'committee_admin', 'committee_admin'], request);
    if (!auth.authenticated) {
      return NextResponse.json(
        { success: false, error: auth.error || 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get all users with active notification tokens grouped by user_id
    let result;
    try {
      // First check if fcm_tokens table exists
      const tableCheck = await sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'fcm_tokens'
        );
      `;

      console.log('[Notifications Users API] FCM tokens table exists:', tableCheck[0]?.exists);

      if (!tableCheck[0]?.exists) {
        return NextResponse.json({
          success: true,
          users: [],
          total: 0,
          message: 'FCM tokens table does not exist. Users need to enable notifications first.'
        });
      }

      // Check total rows in fcm_tokens
      const countResult = await sql`
        SELECT COUNT(*) as total FROM fcm_tokens WHERE is_active = true
      `;
      console.log('[Notifications Users API] Total active tokens:', countResult[0]?.total);

      // Get users from Neon (just the tokens, no team data yet)
      result = await sql`
        SELECT 
          user_id,
          COUNT(*) as device_count,
          json_agg(
            json_build_object(
              'deviceName', device_name,
              'deviceType', device_type,
              'browser', browser,
              'os', os
            )
          ) as devices
        FROM fcm_tokens
        WHERE is_active = true
        GROUP BY user_id
        ORDER BY device_count DESC
      `;

      console.log('[Notifications Users API] Found grouped users:', result.length);

    } catch (dbError: any) {
      console.error('[Notifications Users API] Database error:', dbError);
      // Handle case where table doesn't exist yet
      if (dbError.message?.includes('does not exist')) {
        return NextResponse.json({
          success: true,
          users: [],
          total: 0,
          message: 'No notification users found. FCM tokens table may not exist.'
        });
      }
      throw dbError;
    }

    // Now fetch team names from Firebase for each user
    // The user_id in fcm_tokens is the Firebase Auth UID
    // Need to find how teams are actually stored
    const usersWithTeamNames = await Promise.all(
      result.map(async (row) => {
        let teamName = null;
        let email = null;
        let teamLogo = null;
        
        try {
          console.log('[Notifications Users API] Looking up team for user_id:', row.user_id);
          
          // Try 1: Direct document lookup by Firebase Auth UID
          let teamDoc = await adminDb.collection('teams').doc(row.user_id).get();
          
          if (teamDoc.exists) {
            const teamData = teamDoc.data();
            teamName = teamData?.team_name || teamData?.name || null;
            email = teamData?.email || null;
            teamLogo = teamData?.logo_url || teamData?.team_logo || null;
            console.log('[Notifications Users API] Found team (direct):', teamName);
          } else {
            // Try 2: Look in team_seasons collection (which we know exists)
            const teamSeasonsQuery = await adminDb
              .collection('team_seasons')
              .where('user_id', '==', row.user_id)
              .limit(1)
              .get();
            
            if (!teamSeasonsQuery.empty) {
              const teamSeasonData = teamSeasonsQuery.docs[0].data();
              teamName = teamSeasonData?.team_name || null;
              email = teamSeasonData?.email || null;
              teamLogo = teamSeasonData?.logo_url || teamSeasonData?.team_logo || null;
              console.log('[Notifications Users API] Found team (team_seasons):', teamName);
            } else {
              console.log('[Notifications Users API] No team found in teams or team_seasons for:', row.user_id);
            }
          }
        } catch (firebaseError) {
          console.error('[Notifications Users API] Error fetching team for user:', row.user_id, firebaseError);
        }

        return {
          userId: row.user_id,
          teamName: teamName || row.user_id.substring(0, 8) + '...', // Show partial ID as fallback
          email,
          teamLogo,
          deviceCount: parseInt(row.device_count),
          devices: row.devices
        };
      })
    );

    console.log('[Notifications Users API] Returning users count:', usersWithTeamNames.length);

    return NextResponse.json({
      success: true,
      users: usersWithTeamNames,
      total: usersWithTeamNames.length
    });

  } catch (error: any) {
    console.error('[Notifications Users API] Error fetching notification users:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch notification users' },
      { status: 500 }
    );
  }
}
