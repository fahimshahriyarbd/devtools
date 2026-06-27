'use client';
import { usePathname } from 'next/navigation';
import { Toaster } from '@/components/ui/sonner';

// Per-route toaster placement.
// JSON Studio sits over a full-bleed Monaco editor whose top-right corner
// holds the validation badge and action buttons — top-right toasts cover
// them up. Move toasts to bottom-right just for `/json`. Everywhere else
// keeps the global top-right default.
export default function AppToaster() {
  const pathname = usePathname();
  const position = pathname?.startsWith('/json') ? 'bottom-right' : 'top-right';
  return <Toaster richColors closeButton position={position} />;
}
