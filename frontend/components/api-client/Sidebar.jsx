'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Plus, Folder, FolderOpen, ChevronRight, ChevronDown, Trash2, Pencil, MoreHorizontal,
  History, Layers, Boxes, Upload, Download, Play,
} from 'lucide-react';
import { toast } from 'sonner';
import { useApiClientStore } from '@/lib/api-client/store';
import { cn } from '@/lib/utils';

const METHOD_COLOR = {
  GET: 'text-emerald-400',
  POST: 'text-amber-400',
  PUT: 'text-blue-400',
  PATCH: 'text-violet-400',
  DELETE: 'text-rose-400',
  HEAD: 'text-cyan-400',
  OPTIONS: 'text-fuchsia-400',
};

function CollectionsPane() {
  const s = useApiClientStore();
  const [expanded, setExpanded] = useState({});
  const [dragged, setDragged] = useState(null); // {requestId, fromCollectionId, fromFolderId}
  const [prompt, setPrompt] = useState(null); // { type, ... }

  const toggle = (k) => setExpanded((e) => ({ ...e, [k]: !e[k] }));

  const openReq = (r) => {
    s.addTab(r.request);
    const t = useApiClientStore.getState().tabs[useApiClientStore.getState().tabs.length - 1];
    if (t) useApiClientStore.getState().renameTab(t.id, r.name);
    toast.success(`Loaded ‘${r.name}’ into a new tab`);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-2 py-2 flex items-center gap-1">
        <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => setPrompt({ type: 'newCollection' })} data-testid="new-collection-btn">
          <Plus className="h-3 w-3 mr-1" /> New Collection
        </Button>
      </div>
      <ScrollArea className="flex-1 min-h-0 px-1 pb-2">
        {s.collections.length === 0 ? (
          <div className="text-[11px] text-muted-foreground px-3 py-6 text-center">
            No collections yet. Save a request to get started.
          </div>
        ) : s.collections.map((c) => (
          <div key={c.id} className="mb-1">
            <div
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-accent/50 group cursor-pointer"
              onClick={() => toggle(`c:${c.id}`)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!dragged) return;
                s.moveSavedRequest({ ...dragged, toCollectionId: c.id, toFolderId: null });
                setDragged(null);
              }}
            >
              {expanded[`c:${c.id}`] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <Folder className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs font-medium flex-1 truncate">{c.name}</span>
              <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); setPrompt({ type: 'newFolder', collectionId: c.id }); }} title="Add folder">
                <Plus className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); setPrompt({ type: 'renameCollection', collectionId: c.id, name: c.name }); }} title="Rename">
                <Pencil className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-rose-400" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete collection ‘${c.name}’?`)) s.deleteCollection(c.id); }} title="Delete">
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            {expanded[`c:${c.id}`] && (
              <div className="ml-4 border-l border-border/40 pl-2">
                {c.folders.map((f) => (
                  <div key={f.id}>
                    <div
                      className="flex items-center gap-1 px-2 py-1 rounded hover:bg-accent/50 group cursor-pointer"
                      onClick={() => toggle(`f:${f.id}`)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (!dragged) return;
                        s.moveSavedRequest({ ...dragged, toCollectionId: c.id, toFolderId: f.id });
                        setDragged(null);
                      }}
                    >
                      {expanded[`f:${f.id}`] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {expanded[`f:${f.id}`] ? <FolderOpen className="h-3.5 w-3.5 text-amber-400" /> : <Folder className="h-3.5 w-3.5 text-amber-400" />}
                      <span className="text-xs flex-1 truncate">{f.name}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); setPrompt({ type: 'renameFolder', collectionId: c.id, folderId: f.id, name: f.name }); }} title="Rename">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-rose-400" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete folder ‘${f.name}’?`)) s.deleteFolder(c.id, f.id); }} title="Delete">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    {expanded[`f:${f.id}`] && (
                      <div className="ml-4 border-l border-border/40 pl-2">
                        {f.requests.map((r) => (
                          <RequestRow key={r.id} r={r} onOpen={() => openReq(r)} onDragStart={() => setDragged({ requestId: r.id, fromCollectionId: c.id, fromFolderId: f.id })} onDelete={() => s.deleteSavedRequest({ collectionId: c.id, folderId: f.id, requestId: r.id })} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {c.requests.map((r) => (
                  <RequestRow key={r.id} r={r} onOpen={() => openReq(r)} onDragStart={() => setDragged({ requestId: r.id, fromCollectionId: c.id, fromFolderId: null })} onDelete={() => s.deleteSavedRequest({ collectionId: c.id, requestId: r.id })} />
                ))}
              </div>
            )}
          </div>
        ))}
      </ScrollArea>

      <PromptDialog prompt={prompt} onClose={() => setPrompt(null)} />
    </div>
  );
}

function RequestRow({ r, onOpen, onDragStart, onDelete }) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded hover:bg-accent/50 group cursor-pointer"
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      data-testid={`saved-req-${r.id}`}
    >
      <span className={cn('text-[9px] font-mono font-bold w-11 shrink-0', METHOD_COLOR[r.request.method] || 'text-muted-foreground')}>
        {r.request.method}
      </span>
      <span className="text-xs flex-1 truncate">{r.name}</span>
      <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-rose-400" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ‘${r.name}’?`)) onDelete(); }} title="Delete">
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

function PromptDialog({ prompt, onClose }) {
  const s = useApiClientStore();
  const [value, setValue] = useState(prompt?.name || '');
  const p = prompt;
  const commit = () => {
    if (!value.trim()) return onClose();
    if (p.type === 'newCollection') s.addCollection(value);
    else if (p.type === 'renameCollection') s.renameCollection(p.collectionId, value);
    else if (p.type === 'newFolder') s.addFolder(p.collectionId, value);
    else if (p.type === 'renameFolder') s.renameFolder(p.collectionId, p.folderId, value);
    onClose();
  };
  return (
    <Dialog open={!!p} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {p?.type === 'newCollection' && 'New Collection'}
            {p?.type === 'renameCollection' && 'Rename Collection'}
            {p?.type === 'newFolder' && 'New Folder'}
            {p?.type === 'renameFolder' && 'Rename Folder'}
          </DialogTitle>
        </DialogHeader>
        <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commit()} placeholder="Name" data-testid="prompt-input" />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={commit} data-testid="prompt-confirm">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryPane() {
  const s = useApiClientStore();
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-2 py-2 flex items-center gap-1">
        <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => { if (confirm('Clear all history?')) s.clearHistory(); }} disabled={!s.history.length} data-testid="clear-history-btn">
          <Trash2 className="h-3 w-3 mr-1" /> Clear history
        </Button>
      </div>
      <ScrollArea className="flex-1 min-h-0 px-1 pb-2">
        {s.history.length === 0 ? (
          <div className="text-[11px] text-muted-foreground px-3 py-6 text-center">Send a request to see it here.</div>
        ) : s.history.map((h) => (
          <div key={h.id} className="px-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer group flex items-center gap-2" onClick={() => s.addTab(h.request)} data-testid={`history-item-${h.id}`}>
            <span className={cn('text-[9px] font-mono font-bold w-11 shrink-0', METHOD_COLOR[h.request.method] || 'text-muted-foreground')}>{h.request.method}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs truncate font-mono">{h.request.url || '(empty url)'}</div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                {h.status != null && <Badge variant="outline" className={cn('h-4 text-[9px] px-1 border', h.status < 400 ? 'text-emerald-300 border-emerald-500/30' : 'text-rose-300 border-rose-500/30')}>{h.status}</Badge>}
                <span>{new Date(h.ts).toLocaleTimeString()}</span>
              </div>
            </div>
            <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-rose-400" onClick={(e) => { e.stopPropagation(); s.removeHistory(h.id); }} title="Remove">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}

function EnvironmentsPane({ onManage }) {
  const s = useApiClientStore();
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-2 py-2 space-y-2">
        <Select value={s.activeEnvId || 'none'} onValueChange={(v) => s.setActiveEnv(v === 'none' ? null : v)}>
          <SelectTrigger className="h-8 text-xs" data-testid="active-env-select">
            <SelectValue placeholder="No environment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No environment</SelectItem>
            {s.environments.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-7 text-xs w-full" onClick={onManage} data-testid="manage-envs-btn">
          <Plus className="h-3 w-3 mr-1" /> Manage environments
        </Button>
      </div>
      <ScrollArea className="flex-1 min-h-0 px-1 pb-2">
        {s.environments.length === 0 ? (
          <div className="text-[11px] text-muted-foreground px-3 py-6 text-center">
            No environments yet.<br />Use {'{'}{'{'}variable{'}'}{'}'} placeholders in URLs / headers / body.
          </div>
        ) : s.environments.map((e) => (
          <div key={e.id} className={cn('px-2 py-1.5 rounded flex items-center gap-2 cursor-pointer hover:bg-accent/50', e.id === s.activeEnvId && 'bg-accent/60')} onClick={() => s.setActiveEnv(e.id === s.activeEnvId ? null : e.id)}>
            <Boxes className="h-3.5 w-3.5 text-violet-400" />
            <div className="flex-1 min-w-0">
              <div className="text-xs truncate">{e.name}</div>
              <div className="text-[10px] text-muted-foreground">{(e.variables || []).filter((v) => v.key).length} vars</div>
            </div>
            {e.id === s.activeEnvId && <Badge variant="outline" className="text-[9px] h-4 px-1 border-emerald-500/40 text-emerald-300">active</Badge>}
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}

export default function Sidebar({ onManageEnvs, onImportExport }) {
  const [tab, setTab] = useState('collections');
  return (
    <div className="h-full flex flex-col border-r border-border/60 bg-card/40">
      <div className="px-2 py-2 border-b border-border/60 flex items-center gap-1">
        <div className="font-semibold text-sm flex-1">API Client</div>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onImportExport} title="Import / Export" data-testid="import-export-btn">
          <Upload className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="px-2 pt-2">
        <TabsList className="w-full grid grid-cols-3 h-8">
          <TabsTrigger value="collections" className="text-[11px] h-6" data-testid="tab-collections"><Layers className="h-3 w-3 mr-1" />Coll</TabsTrigger>
          <TabsTrigger value="history" className="text-[11px] h-6" data-testid="tab-history"><History className="h-3 w-3 mr-1" />Hist</TabsTrigger>
          <TabsTrigger value="envs" className="text-[11px] h-6" data-testid="tab-envs"><Boxes className="h-3 w-3 mr-1" />Env</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex-1 min-h-0 mt-2">
        {tab === 'collections' && <CollectionsPane />}
        {tab === 'history' && <HistoryPane />}
        {tab === 'envs' && <EnvironmentsPane onManage={onManageEnvs} />}
      </div>
    </div>
  );
}
