'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Plus, Copy, MoreHorizontal, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

const METHOD_COLOR = {
  GET: 'text-emerald-400',
  POST: 'text-amber-400',
  PUT: 'text-blue-400',
  PATCH: 'text-violet-400',
  DELETE: 'text-rose-400',
  HEAD: 'text-cyan-400',
  OPTIONS: 'text-fuchsia-400',
};

export default function RequestTabs({ tabs, activeTabId, onSelect, onClose, onAdd, onDuplicate, onRename }) {
  const [renaming, setRenaming] = useState(null);
  const [draft, setDraft] = useState('');
  return (
    <div className="flex items-center gap-0.5 border-b border-border/60 bg-card/30 overflow-x-auto scrollbar-thin">
      {tabs.map((t) => {
        const active = t.id === activeTabId;
        const method = (t.request?.method || 'GET').toUpperCase();
        const isRenaming = renaming === t.id;
        return (
          <div key={t.id} className={cn(
            'group relative flex items-center gap-2 h-9 pl-3 pr-1 min-w-[160px] max-w-[240px] border-r border-border/60 cursor-pointer',
            active ? 'bg-background' : 'bg-transparent hover:bg-accent/40'
          )} onClick={() => onSelect(t.id)} onDoubleClick={() => { setRenaming(t.id); setDraft(t.title); }} data-testid={`tab-${t.id}`}>
            <span className={cn('text-[10px] font-mono font-bold shrink-0', METHOD_COLOR[method] || 'text-muted-foreground')}>{method}</span>
            {isRenaming ? (
              <Input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => { onRename(t.id, draft.trim() || 'Untitled'); setRenaming(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { onRename(t.id, draft.trim() || 'Untitled'); setRenaming(null); } if (e.key === 'Escape') setRenaming(null); }}
                className="h-6 text-xs py-0 flex-1"
                onClick={(e) => e.stopPropagation()}
                data-testid={`tab-rename-input-${t.id}`}
              />
            ) : (
              <span className="text-xs truncate flex-1">{t.title}</span>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()} data-testid={`tab-menu-${t.id}`}>
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => { setRenaming(t.id); setDraft(t.title); }}><Pencil className="h-3 w-3 mr-2" />Rename</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(t.id)}><Copy className="h-3 w-3 mr-2" />Duplicate</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onClose(t.id)} className="text-rose-400 focus:text-rose-400"><X className="h-3 w-3 mr-2" />Close</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 opacity-60 hover:opacity-100" onClick={(e) => { e.stopPropagation(); onClose(t.id); }} data-testid={`tab-close-${t.id}`}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        );
      })}
      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={onAdd} title="New tab (Ctrl/Cmd+T)" data-testid="new-tab-btn">
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
