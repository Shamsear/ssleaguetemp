'use client';

import { useState } from 'react';
import { getOptimizedImageUrl } from '@/lib/imagekit/upload';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  quality?: number;
  className?: string;
  fallback?: React.ReactNode;
  // Photo positioning props (set by super admin)
  photoPositionX?: number | null;
  photoPositionY?: number | null;
  photoScale?: number | null;
}

/**
 * Optimized Image component using ImageKit
 * Automatically applies transformations for better performance
 */
export default function OptimizedImage({
  src,
  alt,
  width,
  height,
  quality = 80,
  className = '',
  fallback,
  photoPositionX,
  photoPositionY,
  photoScale,
}: OptimizedImageProps) {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  // Use original URL with cache-busting
  // Note: ImageKit transformations can be added back later if needed
  let optimizedSrc = src;
  
  // Add cache-busting parameter
  const cacheBuster = '20250109-2';
  const separator = optimizedSrc.includes('?') ? '&' : '?';
  optimizedSrc = `${optimizedSrc}${separator}v=${cacheBuster}`;

  if (error && fallback) {
    return <>{fallback}</>;
  }

  // Calculate inline styles for positioning
  const imageStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  };
  
  if (photoPositionX !== null && photoPositionX !== undefined) {
    imageStyle.objectPosition = `${photoPositionX}% ${photoPositionY || 50}%`;
  }
  
  if (photoScale !== null && photoScale !== undefined && photoScale !== 1) {
    imageStyle.transform = `scale(${photoScale})`;
    imageStyle.transformOrigin = 'center';
  }

  return (
    <div className={`relative overflow-hidden w-full h-full ${className}`}>
      {loading && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      )}
      <img
        src={optimizedSrc}
        alt={alt}
        style={imageStyle}
        loading="lazy"
        onLoad={() => setLoading(false)}
        onError={() => {
          setError(true);
          setLoading(false);
        }}
      />
    </div>
  );
}
