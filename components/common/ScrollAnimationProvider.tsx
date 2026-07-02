'use client';

import { useScrollAnimation } from '@/hooks/useScrollAnimation';

/**
 * ScrollAnimationProvider — drop into the root layout to enable
 * scroll-triggered animations on EVERY page.
 *
 * Any element with a `data-scroll` attribute will automatically
 * be animated when it scrolls into view.
 *
 * Usage in JSX:
 *   <div data-scroll="fade-up">I animate on scroll!</div>
 *   <div data-scroll="fade-left" data-scroll-delay="200">Delayed!</div>
 *   <div data-scroll="zoom-in" data-scroll-duration="900">Slower!</div>
 *
 * Available animations:
 *   fade-up, fade-down, fade-left, fade-right, zoom-in, zoom-out, flip-up, fade
 */
export default function ScrollAnimationProvider() {
  useScrollAnimation();
  return null;
}
