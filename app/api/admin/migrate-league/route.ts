import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';

const FROM_LEAGUE = 'SSPSLFLS17';
const TO_LEAGUE = 'SSPSLFLS18';

export async function GET() {
  try {
    const [t] = await fantasySql`SELECT COUNT(*)::int as c FROM fantasy_teams WHERE league_id = ${FROM_LEAGUE}`;
    const [fp] = await fantasySql`SELECT COUNT(*)::int as c FROM fantasy_players WHERE league_id = ${FROM_LEAGUE}`;
    const [fr] = await fantasySql`SELECT COUNT(*)::int as c FROM fantasy_rounds WHERE league_id = ${FROM_LEAGUE}`;
    const [fs] = await fantasySql`SELECT COUNT(*)::int as c FROM fantasy_squad WHERE league_id = ${FROM_LEAGUE}`;

    let fppCount = 0;
    try {
      const [fpp] = await fantasySql`SELECT COUNT(*)::int as c FROM fantasy_player_points WHERE league_id = ${FROM_LEAGUE}`;
      fppCount = fpp?.c ?? 0;
    } catch {}

    let fdCount = 0;
    try {
      const [fd] = await fantasySql`SELECT COUNT(*)::int as c FROM fantasy_drafts WHERE league_id = ${FROM_LEAGUE}`;
      fdCount = fd?.c ?? 0;
    } catch {}

    return NextResponse.json({
      from: FROM_LEAGUE, to: TO_LEAGUE,
      s17_counts: {
        fantasy_teams: t?.c ?? 0,
        fantasy_players: fp?.c ?? 0,
        fantasy_rounds: fr?.c ?? 0,
        fantasy_squad: fs?.c ?? 0,
        fantasy_player_points: fppCount,
        fantasy_drafts: fdCount,
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    if (body.confirm !== 'MIGRATE_S17_TO_S18') {
      return NextResponse.json({ error: 'Pass { "confirm": "MIGRATE_S17_TO_S18" }' }, { status: 400 });
    }

    const results: Record<string, any> = {};

    // Migrate fantasy_teams
    await fantasySql`UPDATE fantasy_teams SET league_id = ${TO_LEAGUE} WHERE league_id = ${FROM_LEAGUE}`;
    const [t2] = await fantasySql`SELECT COUNT(*)::int as c FROM fantasy_teams WHERE league_id = ${TO_LEAGUE}`;
    results.fantasy_teams = `done — S18 now has ${t2?.c} teams`;

    // Migrate fantasy_rounds (if any)
    await fantasySql`UPDATE fantasy_rounds SET league_id = ${TO_LEAGUE} WHERE league_id = ${FROM_LEAGUE}`;
    results.fantasy_rounds = 'done';

    // Migrate fantasy_squad (if any)
    await fantasySql`UPDATE fantasy_squad SET league_id = ${TO_LEAGUE} WHERE league_id = ${FROM_LEAGUE}`;
    results.fantasy_squad = 'done';

    // Migrate fantasy_player_points (if any)
    try {
      await fantasySql`UPDATE fantasy_player_points SET league_id = ${TO_LEAGUE} WHERE league_id = ${FROM_LEAGUE}`;
      results.fantasy_player_points = 'done';
    } catch (e) { results.fantasy_player_points = `skipped: ${e}`; }

    // Migrate fantasy_drafts (if any)
    try {
      await fantasySql`UPDATE fantasy_drafts SET league_id = ${TO_LEAGUE} WHERE league_id = ${FROM_LEAGUE}`;
      results.fantasy_drafts = 'done';
    } catch (e) { results.fantasy_drafts = `skipped: ${e}`; }

    // Deactivate S17 league record
    await fantasySql`UPDATE fantasy_leagues SET is_active = false WHERE league_id = ${FROM_LEAGUE}`;
    results.fantasy_leagues_s17 = 'deactivated';

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
