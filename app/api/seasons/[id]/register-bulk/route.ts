import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { getMainDb } from '@/lib/neon/main-config';
import { getFantasyDb } from '@/lib/neon/fantasy-config';
import { logInitialBalance } from '@/lib/transaction-logger';
import { getOrCreateTeamCashBalance, recordCashDeduction } from '@/lib/cash-balance-utils';
import { prepareTeamSeasonData } from '@/lib/team-season-utils';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: seasonId } = await params;
    const body = await request.json().catch(() => ({}));
    const { teamIds, joinFantasy = true, all = false } = body;

    // Check season
    const seasonDoc = await adminDb.collection('seasons').doc(seasonId).get();
    if (!seasonDoc.exists) {
      return NextResponse.json({ success: false, message: 'Season not found' }, { status: 404 });
    }
    const seasonData = seasonDoc.data()!;

    const mainSql = getMainDb();
    
    // Determine teams to register
    let teamsToRegister: any[] = [];
    if (all || !teamIds || teamIds.length === 0) {
      teamsToRegister = await mainSql`SELECT * FROM teams WHERE is_active = true ORDER BY team_name ASC`;
    } else {
      teamsToRegister = await mainSql`SELECT * FROM teams WHERE id = ANY(${teamIds}) ORDER BY team_name ASC`;
    }

    if (teamsToRegister.length === 0) {
      return NextResponse.json({ success: false, message: 'No teams found to register' }, { status: 400 });
    }

    // Check existing registrations in team_seasons for this season
    const existing = await mainSql`
      SELECT team_id FROM team_seasons 
      WHERE season_id = ${seasonId} AND status = 'registered'
    `;
    const registeredSet = new Set(existing.map((e: any) => e.team_id));

    // Budgets
    const footballBudget = seasonData.euro_budget || seasonData.purseAmount || 10000;
    const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
    const realPlayerBudget = seasonNum >= 18 ? 500 : (seasonData.dollar_budget || 1000);

    // League ID for fantasy
    const leagueId = `SSPSLFLS${seasonNum}`;
    let fantasySql: any = null;
    let budgetPerTeam = 100.00;

    if (joinFantasy) {
      try {
        fantasySql = getFantasyDb();
        const lRes = await fantasySql`
          SELECT * FROM fantasy_leagues WHERE league_id = ${leagueId} LIMIT 1
        `;
        if (lRes.length === 0) {
          await fantasySql`
            INSERT INTO fantasy_leagues (
              league_id, season_id, season_name, league_name,
              budget_per_team, max_squad_size, max_transfers_per_window,
              points_cost_per_transfer, is_active, created_at, updated_at
            ) VALUES (
              ${leagueId}, ${seasonId}, ${seasonData.name || `Season ${seasonNum}`},
              ${`${seasonData.name || `Season ${seasonNum}`} Fantasy League`},
              100.00, 15, 2, 4, true, NOW(), NOW()
            )
            ON CONFLICT (league_id) DO NOTHING
          `;
        } else {
          budgetPerTeam = lRes[0]?.budget_per_team || 100.00;
        }
      } catch (fErr: any) {
        console.error('Error preparing fantasy league:', fErr.message);
      }
    }

    const registeredTeams: any[] = [];
    const alreadyRegisteredTeams: any[] = [];
    const errors: any[] = [];

    for (const team of teamsToRegister) {
      const teamId = team.id || team.team_id;
      const teamName = team.team_name || team.name || 'Team';
      const raw = team.raw_data || {};
      const ownerUid = team.owner_uid || raw.owner_uid || raw.userId || raw.user_id || raw.uid || teamId;
      const teamSeasonId = `${teamId}_${seasonId}`;

      if (registeredSet.has(teamId)) {
        alreadyRegisteredTeams.push({ teamId, teamName });
        continue;
      }

      try {
        const teamSeasonData = prepareTeamSeasonData({
          teamId,
          teamName,
          seasonId,
          seasonName: seasonData.name || seasonId,
          userId: ownerUid,
          username: team.owner_name || raw.owner_name || teamName,
          footballBudget,
          realPlayerBudget,
          baseSlots: seasonData.max_football_players || 25,
        });

        teamSeasonData.position_counts = {
          GK: 0, CB: 0, LB: 0, RB: 0, DMF: 0, CMF: 0, AMF: 0,
          LMF: 0, RMF: 0, LWF: 0, RWF: 0, SS: 0, CF: 0,
        };
        teamSeasonData.team_email = team.owner_email || raw.userEmail || '';
        teamSeasonData.team_logo = team.logo_url || raw.logo || '';
        teamSeasonData.joined_at = new Date().toISOString();

        // 1. Direct upsert into Neon team_seasons
        await mainSql`
          INSERT INTO team_seasons (
            id, team_id, team_name, season_id, user_id, username, team_email,
            status, budget, initial_budget, football_budget, football_spent,
            real_player_budget, real_player_spent, currency_system, players_count,
            football_players_count, stats, real_players, football_players,
            logo_url, raw_data, joined_at, created_at, updated_at
          ) VALUES (
            ${teamSeasonId}, ${teamId}, ${teamName}, ${seasonId}, ${ownerUid},
            ${team.owner_name || teamName}, ${team.owner_email || ''},
            'registered', 0, 0, ${footballBudget}, 0,
            ${realPlayerBudget}, 0, 'dual', 0, 0,
            '{}'::jsonb, '[]'::jsonb, '[]'::jsonb,
            ${team.logo_url || null}, ${JSON.stringify(teamSeasonData)}::jsonb,
            NOW(), NOW(), NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            status = 'registered',
            football_budget = ${footballBudget},
            real_player_budget = ${realPlayerBudget},
            updated_at = NOW()
        `;

        // 2. Update teams table in Neon
        const seasonsList = Array.isArray(raw.seasons) ? raw.seasons : [];
        const updatedSeasons = Array.from(new Set([...seasonsList, seasonId]));
        await mainSql`
          UPDATE teams SET
            season_id = ${seasonId},
            raw_data = COALESCE(raw_data, '{}'::jsonb) || ${JSON.stringify({ current_season_id: seasonId, seasons: updatedSeasons })}::jsonb,
            updated_at = NOW()
          WHERE id = ${teamId}
        `;

        // 3. Initial balance transactions
        await logInitialBalance(teamId, seasonId, footballBudget, 'football_budget' as any).catch(() => {});
        await logInitialBalance(teamId, seasonId, realPlayerBudget, 'real_player_budget' as any).catch(() => {});

        // 4. Cash deduction (100)
        await getOrCreateTeamCashBalance(teamId, teamName).catch(() => {});
        await recordCashDeduction(teamId, teamName, 100, seasonId).catch(() => {});

        // 5. Fantasy team
        if (joinFantasy && fantasySql) {
          await fantasySql`
            INSERT INTO fantasy_teams (
              team_id, league_id, real_team_id, real_team_name, team_name,
              owner_uid, owner_name, budget_remaining, total_points, rank,
              is_enabled, created_at, updated_at
            ) VALUES (
              ${teamId}, ${leagueId}, ${teamId}, ${teamName}, ${teamName},
              ${ownerUid}, ${team.owner_name || teamName}, ${budgetPerTeam},
              0, 999, true, NOW(), NOW()
            )
            ON CONFLICT (team_id) DO UPDATE SET
              league_id = ${leagueId},
              is_enabled = true,
              budget_remaining = ${budgetPerTeam},
              updated_at = NOW()
          `.catch((fe: any) => console.warn('Fantasy bulk insert warning:', fe.message));
        }

        registeredTeams.push({ teamId, teamName });
      } catch (err: any) {
        console.error(`Failed to register ${teamName}:`, err);
        errors.push({ teamId, teamName, error: err.message });
      }
    }

    // Update season participant count
    const totalRegisteredCount = registeredSet.size + registeredTeams.length;
    await mainSql`
      UPDATE seasons SET
        raw_data = COALESCE(raw_data, '{}'::jsonb) || ${JSON.stringify({ participant_count: totalRegisteredCount })}::jsonb,
        updated_at = NOW()
      WHERE id = ${seasonId}
    `;

    return NextResponse.json({
      success: true,
      message: `Successfully registered ${registeredTeams.length} teams for ${seasonData.name}!`,
      registeredCount: registeredTeams.length,
      alreadyRegisteredCount: alreadyRegisteredTeams.length,
      registeredTeams,
      alreadyRegisteredTeams,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Bulk registration error:', error);
    return NextResponse.json({
      success: false,
      message: error.message || 'Failed to process bulk registration',
    }, { status: 500 });
  }
}
