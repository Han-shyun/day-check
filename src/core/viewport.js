import { runtime } from './app-context.js';

export function isIphoneLikeDevice() {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = String(navigator.userAgent || '');
  return /iPhone|iPod/i.test(ua);
}

export function syncViewportClasses() {
  if (typeof window === 'undefined' || !document.body) {
    return;
  }

  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  const isNarrow = window.matchMedia('(max-width: 980px)').matches;
  document.body.classList.toggle('is-ios-portrait', isIphoneLikeDevice() && isPortrait);
  document.body.classList.toggle('is-mobile-portrait', isPortrait && isNarrow);
}

export function registerViewportClassSync() {
  syncViewportClasses();
  if (runtime.viewportClassRegistered || typeof window === 'undefined') {
    return;
  }

  runtime.viewportClassRegistered = true;
  window.addEventListener('resize', syncViewportClasses, { passive: true });
  window.addEventListener('orientationchange', syncViewportClasses);
}
