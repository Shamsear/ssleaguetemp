import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { getMainDb } from '@/lib/neon/main-config';
import { getAuctionDb } from '@/lib/neon/auction-config';

// GET - List all seasons
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');

    let formattedSeasons: any[] = [];

    // 1. Primary: Query seasons table from main DB
    try {
      const mainSql = getMainDb();
      const dbSeasons = await mainSql`
        SELECT s.*, 
               COALESCE((SELECT COUNT(*) FROM team_seasons ts WHERE ts.season_id = s.id), s.total_teams, 0)::int as total_teams
        FROM seasons s
        ORDER BY s.season_number DESC NULLS LAST, s.id DESC
      `;

      if (dbSeasons && dbSeasons.length > 0) {
        formattedSeasons = dbSeasons.map((s: any) => {
          const seasonNum = s.season_number ?? (s.id ? parseInt(s.id.replace(/\D/g, '')) || 0 : 0);
          const isActive = Boolean(s.is_active ?? s.isActive ?? (s.status === 'active'));
          const isRegOpen = Boolean(
            s.registration_open ??
            s.registrationOpen ??
            s.is_player_registration_open ??
            (typeof s.raw_data === 'object' && s.raw_data ? s.raw_data.is_player_registration_open : undefined)
          );
          return {
            id: s.id,
            season_id: s.id,
            ...s,
            name: s.name || (seasonNum ? `Season ${seasonNum}` : `Season ${s.id.replace('SSPSLS', '')}`),
            season_number: seasonNum,
            status: s.status || (isActive ? 'active' : 'completed'),
            is_active: isActive,
            isActive: isActive,
            registration_open: isRegOpen,
            registrationOpen: isRegOpen,
            is_player_registration_open: isRegOpen,
            isPlayerRegistrationOpen: isRegOpen,
            total_teams: Number(s.total_teams ?? 0),
            totalTeams: Number(s.total_teams ?? 0),
            created_at: s.created_at,
          };
        });
      }
    } catch (e: any) {
      console.warn('⚠️ Could not query seasons table in main DB:', e.message);
    }

    // 2. Fallback to tournaments table in tournament DB if main DB returned nothing
    if (formattedSeasons.length === 0) {
      // Fallback query
    try {
      const tourSql = getTournamentDb();
      const tournaments = status
        ? await tourSql`
            SELECT season_id, MAX(created_at) as created_at, MAX(status) as status
            FROM tournaments
            WHERE status = ${status}
            GROUP BY season_id
            ORDER BY season_id DESC
          `
        : await tourSql`
            SELECT season_id, MAX(created_at) as created_at, MAX(status) as status
            FROM tournaments
            GROUP BY season_id
            ORDER BY season_id DESC
          `;

      if (tournaments && tournaments.length > 0) {
        formattedSeasons = tournaments.map((season: any) => {
          const isActive = season.status === 'active';
          return {
            id: season.season_id,
            season_id: season.season_id,
            name: season.season_id.replace('SSPSLS', 'Season '),
            status: season.status || (isActive ? 'active' : 'completed'),
            is_active: isActive,
            isActive: isActive,
            created_at: season.created_at,
          };
        });
      }
    } catch (e: any) {
      console.warn('⚠️ Could not query tournaments table, trying auction DB fallback:', e.message);
    }

    }

    // 3. If no seasons from tournaments, query auction_settings from auction DB
    if (formattedSeasons.length === 0) {
      try {
        const aucSql = getAuctionDb();
        const distinctSeasons = await aucSql`
          SELECT DISTINCT season_id, MAX(created_at) as created_at
          FROM auction_settings
          WHERE season_id IS NOT NULL AND season_id != ''
          GROUP BY season_id
          ORDER BY season_id DESC
        `;

        if (distinctSeasons && distinctSeasons.length > 0) {
          formattedSeasons = distinctSeasons.map((season: any, index: number) => {
            const isActive = index === 0;
            return {
              id: season.season_id,
              season_id: season.season_id,
              name: season.season_id.replace('SSPSLS', 'Season '),
              status: isActive ? 'active' : 'completed',
              is_active: isActive,
              isActive: isActive,
              created_at: season.created_at,
            };
          });
        }
      } catch (e: any) {
        console.warn('⚠️ Could not query auction_settings for seasons:', e.message);
      }
    }

    // 3. Fallback active season: SSPSLS19
    if (formattedSeasons.length === 0) {
      formattedSeasons = [{
        id: 'SSPSLS19',
        season_id: 'SSPSLS19',
        name: 'Season 19',
        status: 'active',
        is_active: true,
        isActive: true,
        created_at: new Date().toISOString(),
      }];
    }

    if (status === 'active') {
      formattedSeasons = formattedSeasons.filter((s: any) => s.status === 'active' || s.is_active);
    }

    return NextResponse.json({
      success: true,
      data: formattedSeasons,
      seasons: formattedSeasons
    });
  } catch (error: any) {
    console.error('Error fetching seasons:', error);
    // Even on error, return the active season so the UI never breaks
    const fallback = [{
      id: 'SSPSLS19',
      season_id: 'SSPSLS19',
      name: 'Season 19',
      status: 'active',
      is_active: true,
      isActive: true,
      created_at: new Date().toISOString(),
    }];
    return NextResponse.json({
      success: true,
      data: fallback,
      seasons: fallback
    });
  }
}

// POST - Create a new season
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sql = getMainDb();
    
    const seasonNumber = body.season_number;
    if (!seasonNumber || seasonNumber <= 0 || seasonNumber > 99) {
      return NextResponse.json({ error: 'Invalid season number' }, { status: 400 });
    }
    
    const seasonId = `SSPSLS${seasonNumber.toString().padStart(2, '0')}`;
    
    // Check if exists
    const existing = await sql`SELECT id FROM seasons WHERE id = ${seasonId} LIMIT 1`;
    if (existing.length > 0) {
      return NextResponse.json({ error: `Season ${seasonNumber} already exists` }, { status: 409 });
    }
    
    const now = new Date().toISOString();
    const newSeason: any = {
      id: seasonId,
      name: body.name || `Season ${seasonNumber}`,
      year: body.year || `${new Date().getFullYear()}`,
      season_number: seasonNumber,
      type: body.type || 'single',
      is_active: false,
      status: 'draft',
      registration_open: false,
      start_date: body.startDate || null,
      end_date: body.endDate || null,
      total_teams: 0,
      total_rounds: body.totalRounds || 0,
      purse_amount: body.purseAmount || 0,
      max_players_per_team: body.maxPlayersPerTeam || 11,
      created_at: now,
      updated_at: now,
    };
    
    if (newSeason.type === 'multi') {
      newSeason.dollar_budget = body.dollar_budget || 1000;
      newSeason.euro_budget = body.euro_budget || 10000;
      newSeason.required_real_players = body.required_real_players || 5;
      newSeason.max_football_players = body.max_football_players || 25;
      newSeason.category_fine_amount = body.category_fine_amount || 20;
    }
    
    const columns = Object.keys(newSeason);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const values = columns.map(k => newSeason[k]);
    
    await sql.query(
      `INSERT INTO seasons (${columns.join(', ')}) VALUES (${placeholders})`,
      values
    );
    
    return NextResponse.json({ success: true, id: seasonId, season: newSeason });
  } catch (error: any) {
    console.error('Error creating season:', error);
    return NextResponse.json({ error: error.message || 'Failed to create season' }, { status: 500 });
  }
}
