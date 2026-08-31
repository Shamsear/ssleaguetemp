import { NextRequest, NextResponse } from 'next/server';
import { getFantasyDb } from '@/lib/neon/fantasy-config';
import { getTournamentDb } from '@/lib/neon/tournament-config';

export async function POST(request: NextRequest) {
    const logs: string[] = [];

    try {
        logs.push('🔄 Starting passive points recalculation...');
        logs.push('');
        logs.push('============================================================');
        logs.push('📋 Step 1: Getting active fantasy leagues...');

        const fantasyDb = getFantasyDb();
        const tournamentDb = getTournamentDb();

        // Get active fantasy leagues
        const leagues = await fantasyDb`
            SELECT league_id, season_id
            FROM fantasy_leagues
            WHERE is_active = true
        `;

        logs.push(`✅ Found ${leagues.length} active league(s)`);
        leagues.forEach(league => {
            logs.push(`   - League: ${league.league_id}`);
        });

        let totalFixtures = 0;
        let totalBonusPoints = 0;

        for (const league of leagues) {
            logs.push('');
            logs.push('============================================================');
            logs.push(`Processing League: ${league.league_id}`);
            logs.push('============================================================');

            // Get team scoring rules
            logs.push('📊 Step 2: Loading team scoring rules...');
            const teamRules = await fantasyDb`
                SELECT rule_type, points_value
                FROM fantasy_scoring_rules
                WHERE league_id = ${league.league_id}
                  AND applies_to = 'team'
                  AND is_active = true
            `;

            logs.push(`✅ Found ${teamRules.length} team scoring rules:`);
            const teamScoringRules = new Map<string, number>();
            teamRules.forEach((rule: any) => {
                teamScoringRules.set(rule.rule_type, rule.points_value);
                logs.push(`   ${rule.rule_type}: ${rule.points_value > 0 ? '+' : ''}${rule.points_value} pts`);
            });

            if (teamScoringRules.size === 0) {
                // Fallback default team scoring rules (aligned with S16 point system)
                logs.push('⚠️ No team rules found in DB, using defaults fallback:');
                const fallbacks = [
                    { type: 'win', pts: 5 },
                    { type: 'draw', pts: 3 },
                    { type: 'loss', pts: -1 },
                    { type: 'scored_6_plus_goals', pts: 8 },
                    { type: 'clean_sheet', pts: 12 },
                    { type: 'concedes_15_plus_goals', pts: -5 },
                    { type: 'team_of_the_week', pts: 10 },
                    { type: 'team_of_the_day', pts: 5 }
                ];
                fallbacks.forEach(fb => {
                    teamScoringRules.set(fb.type, fb.pts);
                    logs.push(`   ${fb.type}: ${fb.pts > 0 ? '+' : ''}${fb.pts} pts`);
                });
            }

            // Reset passive points
            logs.push('');
            logs.push('🔄 Step 3: Resetting passive points...');
            await fantasyDb`
                UPDATE fantasy_teams
                SET 
                  total_points = total_points - COALESCE(passive_points, 0),
                  passive_points = 0
                WHERE league_id = ${league.league_id}
            `;
            logs.push('✅ Reset complete');

            // Delete old bonus records
            logs.push('');
            logs.push('🗑️  Step 4: Deleting old bonus records...');
            await fantasyDb`
                DELETE FROM fantasy_team_bonus_points
                WHERE league_id = ${league.league_id}
            `;
            logs.push('✅ Deleted old records');

            // Get completed fixtures
            logs.push('');
            logs.push('🏟️  Step 5: Getting completed fixtures...');
            const fixtures = await tournamentDb`
                SELECT 
                  f.id as fixture_id,
                  f.round_number,
                  f.home_team_id,
                  f.away_team_id,
                  f.home_score,
                  f.away_score,
                  f.status
                FROM fixtures f
                WHERE f.season_id = ${league.season_id}
                  AND f.status = 'completed'
                ORDER BY f.round_number, f.id
            `;

            logs.push(`✅ Found ${fixtures.length} completed fixtures`);
            totalFixtures += fixtures.length;

            // Recalculate bonuses
            logs.push('');
            logs.push('⚙️  Step 6: Recalculating bonuses...');
            logs.push('');

            let processedCount = 0;
            let leagueBonusPoints = 0;

            for (const fixture of fixtures) {
                processedCount++;

                const homeBonuses = await awardTeamBonus({
                    fantasy_league_id: league.league_id,
                    real_team_id: fixture.home_team_id,
                    fixture_id: fixture.fixture_id,
                    round_number: fixture.round_number,
                    goals_scored: fixture.home_score,
                    goals_conceded: fixture.away_score,
                    teamScoringRules,
                    fantasyDb,
                });

                const awayBonuses = await awardTeamBonus({
                    fantasy_league_id: league.league_id,
                    real_team_id: fixture.away_team_id,
                    fixture_id: fixture.fixture_id,
                    round_number: fixture.round_number,
                    goals_scored: fixture.away_score,
                    goals_conceded: fixture.home_score,
                    teamScoringRules,
                    fantasyDb,
                });

                leagueBonusPoints += homeBonuses + awayBonuses;

                // Log progress every 5 fixtures
                if (processedCount % 5 === 0) {
                    logs.push(`   Processed ${processedCount}/${fixtures.length} fixtures...`);
                }
            }

            // Recalculate ranks in this league
            await fantasyDb`
                WITH ranked_teams AS (
                  SELECT 
                    team_id,
                    ROW_NUMBER() OVER (ORDER BY total_points DESC, team_name ASC) as new_rank
                  FROM fantasy_teams
                  WHERE league_id = ${league.league_id}
                )
                UPDATE fantasy_teams ft
                SET rank = rt.new_rank
                FROM ranked_teams rt
                WHERE ft.team_id = rt.team_id
            `;

            logs.push('');
            logs.push(`✅ Processed all ${fixtures.length} fixtures`);
            logs.push(`✅ Awarded ${leagueBonusPoints} total bonus points`);
            totalBonusPoints += leagueBonusPoints;
        }

        logs.push('');
        logs.push('============================================================');
        logs.push('✅ RECALCULATION COMPLETE!');
        logs.push('============================================================');
        logs.push('');
        logs.push('💡 Summary:');
        logs.push('   - Old passive points deleted');
        logs.push('   - New bonuses calculated with S16 point system rules');
        logs.push('   - Breakdown data saved for each round');
        logs.push('');
        logs.push('🎉 Passive points now include all bonus types!');

        return NextResponse.json({
            success: true,
            logs,
            summary: {
                leagues: leagues.length,
                fixtures: totalFixtures,
                bonusPoints: totalBonusPoints
            }
        });

    } catch (error: any) {
        console.error('Error recalculating passive points:', error);
        logs.push('');
        logs.push(`❌ Error: ${error.message}`);

        return NextResponse.json(
            {
                error: error.message,
                logs
            },
            { status: 500 }
        );
    }
}

async function awardTeamBonus(params: {
  fantasy_league_id: string;
  real_team_id: string;
  fixture_id: string;
  round_number: number;
  goals_scored: number;
  goals_conceded: number;
  teamScoringRules: Map<string, number>;
  fantasyDb: any;
}): Promise<number> {
  const {
    fantasy_league_id,
    real_team_id,
    fixture_id,
    round_number,
    goals_scored,
    goals_conceded,
    teamScoringRules,
    fantasyDb,
  } = params;

  // Find all fantasy teams affiliated with this real team
  const fantasyTeams = await fantasyDb`
    SELECT team_id, team_name, supported_team_id, supported_team_name
    FROM fantasy_teams
    WHERE league_id = ${fantasy_league_id}
      AND (supported_team_id = ${real_team_id} OR supported_team_id LIKE ${real_team_id + '_%'})
  `;

  if (fantasyTeams.length === 0) return 0;

  const won = goals_scored > goals_conceded;
  const draw = goals_scored === goals_conceded;
  const lost = goals_scored < goals_conceded;
  const clean_sheet = goals_conceded === 0;

  const bonus_breakdown: any = {};
  let total_bonus = 0;

  // Apply S16 team scoring rules dynamically
  teamScoringRules.forEach((points, ruleType) => {
    let applies = false;
    switch (ruleType) {
      case 'win':
        applies = won;
        break;
      case 'draw':
        applies = draw;
        break;
      case 'loss':
        applies = lost;
        break;
      case 'clean_sheet':
        applies = clean_sheet;
        break;
      case 'scored_6_plus_goals':
        applies = goals_scored >= 6;
        break;
      case 'concedes_15_plus_goals':
        applies = goals_conceded >= 15;
        break;
    }
    if (applies) {
      bonus_breakdown[ruleType] = points;
      total_bonus += points;
    }
  });

  if (total_bonus === 0) return 0;

  let totalAwarded = 0;

  for (const fantasyTeam of fantasyTeams as any[]) {
    // Record bonus in fantasy_team_bonus_points
    await fantasyDb`
      INSERT INTO fantasy_team_bonus_points (
        league_id, team_id, real_team_id, real_team_name,
        fixture_id, round_number, bonus_breakdown, total_bonus, calculated_at
      ) VALUES (
        ${fantasy_league_id}, ${fantasyTeam.team_id}, ${real_team_id},
        ${fantasyTeam.supported_team_name}, ${fixture_id}, ${round_number},
        ${JSON.stringify(bonus_breakdown)}, ${total_bonus}, NOW()
      )
      ON CONFLICT DO NOTHING
    `;

    await fantasyDb`
      UPDATE fantasy_teams
      SET
        passive_points = passive_points + ${total_bonus},
        total_points = total_points + ${total_bonus},
        updated_at = NOW()
      WHERE team_id = ${fantasyTeam.team_id}
    `;

    totalAwarded += total_bonus;
  }

  return totalAwarded;
}
