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
 * Displays team logos cleanly fitted inside their container without cropping.
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
  void shape;
  void team;

  if (!src) {
    return <>{fallback}</> || null;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`object-contain ${className}`}
      onError={onError}
    />
  );
}

/**
 * Utility function to get logo style object
 * Keeps full logo visible inside container bounds without zoom cropping.
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
  void team;
  void shape;

  return {
    objectFit: 'contain',
    objectPosition: '50% 50%',
  };
}
