'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, FileArchive, FolderTree, GitCompareArrows, Wifi, Share2,
  Moon, Sun, Command, Sparkles, Hash, Dice5, ChevronsLeft, ChevronsRight, Braces,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import CommandPalette from '@/components/CommandPalette';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/folder-compare', label: 'Folder Compare', icon: FolderTree },
  { href: '/zip-compare', label: 'ZIP Compare', icon: FileArchive },
  { href: '/text-compare', label: 'Text Compare', icon: GitCompareArrows },
  { href: '/hash-generator', label: 'Hash Generator', icon: Hash },
  { href: '/random-generator', label: 'Random Generator', icon: Dice5 },
  { href: '/json-studio', label: 'JSON Studio', icon: Braces },
  { href: '/wifi-text-share', label: 'WiFi Text', icon: Wifi },
  { href: '/wifi-file-share', label: 'WiFi Files', icon: Share2 },
];

export default function AppShell({ children }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Auto-close the Quick-actions / Menu palette when the viewport crosses
  // into desktop (>= md / 768px), so the popover opened via the mobile
  // top-bar "Menu" button doesn't linger after a resize.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(min-width: 768px)');
    const handler = (e) => { if (e.matches) setPaletteOpen(false); };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Absorb benign network errors (e.g. "Failed to fetch" from browser-
  // extension-wrapped fetch, or AbortError from in-flight requests cancelled
  // when the user navigates away). These never indicate a real problem —
  // the WebRTC poll loop already retries on the next tick — so we prevent
  // Next.js's dev runtime overlay from surfacing them.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onReject = (event) => {
      const reason = event.reason;
      const msg = (reason && (reason.message || String(reason))) || '';
      const name = reason && reason.name;
      if (
        name === 'AbortError' ||
        msg === 'Failed to fetch' ||
        msg.includes('NetworkError') ||
        msg.includes('Load failed')
      ) {
        event.preventDefault?.();
      }
    };
    window.addEventListener('unhandledrejection', onReject);
    return () => window.removeEventListener('unhandledrejection', onReject);
  }, []);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('devhub.sidebar.collapsed');
    if (stored === '1') setCollapsed(true);
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem('devhub.sidebar.collapsed', collapsed ? '1' : '0');
  }, [collapsed, mounted]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const w = collapsed ? 'w-[68px]' : 'w-64';

  return (
    <div className="flex min-h-screen">
      <TooltipProvider delayDuration={100}>
        <aside
          data-testid="app-sidebar"
          className={cn(
            'hidden md:flex shrink-0 flex-col border-r border-border/60 bg-card/40 backdrop-blur-xl transition-[width] duration-200',
            'sticky top-0 h-screen self-start overflow-hidden',
            w,
          )}
        >
          {/* Brand + collapse button */}
          <div className={cn('relative border-b border-border/60 shrink-0', collapsed ? 'p-3' : 'p-5')}>
            <Link
              href="/"
              aria-label="DevHub Homepage"
              title="DevHub — Go to homepage"
              rel="home"
              data-testid="devhub-home-link"
              className={cn('flex items-center group', collapsed ? 'justify-center' : 'gap-2.5')}
            >
              <div className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 grid place-items-center shadow-lg shadow-violet-500/20 shrink-0 group-hover:scale-105 transition-transform">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <div className="font-semibold text-[15px] leading-tight group-hover:text-blue-400 transition-colors">DevHub</div>
                  <div className="text-[11px] text-muted-foreground leading-tight truncate">devhub.app · Home</div>
                </div>
              )}
            </Link>
            <button
              data-testid="sidebar-collapse-toggle"
              onClick={() => setCollapsed(v => !v)}
              className="absolute -right-4 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full border border-border bg-background grid place-items-center shadow-lg hover:bg-accent hover:scale-105 active:scale-95 transition z-10"
              title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (Ctrl/⌘+B)`}
              aria-label="Toggle sidebar"
            >
              {collapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
            </button>
          </div>

          {/* Nav */}
          <nav className={cn('flex-1 min-h-0 space-y-2 overflow-y-auto sidebar-scroll', collapsed ? 'p-2' : 'p-3')}>
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              const content = (
                <motion.div
                  whileHover={{ x: collapsed ? 0 : 2 }}
                  className={cn(
                    'group flex items-center rounded-lg text-sm transition-colors',
                    collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                    active
                      ? 'bg-accent text-accent-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  <Icon className={cn('h-4 w-4 shrink-0', active && 'text-blue-400')} />
                  {!collapsed && <span className="flex-1 font-medium truncate">{item.label}</span>}
                </motion.div>
              );
              const link = <Link key={item.href} href={item.href} className="block">{content}</Link>;
              return collapsed ? (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : link;
            })}
          </nav>

          {/* Footer */}
          <div className={cn('border-t border-border/60 space-y-2 shrink-0', collapsed ? 'p-2' : 'p-3')}>
            {collapsed ? (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setPaletteOpen(true)}
                      className="w-full flex items-center justify-center rounded-lg border border-border/60 bg-background/40 py-2 hover:bg-accent/50 transition"
                    >
                      <Command className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">Quick actions · ⌘K</TooltipContent>
                </Tooltip>
                {mounted && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-full" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                        {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Toggle theme</TooltipContent>
                  </Tooltip>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={() => setPaletteOpen(true)}
                  className="w-full flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground hover:bg-accent/50 transition"
                >
                  <span className="flex items-center gap-2"><Command className="h-3.5 w-3.5" />Quick actions</span>
                  <kbd className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">⌘K</kbd>
                </button>
                <div className="flex items-center justify-between gap-2 px-1">
                  <div className="text-[11px] text-muted-foreground">v1.0 · Local</div>
                  {mounted && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    >
                      {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        </aside>
      </TooltipProvider>

      <main className="flex-1 min-w-0 flex flex-col">
        <div className="md:hidden flex items-center justify-between p-4 border-b border-border/60 bg-card/40 backdrop-blur">
          <Link
            href="/"
            aria-label="DevHub Homepage"
            title="DevHub — Go to homepage"
            rel="home"
            className="flex items-center gap-2"
          >
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-500 grid place-items-center">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold">DevHub</span>
          </Link>
          <Button size="sm" variant="outline" onClick={() => setPaletteOpen(true)}>
            <Command className="h-3.5 w-3.5 mr-1.5" /> Menu
          </Button>
        </div>
        <div className="flex-1 min-h-0">{children}</div>
      </main>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
