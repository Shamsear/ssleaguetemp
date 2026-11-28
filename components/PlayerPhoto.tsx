'use client';

import Image from 'next/image';
import { memo, useMemo } from 'react';

interface PlayerPhotoProps {
  photoUrl?: string;
  playerName: string;
  shape?: 'circle' | 'square';
  size?: number;
  className?: string;
  positionCircle?: string;
  scaleCircle?: number;
  posXCircle?: number;
  posYCircle?: number;
  positionSquare?: string;
  scaleSquare?: number;
  posXSquare?: number;
  posYSquare?: number;
  showFallback?: boolean;
}

function PlayerPhoto({
  photoUrl,
  playerName,
  shape = 'circle',
  size = 80,
  className = '',
  positionCircle,
  scaleCircle,
  posXCircle,
  posYCircle,
  positionSquare,
  scaleSquare,
  posXSquare,
  posYSquare,
  showFallback = true,
}: PlayerPhotoProps) {
  
  // Determine which settings to use based on shape
  const { scale, posX, posY } = useMemo(() => {
    if (shape === 'circle') {
      return {
        scale: scaleCircle || 1,
        posX: posXCircle ?? 50,
        posY: posYCircle ?? 50,
      };
    } else {
      return {
        scale: scaleSquare || 1,
        posX: posXSquare ?? 50,
        posY: posYSquare ?? 50,
      };
    }
  }, [shape, scaleCircle, posXCircle, posYCircle, scaleSquare, posXSquare, posYSquare]);

  const wrapperClass = shape === 'circle' ? 'rounded-full' : 'rounded-lg';
  const initials = (playerName || '?').charAt(0).toUpperCase();

  return (
    <div 
      className={`relative overflow-hidden bg-gray-100 ${wrapperClass} ${className}`}
      style={{ width: size, height: size, isolation: 'isolate' }}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={playerName}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            objectPosition: `${posX}% ${posY}%`,
            transform: scale !== 1 ? `scale(${scale})` : undefined,
            transformOrigin: `${posX}% ${posY}%`
          }}
        />
      ) : showFallback ? (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-100 to-purple-100">
          <span className="text-xl font-bold text-blue-600">{initials}</span>
        </div>
      ) : null}
    </div>
  );
}

export default memo(PlayerPhoto);
