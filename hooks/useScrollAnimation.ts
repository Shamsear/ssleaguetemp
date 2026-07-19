'use client';

import { useEffect, useRef, useCallback } from 'react';

/**
 * Global scroll animation hook using IntersectionObserver.
 * 
 * TWO MODES:
 * 
 * 1. EXPLICIT: Elements with `data-scroll` attribute are animated with
 *    the specified animation type when they enter the viewport.
 *
 * 2. AUTO-DETECT: Common page elements (section cards, grid items, headings)
 *    are automatically detected and given scroll animations. This makes
 *    scroll animations work on EVERY page without modifying page code.
 *
 * Supported `data-scroll` values:
 *  - "fade-up"       → Fades in + slides up
 *  - "fade-down"     → Fades in + slides down
 *  - "fade-left"     → Fades in + slides from left
 *  - "fade-right"    → Fades in + slides from right
 *  - "zoom-in"       → Fades in + scales up
 *  - "zoom-out"      → Fades in + scales down (from larger)
 *  - "flip-up"       → Perspective flip from bottom
 *  - "fade"          → Simple fade in (no movement)
 *
 * Optional attributes:
 *  - data-scroll-delay="100"   → Delay in ms before animation starts
 *  - data-scroll-duration="600" → Duration in ms (default: 700ms)
 *  - data-scroll-once="false"  → If "false", re-animates every time it enters viewport
 *  - data-scroll-no-auto       → Prevents auto-detection from adding animations to this element
 */
export function useScrollAnimation() {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  const processedElementsRef = useRef<WeakSet<Element>>(new WeakSet());

  const observeElements = useCallback(() => {
    if (!observerRef.current) return;
    
    const elements = document.querySelectorAll('[data-scroll]:not([data-scroll-observed])');
    elements.forEach((el) => {
      el.setAttribute('data-scroll-observed', 'true');
      observerRef.current!.observe(el);
    });
  }, []);

  const autoDetectElements = useCallback(() => {
    if (!observerRef.current) return;

    // Target the main content area
    const main = document.querySelector('main');
    if (!main) return;

    // Auto-detect: Major section containers (white cards, console-cards, glass panels)
    // These are the big white rounded sections that appear on most pages
    const sectionSelectors = [
      // Top-level section cards (direct children of common containers)
      'main > div > div > .bg-white',
      'main > div > .bg-white',
      'main section',
      'main article',
      'main .console-card',
      'main .glass',
      'main .border.rounded-2xl',
      'main .border.rounded-xl',
      'main .shadow-sm',
      'main .shadow-md',
      // Grid children (cards in grids)
      'main .grid > div',
      'main .grid > a',
      // Space-y children (stacked sections)
      'main .space-y-6 > div',
      'main .space-y-8 > div',
      'main .space-y-10 > div',
    ];

    sectionSelectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el, index) => {
          // Skip if already has data-scroll or has been processed or opted out
          if (el.hasAttribute('data-scroll') || 
              el.hasAttribute('data-scroll-no-auto') ||
              processedElementsRef.current.has(el)) return;
          
          // Skip very small elements (likely icons, badges)
          const rect = el.getBoundingClientRect();
          if (rect.height < 40) return;

          // Skip elements that are currently loading (skeletons/spinners)
          if (el.classList.contains('animate-pulse') || 
              el.classList.contains('animate-spin')) return;

          // Skip elements inside modals or fixed overlays
          if (el.closest('[role="dialog"]') || 
              el.closest('.fixed') ||
              el.closest('[data-scroll]')) return;

          processedElementsRef.current.add(el);
          
          // Choose animation based on position/type
          let animationType = 'fade-up';
          
          // Grid items get staggered delays
          const parent = el.parentElement;
          if (parent && (parent.classList.contains('grid') || 
              parent.getAttribute('class')?.includes('grid-cols'))) {
            const delay = Math.min(index * 80, 480);
            el.setAttribute('data-scroll-delay', delay.toString());
          }
          
          el.setAttribute('data-scroll', animationType);
          el.setAttribute('data-scroll-observed', 'true');
          observerRef.current!.observe(el);
        });
      } catch (e) {
        // Silently ignore invalid selectors
      }
    });
  }, []);

  useEffect(() => {
    // Don't run on the server
    if (typeof window === 'undefined') return;

    // Respect prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      document.querySelectorAll('[data-scroll]').forEach((el) => {
        (el as HTMLElement).style.opacity = '1';
        (el as HTMLElement).style.transform = 'none';
      });
      return;
    }

    // Create IntersectionObserver
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            const delay = parseInt(el.getAttribute('data-scroll-delay') || '0', 10);

            if (delay > 0) {
              setTimeout(() => {
                el.classList.add('scroll-visible');
                el.setAttribute('data-scroll-finished', 'true');
              }, delay);
            } else {
              el.classList.add('scroll-visible');
              el.setAttribute('data-scroll-finished', 'true');
            }

            // Unobserve unless data-scroll-once="false"
            const once = el.getAttribute('data-scroll-once');
            if (once !== 'false') {
              observerRef.current?.unobserve(el);
            }
          } else {
            const el = entry.target as HTMLElement;
            const once = el.getAttribute('data-scroll-once');
            if (once === 'false') {
              el.classList.remove('scroll-visible');
              el.removeAttribute('data-scroll-finished');
            }
          }
        });
      },
      {
        threshold: 0.01,
        rootMargin: '0px 0px -10px 0px',
      }
    );

    // Phase 1: Observe explicit data-scroll elements
    observeElements();

    // Phase 2: Auto-detect and animate common page elements
    // Small delay to let the page render first
    const autoDetectTimer = setTimeout(() => {
      autoDetectElements();
    }, 100);

    let checkTimeout: NodeJS.Timeout | null = null;
    
    const triggerCheck = () => {
      if (checkTimeout) clearTimeout(checkTimeout);
      checkTimeout = setTimeout(() => {
        requestAnimationFrame(() => {
          observeElements();
          autoDetectElements();
        });
      }, 100);
    };

    // Watch for dynamically added elements or visibility changes (tabs, modals, route changes)
    mutationObserverRef.current = new MutationObserver((mutations) => {
      let shouldCheck = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          shouldCheck = true;
          break;
        }
        if (
          mutation.type === 'attributes' &&
          (mutation.attributeName === 'class' || mutation.attributeName === 'style')
        ) {
          const target = mutation.target as HTMLElement;
          if (target && !target.classList.contains('scroll-visible') && !target.hasAttribute('data-scroll-finished')) {
            shouldCheck = true;
            break;
          }
        }
      }
      if (shouldCheck) {
        triggerCheck();
      }
    });

    mutationObserverRef.current.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    return () => {
      clearTimeout(autoDetectTimer);
      if (checkTimeout) clearTimeout(checkTimeout);
      observerRef.current?.disconnect();
      mutationObserverRef.current?.disconnect();
    };
  }, [observeElements, autoDetectElements]);
}
