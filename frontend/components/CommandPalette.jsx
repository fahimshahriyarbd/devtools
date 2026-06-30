'use client';
import { useRouter } from 'next/navigation';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator, CommandShortcut
} from '@/components/ui/command';
import {
  LayoutDashboard, FileArchive, FolderTree, GitCompareArrows, Wifi, Share2,
  Moon, Sun, Plus, Hash, Dice5, Braces
} from 'lucide-react';
import { useTheme } from 'next-themes';

// Order MUST stay in sync with the NAV array in AppShell.jsx so the mobile
// "Menu" palette lists items in the same order as the desktop sidebar.
const PALETTE_NAV = [
  { href: '/',                 label: 'Dashboard',         icon: LayoutDashboard },
  { href: '/folder-compare',   label: 'Folder Compare',    icon: FolderTree,         badge: 'NEW' },
  { href: '/zip-compare',      label: 'ZIP Compare',       icon: FileArchive },
  { href: '/text-compare',     label: 'Text Compare',      icon: GitCompareArrows },
  { href: '/hash-generator',   label: 'Hash Generator',    icon: Hash,               badge: 'NEW' },
  { href: '/random-generator', label: 'Random Generator',  icon: Dice5,              badge: 'NEW' },
  { href: '/json-studio',      label: 'JSON Studio',       icon: Braces,             badge: 'NEW' },
  { href: '/wifi-text-share',  label: 'WiFi Text Share',   icon: Wifi },
  { href: '/wifi-file-share',  label: 'WiFi File Share',   icon: Share2,             badge: 'NEW' },
];

export default function CommandPalette({ open, onOpenChange }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const go = (path) => {
    onOpenChange(false);
    router.push(path);
  };

  // On mobile (< 768px), prevent Radix Dialog from auto-focusing the search
  // input on open — otherwise the on-screen keyboard pops up the moment the
  // user taps the "Menu" button, which is what most users want to AVOID
  // when they're just looking for navigation. Desktop keeps the default
  // focus-input behaviour so ⌘K → start typing still works.
  const handleOpenAutoFocus = (e) => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(max-width: 767px)').matches) {
      e.preventDefault();
    }
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} onOpenAutoFocus={handleOpenAutoFocus}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {PALETTE_NAV.map(({ href, label, icon: Icon, badge }) => (
            <CommandItem
              key={href}
              onSelect={() => go(href)}
              data-testid={`palette-nav-${href === '/' ? 'home' : href.slice(1)}`}
            >
              <Icon className="mr-2 h-4 w-4" />
              {label}
              {badge && <CommandShortcut>{badge}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => go('/wifi-file-share?create=1')}><Plus className="mr-2 h-4 w-4" />Create File Share Room</CommandItem>
          <CommandItem onSelect={() => go('/wifi-text-share?create=1')}><Plus className="mr-2 h-4 w-4" />Create Text Share Room</CommandItem>
          <CommandItem onSelect={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); onOpenChange(false); }}>
            {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            Toggle theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
