'use client';
import { useState, useMemo, useRef } from 'react';
import JSZip from 'jszip';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { FileArchive, Upload, X, Loader2, ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import {
  RowItem, PreviewDialog, computeDiff, hashBytes,
} from '@/components/archive-compare/CompareShared';

async function loadZip(file) {
  const zip = await JSZip.loadAsync(file);
  const entries = [];
  const promises = [];
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    promises.push(entry.async('uint8array').then(buf => {
      entries.push({ path, size: buf.byteLength, bytes: buf });
    }));
  });
  await Promise.all(promises);
  await Promise.all(entries.map(async e => { e.hash = await hashBytes(e.bytes); }));
  return { name: file.name, entries };
}

export default function ZipComparePage() {
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
  const leftInput = useRef(null);
  const rightInput = useRef(null);

  const handlePick = async (side, file) => {
    if (!file) return;
    const setLoad = side === 'L' ? setLoadingL : setLoadingR;
    setLoad(true);
    try {
      const z = await loadZip(file);
      side === 'L' ? setLeft(z) : setRight(z);
      toast.success(`Loaded ${file.name} · ${z.entries.length} files`);
    } catch {
      toast.error(`Failed to read ${file.name}`);
    } finally { setLoad(false); }
  };

  const diff = useMemo(() => computeDiff(left, right), [left, right]);

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
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-500 grid place-items-center">
            <FileArchive className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="font-semibold leading-tight">ZIP Compare</div>
            <div className="text-[11px] text-muted-foreground">Archive diff engine</div>
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
        <div className="ml-auto flex items-center gap-2">
          <Input data-testid="zip-search" className="h-9 w-56" placeholder="Filter by path…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {left && right && <Button data-testid="zip-swap-btn" size="sm" variant="outline" onClick={swap}><ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />Swap</Button>}
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 border-b border-border/60">
          <UploadCard label="Old / Base" file={left} onPick={(f) => handlePick('L', f)} loading={loadingL} inputRef={leftInput} onClear={() => setLeft(null)} accent="from-amber-500/30 to-yellow-500/30" testId="upload-left" />
          <UploadCard label="New / Compare" file={right} onPick={(f) => handlePick('R', f)} loading={loadingR} inputRef={rightInput} onClear={() => setRight(null)} accent="from-blue-500/30 to-violet-500/30" testId="upload-right" />
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
              Upload two ZIP archives to compare their contents.
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

function UploadCard({ label, file, onPick, loading, inputRef, onClear, accent, testId }) {
  return (
    <Card
      data-testid={testId}
      className={cn('relative overflow-hidden p-4 border-dashed border-2 hover:border-foreground/40 transition cursor-pointer bg-card/40 backdrop-blur')}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onPick(f); }}
    >
      <div className={cn('absolute -top-10 -right-10 h-32 w-32 rounded-full bg-gradient-to-br opacity-30 blur-2xl', accent)} />
      <div className="relative flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-muted/50 grid place-items-center">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-sm font-medium truncate">{file ? file.name : 'Drop or click to upload .zip'}</div>
          {file && <div className="text-[11px] text-muted-foreground">{file.entries.length} files</div>}
        </div>
        {file && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onClear(); }}><X className="h-3.5 w-3.5" /></Button>}
      </div>
      <input ref={inputRef} type="file" accept=".zip" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
    </Card>
  );
}
