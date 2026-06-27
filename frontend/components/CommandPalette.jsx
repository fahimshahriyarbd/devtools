'use client';
import { useRouter } from 'next/navigation';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator, CommandShortcut
} from '@/components/ui/command';
import {
  LayoutDashboard, FileArchive, FolderTree, GitCompareArrows, Wifi, Share2,
  Moon, Sun, Plus, Sparkles, Hash, Dice5, Braces
} from 'lucide-react';
import { useTheme } from 'next-themes';

export default function CommandPalette({ open, onOpenChange }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const go = (path) => {
    onOpenChange(false);
    router.push(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go('/')}><LayoutDashboard className="mr-2 h-4 w-4" />Dashboard</CommandItem>
          <CommandItem onSelect={() => go('/folder-compare')}><FolderTree className="mr-2 h-4 w-4" />Folder Compare <CommandShortcut>NEW</CommandShortcut></CommandItem>
          <CommandItem onSelect={() => go('/zip-compare')}><FileArchive className="mr-2 h-4 w-4" />ZIP Compare</CommandItem>
          <CommandItem onSelect={() => go('/text-compare')}><GitCompareArrows className="mr-2 h-4 w-4" />Text Compare</CommandItem>
          <CommandItem onSelect={() => go('/wifi-share')}><Wifi className="mr-2 h-4 w-4" />WiFi Text Share</CommandItem>
          <CommandItem onSelect={() => go('/wifi-fileshare')}><Share2 className="mr-2 h-4 w-4" />WiFi File Share <CommandShortcut>NEW</CommandShortcut></CommandItem>
          <CommandItem onSelect={() => go('/hash-generator')}><Hash className="mr-2 h-4 w-4" />Hash Generator <CommandShortcut>NEW</CommandShortcut></CommandItem>
          <CommandItem onSelect={() => go('/random-generator')}><Dice5 className="mr-2 h-4 w-4" />Random Generator <CommandShortcut>NEW</CommandShortcut></CommandItem>
          <CommandItem onSelect={() => go('/json')}><Braces className="mr-2 h-4 w-4" />JSON Studio <CommandShortcut>NEW</CommandShortcut></CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => go('/wifi-fileshare?create=1')}><Plus className="mr-2 h-4 w-4" />Create File Share Room</CommandItem>
          <CommandItem onSelect={() => go('/wifi-share?create=1')}><Plus className="mr-2 h-4 w-4" />Create Text Share Room</CommandItem>
          <CommandItem onSelect={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); onOpenChange(false); }}>
            {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            Toggle theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
