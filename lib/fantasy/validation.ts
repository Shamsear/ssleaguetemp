// Fantasy League Request Validation
// Using Zod for runtime type validation

import { z } from 'zod';
import { NextRequest } from 'next/server';

/**
 * Validation Schema: Draft Player Request
 */
export const DraftPlayerSchema = z.object({
  user_id: z.string().min(1, 'user_id is required'),
  real_player_id: z.string().min(1, 'real_player_id is required'),
  player_name: z.string().min(1, 'player_name is required'),
  position: z.string().optional(),
  team_name: z.string().optional(),
  draft_price: z.number().positive('draft_price must be positive'),
});

export type DraftPlayerRequest = z.infer<typeof DraftPlayerSchema>;

/**
 * Validation Schema: Get Available Players Query
 */
export const AvailablePlayersQuerySchema = z.object({
  league_id: z.string().min(1, 'league_id is required'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  category: z.enum(['A', 'B', 'C', 'D', 'E']).optional(),
  search: z.string().optional(),
});

export type AvailablePlayersQuery = z.infer<typeof AvailablePlayersQuerySchema>;

/**
 * Validation Schema: Remove Player Request
 */
export const RemovePlayerQuerySchema = z.object({
  user_id: z.string().min(1, 'user_id is required'),
  real_player_id: z.string().min(1, 'real_player_id is required'),
});

export type RemovePlayerQuery = z.infer<typeof RemovePlayerQuerySchema>;

/**
 * Generic validation helper
 * Validates request data against a Zod schema
 */
export async function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): Promise<{ success: true; data: T } | { success: false; errors: z.ZodError }> {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: error };
    }
    throw error;
  }
}

/**
 * Validate request body (POST/PUT/PATCH)
 */
export async function validateBody<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; errors: z.ZodError }> {
  try {
    const body = await request.json();
    return validateRequest(schema, body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: error };
    }
    throw error;
  }
}

/**
 * Validate query parameters (GET/DELETE)
 */
export function validateQuery<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const searchParams = request.nextUrl.searchParams;
  const query = Object.fromEntries(searchParams.entries());
  return validateRequest(schema, query);
}

/**
 * Format validation errors for API response
 */
export function formatValidationErrors(errors: z.ZodError): {
  error: string;
  code: string;
  details: Array<{
    field: string;
    message: string;
  }>;
} {
  return {
    error: 'Validation failed',
    code: 'VALIDATION_ERROR',
    details: errors.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
    })),
  };
}
