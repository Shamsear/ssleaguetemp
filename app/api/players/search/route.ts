import { NextRequest, NextResponse } from 'next/server';
import { getMainDb } from '@/lib/neon/main-config';
import { getTournamentDb } from '@/lib/neon/tournament-config';

// In-memory cache for all players (cached for 5 minutes)
let playersCache: { data: any[], timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getAllPlayers() {
  const now = Date.now();

  // Return cached data if still valid
  if (playersCache && (now - playersCache.timestamp) < CACHE_TTL) {
    return playersCache.data;
  }

  // Fetch fresh data from Neon
  const sql = getMainDb();
  const rows = await sql`SELECT id, player_id, name FROM realplayers ORDER BY player_id ASC`;

  const players = rows.map((row: any) => ({
    id: row.id,
    player_id: row.player_id,
    name: row.name,
  }));

  // Update cache
  playersCache = { data: players, timestamp: now };
  return players;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const term = searchParams.get('term');
    const seasonId = searchParams.get('seasonId');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!seasonId) {
      return NextResponse.json(
        { error: 'Season ID is required' },
        { status: 400 }
      );
    }

    let allPlayers: any[] = [];

    if (!term || term === 'all') {
      // Get all players from cache or fetch (fallback/initial listing)
      const allPlayersData = await getAllPlayers();
      allPlayers = allPlayersData.slice(0, limit);
    } else {
      // Search in memory from all players cache (enables substring matching & diacritic-insensitive search)
      const allPlayersData = await getAllPlayers();
      const normalizeStr = (str: string) => 
        str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const cleanTerm = normalizeStr(term);
      
      allPlayers = allPlayersData.filter((player: any) => 
        (player.name && normalizeStr(player.name).includes(cleanTerm)) ||
        (player.player_id && normalizeStr(player.player_id).includes(cleanTerm))
      ).slice(0, limit);
    }

    if (allPlayers.length === 0) {
      return NextResponse.json({
        players: [],
        cached: true
      });
    }

    // Get player IDs for batch status check
    const playerIds = allPlayers.map((p: any) => p.player_id);

    // Check registration status in Neon player_seasons table (source of truth)
    const sql = getTournamentDb();
    const registeredPlayerIds = new Set<string>();

    try {
      const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
      const isModern = seasonNum === 16 || seasonNum === 17;

      // Query database table to check which players are registered for this season
      let registeredPlayers;
      if (isModern) {
        registeredPlayers = await sql`
          SELECT player_id 
          FROM player_seasons 
          WHERE season_id = ${seasonId} 
          AND player_id = ANY(${playerIds})
        `;
      } else {
        registeredPlayers = await sql`
          SELECT player_id 
          FROM realplayerstats 
          WHERE season_id = ${seasonId} 
          AND player_id = ANY(${playerIds})
        `;
      }

      registeredPlayers.forEach((row: any) => {
        registeredPlayerIds.add(row.player_id);
      });
    } catch (error) {
      console.error('Error checking player registration status:', error);
      // Continue with empty set if query fails
    }

    // Map players with status
    const playersWithStatus = allPlayers.map((player: any) => ({
      ...player,
      status: registeredPlayerIds.has(player.player_id)
        ? 'registered_current'
        : 'available',
      status_text: registeredPlayerIds.has(player.player_id)
        ? 'Already Registered'
        : 'Available'
    }));

    return NextResponse.json({
      players: playersWithStatus,
      count: playersWithStatus.length,
      cached: playersCache !== null
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      }
    });
  } catch (error) {
    console.error('Error searching players:', error);
    return NextResponse.json(
      { error: 'Failed to search players' },
      { status: 500 }
    );
  }
}

// Enable edge runtime for faster response
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
