import Image from 'next/image';

interface TeamLogoProps {
  src: string;
  alt: string;
  className?: string;
  shape?: 'circle' | 'square';
  team?: {
    logo_position_x_circle?: number;
    logo_position_y_circle?: number;
    logo_scale_circle?: number;
    logo_position_x_square?: number;
    logo_position_y_square?: number;
    logo_scale_square?: number;
  };
  fallback?: React.ReactNode;
  onError?: () => void;
}

/**
 * TeamLogo Component
 * Displays team logos with proper positioning based on shape (circle or square)
 * Uses the team's saved position settings to fill containers without white space
 */
export function TeamLogo({ 
  src, 
  alt, 
  className = '', 
  shape = 'square',
  team,
  fallback,
  onError
}: TeamLogoProps) {
  // Get position settings based on shape
  const posX = shape === 'circle' 
    ? (team?.logo_position_x_circle ?? 50) 
    : (team?.logo_position_x_square ?? 50);
  
  const posY = shape === 'circle'
    ? (team?.logo_position_y_circle ?? 50)
    : (team?.logo_position_y_square ?? 50);
  
  const scale = shape === 'circle'
    ? (team?.logo_scale_circle ?? 1)
    : (team?.logo_scale_square ?? 1);

  const logoStyle = {
    objectPosition: `${posX}% ${posY}%`,
    transform: `scale(${scale})`,
    transformOrigin: `${posX}% ${posY}%`,
  };

  if (!src) {
    return <>{fallback}</> || null;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`object-cover ${className}`}
      style={logoStyle}
      onError={onError}
    />
  );
}

/**
 * Utility function to get logo style object
 * Can be used inline when component usage is not possible
 */
export function getTeamLogoStyle(
  team: {
    logo_position_x_circle?: number;
    logo_position_y_circle?: number;
    logo_scale_circle?: number;
    logo_position_x_square?: number;
    logo_position_y_square?: number;
    logo_scale_square?: number;
  } | undefined,
  shape: 'circle' | 'square' = 'square'
): React.CSSProperties {
  const posX = shape === 'circle' 
    ? (team?.logo_position_x_circle ?? 50) 
    : (team?.logo_position_x_square ?? 50);
  
  const posY = shape === 'circle'
    ? (team?.logo_position_y_circle ?? 50)
    : (team?.logo_position_y_square ?? 50);
  
  const scale = shape === 'circle'
    ? (team?.logo_scale_circle ?? 1)
    : (team?.logo_scale_square ?? 1);

  return {
    objectPosition: `${posX}% ${posY}%`,
    transform: `scale(${scale})`,
    transformOrigin: `${posX}% ${posY}%`,
  };
}
