'use client';
import { useState, useEffect } from 'react';

/**
 * Controlled open-state for Sheets that should only be visible on mobile
 * (i.e. triggers use `lg:hidden`). Auto-closes the sheet whenever the
 * viewport crosses the `lg` breakpoint into desktop so it doesn't linger
 * as an orphaned modal when the user resizes.
 *
 * Tailwind `lg` = 1024px.
 */
export function useMobileSheet(query = '(min-width: 1024px)') {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const handler = (e) => { if (e.matches) setOpen(false); };
    if (mql.matches) setOpen(false);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);
  return [open, setOpen];
}
