'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, Plus, Trash2, Save, FolderPlus, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import KeyValueEditor from './KeyValueEditor';
import { useApiClientStore } from '@/lib/api-client/store';
import { GENERATORS } from '@/lib/api-client/codegen';

// ------------- Save Request Dialog -------------
export function SaveRequestDialog({ open, onOpenChange, request, tab }) {
  const s = useApiClientStore();
  const [name, setName] = useState(tab?.title || 'Untitled Request');
  const [collectionId, setCollectionId] = useState(s.collections[0]?.id || '');
  const [folderId, setFolderId] = useState('root');
  const [newColName, setNewColName] = useState('');

  const commit = () => {
    let cid = collectionId;
    if (!cid) {
      const nm = (newColName || 'New Collection').trim();
      s.addCollection(nm);
      const cols = useApiClientStore.getState().collections;
      cid = cols[cols.length - 1].id;
    }
    s.saveRequest({ collectionId: cid, folderId: folderId === 'root' ? null : folderId, name, request });
    if (tab) s.renameTab(tab.id, name);
    toast.success(`Saved ‘${name}’`);
    onOpenChange(false);
  };

  const chosen = s.collections.find((c) => c.id === collectionId);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save request</DialogTitle>
          <DialogDescription>Store this request in a local collection.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Request name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} data-testid="save-req-name" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Collection</label>
            {s.collections.length > 0 ? (
              <Select value={collectionId} onValueChange={(v) => { setCollectionId(v); setFolderId('root'); }}>
                <SelectTrigger className="h-9" data-testid="save-req-collection"><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>
                  {s.collections.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input value={newColName} onChange={(e) => setNewColName(e.target.value)} placeholder="New collection name" />
            )}
          </div>
          {chosen && chosen.folders.length > 0 && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Folder</label>
              <Select value={folderId} onValueChange={setFolderId}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="root">(top level)</SelectItem>
                  {chosen.folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={commit} data-testid="save-req-confirm"><Save className="h-3.5 w-3.5 mr-1" />Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------- Environment Manager Dialog -------------
export function EnvironmentManager({ open, onOpenChange }) {
  const s = useApiClientStore();
  const [selected, setSelected] = useState(s.environments[0]?.id || null);
  const env = s.environments.find((e) => e.id === selected);

  const create = () => {
    s.addEnvironment('New Environment');
    const envs = useApiClientStore.getState().environments;
    setSelected(envs[envs.length - 1].id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[560px] flex flex-col p-0">
        <DialogHeader className="px-5 pt-4">
          <DialogTitle>Environments</DialogTitle>
          <DialogDescription>Define {'{'}{'{'}variable{'}'}{'}'} placeholders that get substituted into URLs, headers, and bodies before each request.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 grid grid-cols-[220px_1fr] gap-0 min-h-0 border-t border-border/60">
          <div className="border-r border-border/60 flex flex-col">
            <div className="p-2">
              <Button size="sm" variant="outline" className="h-7 w-full text-xs" onClick={create} data-testid="env-add-btn">
                <Plus className="h-3 w-3 mr-1" /> Add environment
              </Button>
            </div>
            <ScrollArea className="flex-1 min-h-0 px-1 pb-2">
              {s.environments.map((e) => (
                <div key={e.id} className={`px-2 py-1.5 rounded flex items-center gap-2 cursor-pointer hover:bg-accent/50 ${selected === e.id ? 'bg-accent/60' : ''}`} onClick={() => setSelected(e.id)}>
                  <span className="text-xs flex-1 truncate">{e.name}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-rose-400" onClick={(ev) => { ev.stopPropagation(); if (confirm(`Delete env ‘${e.name}’?`)) { s.deleteEnvironment(e.id); setSelected(null); } }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </ScrollArea>
          </div>
          <div className="flex flex-col min-h-0">
            {env ? (
              <>
                <div className="p-3 border-b border-border/60">
                  <Input value={env.name} onChange={(e) => s.renameEnvironment(env.id, e.target.value)} className="h-9" data-testid="env-name-input" />
                </div>
                <ScrollArea className="flex-1 min-h-0 p-3">
                  <KeyValueEditor
                    rows={env.variables || []}
                    onChange={(rows) => s.updateEnvironmentVars(env.id, rows)}
                    keyPlaceholder="Variable"
                    valuePlaceholder="Value"
                    testIdPrefix="env-var"
                  />
                </ScrollArea>
              </>
            ) : (
              <div className="grid place-items-center h-full text-sm text-muted-foreground">Select or create an environment.</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------- Code Generator Dialog -------------
export function CodeGeneratorDialog({ open, onOpenChange, request, env }) {
  const [choice, setChoice] = useState('curl');
  const gen = GENERATORS.find((g) => g.id === choice);
  const code = gen ? gen.run(request, env) : '';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Code snippet</DialogTitle>
          <DialogDescription>Copy a ready-to-run snippet for your favourite HTTP client.</DialogDescription>
        </DialogHeader>
        <Tabs value={choice} onValueChange={setChoice}>
          <TabsList className="flex-wrap h-auto">
            {GENERATORS.map((g) => <TabsTrigger key={g.id} value={g.id} className="text-xs" data-testid={`codegen-${g.id}`}>{g.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
        <div className="mt-3">
          <ScrollArea className="h-[340px] rounded-md border border-border/60 bg-muted/30 p-3">
            <pre className="text-[12px] font-mono whitespace-pre" data-testid="codegen-output">{code}</pre>
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button onClick={() => { navigator.clipboard.writeText(code); toast.success('Copied'); }} data-testid="codegen-copy">
            <Copy className="h-3.5 w-3.5 mr-1" /> Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------- Import / Export Dialog -------------
export function ImportExportDialog({ open, onOpenChange }) {
  const s = useApiClientStore();
  const exportCollections = () => {
    const blob = new Blob([JSON.stringify({ collections: s.collections }, null, 2)], { type: 'application/json' });
    triggerDownload(blob, 'devhub-collections.json');
  };
  const exportAll = () => {
    const payload = {
      tabs: s.tabs, activeTabId: s.activeTabId, collections: s.collections,
      history: s.history, environments: s.environments, activeEnvId: s.activeEnvId,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    triggerDownload(blob, 'devhub-api-client-backup.json');
  };
  const importFile = async (mode) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json';
    inp.onchange = async () => {
      const f = inp.files?.[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (mode === 'collections') {
          const list = j.collections || (Array.isArray(j) ? j : []);
          if (!Array.isArray(list) || list.length === 0) throw new Error('No collections found in file');
          s.importCollections(list);
          toast.success(`Imported ${list.length} collection${list.length === 1 ? '' : 's'}`);
        } else {
          s.restoreAll(j);
          toast.success('Restored from backup');
        }
      } catch (e) {
        toast.error(e?.message || 'Import failed');
      }
    };
    inp.click();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import / Export</DialogTitle>
          <DialogDescription>Everything stays in your browser — nothing is uploaded anywhere.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={exportCollections} data-testid="export-collections-btn"><Download className="h-3.5 w-3.5 mr-1" />Export collections</Button>
          <Button variant="outline" onClick={exportAll} data-testid="export-all-btn"><Download className="h-3.5 w-3.5 mr-1" />Full backup</Button>
          <Button variant="outline" onClick={() => importFile('collections')} data-testid="import-collections-btn"><Upload className="h-3.5 w-3.5 mr-1" />Import collections</Button>
          <Button variant="outline" onClick={() => importFile('all')} data-testid="import-all-btn"><Upload className="h-3.5 w-3.5 mr-1" />Restore backup</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast.success('Downloaded');
}
