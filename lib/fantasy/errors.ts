// Fantasy League Error Handling
// Custom error classes with detailed messages

/**
 * Base Fantasy Error Class
 */
export class FantasyError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'FantasyError';
  }
}

/**
 * Player Already Drafted Error
 */
export class PlayerAlreadyDraftedError extends FantasyError {
  constructor(
    playerName: string,
    draftedBy: {
      team_id: string;
      team_name: string;
      drafted_at: Date;
    },
    suggestedAlternatives?: Array<{
      player_id: string;
      player_name: string;
      category: string;
      draft_price: number;
    }>
  ) {
    super(
      `${playerName} has already been drafted by ${draftedBy.team_name}`,
      400,
      'PLAYER_ALREADY_DRAFTED',
      {
        player_name: playerName,
        drafted_by: draftedBy,
        suggested_alternatives: suggestedAlternatives || [],
      }
    );
  }
}

/**
 * Squad Full Error
 */
export class SquadFullError extends FantasyError {
  constructor(
    currentSize: number,
    maxSize: number,
    teamName: string
  ) {
    super(
      `Squad is full. ${teamName} already has ${currentSize} players (maximum: ${maxSize})`,
      400,
      'SQUAD_FULL',
      {
        current_size: currentSize,
        max_size: maxSize,
        remaining_slots: 0,
      }
    );
  }
}

/**
 * Insufficient Budget Error
 */
export class InsufficientBudgetError extends FantasyError {
  constructor(
    requiredAmount: number,
    availableAmount: number,
    playerName: string,
    shortfall: number
  ) {
    super(
      `Insufficient budget to draft ${playerName}. Required: €${requiredAmount}M, Available: €${availableAmount}M`,
      400,
      'INSUFFICIENT_BUDGET',
      {
        required: requiredAmount,
        available: availableAmount,
        shortfall: shortfall,
        player_name: playerName,
      }
    );
  }
}

/**
 * Invalid Draft Price Error
 */
export class InvalidDraftPriceError extends FantasyError {
  constructor(
    providedPrice: number,
    expectedPrice: number,
    playerName: string,
    category: string
  ) {
    super(
      `Invalid draft price for ${playerName}. Expected: €${expectedPrice}M (Category ${category}), Provided: €${providedPrice}M`,
      400,
      'INVALID_DRAFT_PRICE',
      {
        expected: expectedPrice,
        provided: providedPrice,
        player_name: playerName,
        player_category: category,
      }
    );
  }
}

/**
 * Player Not Found Error
 */
export class PlayerNotFoundError extends FantasyError {
  constructor(
    playerId: string,
    seasonId?: string
  ) {
    super(
      seasonId 
        ? `Player ${playerId} not found in season ${seasonId}`
        : `Player ${playerId} not found`,
      404,
      'PLAYER_NOT_FOUND',
      {
        player_id: playerId,
        season_id: seasonId,
      }
    );
  }
}

/**
 * Draft Not Active Error
 */
export class DraftNotActiveError extends FantasyError {
  constructor(
    currentStatus: string,
    leagueName?: string
  ) {
    const message = currentStatus === 'pending'
      ? 'Draft has not started yet. Please wait for the draft to begin.'
      : currentStatus === 'closed'
      ? 'Draft period has ended. Use transfer windows to modify your squad.'
      : `Draft is currently ${currentStatus}`;

    super(
      leagueName ? `${message} (League: ${leagueName})` : message,
      403,
      'DRAFT_NOT_ACTIVE',
      {
        current_status: currentStatus,
        league_name: leagueName,
      }
    );
  }
}

/**
 * League Not Found Error
 */
export class LeagueNotFoundError extends FantasyError {
  constructor(leagueId: string) {
    super(
      `Fantasy league ${leagueId} not found`,
      404,
      'LEAGUE_NOT_FOUND',
      {
        league_id: leagueId,
      }
    );
  }
}

/**
 * Team Not Found Error
 */
export class TeamNotFoundError extends FantasyError {
  constructor(userId: string) {
    super(
      `No fantasy team found for user ${userId}`,
      404,
      'TEAM_NOT_FOUND',
      {
        user_id: userId,
        message: 'Please create a fantasy team first or join a league',
      }
    );
  }
}

/**
 * Player Not In Squad Error
 */
export class PlayerNotInSquadError extends FantasyError {
  constructor(playerName: string, teamName: string) {
    super(
      `${playerName} is not in ${teamName}'s squad`,
      404,
      'PLAYER_NOT_IN_SQUAD',
      {
        player_name: playerName,
        team_name: teamName,
      }
    );
  }
}

/**
 * Generic Database Error
 */
export class DatabaseError extends FantasyError {
  constructor(operation: string, originalError?: Error) {
    super(
      `Database error during ${operation}`,
      500,
      'DATABASE_ERROR',
      {
        operation,
        original_error: originalError?.message,
      }
    );
  }
}

/**
 * Error Response Helper
 * Converts errors to consistent API response format
 */
export function formatErrorResponse(error: unknown): {
  error: string;
  code: string;
  message: string;
  details?: any;
  statusCode: number;
} {
  if (error instanceof FantasyError) {
    return {
      error: error.code,
      code: error.code,
      message: error.message,
      details: error.details,
      statusCode: error.statusCode,
    };
  }

  if (error instanceof Error) {
    return {
      error: 'INTERNAL_SERVER_ERROR',
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      details: {
        message: error.message,
      },
      statusCode: 500,
    };
  }

  return {
    error: 'UNKNOWN_ERROR',
    code: 'UNKNOWN_ERROR',
    message: 'An unknown error occurred',
    statusCode: 500,
  };
}
