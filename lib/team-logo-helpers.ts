/**
 * Team Logo Helper Functions
 * Use these to apply proper positioning to team logos throughout the app
 */

export interface TeamLogoData {
  logo_url?: string;
  logo_position_x_circle?: number;
  logo_position_y_circle?: number;
  logo_scale_circle?: number;
  logo_position_x_square?: number;
  logo_position_y_square?: number;
  logo_scale_square?: number;
  team_logo?: string; // Alternative field name
}

/**
 * Get logo style for a specific shape
 * @param team - Team object with logo positioning data
 * @param shape - 'circle' or 'square'
 * @returns CSS style object
 */
export function getTeamLogoStyle(
  team: TeamLogoData | undefined | null,
  shape: 'circle' | 'square' = 'square'
): React.CSSProperties {
  if (!team) {
    return {
      objectPosition: '50% 50%',
      transform: 'scale(1)',
      transformOrigin: '50% 50%',
    };
  }

  const posX = shape === 'circle' 
    ? (team.logo_position_x_circle ?? 50) 
    : (team.logo_position_x_square ?? 50);
  
  const posY = shape === 'circle'
    ? (team.logo_position_y_circle ?? 50)
    : (team.logo_position_y_square ?? 50);
  
  const scale = shape === 'circle'
    ? (team.logo_scale_circle ?? 1)
    : (team.logo_scale_square ?? 1);

  return {
    objectPosition: `${posX}% ${posY}%`,
    transform: `scale(${scale})`,
    transformOrigin: `${posX}% ${posY}%`,
  };
}

/**
 * Get the logo URL from team object (handles multiple field names)
 */
export function getTeamLogoUrl(team: TeamLogoData | undefined | null): string | undefined {
  return team?.logo_url || team?.team_logo;
}

/**
 * Auto-detect shape from className
 * @param className - The className string
 * @returns 'circle' or 'square'
 */
export function detectShapeFromClassName(className: string): 'circle' | 'square' {
  return className.includes('rounded-full') ? 'circle' : 'square';
}
