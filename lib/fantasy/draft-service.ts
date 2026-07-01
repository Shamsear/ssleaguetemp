// Fantasy Draft Service Layer
// Separates business logic from API routes

import { fantasySql } from '@/lib/neon/fantasy-config';
import { getTournamentDb } from '@/lib/neon/tournament-config';
import {
  PlayerAlreadyDraftedError,
  SquadFullError,
  InsufficientBudgetError,
  InvalidDraftPriceError,
  PlayerNotFoundError,
  DraftNotActiveError,
  LeagueNotFoundError,
  TeamNotFoundError,
  PlayerNotInSquadError,
  DatabaseError,
} from './errors';

export interface DraftPlayerParams {
  user_id: string;
  real_player_id: string;
  player_name: string;
  position?: string;
  team_name?: string;
  draft_price: number;
}

export interface DraftResult {
  success: true;
  squad_id: string;
  player_name: string;
  position: string;
  purchase_price: number;
  remaining_budget: number;
  squad_size: number;
  max_squad_size: number;
  player_category: string;
}

export interface RemovePlayerParams {
  user_id: string;
  real_player_id: string;
}

export interface RemovePlayerResult {
  success: true;
  player_name: string;
  refunded_amount: number;
  new_budget: number;
}

export interface DraftContext {
  team: any;
  league: any;
  currentSquad: any[];
  playerCategory: string;
  expectedPrice: number;
}

/**
 * Fantasy Draft Service
 * Handles all draft-related business logic
 */
export class FantasyDraftService {
  constructor(
    private fantasySql: any,
    private tournamentSql: any
  ) {}

  /**
   * Draft a player for a fantasy team
   */
  async draftPlayer(params: DraftPlayerParams): Promise<DraftResult> {
    // Validate and gather context
    const context = await this.prepareDraftContext(params);

    // Execute draft in transaction
    return await this.executeDraft(params, context);
  }

  /**
   * Remove a drafted player from squad
   */
  async removePlayer(params: RemovePlayerParams): Promise<RemovePlayerResult> {
    // Get team and league info
    const { team, league } = await this.getTeamAndLeague(params.user_id);

    // Verify draft is active
    if (league.draft_status !== 'active') {
      throw new DraftNotActiveError(league.draft_status, league.name);
    }

    // Get the player from squad
    const squadPlayer = await this.fantasySql`
      SELECT * FROM fantasy_squad
      WHERE team_id = ${team.team_id}
        AND real_player_id = ${params.real_player_id}
      LIMIT 1
    `;

    if (squadPlayer.length === 0) {
      throw new PlayerNotInSquadError('Player', team.team_name);
    }

    const player = squadPlayer[0];
    const refundPrice = Number(player.purchase_price);

    // Execute removal in transaction
    await this.fantasySql.begin(async (tx: any) => {
      // Remove from fantasy_squad
      await tx`
        DELETE FROM fantasy_squad
        WHERE team_id = ${team.team_id}
          AND real_player_id = ${params.real_player_id}
      `;

      // Make player available again
      await tx`
        UPDATE fantasy_players
        SET is_available = true,
            drafted_by_team_id = NULL,
            updated_at = NOW()
        WHERE league_id = ${league.league_id}
          AND real_player_id = ${params.real_player_id}
      `;

      // Refund the budget
      await tx`
        UPDATE fantasy_teams
        SET budget_remaining = budget_remaining + ${refundPrice},
            updated_at = CURRENT_TIMESTAMP
        WHERE team_id = ${team.team_id}
      `;
    });

    return {
      success: true,
      player_name: player.player_name,
      refunded_amount: refundPrice,
      new_budget: Number(team.budget_remaining) + refundPrice,
    };
  }

  /**
   * Prepare draft context (validation + data gathering)
   */
  private async prepareDraftContext(params: DraftPlayerParams): Promise<DraftContext> {
    // Get team and league (optimized with JOIN)
    const { team, league } = await this.getTeamAndLeague(params.user_id);

    // Validate draft status
    this.validateDraftStatus(league);

    // Get player info and validate existence
    const playerCategory = await this.getPlayerCategory(
      params.real_player_id,
      league.season_id
    );

    // Get current squad
    const currentSquad = await this.fantasySql`
      SELECT * FROM fantasy_squad
      WHERE team_id = ${team.team_id}
    `;

    // Validate squad size
    this.validateSquadSize(currentSquad.length, league.max_squad_size, team.team_name);

    // Get expected price
    const expectedPrice = this.getExpectedPrice(playerCategory, league);

    // Validate price
    this.validateDraftPrice(
      params.draft_price,
      expectedPrice,
      params.player_name,
      playerCategory
    );

    // Validate budget
    this.validateBudget(
      currentSquad,
      league.budget_per_team,
      params.draft_price,
      params.player_name
    );

    return {
      team,
      league,
      currentSquad,
      playerCategory,
      expectedPrice,
    };
  }

  /**
   * Execute draft transaction
   */
  private async executeDraft(
    params: DraftPlayerParams,
    context: DraftContext
  ): Promise<DraftResult> {
    const { team, league, currentSquad, playerCategory } = context;

    try {
      const result = await this.fantasySql.begin(async (tx: any) => {
        // Lock player row to prevent race conditions
        const playerCheck = await tx`
          SELECT drafted_by_team_id, is_available
          FROM fantasy_players
          WHERE league_id = ${league.league_id}
            AND real_player_id = ${params.real_player_id}
          FOR UPDATE
        `;

        // Check if player is available
        if (playerCheck.length > 0) {
          const playerData = playerCheck[0];
          if (!playerData.is_available || playerData.drafted_by_team_id) {
            // Get team info for better error message
            const draftedByTeam = await tx`
              SELECT team_id, team_name, updated_at
              FROM fantasy_teams
              WHERE team_id = ${playerData.drafted_by_team_id}
              LIMIT 1
            `;

            throw new PlayerAlreadyDraftedError(
              params.player_name,
              {
                team_id: draftedByTeam[0]?.team_id || 'unknown',
                team_name: draftedByTeam[0]?.team_name || 'Another Team',
                drafted_at: draftedByTeam[0]?.updated_at || new Date(),
              },
              await this.getSuggestedAlternatives(playerCategory, league.league_id, league.season_id, tx)
            );
          }
        }

        // Generate IDs
        const squad_id = `squad_${team.team_id}_${params.real_player_id}_${Date.now()}`;
        const draft_id = `draft_${team.team_id}_${params.real_player_id}_${Date.now()}`;

        // Insert into fantasy_squad
        await tx`
          INSERT INTO fantasy_squad (
            squad_id, team_id, league_id, real_player_id,
            player_name, position, real_team_name, category,
            purchase_price, current_value, acquisition_type
          ) VALUES (
            ${squad_id}, ${team.team_id}, ${league.league_id}, ${params.real_player_id},
            ${params.player_name}, ${params.position || 'Unknown'}, 
            ${params.team_name || 'Unknown'}, ${playerCategory},
            ${params.draft_price}, ${params.draft_price}, 'draft'
          )
        `;

        // Update or insert fantasy_players
        if (playerCheck.length > 0) {
          await tx`
            UPDATE fantasy_players
            SET 
              times_drafted = COALESCE(times_drafted, 0) + 1,
              is_available = false,
              drafted_by_team_id = ${team.team_id},
              category = ${playerCategory},
              updated_at = NOW()
            WHERE league_id = ${league.league_id}
              AND real_player_id = ${params.real_player_id}
          `;
        } else {
          await tx`
            INSERT INTO fantasy_players (
              league_id, real_player_id, draft_price,
              times_drafted, total_points, is_available,
              drafted_by_team_id, category
            ) VALUES (
              ${league.league_id}, ${params.real_player_id}, ${params.draft_price},
              1, 0, false, ${team.team_id}, ${playerCategory}
            )
          `;
        }

        // Insert into fantasy_drafts
        await tx`
          INSERT INTO fantasy_drafts (
            draft_id, league_id, team_id, real_player_id,
            player_name, position, real_team_name, draft_price,
            draft_order, category
          ) VALUES (
            ${draft_id}, ${league.league_id}, ${team.team_id}, ${params.real_player_id},
            ${params.player_name}, ${params.position || 'Unknown'}, 
            ${params.team_name || 'Unknown'}, ${params.draft_price}, 
            ${currentSquad.length + 1}, ${playerCategory}
          )
        `;

        // Calculate and update budget
        const currentBudgetSpent = currentSquad.reduce(
          (sum: number, p: any) => sum + Number(p.purchase_price),
          0
        );
        const newBudgetRemaining = Number(league.budget_per_team) - currentBudgetSpent - params.draft_price;

        await tx`
          UPDATE fantasy_teams
          SET budget_remaining = ${newBudgetRemaining},
              updated_at = CURRENT_TIMESTAMP
          WHERE team_id = ${team.team_id}
        `;

        return {
          squad_id,
          newBudgetRemaining,
          squadSize: currentSquad.length + 1,
        };
      });

      return {
        success: true,
        squad_id: result.squad_id,
        player_name: params.player_name,
        position: params.position || 'Unknown',
        purchase_price: params.draft_price,
        remaining_budget: result.newBudgetRemaining,
        squad_size: result.squadSize,
        max_squad_size: Number(league.max_squad_size),
        player_category: playerCategory,
      };
    } catch (error) {
      if (
        error instanceof PlayerAlreadyDraftedError ||
        error instanceof SquadFullError ||
        error instanceof InsufficientBudgetError
      ) {
        throw error;
      }
      throw new DatabaseError('draft player', error as Error);
    }
  }

  /**
   * Get team and league info with optimized query
   */
  private async getTeamAndLeague(userId: string): Promise<{ team: any; league: any }> {
    const result = await this.fantasySql`
      SELECT 
        ft.team_id,
        ft.owner_uid,
        ft.team_name,
        ft.budget_remaining,
        fl.league_id,
        fl.name as league_name,
        fl.max_squad_size,
        fl.budget_per_team,
        fl.draft_status,
        fl.category_prices,
        fl.star_rating_prices,
        fl.season_id,
        fl.draft_closes_at
      FROM fantasy_teams ft
      JOIN fantasy_leagues fl ON ft.league_id = fl.league_id
      WHERE ft.owner_uid = ${userId} AND ft.is_enabled = true
      LIMIT 1
    `;

    if (result.length === 0) {
      throw new TeamNotFoundError(userId);
    }

    const row = result[0];
    return {
      team: {
        team_id: row.team_id,
        owner_uid: row.owner_uid,
        team_name: row.team_name,
        budget_remaining: row.budget_remaining,
      },
      league: {
        league_id: row.league_id,
        name: row.league_name,
        max_squad_size: row.max_squad_size,
        budget_per_team: row.budget_per_team,
        draft_status: row.draft_status,
        category_prices: row.category_prices,
        star_rating_prices: row.star_rating_prices,
        season_id: row.season_id,
        draft_closes_at: row.draft_closes_at,
      },
    };
  }

  /**
   * Get player category from tournament database
   */
  private async getPlayerCategory(playerId: string, seasonId: string): Promise<string> {
    const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
    const isModern = seasonNum === 16 || seasonNum === 17;

    const playerData = isModern
      ? await this.tournamentSql`
          SELECT category
          FROM player_seasons
          WHERE player_id = ${playerId}
            AND season_id = ${seasonId}
          LIMIT 1
        `
      : await this.tournamentSql`
          SELECT category
          FROM realplayerstats
          WHERE player_id = ${playerId}
            AND season_id = ${seasonId}
          LIMIT 1
        `;

    if (playerData.length === 0) {
      throw new PlayerNotFoundError(playerId, seasonId);
    }

    return playerData[0].category || 'A';
  }

  /**
   * Get expected price for category
   */
  private getExpectedPrice(category: string, league: any): number {
    const categoryPrices = league.category_prices || [];
    const priceObj = categoryPrices.find((p: any) => p.category === category);
    return priceObj?.price || 40.0;
  }

  /**
   * Validate draft status
   */
  private validateDraftStatus(league: any): void {
    if (league.draft_status !== 'active') {
      throw new DraftNotActiveError(league.draft_status, league.name);
    }

    if (league.draft_closes_at) {
      const now = new Date();
      const closeDate = new Date(league.draft_closes_at);
      if (now > closeDate) {
        throw new DraftNotActiveError('closed', league.name);
      }
    }
  }

  /**
   * Validate squad size
   */
  private validateSquadSize(currentSize: number, maxSize: number, teamName: string): void {
    if (currentSize >= maxSize) {
      throw new SquadFullError(currentSize, maxSize, teamName);
    }
  }

  /**
   * Validate draft price
   */
  private validateDraftPrice(
    providedPrice: number,
    expectedPrice: number,
    playerName: string,
    category: string
  ): void {
    if (Math.abs(providedPrice - expectedPrice) > 0.01) {
      throw new InvalidDraftPriceError(providedPrice, expectedPrice, playerName, category);
    }
  }

  /**
   * Validate budget
   */
  private validateBudget(
    currentSquad: any[],
    totalBudget: number,
    draftPrice: number,
    playerName: string
  ): void {
    const currentBudgetSpent = currentSquad.reduce(
      (sum: number, p: any) => sum + Number(p.purchase_price),
      0
    );
    const remainingBudget = Number(totalBudget) - currentBudgetSpent;

    if (draftPrice > remainingBudget) {
      throw new InsufficientBudgetError(
        draftPrice,
        remainingBudget,
        playerName,
        draftPrice - remainingBudget
      );
    }
  }

  /**
   * Get suggested alternative players (same category, available)
   */
  private async getSuggestedAlternatives(
    category: string,
    leagueId: string,
    seasonId: string,
    tx: any
  ): Promise<Array<{ player_id: string; player_name: string; category: string; draft_price: number }>> {
    try {
      const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
      const isModern = seasonNum === 16 || seasonNum === 17;

      const alternatives = isModern
        ? await this.tournamentSql`
            SELECT player_id, player_name, category
            FROM player_seasons ps
            WHERE ps.category = ${category}
              AND ps.season_id = ${seasonId}
              AND ps.player_id NOT IN (
                SELECT real_player_id
                FROM fantasy_players
                WHERE league_id = ${leagueId}
                  AND (is_available = false OR drafted_by_team_id IS NOT NULL)
              )
            LIMIT 3
          `
        : await this.tournamentSql`
            SELECT player_id, player_name, category
            FROM realplayerstats ps
            WHERE ps.category = ${category}
              AND ps.season_id = ${seasonId}
              AND ps.player_id NOT IN (
                SELECT real_player_id
                FROM fantasy_players
                WHERE league_id = ${leagueId}
                  AND (is_available = false OR drafted_by_team_id IS NOT NULL)
              )
            LIMIT 3
          `;

      return alternatives.map((p: any) => ({
        player_id: p.player_id,
        player_name: p.player_name,
        category: p.category,
        draft_price: 40.0, // Placeholder
      }));
    } catch {
      return [];
    }
  }
}
