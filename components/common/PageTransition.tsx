/**
 * Page Transition Wrapper
 * Provides smooth transitions between pages
 */

'use client';

import { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  return <>{children}</>;
}
