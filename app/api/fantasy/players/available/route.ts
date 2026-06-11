import { NextRequest, NextResponse } from 'next/server';
import { fantasySql } from '@/lib/neon/fantasy-config';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { FantasyPlayersService } from '@/lib/fantasy/players-service';
import { validateQuery, AvailablePlayersQuerySchema, formatValidationErrors } from '@/lib/fantasy/validation';
import { formatErrorResponse } from '@/lib/fantasy/errors';

/**
 * GET /api/fantasy/players/available?league_id=xxx&cursor=xxx&limit=50&category=A&search=ronaldo
 * Get available (undrafted) players with pagination and filtering
 */
export async function GET(request: NextRequest) {
  try {
    // Validate query parameters
    const validation = validateQuery(request, AvailablePlayersQuerySchema);
    
    if (!validation.success) {
      return NextResponse.json(
        formatValidationErrors(validation.errors),
        { status: 400 }
      );
    }

    const query = validation.data;

    // Use players service
    const playersService = new FantasyPlayersService(fantasySql, getTournamentDb());
    
    const result = await playersService.getAvailablePlayers({
      league_id: query.league_id,
      cursor: query.cursor,
      limit: query.limit,
      category: query.category,
      search: query.search,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching available players:', error);
    const errorResponse = formatErrorResponse(error);
    return NextResponse.json(
      {
        error: errorResponse.code,
        message: errorResponse.message,
        details: errorResponse.details,
      },
      { status: errorResponse.statusCode }
    );
  }
}
