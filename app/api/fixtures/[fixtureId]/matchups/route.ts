import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { verifyAuth } from '@/lib/auth-helper';

export const dynamic = 'force-dynamic';
import { isRoundStartedFromDeadline, materializeTripleThreatMatchups } from '@/lib/lineup-validation';
import { computeISTResultDeadline } from '@/lib/utils/timezone';
import { getAuctionDb } from '@/lib/neon/auction-config';
import { sendNotificationToSeason } from '@/lib/notifications/send-notification';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { syncPlayerStatsForSeason } from '@/lib/neon/sync-player-stats';
import {
  calculateTripleThreatFixture,
  normalizeResultGoals,
  resolveTripleThreatMode,
} from '@/lib/tournament/triple-threat-engine';

/**
 * Distribute match rewards (eCoin & SSCoin) to teams based on match result
 */
async function distributeMatchRewards(params: {
  fixtureId: string;
  matchResult: 'home_win' | 'away_win' | 'draw';
  seasonId: string;
  roundNumber: number;
  leg: number;
}) {
  const sql = getTournamentDb();
  const { fixtureId, matchResult, seasonId, roundNumber, leg } = params;

  // Check if rewards have already been distributed for this fixture (in Firebase)
  const existingRewardsSnapshot = await adminDb.collection('transactions')
    .where('transaction_type', '==', 'match_reward')
    .limit(1000)
    .get();

  const hasExistingReward = existingRewardsSnapshot.docs.some(doc => {
    const description = doc.data().description || '';
    return description.includes(`Fixture: ${fixtureId}`);
  });

  if (hasExistingReward) {
    console.log(`⚠️ Match rewards already distributed for fixture ${fixtureId}, skipping duplicate distribution`);
    return;
  }

  // Get fixture details
  const [fixture] = await sql`
    SELECT home_team_id, away_team_id, tournament_id
    FROM fixtures
    WHERE id = ${fixtureId}
    LIMIT 1
  `;

  if (!fixture) {
    console.log('Fixture not found for rewards distribution');
    return;
  }

  const { home_team_id, away_team_id, tournament_id } = fixture;

  // Get tournament rewards configuration
  const [tournament] = await sql`
    SELECT rewards
    FROM tournaments
    WHERE id = ${tournament_id}
    LIMIT 1
  `;

  if (!tournament || !tournament.rewards || !tournament.rewards.match_results) {
    console.log(`No match rewards configured for tournament ${tournament_id}`);
    return;
  }

  const matchRewards = tournament.rewards.match_results;

  // Determine rewards for each team
  let homeECoin = 0, homeSSCoin = 0, awayECoin = 0, awaySSCoin = 0;
  let homeResult = '', awayResult = '';

  if (matchResult === 'home_win') {
    homeECoin = matchRewards.win_ecoin || 0;
    homeSSCoin = matchRewards.win_sscoin || 0;
    awayECoin = matchRewards.loss_ecoin || 0;
    awaySSCoin = matchRewards.loss_sscoin || 0;
    homeResult = 'Win';
    awayResult = 'Loss';
  } else if (matchResult === 'away_win') {
    homeECoin = matchRewards.loss_ecoin || 0;
    homeSSCoin = matchRewards.loss_sscoin || 0;
    awayECoin = matchRewards.win_ecoin || 0;
    awaySSCoin = matchRewards.win_sscoin || 0;
    homeResult = 'Loss';
    awayResult = 'Win';
  } else {
    homeECoin = matchRewards.draw_ecoin || 0;
    homeSSCoin = matchRewards.draw_sscoin || 0;
    awayECoin = matchRewards.draw_ecoin || 0;
    awaySSCoin = matchRewards.draw_sscoin || 0;
    homeResult = 'Draw';
    awayResult = 'Draw';
  }

  // Distribute rewards to home team
  if (homeECoin > 0 || homeSSCoin > 0) {
    // Update team budgets in Firebase
    const teamSeasonDocId = `${home_team_id}_${seasonId}`;
    const teamSeasonRef = adminDb.collection('team_seasons').doc(teamSeasonDocId);
    const teamSeasonDoc = await teamSeasonRef.get();

    if (teamSeasonDoc.exists) {
      const currentFootballBudget = teamSeasonDoc.data()?.football_budget || 0;
      const currentRealBudget = teamSeasonDoc.data()?.real_player_budget || 0;

      await teamSeasonRef.update({
        football_budget: currentFootballBudget + homeECoin,
        real_player_budget: currentRealBudget + homeSSCoin,
        updated_at: new Date()
      });

      // Also update Neon auction database teams table (football_budget only, SSCoin stays in Firebase)
      try {
        const auctionSql = getAuctionDb();
        await auctionSql`
          UPDATE teams
          SET 
            football_budget = COALESCE(football_budget, 0) + ${homeECoin},
            updated_at = NOW()
          WHERE id = ${home_team_id}
        `;
        console.log(`✅ Updated Neon teams table for ${home_team_id}: +${homeECoin} eCoin`);
      } catch (neonError) {
        console.error(`⚠️  Failed to update Neon teams table for ${home_team_id}:`, neonError);
        // Don't fail the whole operation if Neon update fails
      }

      // Record transactions in Firebase (separate for eCoin and SSCoin)
      if (homeECoin > 0) {
        await adminDb.collection('transactions').add({
          team_id: home_team_id,
          season_id: seasonId,
          transaction_type: 'match_reward',
          currency_type: 'football',
          amount: homeECoin,
          description: `Match Reward (${homeResult}) - Round ${roundNumber}${leg > 1 ? ' Leg ' + leg : ''} - eCoin - Fixture: ${fixtureId}`,
          created_at: new Date(),
          updated_at: new Date(),
          metadata: {
            fixture_id: fixtureId,
            round_number: roundNumber,
            leg: leg,
            result: homeResult,
            currency: 'ecoin'
          }
        });
      }

      if (homeSSCoin > 0) {
        await adminDb.collection('transactions').add({
          team_id: home_team_id,
          season_id: seasonId,
          transaction_type: 'match_reward',
          currency_type: 'real',
          amount: homeSSCoin,
          description: `Match Reward (${homeResult}) - Round ${roundNumber}${leg > 1 ? ' Leg ' + leg : ''} - SSCoin - Fixture: ${fixtureId}`,
          created_at: new Date(),
          updated_at: new Date(),
          metadata: {
            fixture_id: fixtureId,
            round_number: roundNumber,
            leg: leg,
            result: homeResult,
            currency: 'sscoin'
          }
        });
      }

      console.log(`✅ Distributed match rewards to home team ${home_team_id}: eCoin ${homeECoin}, SSCoin ${homeSSCoin}`);
    }
  }

  // Distribute rewards to away team
  if (awayECoin > 0 || awaySSCoin > 0) {
    // Update team budgets in Firebase
    const teamSeasonDocId = `${away_team_id}_${seasonId}`;
    const teamSeasonRef = adminDb.collection('team_seasons').doc(teamSeasonDocId);
    const teamSeasonDoc = await teamSeasonRef.get();

    if (teamSeasonDoc.exists) {
      const currentFootballBudget = teamSeasonDoc.data()?.football_budget || 0;
      const currentRealBudget = teamSeasonDoc.data()?.real_player_budget || 0;

      await teamSeasonRef.update({
        football_budget: currentFootballBudget + awayECoin,
        real_player_budget: currentRealBudget + awaySSCoin,
        updated_at: new Date()
      });

      // Also update Neon auction database teams table (football_budget only, SSCoin stays in Firebase)
      try {
        const auctionSql = getAuctionDb();
        await auctionSql`
          UPDATE teams
          SET 
            football_budget = COALESCE(football_budget, 0) + ${awayECoin},
            updated_at = NOW()
          WHERE id = ${away_team_id}
        `;
        console.log(`✅ Updated Neon teams table for ${away_team_id}: +${awayECoin} eCoin`);
      } catch (neonError) {
        console.error(`⚠️  Failed to update Neon teams table for ${away_team_id}:`, neonError);
        // Don't fail the whole operation if Neon update fails
      }

      // Record transactions in Firebase (separate for eCoin and SSCoin)
      if (awayECoin > 0) {
        await adminDb.collection('transactions').add({
          team_id: away_team_id,
          season_id: seasonId,
          transaction_type: 'match_reward',
          currency_type: 'football',
          amount: awayECoin,
          description: `Match Reward (${awayResult}) - Round ${roundNumber}${leg > 1 ? ' Leg ' + leg : ''} - eCoin - Fixture: ${fixtureId}`,
          created_at: new Date(),
          updated_at: new Date(),
          metadata: {
            fixture_id: fixtureId,
            round_number: roundNumber,
            leg: leg,
            result: awayResult,
            currency: 'ecoin'
          }
        });
      }

      if (awaySSCoin > 0) {
        await adminDb.collection('transactions').add({
          team_id: away_team_id,
          season_id: seasonId,
          transaction_type: 'match_reward',
          currency_type: 'real',
          amount: awaySSCoin,
          description: `Match Reward (${awayResult}) - Round ${roundNumber}${leg > 1 ? ' Leg ' + leg : ''} - SSCoin - Fixture: ${fixtureId}`,
          created_at: new Date(),
          updated_at: new Date(),
          metadata: {
            fixture_id: fixtureId,
            round_number: roundNumber,
            leg: leg,
            result: awayResult,
            currency: 'sscoin'
          }
        });
      }

      console.log(`✅ Distributed match rewards to away team ${away_team_id}: eCoin ${awayECoin}, SSCoin ${awaySSCoin}`);
    }
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { fixtureId } = await params;

    // Check Triple Threat round-start gate so matchups do not leak away lineups pre-start
    const metaRows = await sql`
      SELECT
        f.tournament_id, f.status as fixture_status,
        t.tournament_type, ts.matchday_format,
        rd.scheduled_date, rd.scheduled_date::text as scheduled_date_str,
        rd.round_start_time, rd.status as round_status
      FROM fixtures f
      LEFT JOIN tournaments t ON f.tournament_id = t.id
      LEFT JOIN tournament_settings ts ON t.id = ts.tournament_id
      LEFT JOIN round_deadlines rd ON (
        f.round_number = rd.round_number
        AND f.season_id = rd.season_id
        AND f.tournament_id = rd.tournament_id
        AND (f.leg IS NULL OR rd.leg IS NULL OR f.leg = rd.leg)
      )
      WHERE f.id = ${fixtureId}
      LIMIT 1
    `;

    const meta = metaRows[0];
    const isTT = Boolean(
      meta && (
        meta.tournament_type === 'triple_threat' ||
        meta.matchday_format === 'triple_threat' ||
        String(meta.tournament_id || '').toLowerCase().includes('triple_threat')
      )
    );

    const roundStarted = meta
      ? isRoundStartedFromDeadline({
          round_status: meta.round_status,
          fixture_status: meta.fixture_status,
          scheduled_date: meta.scheduled_date,
          scheduled_date_str: meta.scheduled_date_str,
          round_start_time: meta.round_start_time,
        })
      : true;

    if (isTT && !roundStarted) {
      const auth = await verifyAuth(undefined, request);
      const roleLower = String(auth.role || '').toLowerCase();
      const isAdmin = Boolean(
        auth.authenticated &&
        ['committee_admin', 'super_admin', 'superadmin', 'admin'].includes(roleLower)
      );
      if (!isAdmin) {
        return NextResponse.json(
          {
            matchups: [],
            hidden_until_round_start: true,
          },
          { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
        );
      }
    }

    // Get matchups for this fixture
    let matchups = await sql`
      SELECT * FROM matchups
      WHERE fixture_id = ${fixtureId}
      ORDER BY position ASC
    `;

    // Once Triple Threat round starts, auto-materialize matchups if both teams already submitted
    if (isTT && roundStarted && matchups.length === 0) {
      try {
        const res = await materializeTripleThreatMatchups(sql, fixtureId);
        if (res.created) {
          matchups = await sql`
            SELECT * FROM matchups
            WHERE fixture_id = ${fixtureId}
            ORDER BY position ASC
          `;
        }
      } catch (matErr) {
        console.warn('Could not auto-materialize Triple Threat matchups on read:', matErr);
      }
    }

    return NextResponse.json(
      { matchups },
      { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
    );
  } catch (error: any) {
    console.error('Error fetching matchups:', error);
    return NextResponse.json(
      { error: 'Failed to fetch matchups' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { fixtureId } = await params;
    const body = await request.json();
    const { matchups, created_by, allow_overwrite } = body;

    console.log('📥 Received matchups data:', {
      fixtureId,
      created_by,
      matchupsCount: matchups?.length,
      isArray: Array.isArray(matchups),
      allow_overwrite,
      firstMatchup: matchups?.[0]
    });

    // Validate
    if (!matchups || !Array.isArray(matchups) || matchups.length === 0) {
      console.error('❌ Validation failed:', { matchups, isArray: Array.isArray(matchups), length: matchups?.length });
      return NextResponse.json(
        { error: 'Invalid matchups data' },
        { status: 400 }
      );
    }

    // Get fixture to extract season_id, round_number, and tournament_id
    const fixtures = await sql`
      SELECT
        f.season_id, f.round_number, f.tournament_id,
        f.home_team_id, f.away_team_id, f.home_team_name, f.away_team_name,
        f.scoring_system, f.knockout_format,
        t.tournament_type, ts.matchday_format
      FROM fixtures f
      LEFT JOIN tournaments t ON f.tournament_id = t.id
      LEFT JOIN tournament_settings ts ON t.id = ts.tournament_id
      WHERE f.id = ${fixtureId}
      LIMIT 1
    `;

    if (fixtures.length === 0) {
      return NextResponse.json(
        { error: 'Fixture not found' },
        { status: 404 }
      );
    }

    const fixture = fixtures[0];
    const { season_id: seasonId, round_number: roundNumber, tournament_id: tournamentId, home_team_id, away_team_id, home_team_name, away_team_name } = fixture;

    // Special mode: manual pairing of the 2 Duo (2 × 1v1) matchups after Co-op & Single auto-creation
    if (body.mode === 'triple_threat_duo') {
      if (matchups.length !== 2) {
        return NextResponse.json(
          { error: 'Duo (2 × 1v1) mode requires exactly 2 matchups' },
          { status: 400 }
        );
      }

      const normalizedDuo = matchups.map((m: any, idx: number) => {
        const homeId = String(m.home_player_id || m.home_player_ids?.[0] || '').trim();
        const homeName = String(m.home_player_name || m.home_player_names?.[0] || '').trim();
        const awayId = String(m.away_player_id || m.away_player_ids?.[0] || '').trim();
        const awayName = String(m.away_player_name || m.away_player_names?.[0] || '').trim();
        const dur = Number(m.match_duration);
        return {
          position: idx === 0 ? 2 : 3,
          home_player_id: homeId,
          home_player_name: homeName,
          away_player_id: awayId,
          away_player_name: awayName,
          match_duration: Number.isFinite(dur) && dur > 0 ? dur : 6,
        };
      });

      const homeDuoIds = normalizedDuo.map((m) => m.home_player_id).filter(Boolean);
      const awayDuoIds = normalizedDuo.map((m) => m.away_player_id).filter(Boolean);
      if (new Set(homeDuoIds).size !== 2 || new Set(awayDuoIds).size !== 2) {
        return NextResponse.json(
          { error: 'Duo (2 × 1v1) requires 2 distinct Home players and 2 distinct Away players' },
          { status: 400 }
        );
      }

      const existingRows = await sql`
        SELECT position, match_mode, home_player_id, home_player_ids, away_player_id, away_player_ids
        FROM matchups
        WHERE fixture_id = ${fixtureId}
      `;

      const existingDuoCount = existingRows.filter(
        (r: any) => r.match_mode === 'duo' || r.position === 2 || r.position === 3
      ).length;

      if (existingDuoCount > 0 && !allow_overwrite) {
        return NextResponse.json(
          {
            error: 'MATCHUPS_ALREADY_EXIST',
            message: 'Duo matchups have already been created for this fixture',
          },
          { status: 409 }
        );
      }

      const nonDuoHomeIds = new Set<string>();
      const nonDuoAwayIds = new Set<string>();
      existingRows
        .filter((r: any) => r.match_mode !== 'duo' && r.position !== 2 && r.position !== 3)
        .forEach((r: any) => {
          (Array.isArray(r.home_player_ids) && r.home_player_ids.length > 0 ? r.home_player_ids : [r.home_player_id])
            .filter(Boolean)
            .forEach((id: any) => nonDuoHomeIds.add(String(id)));
          (Array.isArray(r.away_player_ids) && r.away_player_ids.length > 0 ? r.away_player_ids : [r.away_player_id])
            .filter(Boolean)
            .forEach((id: any) => nonDuoAwayIds.add(String(id)));
        });

      if (homeDuoIds.some((id) => nonDuoHomeIds.has(id)) || awayDuoIds.some((id) => nonDuoAwayIds.has(id))) {
        return NextResponse.json(
          { error: 'Players already assigned to Co-op or Single cannot be used in Duo matchups' },
          { status: 400 }
        );
      }

      if (existingDuoCount > 0) {
        await sql`
          DELETE FROM matchups
          WHERE fixture_id = ${fixtureId}
            AND (match_mode = 'duo' OR position IN (2, 3))
        `;
      }

      for (const m of normalizedDuo) {
        await sql`
          INSERT INTO matchups (
            fixture_id, season_id, tournament_id, round_number, position, match_mode,
            home_player_id, home_player_name, away_player_id, away_player_name,
            home_player_ids, home_player_names, away_player_ids, away_player_names,
            match_duration, created_by, created_at, updated_at
          ) VALUES (
            ${fixtureId}, ${seasonId}, ${tournamentId}, ${roundNumber}, ${m.position}, 'duo',
            ${m.home_player_id}, ${m.home_player_name},
            ${m.away_player_id}, ${m.away_player_name},
            ${[m.home_player_id]}, ${[m.home_player_name]},
            ${[m.away_player_id]}, ${[m.away_player_name]},
            ${m.match_duration}, ${created_by || 'team'}, NOW(), NOW()
          )
        `;
      }

      await sql`
        UPDATE fixtures
        SET
          matchups_created_by = COALESCE(matchups_created_by, ${created_by || 'team'}),
          matchups_created_at = COALESCE(matchups_created_at, NOW()),
          updated_at = NOW()
        WHERE id = ${fixtureId}
      `;

      // Sync Duo order into lineups.triple_threat_lineup while keeping Co-op & Single intact
      const syncSideDuoLineup = async (teamId: string | null | undefined, duoPairs: Array<{ player_id: string; player_name: string }>) => {
        if (!teamId || duoPairs.length !== 2) return;
        try {
          const rows = await sql`
            SELECT id, triple_threat_lineup
            FROM lineups
            WHERE fixture_id = ${fixtureId}
              AND team_id = ${teamId}
              AND COALESCE(submitted_by, '') <> 'system_auto'
            LIMIT 1
          `;
          if (rows.length === 0 || !rows[0].triple_threat_lineup) return;
          const existingTT = rows[0].triple_threat_lineup;
          const nextTT = {
            coop: Array.isArray(existingTT.coop) ? existingTT.coop : [],
            duo: duoPairs,
            single: Array.isArray(existingTT.single) ? existingTT.single : [],
          };
          const nextStartingXi = [
            ...(Array.isArray(nextTT.coop) ? nextTT.coop : []).map((p: any, i: number) => ({ ...p, mode: 'coop', slot: i + 1 })),
            ...duoPairs.map((p: any, i: number) => ({ ...p, mode: 'duo', slot: i + 1 })),
            ...(Array.isArray(nextTT.single) ? nextTT.single : []).map((p: any, i: number) => ({ ...p, mode: 'single', slot: i + 1 })),
          ];
          await sql`
            UPDATE lineups
            SET
              triple_threat_lineup = ${JSON.stringify(nextTT)}::jsonb,
              starting_xi = ${JSON.stringify(nextStartingXi)}::jsonb,
              updated_at = NOW()
            WHERE id = ${rows[0].id}
          `;
        } catch (syncErr) {
          console.warn('Could not sync Duo lineup order:', syncErr);
        }
      };

      await Promise.all([
        syncSideDuoLineup(home_team_id, normalizedDuo.map((m) => ({ player_id: m.home_player_id, player_name: m.home_player_name }))),
        syncSideDuoLineup(away_team_id, normalizedDuo.map((m) => ({ player_id: m.away_player_id, player_name: m.away_player_name }))),
      ]);

      const updatedMatchups = await sql`
        SELECT * FROM matchups
        WHERE fixture_id = ${fixtureId}
        ORDER BY position ASC
      `;

      return NextResponse.json({
        success: true,
        message: 'Duo (2 × 1v1) matchups created successfully',
        was_overwritten: existingDuoCount > 0,
        matchups: updatedMatchups,
      });
    }

    // Check if matchups already exist
    const existingMatchups = await sql`
      SELECT COUNT(*) as count
      FROM matchups
      WHERE fixture_id = ${fixtureId}
    `;

    const matchupsExist = existingMatchups[0].count > 0;

    // If matchups exist and we're not explicitly allowing overwrite, reject
    if (matchupsExist && !allow_overwrite) {
      console.log('⚠️ Race condition detected: Matchups already exist');
      return NextResponse.json(
        {
          error: 'MATCHUPS_ALREADY_EXIST',
          message: 'Fixture has already been created by the other team'
        },
        { status: 409 } // 409 Conflict
      );
    }

    // If overwriting, delete existing matchups
    let wasOverwritten = false;
    if (matchupsExist) {
      console.log('🗑️ Deleting existing matchups for overwrite');
      await sql`
        DELETE FROM matchups
        WHERE fixture_id = ${fixtureId}
      `;
      wasOverwritten = true;
    }

    // Insert new matchups
    for (const matchup of matchups) {
      await sql`
        INSERT INTO matchups (
          fixture_id,
          season_id,
          tournament_id,
          round_number,
          home_player_id,
          home_player_name,
          away_player_id,
          away_player_name,
          position,
          match_duration,
          created_by,
          created_at
        ) VALUES (
          ${fixtureId},
          ${seasonId},
          ${tournamentId},
          ${roundNumber},
          ${matchup.home_player_id},
          ${matchup.home_player_name},
          ${matchup.away_player_id},
          ${matchup.away_player_name},
          ${matchup.position},
          ${matchup.match_duration || 6},
          ${created_by},
          NOW()
        )
      `;
    }

    // Update fixture with creation tracking
    await sql`
      UPDATE fixtures
      SET 
        matchups_created_by = ${created_by},
        matchups_created_at = NOW(),
        updated_at = NOW()
      WHERE id = ${fixtureId}
    `;

    // Lock home team lineup when matchups are created
    // Home team lineup locks when they submit matchups (no time deadline)
    const homeLineup = fixture.home_lineup;
    if (homeLineup && !homeLineup.locked) {
      await sql`
        UPDATE fixtures
        SET 
          home_lineup = jsonb_set(
            home_lineup,
            '{locked}',
            'true'::jsonb
          ),
          home_lineup = jsonb_set(
            home_lineup,
            '{locked_at}',
            to_jsonb(${new Date().toISOString()}::text)
          ),
          home_lineup = jsonb_set(
            home_lineup,
            '{locked_by}',
            to_jsonb(${created_by}::text)
          ),
          home_lineup = jsonb_set(
            home_lineup,
            '{locked_reason}',
            to_jsonb('Matchups created'::text)
          ),
          updated_at = NOW()
        WHERE id = ${fixtureId}
      `;
      console.log('🔒 Locked home lineup for fixture (matchups created):', fixtureId);
    }

    // Send FCM notification
    try {
      const notificationBody = wasOverwritten
        ? `Matchups for ${home_team_name} vs ${away_team_name} have been updated (${matchups.length} matches).`
        : `Matchups for ${home_team_name} vs ${away_team_name} have been created (${matchups.length} matches).`;

      await sendNotificationToSeason(
        {
          title: wasOverwritten ? '🔄 Matchups Updated' : '⚔️ Matchups Created',
          body: notificationBody,
          url: `/fixtures/${fixtureId}`,
          icon: '/logo.png',
          data: {
            type: wasOverwritten ? 'matchups_updated' : 'matchups_created',
            fixture_id: fixtureId,
            home_team: home_team_name,
            away_team: away_team_name,
            matchup_count: matchups.length.toString(),
          }
        },
        seasonId
      );
    } catch (notifError) {
      console.error('Failed to send matchups creation notification:', notifError);
      // Don't fail the request
    }

    console.log(`✅ Matchups ${wasOverwritten ? 'updated' : 'created'} successfully by ${created_by}`);

    return NextResponse.json({
      success: true,
      message: wasOverwritten ? 'Matchups updated successfully' : 'Matchups created successfully',
      was_overwritten: wasOverwritten
    });
  } catch (error: any) {
    console.error('Error creating matchups:', error);
    console.error('Error details:', error.message, error.stack);
    return NextResponse.json(
      { error: 'Failed to create matchups', details: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { fixtureId } = await params;
    const body = await request.json();
    const { matchups } = body;

    // Validate
    if (!matchups || !Array.isArray(matchups) || matchups.length === 0) {
      return NextResponse.json(
        { error: 'Invalid matchups data' },
        { status: 400 }
      );
    }

    const fixtureMetaRows = await sql`
      SELECT
        f.id, f.season_id, f.tournament_id, f.round_number,
        f.home_team_id, f.away_team_id, f.matchups_created_by,
        f.scoring_system, f.knockout_format,
        t.tournament_type, ts.matchday_format
      FROM fixtures f
      LEFT JOIN tournaments t ON f.tournament_id = t.id
      LEFT JOIN tournament_settings ts ON t.id = ts.tournament_id
      WHERE f.id = ${fixtureId}
      LIMIT 1
    `;
    const fixtureMeta = fixtureMetaRows[0] || null;
    const isTripleThreat = Boolean(
      (fixtureMeta && (
        fixtureMeta.tournament_type === 'triple_threat' ||
        fixtureMeta.matchday_format === 'triple_threat' ||
        fixtureMeta.scoring_system === 'triple_threat' ||
        fixtureMeta.knockout_format === 'triple_threat' ||
        String(fixtureMeta.id || '').toLowerCase().includes('triple_threat')
      )) ||
      matchups.some((m: any) => Boolean(m?.match_mode))
    );

    const normalizeSide = (m: any, side: 'home' | 'away') => {
      const isHome = side === 'home';
      const idsRaw = isHome ? m.home_player_ids : m.away_player_ids;
      const namesRaw = isHome ? m.home_player_names : m.away_player_names;
      const fallbackId = String((isHome ? m.home_player_id : m.away_player_id) || '').trim();
      const fallbackName = String((isHome ? m.home_player_name : m.away_player_name) || '').trim();
      const isCoop = resolveTripleThreatMode(m) === 'coop';

      const ids: string[] = Array.isArray(idsRaw) && idsRaw.length > 0
        ? idsRaw.map((v: any) => String(v || '').trim()).filter(Boolean)
        : (fallbackId ? [fallbackId] : []);
      const names: string[] = Array.isArray(namesRaw) && namesRaw.length > 0
        ? namesRaw.map((v: any) => String(v || '').trim()).filter(Boolean)
        : (fallbackName
            ? (isCoop ? fallbackName.split(/\s*&\s*/).map((v) => v.trim()).filter(Boolean) : [fallbackName])
            : []);

      return {
        ids,
        names,
        scalarId: ids[0] || fallbackId || '',
        scalarName: names.length > 1 ? names.join(' & ') : (names[0] || fallbackName || ''),
      };
    };

    const normalizedMatchups = matchups.map((m: any) => {
      const mode = isTripleThreat ? resolveTripleThreatMode(m) : (m.match_mode || null);
      const defaultDuration = mode === 'coop' ? 8 : 6;
      const parsedDuration = Number(m.match_duration);
      return {
        ...m,
        match_mode: mode,
        match_duration: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : defaultDuration,
        homeSide: normalizeSide(m, 'home'),
        awaySide: normalizeSide(m, 'away'),
      };
    });

    if (isTripleThreat) {
      const allHomeIds: string[] = [];
      const allAwayIds: string[] = [];
      for (const m of normalizedMatchups) {
        const reqCount = m.match_mode === 'coop' ? 2 : 1;
        if (m.homeSide.ids.length !== reqCount || m.awaySide.ids.length !== reqCount) {
          return NextResponse.json(
            {
              error: `Match #${m.position} (${m.match_mode === 'coop' ? 'Co-op 2v2' : '1v1'}) requires ${reqCount} player(s) per side`,
            },
            { status: 400 }
          );
        }
        allHomeIds.push(...m.homeSide.ids);
        allAwayIds.push(...m.awaySide.ids);
      }
      if (new Set(allHomeIds).size !== allHomeIds.length || new Set(allAwayIds).size !== allAwayIds.length) {
        return NextResponse.json(
          { error: 'Each player can only be assigned to one Triple Threat slot per fixture' },
          { status: 400 }
        );
      }
    }

    // Update existing matchups (or insert missing Triple Threat mode positions added during edit)
    for (const matchup of normalizedMatchups) {
      const updatedRows = await sql`
        UPDATE matchups
        SET
          home_player_id = ${matchup.homeSide.scalarId},
          home_player_name = ${matchup.homeSide.scalarName},
          home_player_ids = ${isTripleThreat || matchup.homeSide.ids.length > 0 ? matchup.homeSide.ids : null},
          home_player_names = ${isTripleThreat || matchup.homeSide.names.length > 0 ? matchup.homeSide.names : null},
          away_player_id = ${matchup.awaySide.scalarId},
          away_player_name = ${matchup.awaySide.scalarName},
          away_player_ids = ${isTripleThreat || matchup.awaySide.ids.length > 0 ? matchup.awaySide.ids : null},
          away_player_names = ${isTripleThreat || matchup.awaySide.names.length > 0 ? matchup.awaySide.names : null},
          match_mode = COALESCE(${matchup.match_mode}, match_mode),
          match_duration = ${matchup.match_duration},
          home_original_player_id = ${matchup.home_original_player_id || null},
          home_original_player_name = ${matchup.home_original_player_name || null},
          home_substituted = ${matchup.home_substituted || false},
          home_sub_penalty = ${matchup.home_sub_penalty || 0},
          away_original_player_id = ${matchup.away_original_player_id || null},
          away_original_player_name = ${matchup.away_original_player_name || null},
          away_substituted = ${matchup.away_substituted || false},
          away_sub_penalty = ${matchup.away_sub_penalty || 0},
          updated_at = NOW()
        WHERE fixture_id = ${fixtureId}
        AND position = ${matchup.position}
        RETURNING id
      `;

      if (updatedRows.length === 0 && isTripleThreat && fixtureMeta) {
        await sql`
          INSERT INTO matchups (
            fixture_id,
            season_id,
            tournament_id,
            round_number,
            home_player_id,
            home_player_name,
            home_player_ids,
            home_player_names,
            away_player_id,
            away_player_name,
            away_player_ids,
            away_player_names,
            position,
            match_mode,
            match_duration,
            home_original_player_id,
            home_original_player_name,
            home_substituted,
            home_sub_penalty,
            away_original_player_id,
            away_original_player_name,
            away_substituted,
            away_sub_penalty,
            created_by,
            created_at,
            updated_at
          ) VALUES (
            ${fixtureId},
            ${fixtureMeta.season_id},
            ${fixtureMeta.tournament_id || null},
            ${fixtureMeta.round_number},
            ${matchup.homeSide.scalarId},
            ${matchup.homeSide.scalarName},
            ${matchup.homeSide.ids},
            ${matchup.homeSide.names},
            ${matchup.awaySide.scalarId},
            ${matchup.awaySide.scalarName},
            ${matchup.awaySide.ids},
            ${matchup.awaySide.names},
            ${matchup.position},
            ${matchup.match_mode},
            ${matchup.match_duration},
            ${matchup.home_original_player_id || null},
            ${matchup.home_original_player_name || null},
            ${matchup.home_substituted || false},
            ${matchup.home_sub_penalty || 0},
            ${matchup.away_original_player_id || null},
            ${matchup.away_original_player_name || null},
            ${matchup.away_substituted || false},
            ${matchup.away_sub_penalty || 0},
            ${fixtureMeta.matchups_created_by || 'team'},
            NOW(),
            NOW()
          )
        `;
      }
    }

    // Keep Triple Threat team lineups in sync with edited matchups
    if (isTripleThreat && fixtureMeta) {
      const sorted = [...normalizedMatchups].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
      const syncSideLineup = async (teamId: string | null | undefined, side: 'home' | 'away') => {
        if (!teamId) return;
        const getSidePairs = (m: any) => {
          const s = side === 'home' ? m.homeSide : m.awaySide;
          return s.ids.map((id: string, i: number) => ({
            player_id: id,
            player_name: s.names[i] || id,
          }));
        };
        const coopRow = sorted.find((m: any) => m.match_mode === 'coop');
        const duoRows = sorted.filter((m: any) => m.match_mode === 'duo');
        const singleRow = sorted.find((m: any) => m.match_mode === 'single');
        const coop = coopRow ? getSidePairs(coopRow).slice(0, 2) : [];
        let duo = duoRows.flatMap((dm: any) => getSidePairs(dm).slice(0, 1)).slice(0, 2);
        const single = singleRow ? getSidePairs(singleRow).slice(0, 1) : [];
        if (coop.length !== 2 || single.length !== 1) return;

        try {
          if (duo.length < 2) {
            const existingRows = await sql`
              SELECT triple_threat_lineup
              FROM lineups
              WHERE fixture_id = ${fixtureId}
                AND team_id = ${teamId}
                AND COALESCE(submitted_by, '') <> 'system_auto'
              LIMIT 1
            `;
            const existingDuo = existingRows[0]?.triple_threat_lineup?.duo;
            if (Array.isArray(existingDuo) && existingDuo.length >= 2) {
              duo = existingDuo.slice(0, 2);
            }
          }
          if (duo.length !== 2) return;

          const ttPayload = { coop, duo, single };
          const startingXiPayload = [
            ...coop.map((p: any, i: number) => ({ ...p, mode: 'coop', slot: i + 1 })),
            ...duo.map((p: any, i: number) => ({ ...p, mode: 'duo', slot: i + 1 })),
            ...single.map((p: any, i: number) => ({ ...p, mode: 'single', slot: i + 1 })),
          ];

          await sql`
            UPDATE lineups
            SET
              triple_threat_lineup = ${JSON.stringify(ttPayload)}::jsonb,
              starting_xi = ${JSON.stringify(startingXiPayload)}::jsonb,
              updated_at = NOW()
            WHERE fixture_id = ${fixtureId}
              AND team_id = ${teamId}
              AND COALESCE(submitted_by, '') <> 'system_auto'
          `;
        } catch (syncErr) {
          console.warn('Could not sync Triple Threat lineup after matchup edit:', syncErr);
        }
      };

      await Promise.all([
        syncSideLineup(fixtureMeta.home_team_id, 'home'),
        syncSideLineup(fixtureMeta.away_team_id, 'away'),
      ]);
    }

    return NextResponse.json({ success: true, message: 'Matchups updated successfully' });
  } catch (error: any) {
    console.error('Error updating matchups:', error);
    return NextResponse.json(
      { error: 'Failed to update matchups' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ fixtureId: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { fixtureId } = await params;
    const body = await request.json();
    const { results, entered_by } = body;

    // Validate
    if (!results || !Array.isArray(results) || results.length === 0) {
      return NextResponse.json(
        { error: 'Invalid results data' },
        { status: 400 }
      );
    }

    // Check result entry deadline and get penalty goals
    const fixtures = await sql`
      SELECT f.season_id, f.round_number, f.leg, f.status as current_status,
             COALESCE(f.home_penalty_goals, 0) as home_penalty_goals,
             COALESCE(f.away_penalty_goals, 0) as away_penalty_goals,
             f.home_team_name, f.away_team_name
      FROM fixtures f
      WHERE f.id = ${fixtureId}
      LIMIT 1
    `;

    if (fixtures.length === 0) {
      return NextResponse.json(
        { error: 'Fixture not found' },
        { status: 404 }
      );
    }

    const { season_id, round_number, leg, current_status, home_penalty_goals, away_penalty_goals } = fixtures[0];

    // Get round deadlines
    const deadlines = await sql`
      SELECT scheduled_date::text as scheduled_date_str, scheduled_date, result_entry_deadline_time, result_entry_deadline_day_offset
      FROM round_deadlines
      WHERE season_id = ${season_id}
      AND round_number = ${round_number}
      AND leg = ${leg}
      LIMIT 1
    `;

    // Deadline check disabled - phase logic on frontend controls access
    // The frontend already checks if we're in result_entry phase before allowing submission
    if (deadlines.length > 0 && (deadlines[0].scheduled_date_str || deadlines[0].scheduled_date)) {
      const deadline = deadlines[0];
      const resultDeadline = computeISTResultDeadline(
        deadline.scheduled_date_str || deadline.scheduled_date,
        deadline.result_entry_deadline_day_offset,
        deadline.result_entry_deadline_time
      );
      const now = new Date();

      console.log('Result entry - Deadline info:', {
        now: now.toISOString(),
        deadline: resultDeadline.toISOString(),
        isPassed: now >= resultDeadline
      });

      const { is_admin, user_role } = body;
      const isAdmin = is_admin || user_role === 'admin' || user_role === 'committee' || entered_by === 'admin';

      if (!isAdmin && now >= resultDeadline) {
        return NextResponse.json(
          { 
            error: 'Result entry deadline has passed',
            deadline: resultDeadline.toISOString(),
            current_time: now.toISOString()
          },
          { status: 403 }
        );
      }
    }

    // Normalize and update match results (summing per-player Co-op goals when provided)
    const normalizedResults = results.map((result: any) => ({
      ...result,
      ...normalizeResultGoals(result),
    }));

    for (const result of normalizedResults) {
      await sql`
        UPDATE matchups
        SET 
          home_goals = ${result.home_goals},
          away_goals = ${result.away_goals},
          home_player_goals = ${result.home_player_goals},
          away_player_goals = ${result.away_player_goals},
          result_entered_by = ${entered_by},
          result_entered_at = NOW(),
          updated_at = NOW()
        WHERE fixture_id = ${fixtureId}
        AND position = ${result.position}
      `;
    }

    // Calculate total scores from all matchups
    // Need to check tournament scoring type and knockout format
    const tournamentInfo = await sql`
      SELECT t.id as tournament_id, t.tournament_type, ts.scoring_type, ts.matchday_format, ts.clean_sweep_bonus, ts.points_as_gd, f.knockout_format
      FROM fixtures f
      JOIN tournaments t ON f.tournament_id = t.id
      LEFT JOIN tournament_settings ts ON t.id = ts.tournament_id
      WHERE f.id = ${fixtureId}
      LIMIT 1
    `;
    
    const isTripleThreat = tournamentInfo[0]?.tournament_type === 'triple_threat' || tournamentInfo[0]?.matchday_format === 'triple_threat';
    const scoringType = isTripleThreat ? 'triple_threat' : (tournamentInfo[0]?.scoring_type || 'goals');
    const knockoutFormat = tournamentInfo[0]?.knockout_format;
    
    // Get substitution penalties and match_mode from matchups
    const matchupsWithPenalties = await sql`
      SELECT 
        position,
        match_mode,
        COALESCE(home_sub_penalty, 0) as home_sub_penalty,
        COALESCE(away_sub_penalty, 0) as away_sub_penalty
      FROM matchups
      WHERE fixture_id = ${fixtureId}
      ORDER BY position ASC
    `;

    // Create a map of penalties & mode by position
    const penaltiesMap = new Map();
    const modeMap = new Map<number, string>();
    matchupsWithPenalties.forEach((m: any) => {
      penaltiesMap.set(m.position, {
        home_sub_penalty: Number(m.home_sub_penalty) || 0,
        away_sub_penalty: Number(m.away_sub_penalty) || 0
      });
      if (m.match_mode) {
        modeMap.set(m.position, m.match_mode);
      }
    });
    
    let totalHomeScore = 0;
    let totalAwayScore = 0;
    let homePointsDiff = 0;
    let awayPointsDiff = 0;
    let cleanSweepWinner: string | null = null;
    
    if (isTripleThreat) {
      const ttResult = calculateTripleThreatFixture(
        normalizedResults.map((r: any) => ({
          position: r.position,
          mode: resolveTripleThreatMode({
            mode: r.match_mode || modeMap.get(r.position),
            position: r.position,
          }),
          home_goals: r.home_goals ?? 0,
          away_goals: r.away_goals ?? 0,
        }))
      );

      totalHomeScore = ttResult.home_total_points;
      totalAwayScore = ttResult.away_total_points;
      homePointsDiff = ttResult.home_points_difference;
      awayPointsDiff = ttResult.away_points_difference;
      cleanSweepWinner = ttResult.clean_sweep_team === 'home' 
        ? fixtures[0].home_team_name 
        : ttResult.clean_sweep_team === 'away' 
          ? fixtures[0].away_team_name 
          : null;

      // Update points and bonus on individual matchups
      for (const mRes of (ttResult.matchResults || ttResult.matches)) {
        await sql`
          UPDATE matchups
          SET
            points_awarded_home = ${mRes.home_points},
            points_awarded_away = ${mRes.away_points},
            bonus_awarded_home = ${mRes.home_bonus},
            bonus_awarded_away = ${mRes.away_bonus}
          WHERE fixture_id = ${fixtureId} AND position = ${mRes.position}
        `;
      }
    } else if (knockoutFormat === 'round_robin' && scoringType === 'goals') {
      // Round Robin Goal-Based: Count total goals AND wins
      // Primary: Total goals scored
      // Tiebreaker: Number of matchups won
      let homeGoals = 0;
      let awayGoals = 0;
      let homeWins = 0;
      let awayWins = 0;
      
      for (const result of normalizedResults) {
        const penalties = penaltiesMap.get(result.position) || { home_sub_penalty: 0, away_sub_penalty: 0 };
        
        // Count goals (for primary score)
        homeGoals += result.home_goals;
        awayGoals += result.away_goals;
        
        // Calculate matchup winner WITH substitution penalties (for tiebreaker)
        const homeMatchupScore = result.home_goals + penalties.away_sub_penalty;
        const awayMatchupScore = result.away_goals + penalties.home_sub_penalty;
        
        if (homeMatchupScore > awayMatchupScore) {
          homeWins++;
        } else if (awayMatchupScore > homeMatchupScore) {
          awayWins++;
        }
      }
      
      // Add substitution penalties to goals
      const totalHomeSubPenalty = Array.from(penaltiesMap.values()).reduce((sum: number, p: any) => sum + p.home_sub_penalty, 0);
      const totalAwaySubPenalty = Array.from(penaltiesMap.values()).reduce((sum: number, p: any) => sum + p.away_sub_penalty, 0);
      
      homeGoals += totalAwaySubPenalty + (Number(home_penalty_goals) || 0);
      awayGoals += totalHomeSubPenalty + (Number(away_penalty_goals) || 0);
      
      // Store both goals and wins for display
      totalHomeScore = homeGoals;
      totalAwayScore = awayGoals;
      
      console.log(`Round Robin Goal-Based: Home ${homeGoals} goals (${homeWins} wins) vs Away ${awayGoals} goals (${awayWins} wins)`);
      
      // Determine winner: First by goals, then by wins if tied
      // This will be used for match result determination below
      
    } else if (scoringType === 'wins') {
      // Win-based scoring: 3 points for win, 1 for draw, 0 for loss
      // Substitution penalties are added to the MATCHUP score to determine winner
      // but NOT to player stats
      for (const result of normalizedResults) {
        const penalties = penaltiesMap.get(result.position) || { home_sub_penalty: 0, away_sub_penalty: 0 };
        
        // Calculate matchup score WITH substitution penalties
        // home_sub_penalty = penalty awarded TO away (when home subs)
        // away_sub_penalty = penalty awarded TO home (when away subs)
        const homeMatchupScore = result.home_goals + penalties.away_sub_penalty; // Home gets penalty when away subs
        const awayMatchupScore = result.away_goals + penalties.home_sub_penalty; // Away gets penalty when home subs
        
        console.log(`Matchup ${result.position}: Home ${result.home_goals}+${penalties.away_sub_penalty} = ${homeMatchupScore} vs Away ${result.away_goals}+${penalties.home_sub_penalty} = ${awayMatchupScore}`);
        
        if (homeMatchupScore > awayMatchupScore) {
          totalHomeScore += 3; // Home wins this matchup
        } else if (awayMatchupScore > homeMatchupScore) {
          totalAwayScore += 3; // Away wins this matchup
        } else {
          totalHomeScore += 1; // Draw
          totalAwayScore += 1; // Draw
        }
      }
      
      // Add fine/violation penalty goals to total score (these affect final result)
      totalHomeScore += (Number(home_penalty_goals) || 0);
      totalAwayScore += (Number(away_penalty_goals) || 0);
      
      console.log(`Win-based scoring - Total points: Home ${totalHomeScore}, Away ${totalAwayScore} (includes ${home_penalty_goals || 0} and ${away_penalty_goals || 0} fine penalties)`);
    } else {
      // Standard goal-based scoring: sum of all goals INCLUDING substitution penalties
      for (const result of normalizedResults) {
        totalHomeScore += result.home_goals;
        totalAwayScore += result.away_goals;
      }
      
      // In goal-based, substitution penalties are added to total score
      const totalHomeSubPenalty = Array.from(penaltiesMap.values()).reduce((sum: number, p: any) => sum + p.home_sub_penalty, 0);
      const totalAwaySubPenalty = Array.from(penaltiesMap.values()).reduce((sum: number, p: any) => sum + p.away_sub_penalty, 0);
      
      totalHomeScore += totalAwaySubPenalty + (Number(home_penalty_goals) || 0);
      totalAwayScore += totalHomeSubPenalty + (Number(away_penalty_goals) || 0);
      
      console.log(`Goal-based scoring - Total goals: Home ${totalHomeScore}, Away ${totalAwayScore} (includes sub penalties and fine penalties)`);
    }

    // Determine match result
    let matchResult: 'home_win' | 'away_win' | 'draw';
    if (totalHomeScore > totalAwayScore) {
      matchResult = 'home_win';
    } else if (totalAwayScore > totalHomeScore) {
      matchResult = 'away_win';
    } else {
      matchResult = 'draw';
    }

    // Update fixture with scores, result, and status
    await sql`
      UPDATE fixtures
      SET 
        home_score = ${totalHomeScore},
        away_score = ${totalAwayScore},
        home_points_earned = ${totalHomeScore},
        away_points_earned = ${totalAwayScore},
        home_points_difference = ${homePointsDiff},
        away_points_difference = ${awayPointsDiff},
        clean_sweep_winner = ${cleanSweepWinner},
        result = ${matchResult},
        status = 'completed', 
        updated_at = NOW()
      WHERE id = ${fixtureId}
    `;

    // Distribute match rewards based on tournament configuration (S16-17 only)
    const seasonNum = parseInt(season_id.replace(/\D/g, '')) || 0;
    if (seasonNum < 18) {
      try {
        await distributeMatchRewards({
          fixtureId,
          matchResult,
          seasonId: season_id,
          roundNumber: round_number,
          leg
        });
      } catch (rewardError) {
        console.error('Failed to distribute match rewards:', rewardError);
        // Don't fail the entire request if rewards fail
      }
    } else {
      console.log(`ℹ️ Skipping match rewards distribution for Season ${seasonNum}`);
    }

    // Update team stats in teamstats table
    try {
      console.log('📊 Updating team stats...');
      const host = request.headers.get('host');
      const protocol = request.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (host ? `${protocol}://${host}` : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'));

      // Get fixture details for team stats update
      const fixtureDetails = await sql`
        SELECT home_team_id, away_team_id
        FROM fixtures
        WHERE id = ${fixtureId}
        LIMIT 1
      `;

      if (fixtureDetails.length > 0) {
        const teamStatsResponse = await fetch(`${baseUrl}/api/teamstats/update-stats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            season_id: season_id,
            fixture_id: fixtureId,
            home_team_id: fixtureDetails[0].home_team_id,
            away_team_id: fixtureDetails[0].away_team_id,
            home_score: totalHomeScore,
            away_score: totalAwayScore,
            home_penalty_goals: Number(home_penalty_goals) || 0,
            away_penalty_goals: Number(away_penalty_goals) || 0,
            scoring_type: scoringType,
            matchups: normalizedResults,
            ...(isTripleThreat ? { is_edit: current_status === 'completed' } : {})
          })
        });

        if (!teamStatsResponse.ok) {
          const errorData = await teamStatsResponse.json();
          console.error('Team stats update failed:', errorData);
        } else {
          const teamStatsData = await teamStatsResponse.json();
          console.log('✅ Team stats updated:', teamStatsData);
        }
      }
    } catch (teamStatsError) {
      console.error('Failed to update team stats:', teamStatsError);
      // Don't fail the entire request if team stats update fails
    }

    // Calculate fantasy points (including passive team bonuses)
    try {
      console.log('🎮 Triggering fantasy points calculation...');
      const host = request.headers.get('host');
      const protocol = request.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https');
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (host ? `${protocol}://${host}` : (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'));
      const fantasyResponse = await fetch(`${baseUrl}/api/fantasy/calculate-points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixture_id: fixtureId,
          season_id: season_id,
          round_number: round_number
        })
      });

      if (!fantasyResponse.ok) {
        const errorData = await fantasyResponse.json();
        console.error('Fantasy points calculation failed:', errorData);
      } else {
        const fantasyData = await fantasyResponse.json();
        console.log('✅ Fantasy points calculated:', fantasyData);
      }
    } catch (fantasyError) {
      console.error('Failed to calculate fantasy points:', fantasyError);
      // Don't fail the entire request if fantasy calculation fails
    }

    // Update real player stats & POTD / MOTM awards directly in database
    try {
      console.log('⚽ Syncing real player stats for season:', season_id);
      await syncPlayerStatsForSeason(season_id);
      console.log('✅ Real player stats synced successfully');
    } catch (rpsError) {
      console.error('Failed to sync realplayerstats:', rpsError);
    }

    return NextResponse.json({
      success: true,
      message: 'Results saved successfully',
      fixture_status: 'completed',
      ...(isTripleThreat
        ? {
            fixture: {
              home_score: totalHomeScore,
              away_score: totalAwayScore,
              result: matchResult,
              clean_sweep_winner: cleanSweepWinner,
            },
          }
        : {}),
    });
  } catch (error: any) {
    console.error('Error saving results:', error);
    return NextResponse.json(
      { error: 'Failed to save results' },
      { status: 500 }
    );
  }
}
