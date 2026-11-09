import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { adminAuth } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { triggerNews } from '@/lib/news/trigger';
import { logInitialBalance } from '@/lib/transaction-logger';
import { getFantasyDb } from '@/lib/neon/fantasy-config';
import { sendNotification } from '@/lib/notifications/send-notification';
import { getOrCreateTeamCashBalance, recordCashDeduction } from '@/lib/cash-balance-utils';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get userId from request body (sent by client after authentication)
    const body = await request.json();
    let { action, userId, managerName, joinFantasy } = body; // NEW: Added managerName and joinFantasy

    if (!userId && !body.teamId && !body.team_id) {
      return NextResponse.json({
        success: false,
        message: 'Unauthorized - No user ID provided',
      }, { status: 401 });
    }

    const { id: seasonId } = await params;

    if (!action || !['join', 'decline'].includes(action)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid action. Must be "join" or "decline"',
      }, { status: 400 });
    }

    // Check if season exists
    const seasonDoc = await adminDb.collection('seasons').doc(seasonId).get();
    if (!seasonDoc.exists) {
      return NextResponse.json({
        success: false,
        message: 'Season not found',
      }, { status: 404 });
    }

    const seasonData = seasonDoc.data()!;

    // Support team lookup by teamId or userId
    let teamDocId: string = body.teamId || '';
    let existingTeamQuery: any = { empty: true };

    if (teamDocId) {
      const teamDoc = await adminDb.collection('teams').doc(teamDocId).get();
      if (teamDoc.exists) {
        existingTeamQuery = { empty: false, docs: [teamDoc] };
      }
    }

    if (existingTeamQuery.empty && userId) {
      // Check if userId is actually a team ID
      const teamDoc = await adminDb.collection('teams').doc(userId).get();
      if (teamDoc.exists) {
        teamDocId = userId;
        existingTeamQuery = { empty: false, docs: [teamDoc] };
      }
    }

    if (existingTeamQuery.empty && userId) {
      // Fallback: Try to find team by owner_uid
      const teamQuery = await adminDb.collection('teams')
        .where('owner_uid', '==', userId)
        .limit(1)
        .get();

      if (!teamQuery.empty) {
        teamDocId = teamQuery.docs[0].id;
        existingTeamQuery = teamQuery;
      }
    }

    if (existingTeamQuery.empty) {
      console.error(`❌ No team document found for teamId: ${body.teamId}, userId: ${userId}`);
      return NextResponse.json({
        success: false,
        message: 'Team not found. Please complete team registration first.',
      }, { status: 404 });
    }

    const existingTeamDoc = existingTeamQuery.docs[0];
    const existingTeamData = existingTeamDoc.data();

    // Try to load user data if available, but fallback gracefully to team data
    let userData: any = null;
    const lookupUserId = userId || existingTeamData.owner_uid || existingTeamData.userId;
    if (lookupUserId) {
      try {
        const userDoc = await adminDb.collection('users').doc(lookupUserId).get();
        if (userDoc.exists) {
          userData = userDoc.data();
        }
      } catch (uErr) {
        console.warn('Optional user doc fetch warning:', uErr);
      }
    }

    if (!userData) {
      userData = {
        teamName: existingTeamData.team_name || existingTeamData.name || 'Team',
        username: existingTeamData.owner_name || 'Owner',
        email: existingTeamData.owner_email || existingTeamData.userEmail || '',
        logoUrl: existingTeamData.logo_url || existingTeamData.logo || null,
      };
    }

    const teamName = userData.teamName || existingTeamData.team_name || existingTeamData.name || 'Team';
    if (!userId) {
      userId = lookupUserId || teamDocId;
    }

    // Check if team has already made a decision for this season
    let teamSeasonId = `${teamDocId}_${seasonId}`;
    const existingTeamSeason = await adminDb.collection('team_seasons').doc(teamSeasonId).get();

    if (existingTeamSeason.exists) {
      const existingData = existingTeamSeason.data()!;
      
      if (existingData.status === 'registered') {
        return NextResponse.json({
          success: false,
          message: 'You have already joined this season',
        }, { status: 400 });
      }
      
      // If they declined before, only block if they are trying to decline again
      if (existingData.status === 'declined' && action === 'decline') {
        return NextResponse.json({
          success: false,
          message: 'You have already declined this season',
        }, { status: 400 });
      }
      
      console.log(`🔄 Team previously declined but is now joining season: ${seasonId}`);
    }

    if (action === 'join') {
      console.log(`📝 Creating dual currency registration for ${teamName}: ${seasonId}`);

      const batch = adminDb.batch();

      // Team must exist at this point (we returned error above if not)
      // Update team with current season only
      const existingData = existingTeamData;
      const updatedSeasons = existingData.seasons
        ? [...existingData.seasons, seasonId]
        : [seasonId];

      const teamRef = adminDb.collection('teams').doc(teamDocId);
      batch.update(teamRef, {
        seasons: updatedSeasons,
        current_season_id: seasonId,
        total_seasons_participated: updatedSeasons.length,
        logo_url: userData.logoUrl || null,
        teamLogo: userData.logoUrl || null, // Update both fields
        email: userData.email || existingData.email || '',
        updated_at: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(), // Update both fields
        // Add manager name if provided
        ...(managerName && { manager_name: managerName }),
        // Update fantasy participation if opted in
        ...(joinFantasy && {
          fantasy_participating: true,
          fantasy_joined_at: FieldValue.serverTimestamp()
        })
      });

      // NOTE: teamstats entries will be created when teams are assigned to tournaments
      // Don't create them here since we need tournament_id for the new ID format (teamid_tournamentid)

      // Recalculate teamSeasonId in case teamDocId was updated
      teamSeasonId = `${teamDocId}_${seasonId}`;

      // Create team_seasons record using utility function (always uses new format)
      const { prepareTeamSeasonData } = require('@/lib/team-season-utils');
      
      // Determine budgets based on season configuration (always dual currency now)
      const footballBudget = seasonData.euro_budget || seasonData.purseAmount || 10000;
      
      // Determine real player budget from season settings, falling back to 400 for S18+ or 1000
      const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
      const realPlayerBudget = seasonData.dollar_budget ? Number(seasonData.dollar_budget) : (seasonNum >= 18 ? 400 : 1000);
      
      const teamSeasonData = prepareTeamSeasonData({
        teamId: teamDocId,
        teamName: teamName,
        seasonId: seasonId,
        seasonName: seasonData.name || seasonId,
        userId: userId,
        username: userData.username || '',
        footballBudget: footballBudget,
        realPlayerBudget: realPlayerBudget,
        baseSlots: seasonData.max_football_players || 25,
      });
      
      // Add position counts (not in utility function)
      teamSeasonData.position_counts = {
        GK: 0,
        CB: 0,
        LB: 0,
        RB: 0,
        DMF: 0,
        CMF: 0,
        AMF: 0,
        LMF: 0,
        RMF: 0,
        LWF: 0,
        RWF: 0,
        SS: 0,
        CF: 0,
      };
      
      // Add team metadata
      const resolvedLogo = userData?.logoUrl || userData?.teamLogo || existingTeamData?.logo_url || existingTeamData?.team_logo || existingTeamData?.logoUrl || existingTeamData?.teamLogo || existingTeamData?.logo || '';
      teamSeasonData.team_email = userData.email;
      teamSeasonData.team_logo = resolvedLogo;
      teamSeasonData.logo_url = resolvedLogo;
      teamSeasonData.joined_at = FieldValue.serverTimestamp();
      
      const teamSeasonRef = adminDb.collection('team_seasons').doc(teamSeasonId);
      batch.set(teamSeasonRef, teamSeasonData);

      // Log initial balance transactions for dual currency
      await logInitialBalance(
        teamDocId,
        seasonId,
        footballBudget,
        'football_budget' as any // eCoin for football players
      );
      
      await logInitialBalance(
        teamDocId,
        seasonId,
        realPlayerBudget,
        'real_player_budget' as any // SSCoin for real players
      );

      console.log(`✅ Created dual currency registration for ${teamName}: ${teamSeasonId}`);

      // Commit all operations
      await batch.commit();

      // 6. Record Season Cash Deduction
      try {
        const cashBalance = await getOrCreateTeamCashBalance(teamDocId, teamName);
        const deductionAmount = 100;
        await recordCashDeduction(teamDocId, teamName, deductionAmount, seasonId);
      } catch (cashError) {
        console.error('Failed to process cash deduction:', cashError);
        // Don't fail the registration if cash deduction recording fails
      }

      // Update season participant count (separate operation)
      await adminDb.collection('seasons').doc(seasonId).update({
        participant_count: FieldValue.increment(1),
        updated_at: FieldValue.serverTimestamp(),
      });

      // Create fantasy team if user opted in
      if (joinFantasy) {
        try {
          const fantasySql = getFantasyDb();

          // Determine league ID (format: SSPSLFLS + season number)
          const seasonNumber = seasonId.replace('SSPSLS', '');
          const leagueId = `SSPSLFLS${seasonNumber}`;

          console.log(`🎮 Creating fantasy team for ${teamName} in league ${leagueId}`);

          // Ensure fantasy league exists for this season
          const leagueResult = await fantasySql`
            SELECT budget_per_team FROM fantasy_leagues 
            WHERE league_id = ${leagueId}
            LIMIT 1
          `;
          let budgetPerTeam = 100.00;
          if (leagueResult.length === 0) {
            await fantasySql`
              INSERT INTO fantasy_leagues (
                league_id, season_id, season_name, league_name,
                budget_per_team, max_squad_size, max_transfers_per_window,
                points_cost_per_transfer, is_active, created_at, updated_at
              ) VALUES (
                ${leagueId}, ${seasonId}, ${seasonData.name || `Season ${seasonNumber}`},
                ${`${seasonData.name || `Season ${seasonNumber}`} Fantasy League`},
                100.00, 15, 2, 4, true, NOW(), NOW()
              )
              ON CONFLICT (league_id) DO NOTHING
            `;
          } else {
            budgetPerTeam = leagueResult[0]?.budget_per_team || 100.00;
          }

          // Create fantasy team entry with proper fields
          await fantasySql`
            INSERT INTO fantasy_teams (
              team_id,
              league_id,
              real_team_id,
              real_team_name,
              team_name,
              owner_uid,
              owner_name,
              budget_remaining,
              total_points,
              rank,
              is_enabled,
              created_at,
              updated_at
            ) VALUES (
              ${teamDocId},
              ${leagueId},
              ${teamDocId},
              ${teamName},
              ${teamName},
              ${userId},
              ${userData.username || teamName},
              ${budgetPerTeam},
              0,
              999,
              true,
              NOW(),
              NOW()
            )
            ON CONFLICT (team_id) DO UPDATE SET
              is_enabled = true,
              budget_remaining = ${budgetPerTeam},
              updated_at = NOW()
          `;

          console.log(`✅ Fantasy team created: ${teamDocId}`);
        } catch (fantasyError) {
          console.error('Failed to create fantasy team:', fantasyError);
          // Don't fail the registration if fantasy team creation fails
        }
      }

      // Background news trigger (non-blocking)
      (async () => {
        try {
          const totalTeams = seasonData?.participant_count || 1;
          const isReturning = existingTeamData?.seasons && existingTeamData.seasons.length > 1;
          const teamLogo = userData?.logoUrl || existingTeamData?.logo_url || null;
          await triggerNews('team_registered' as any, {
            season_id: seasonId,
            team_name: teamName,
            total_teams: totalTeams,
            is_returning: isReturning,
            team_logo: teamLogo,
          });
        } catch (newsError) {
          console.error('Failed to generate team registration news:', newsError);
        }
      })().catch(() => {});

      // Background notifications (non-blocking)
      (async () => {
        try {
          await (sendNotification as any)(
            {
              title: '✅ Registration Complete!',
              body: `Welcome to ${seasonData.name}! Start building your team!`,
              url: `/dashboard/team`,
              icon: '/logo.png',
              data: {
                type: 'season_registration',
                season_id: seasonId,
                currency_system: 'dual',
                football_budget: footballBudget.toString(),
                real_player_budget: realPlayerBudget.toString(),
              }
            },
            teamDocId
          );

          await sendNotification(
            {
              title: `📝 New Season Sign-up: ${teamName}`,
              body: `${teamName} has registered to participate in ${seasonData.name || seasonId}.`,
              url: `/dashboard/committee/registration`
            },
            { isCommittee: true }
          );
        } catch (notifError) {
          console.error('Notification error:', notifError);
        }
      })().catch(() => {});

      return NextResponse.json({
        success: true,
        message: `Successfully joined ${seasonData.name}!`,
        data: {
          season_id: seasonId,
          season_name: seasonData.name,
          currency_system: 'dual',
          football_budget: footballBudget,
          real_player_budget: realPlayerBudget,
          status: 'registered',
        },
      });
    } else if (action === 'decline') {
      // Create team_seasons record for declining
      const declineData: any = {
        team_id: teamDocId, // Fix: Use correct teamDocId
        user_id: userId, // For backwards compatibility
        season_id: seasonId,
        team_name: userData.teamName || userData.username || 'Team',
        username: userData.username || '',
        owner_name: userData.username || '',
        team_email: userData.email,
        team_logo: userData?.logoUrl || userData?.teamLogo || existingTeamData?.logo_url || existingTeamData?.team_logo || '',
        logo_url: userData?.logoUrl || userData?.teamLogo || existingTeamData?.logo_url || existingTeamData?.team_logo || '',
        status: 'declined',
        players_count: 0,
        position_counts: {
          GK: 0,
          CB: 0,
          LB: 0,
          RB: 0,
          DMF: 0,
          CMF: 0,
          AMF: 0,
          LMF: 0,
          RMF: 0,
          LWF: 0,
          RWF: 0,
          SS: 0,
          CF: 0,
        },
        declined_at: FieldValue.serverTimestamp(),
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      };

      // Fix: Add zero balance for dual currency system
      declineData.football_budget = 0;
      declineData.football_spent = 0;
      declineData.real_player_budget = 0;
      declineData.real_player_spent = 0;
      declineData.currency_system = 'dual';

      await adminDb.collection('team_seasons').doc(teamSeasonId).set(declineData);

      // Notify committee admins
      try {
        await sendNotification(
          {
            title: `❌ Season Declined: ${teamName}`,
            body: `${teamName} has declined to join ${seasonData.name || seasonId}.`,
            url: `/dashboard/committee/registration`
          },
          { isCommittee: true }
        );
      } catch (adminNotifError) {
        console.error('Failed to notify admins of team decline:', adminNotifError);
      }

      return NextResponse.json({
        success: true,
        message: `You have declined ${seasonData.name}. You can join future seasons.`,
        data: {
          season_id: seasonId,
          season_name: seasonData.name,
          status: 'declined',
        },
      });
    }

  } catch (error: any) {
    console.error('Error processing season registration:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal server error - Failed to process registration',
    }, { status: 500 });
  }
}
