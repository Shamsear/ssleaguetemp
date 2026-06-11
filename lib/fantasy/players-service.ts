// Fantasy Players Service Layer
// Handles player listing, filtering, and pagination

import { fantasySql } from '@/lib/neon/fantasy-config';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import { LeagueNotFoundError } from './errors';

export interface AvailablePlayersParams {
  league_id: string;
  cursor?: string;
  limit?: number;
  category?: string;
  search?: string;
}

export interface PlayerInfo {
  real_player_id: string;
  player_name: string;
  position: string;
  team: string;
  team_id: string;
  category: string;
  draft_price: number;
  points: number;
  is_available: boolean;
}

export interface PaginationInfo {
  next_cursor: string | null;
  has_more: boolean;
  limit: number;
  total_in_page: number;
}

export interface AvailablePlayersResult {
  success: true;
  available_players: PlayerInfo[];
  pagination: PaginationInfo;
  filters_applied: {
    category?: string;
    search?: string;
  };
}

/**
 * Fantasy Players Service
 * Handles player queries with filtering and pagination
 */
export class FantasyPlayersService {
  constructor(
    private fantasySql: any,
    private tournamentSql: any
  ) {}

  /**
   * Get available (undrafted) players with pagination and filtering
   */
  async getAvailablePlayers(params: AvailablePlayersParams): Promise<AvailablePlayersResult> {
    const limit = params.limit || 50;

    // Get league and validate
    const league = await this.getLeague(params.league_id);

    // Get category pricing
    const categoryPricing = this.getCategoryPricing(league);

    // Get drafted player IDs
    const draftedPlayerIds = await this.getDraftedPlayerIds(params.league_id);

    // Get available players with filtering and pagination
    const players = await this.queryAvailablePlayers({
      seasonId: league.season_id,
      draftedPlayerIds,
      cursor: params.cursor,
      limit: limit + 1, // Fetch one extra to determine if there are more
      category: params.category,
      search: params.search,
    });

    // Check if there are more results
    const hasMore = players.length > limit;
    const playersToReturn = players.slice(0, limit);

    // Map to fantasy format
    const availablePlayers = playersToReturn.map((player: any) => {
      const category = player.category || 'A';
      const draftPrice = categoryPricing[category] || 10;

      return {
        real_player_id: player.player_id,
        player_name: player.player_name,
        position: player.category || 'Unknown',
        team: player.team || 'Unknown',
        team_id: player.team_id,
        category: category,
        draft_price: draftPrice,
        points: 0,
        is_available: true,
      };
    });

    // Determine next cursor
    const nextCursor = hasMore && playersToReturn.length > 0
      ? playersToReturn[playersToReturn.length - 1].player_id
      : null;

    return {
      success: true,
      available_players: availablePlayers,
      pagination: {
        next_cursor: nextCursor,
        has_more: hasMore,
        limit: limit,
        total_in_page: availablePlayers.length,
      },
      filters_applied: {
        category: params.category,
        search: params.search,
      },
    };
  }

  /**
   * Get league by ID
   */
  private async getLeague(leagueId: string): Promise<any> {
    const leagues = await this.fantasySql`
      SELECT * FROM fantasy_leagues
      WHERE league_id = ${leagueId}
      LIMIT 1
    `;

    if (leagues.length === 0) {
      throw new LeagueNotFoundError(leagueId);
    }

    return leagues[0];
  }

  /**
   * Get category pricing from league settings
   */
  private getCategoryPricing(league: any): Record<string, number> {
    const categoryPricing: Record<string, number> = {};

    if (league.category_prices) {
      // Use category pricing
      league.category_prices.forEach((p: any) => {
        categoryPricing[p.category] = p.price;
      });
    } else if (league.star_rating_prices) {
      // Fallback: Map star_rating to categories
      const starToCategoryMap: Record<number, string> = {
        10: 'A',
        9: 'A',
        8: 'B',
        7: 'B',
        6: 'C',
        5: 'C',
        4: 'D',
        3: 'D',
        2: 'E',
        1: 'E',
      };

      league.star_rating_prices.forEach((p: any) => {
        const category = starToCategoryMap[p.stars] || 'E';
        // If multiple star ratings map to same category, use highest price
        if (!categoryPricing[category] || p.price > categoryPricing[category]) {
          categoryPricing[category] = p.price;
        }
      });
    }

    // Default category prices if none set
    if (Object.keys(categoryPricing).length === 0) {
      categoryPricing['A'] = 40.0;
      categoryPricing['B'] = 25.0;
      categoryPricing['C'] = 15.0;
      categoryPricing['D'] = 10.0;
      categoryPricing['E'] = 5.0;
    }

    return categoryPricing;
  }

  /**
   * Get set of drafted player IDs
   */
  private async getDraftedPlayerIds(leagueId: string): Promise<Set<string>> {
    const draftedPlayers = await this.fantasySql`
      SELECT real_player_id
      FROM fantasy_players
      WHERE league_id = ${leagueId}
        AND (is_available = false OR drafted_by_team_id IS NOT NULL)
    `;

    return new Set(draftedPlayers.map((p: any) => p.real_player_id));
  }

  /**
   * Query available players with filters and pagination
   */
  private async queryAvailablePlayers(params: {
    seasonId: string;
    draftedPlayerIds: Set<string>;
    cursor?: string;
    limit: number;
    category?: string;
    search?: string;
  }): Promise<any[]> {
    const { seasonId, cursor, limit, category, search } = params;

    // Build the query with filters
    let query = this.tournamentSql`
      SELECT 
        player_id,
        player_name,
        team_id,
        team,
        category
      FROM player_seasons
      WHERE season_id = ${seasonId}
        AND player_name IS NOT NULL
        AND team_id IS NOT NULL
        AND team_id != ''
        AND team IS NOT NULL
        AND team != ''
    `;

    // Add cursor pagination (player_id > cursor)
    if (cursor) {
      query = this.tournamentSql`
        SELECT 
          player_id,
          player_name,
          team_id,
          team,
          category
        FROM player_seasons
        WHERE season_id = ${seasonId}
          AND player_name IS NOT NULL
          AND team_id IS NOT NULL
          AND team_id != ''
          AND team IS NOT NULL
          AND team != ''
          AND player_id > ${cursor}
      `;
    }

    // Execute query
    let allPlayers = await query;

    // Filter out drafted players (done in application layer since it's a Set)
    allPlayers = allPlayers.filter((p: any) => !params.draftedPlayerIds.has(p.player_id));

    // Apply category filter
    if (category) {
      allPlayers = allPlayers.filter((p: any) => p.category === category);
    }

    // Apply search filter (case-insensitive)
    if (search) {
      const searchLower = search.toLowerCase();
      allPlayers = allPlayers.filter((p: any) =>
        p.player_name?.toLowerCase().includes(searchLower) ||
        p.team?.toLowerCase().includes(searchLower)
      );
    }

    // Sort by category (A first), then by player_id for consistent pagination
    const categoryOrder: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };
    allPlayers.sort((a: any, b: any) => {
      const catA = categoryOrder[a.category] ?? 999;
      const catB = categoryOrder[b.category] ?? 999;
      if (catA !== catB) {
        return catA - catB;
      }
      // Sort by player_id for consistent pagination
      return a.player_id.localeCompare(b.player_id);
    });

    // Return limited results
    return allPlayers.slice(0, limit);
  }

  /**
   * Get player statistics (for advanced features)
   */
  async getPlayerStats(leagueId: string, playerId: string): Promise<any> {
    const stats = await this.fantasySql`
      SELECT 
        fp.real_player_id,
        fp.total_points,
        fp.times_drafted,
        fp.drafted_by_team_id,
        ft.team_name as drafted_by_team_name
      FROM fantasy_players fp
      LEFT JOIN fantasy_teams ft ON fp.drafted_by_team_id = ft.team_id
      WHERE fp.league_id = ${leagueId}
        AND fp.real_player_id = ${playerId}
      LIMIT 1
    `;

    return stats[0] || null;
  }

  /**
   * Get category summary (how many players in each category)
   */
  async getCategorySummary(leagueId: string): Promise<Record<string, number>> {
    const league = await this.getLeague(leagueId);
    const draftedPlayerIds = await this.getDraftedPlayerIds(leagueId);

    const allPlayers = await this.tournamentSql`
      SELECT category
      FROM player_seasons
      WHERE season_id = ${league.season_id}
        AND player_name IS NOT NULL
        AND team_id IS NOT NULL
        AND team_id != ''
    `;

    const availablePlayers = allPlayers.filter(
      (p: any) => !draftedPlayerIds.has(p.player_id)
    );

    const summary: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    availablePlayers.forEach((p: any) => {
      const cat = p.category || 'A';
      summary[cat] = (summary[cat] || 0) + 1;
    });

    return summary;
  }
}
