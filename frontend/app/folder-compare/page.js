'use client';
import { useState, useMemo, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { FolderTree, FolderUp, X, Loader2, ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import {
  RowItem, PreviewDialog, computeDiff, hashBytes,
} from '@/components/archive-compare/CompareShared';

/**
 * Default noise filter: VCS metadata, OS sidecar files, dependency caches.
 * Users can opt out via the "Exclude common noise" toggle in the header.
 */
const SKIP_DIR_RE = /(?:^|\/)(?:\.git|node_modules|\.next|\.cache|__pycache__|\.venv|venv|dist|build|\.idea|\.vscode)(?:\/|$)/i;
const SKIP_FILE_RE = /(?:^|\/)(?:\.DS_Store|Thumbs\.db|desktop\.ini)$/i;
const shouldSkip = (path) => SKIP_DIR_RE.test(path) || SKIP_FILE_RE.test(path);

/**
 * Load a folder from a FileList obtained via <input webkitdirectory> or DataTransferItem entries.
 * Returns { name, entries: [{ path, size, bytes, hash }] }.
 * Exclusions are NOT applied here — they're applied at diff-time so the toggle
 * is interactive without requiring a re-upload.
 */
async function loadFolderFromFiles(fileList, fallbackName = 'folder') {
  const files = Array.from(fileList);
  if (!files.length) throw new Error('Empty folder');

  let rootName = fallbackName;
  const first = files.find(f => f.webkitRelativePath);
  if (first) rootName = first.webkitRelativePath.split('/')[0] || rootName;

  const entries = [];
  for (const f of files) {
    const rel = f.webkitRelativePath || f.name;
    const inner = rel.includes('/') ? rel.slice(rel.indexOf('/') + 1) : rel;
    const buf = new Uint8Array(await f.arrayBuffer());
    entries.push({ path: inner, size: buf.byteLength, bytes: buf });
  }
  await Promise.all(entries.map(async e => { e.hash = await hashBytes(e.bytes); }));
  return { name: rootName, entries };
}

/**
 * Walk a DataTransferItem's FileSystemEntry tree recursively into a list
 * of { path, file } objects. Used for drag-and-drop folder uploads.
 */
async function walkEntry(entry, prefix = '') {
  const out = [];
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    out.push({ path: prefix + entry.name, file });
    return out;
  }
  // Directory: read all entries (some browsers paginate readEntries)
  const reader = entry.createReader();
  let batch;
  do {
    batch = await new Promise((res, rej) => reader.readEntries(res, rej));
    for (const e of batch) {
      const children = await walkEntry(e, prefix + entry.name + '/');
      out.push(...children);
    }
  } while (batch.length);
  return out;
}

async function loadFolderFromDrop(dataTransfer) {
  const items = Array.from(dataTransfer.items || []);
  const entries = [];
  for (const it of items) {
    if (typeof it.webkitGetAsEntry !== 'function') continue;
    const e = it.webkitGetAsEntry();
    if (!e) continue;
    if (e.isFile) {
      // a single dropped file — treat as a one-file folder
      const file = await new Promise((res, rej) => e.file(res, rej));
      entries.push({ path: e.name, file });
    } else {
      const collected = await walkEntry(e, '');
      entries.push(...collected);
    }
  }
  if (!entries.length) throw new Error('Nothing to read');

  // Use the top-most directory name (if any) as the folder name.
  const top = entries[0].path.split('/')[0] || 'folder';
  const fileList = entries.map(e => {
    // Pretend each File has webkitRelativePath = `<top>/<inner>`.
    const inner = e.path;
    try { Object.defineProperty(e.file, 'webkitRelativePath', { value: `${top}/${inner}`, configurable: true }); }
    catch { /* noop */ }
    return e.file;
  });
  return loadFolderFromFiles(fileList, top);
}

export default function FolderComparePage() {
  const { resolvedTheme } = useTheme();
  const [left, setLeft] = useState(null);
  const [right, setRight] = useState(null);
  const [loadingL, setLoadingL] = useState(false);
  const [loadingR, setLoadingR] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [sideBySide, setSideBySide] = useState(true);
  const [ignoreWs, setIgnoreWs] = useState(false);
  const [wrapInPreview, setWrapInPreview] = useState(true);
  const [excludeNoise, setExcludeNoise] = useState(true);
  const leftInput = useRef(null);
  const rightInput = useRef(null);

  const handlePickFiles = async (side, fileList) => {
    if (!fileList || !fileList.length) return;
    const setLoad = side === 'L' ? setLoadingL : setLoadingR;
    setLoad(true);
    try {
      const folder = await loadFolderFromFiles(fileList);
      side === 'L' ? setLeft(folder) : setRight(folder);
      toast.success(`Loaded ${folder.name} · ${folder.entries.length} files`);
    } catch (e) {
      toast.error(`Failed to read folder: ${e.message || e}`);
    } finally { setLoad(false); }
  };

  const handleDrop = async (side, dataTransfer) => {
    const setLoad = side === 'L' ? setLoadingL : setLoadingR;
    setLoad(true);
    try {
      const folder = await loadFolderFromDrop(dataTransfer);
      side === 'L' ? setLeft(folder) : setRight(folder);
      toast.success(`Loaded ${folder.name} · ${folder.entries.length} files`);
    } catch (e) {
      toast.error(`Failed to read folder: ${e.message || e}`);
    } finally { setLoad(false); }
  };

  // Apply the (optional) noise filter at diff time so toggling it doesn't
  // require re-uploading the folders.
  const filteredLeft = useMemo(() => {
    if (!left || !excludeNoise) return left;
    return { ...left, entries: left.entries.filter(e => !shouldSkip(e.path)) };
  }, [left, excludeNoise]);
  const filteredRight = useMemo(() => {
    if (!right || !excludeNoise) return right;
    return { ...right, entries: right.entries.filter(e => !shouldSkip(e.path)) };
  }, [right, excludeNoise]);

  const diff = useMemo(() => computeDiff(filteredLeft, filteredRight), [filteredLeft, filteredRight]);

  const visible = useMemo(() => {
    if (!diff) return [];
    return diff.rows.filter(r => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (search && !r.path.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [diff, filter, search]);

  const swap = () => { const t = left; setLeft(right); setRight(t); };

  const selectedRow = selected ? visible.find(r => r.path === selected) : null;
  const idx = selectedRow ? visible.findIndex(r => r.path === selectedRow.path) : -1;
  const prev = idx > 0 ? visible[idx - 1] : null;
  const next = idx >= 0 && idx < visible.length - 1 ? visible[idx + 1] : null;

  return (
    <div className="flex flex-col h-screen">
      <header className="flex flex-wrap items-center gap-3 p-4 border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500 grid place-items-center">
            <FolderTree className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="font-semibold leading-tight">Folder Compare</div>
            <div className="text-[11px] text-muted-foreground">Directory diff engine</div>
          </div>
        </div>
        {diff && (
          <div className="flex items-center gap-2 text-xs">
            <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 border">+{diff.stats.added} added</Badge>
            <Badge className="bg-rose-500/15 text-rose-300 border-rose-500/30 border">−{diff.stats.removed} removed</Badge>
            <Badge className="bg-blue-500/15 text-blue-300 border-blue-500/30 border">~{diff.stats.modified} modified</Badge>
            <Badge variant="secondary" className="text-xs">{diff.stats.unchanged} unchanged</Badge>
          </div>
        )}
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2" title=".git, node_modules, .next, .cache, __pycache__, .venv, venv, dist, build, .idea, .vscode, .DS_Store, Thumbs.db, desktop.ini">
            <Switch
              id="exclude-noise"
              data-testid="exclude-noise-toggle"
              checked={excludeNoise}
              onCheckedChange={setExcludeNoise}
            />
            <Label htmlFor="exclude-noise" className="text-xs cursor-pointer select-none">
              Exclude common noise
            </Label>
          </div>
          <Input data-testid="folder-search" className="h-9 w-56" placeholder="Filter by path…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {left && right && <Button data-testid="folder-swap-btn" size="sm" variant="outline" onClick={swap}><ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />Swap</Button>}
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 border-b border-border/60">
          <FolderUploadCard
            label="Old / Base"
            folder={left}
            onPickFiles={(fl) => handlePickFiles('L', fl)}
            onDropFolder={(dt) => handleDrop('L', dt)}
            loading={loadingL}
            inputRef={leftInput}
            onClear={() => setLeft(null)}
            accent="from-cyan-500/30 to-teal-500/30"
            testId="upload-left-folder"
          />
          <FolderUploadCard
            label="New / Compare"
            folder={right}
            onPickFiles={(fl) => handlePickFiles('R', fl)}
            onDropFolder={(dt) => handleDrop('R', dt)}
            loading={loadingR}
            inputRef={rightInput}
            onClear={() => setRight(null)}
            accent="from-blue-500/30 to-violet-500/30"
            testId="upload-right-folder"
          />
        </div>

        {diff && (
          <Tabs value={filter} onValueChange={setFilter} className="px-4 pt-3">
            <TabsList>
              <TabsTrigger value="all" className="text-xs">All <span className="ml-1.5 text-[10px] text-muted-foreground">{diff.rows.length}</span></TabsTrigger>
              <TabsTrigger value="added" className="text-xs text-emerald-300">Added <span className="ml-1.5 text-[10px] opacity-70">{diff.stats.added}</span></TabsTrigger>
              <TabsTrigger value="removed" className="text-xs text-rose-300">Removed <span className="ml-1.5 text-[10px] opacity-70">{diff.stats.removed}</span></TabsTrigger>
              <TabsTrigger value="modified" className="text-xs text-blue-300">Modified <span className="ml-1.5 text-[10px] opacity-70">{diff.stats.modified}</span></TabsTrigger>
              <TabsTrigger value="unchanged" className="text-xs">Unchanged <span className="ml-1.5 text-[10px] opacity-70">{diff.stats.unchanged}</span></TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        <ScrollArea className="flex-1 px-2 py-2">
          {!diff ? (
            <div className="h-full grid place-items-center text-center text-sm text-muted-foreground p-12">
              <div className="max-w-md">
                <FolderTree className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <div className="font-medium text-foreground mb-1">Pick two folders to compare</div>
                <div>Click a card or drag a folder onto it. Comparison runs entirely in your browser — nothing is uploaded.</div>
                <div className="mt-3 text-[11px]">
                  Common noise (<span className="font-mono">.git, node_modules, .next, dist, build, .DS_Store</span>…) is excluded by default — toggle <span className="text-foreground">“Exclude common noise”</span> in the header to include them.
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-5xl mx-auto px-2">
              {visible.map(r => <RowItem key={r.path} row={r} selected={selected === r.path} onClick={() => setSelected(r.path)} />)}
              {visible.length === 0 && <div className="p-12 text-center text-sm text-muted-foreground">No matching entries</div>}
            </div>
          )}
        </ScrollArea>
      </div>

      <Dialog open={!!selectedRow} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent
          className="p-0 gap-0 max-w-none w-screen h-screen sm:rounded-none border-0 flex flex-col [&>button.absolute]:hidden"
        >
          <DialogTitle className="sr-only">{selectedRow ? `Preview ${selectedRow.path}` : 'Preview'}</DialogTitle>
          <DialogDescription className="sr-only">File diff preview</DialogDescription>
          {selectedRow && (
            <PreviewDialog
              row={selectedRow}
              prev={prev}
              next={next}
              onPrev={() => prev && setSelected(prev.path)}
              onNext={() => next && setSelected(next.path)}
              onClose={() => setSelected(null)}
              theme={resolvedTheme}
              sideBySide={sideBySide}
              setSideBySide={setSideBySide}
              ignoreWs={ignoreWs}
              setIgnoreWs={setIgnoreWs}
              wrap={wrapInPreview}
              setWrap={setWrapInPreview}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FolderUploadCard({ label, folder, onPickFiles, onDropFolder, loading, inputRef, onClear, accent, testId }) {
  return (
    <Card
      data-testid={testId}
      className={cn('relative overflow-hidden p-4 border-dashed border-2 hover:border-foreground/40 transition cursor-pointer bg-card/40 backdrop-blur')}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); if (e.dataTransfer) onDropFolder(e.dataTransfer); }}
    >
      <div className={cn('absolute -top-10 -right-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-30 blur-2xl', accent)} />
      <div className="relative flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-muted/50 grid place-items-center">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderUp className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-sm font-medium truncate">{folder ? folder.name : 'Drop or click to pick a folder'}</div>
          {folder && <div className="text-[11px] text-muted-foreground">{folder.entries.length} files</div>}
        </div>
        {folder && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onClear(); }}><X className="h-3.5 w-3.5" /></Button>}
      </div>
      <input
        ref={(el) => {
          if (el) {
            el.setAttribute('webkitdirectory', '');
            el.setAttribute('directory', '');
          }
          inputRef.current = el;
        }}
        type="file"
        className="hidden"
        multiple
        onChange={(e) => onPickFiles(e.target.files)}
      />
    </Card>
  );
}
