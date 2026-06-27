'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Hash, Copy, Download, FileUp, Save, Trash2, Search, Check, X,
  Sparkles, Clock, FileText, CornerDownLeft, BookmarkPlus, BookmarkX, History,
  Zap, Pause, Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { HASH_ALGORITHMS, computeAll, hashFile, compareHashes } from '@/lib/hash-utils';
import { useHashStore } from '@/lib/stores';

export default function HashGeneratorPage() {
  const {
    input, setInput, selected, setSelected, autoCompute, setAutoCompute,
    history, addHistory, clearHistory, removeHistory,
    snapshots, addSnapshot, deleteSnapshot,
  } = useHashStore();

  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('text');
  const [files, setFiles] = useState([]);
  const [filesBusy, setFilesBusy] = useState(false);
  const [hashA, setHashA] = useState('');
  const [hashB, setHashB] = useState('');
  const [sideSearch, setSideSearch] = useState('');
  const [snapTab, setSnapTab] = useState('recent'); // recent | snapshots
  // Tracks whether the current results match the live input — drives the
  // "stale" indicator on the Compute button in manual mode so the user
  // knows when a recompute is needed.
  const [resultsForInput, setResultsForInput] = useState('');
  const debounceRef = useRef(null);

  // Shared compute routine — used by the auto effect AND the manual button.
  const runCompute = useCallback(async (text) => {
    setBusy(true);
    const r = await computeAll(text, selected);
    setResults(r); setResultsForInput(text);
    setBusy(false);
    addHistory(r.filter(x => !x.error).map(x => ({
      id: crypto.randomUUID(), time: Date.now(), algo: x.algorithm, label: x.label,
      preview: text.slice(0, 60), fullInput: text, value: x.value, source: 'text',
    })));
  }, [selected, addHistory]);

  // Auto compute on input change (debounced) — only when autoCompute is on.
  useEffect(() => {
    if (tab !== 'text') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!autoCompute) return;
    if (!input) { setResults([]); setResultsForInput(''); return; }
    debounceRef.current = setTimeout(() => { runCompute(input); }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [input, selected, tab, autoCompute, runCompute]);

  const isStale = !!input && resultsForInput !== input;

  // ----- Keyboard shortcuts -----
  useEffect(() => {
    const onKey = async (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'Enter') {
        e.preventDefault();
        if (input) runCompute(input);
      } else if (ctrl && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        if (results[0]?.value) { navigator.clipboard.writeText(results[0].value); toast.success(`Copied ${results[0].label}`); }
      } else if (ctrl && e.key.toLowerCase() === 's' && !e.shiftKey) {
        e.preventDefault();
        saveSnapshot();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [input, results, runCompute]);

  const saveSnapshot = () => {
    if (!results.length) return toast.error('Nothing to save');
    const title = `Snapshot ${new Date().toLocaleString()}`;
    addSnapshot({
      id: crypto.randomUUID(), title, time: Date.now(),
      input,
      hashes: results.filter(r => !r.error),
    });
    toast.success('Snapshot saved');
  };

  // Save a single recent entry as a snapshot (containing just that one hash)
  const saveRecent = (h) => {
    const text = h.fullInput ?? h.preview ?? '';
    addSnapshot({
      id: crypto.randomUUID(),
      title: `${h.label} · ${new Date(h.time).toLocaleString()}`,
      time: Date.now(),
      input: text,
      hashes: [{ algorithm: h.algo, label: h.label, value: h.value, length: h.value.length }],
    });
    toast.success('Saved to snapshots');
  };

  // Load a stored input back into the textarea
  const loadToInput = (text) => {
    setInput(text ?? '');
    setTab('text');
    toast.success('Loaded into input');
  };

  // Explicitly compute hashes for an empty string (the auto-compute effect
  // bails when input is empty, so this gives users a one-click escape hatch
  // — e.g. for verifying a known constant like SHA-256("") = e3b0c44…b855).
  const hashEmptyString = async () => {
    if (!selected.length) {
      toast.error('Select at least one algorithm');
      return;
    }
    await runCompute('');
    toast.success('Hashed empty string');
  };

  // ----- File hash analyzer -----
  const handleFiles = async (fileList) => {
    const list = Array.from(fileList || []);
    if (!list.length) return;
    setFilesBusy(true);
    const out = [];
    for (const f of list) {
      const r = await hashFile(f, selected);
      const hashes = {};
      for (const h of r) if (!h.error) hashes[h.algorithm] = h.value;
      out.push({ name: f.name, size: f.size, lastModified: f.lastModified, hashes });
    }
    setFiles(fs => [...out, ...fs]);
    setFilesBusy(false);
    toast.success(`Hashed ${list.length} file${list.length === 1 ? '' : 's'}`);
  };

  const duplicateGroups = useMemo(() => {
    // group by sha256 (or first selected) if available
    const key = files[0]?.hashes?.sha256 ? 'sha256' : selected[0];
    const map = new Map();
    for (const f of files) {
      const k = f.hashes?.[key];
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(f);
    }
    return Array.from(map.entries()).filter(([, arr]) => arr.length > 1);
  }, [files, selected]);

  // ----- Comparison -----
  const cmp = useMemo(() => compareHashes(hashA, hashB), [hashA, hashB]);

  // ----- Filtered recent & saved (shared search box) -----
  const filteredHistory = useMemo(() => {
    if (!sideSearch) return history;
    const q = sideSearch.toLowerCase();
    return history.filter(x =>
      x.value.toLowerCase().includes(q) ||
      (x.preview || '').toLowerCase().includes(q) ||
      (x.fullInput || '').toLowerCase().includes(q) ||
      (x.label || '').toLowerCase().includes(q)
    );
  }, [history, sideSearch]);

  const filteredSnapshots = useMemo(() => {
    if (!sideSearch) return snapshots;
    const q = sideSearch.toLowerCase();
    return snapshots.filter(s =>
      (s.title || '').toLowerCase().includes(q) ||
      (s.input || '').toLowerCase().includes(q) ||
      (s.hashes || []).some(h => (h.value || '').toLowerCase().includes(q) || (h.label || '').toLowerCase().includes(q))
    );
  }, [snapshots, sideSearch]);

  // ----- Export -----
  const exportData = (format) => {
    let data = '', filename = '', mime = 'text/plain';
    if (format === 'json') {
      data = JSON.stringify({ input, results }, null, 2);
      filename = 'hashes.json'; mime = 'application/json';
    } else if (format === 'csv') {
      data = 'algorithm,length,value\n' + results.filter(r => !r.error).map(r => `${r.algorithm},${r.length},${r.value}`).join('\n');
      filename = 'hashes.csv'; mime = 'text/csv';
    } else {
      data = results.filter(r => !r.error).map(r => `${r.label}: ${r.value}`).join('\n');
      filename = 'hashes.txt';
    }
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ----- UI -----
  const sidePanel = (
    <SidePanel
      history={history}
      snapshots={snapshots}
      sideSearch={sideSearch}
      setSideSearch={setSideSearch}
      snapTab={snapTab}
      setSnapTab={setSnapTab}
      clearHistory={clearHistory}
      removeHistory={removeHistory}
      filteredHistory={filteredHistory}
      filteredSnapshots={filteredSnapshots}
      loadToInput={loadToInput}
      saveRecent={saveRecent}
      deleteSnapshot={deleteSnapshot}
    />
  );

  return (
    <div className="flex h-screen min-w-0">
      {/* Left sidebar — desktop only */}
      <aside className="hidden lg:flex flex-col w-80 shrink-0 border-r border-border/60 bg-card/30 backdrop-blur">
        {sidePanel}
      </aside>

      {/* Center */}
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="flex flex-wrap items-center gap-2 sm:gap-3 p-3 sm:p-4 border-b border-border/60 bg-card/40 backdrop-blur">
          {/* Mobile-only: open Recent/Saved drawer */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="lg:hidden h-9 px-2"
                data-testid="mobile-history-btn"
                title="Recent & Saved"
              >
                <History className="h-4 w-4" />
                <span className="ml-1.5 text-xs">
                  {history.length + snapshots.length > 0 ? history.length + snapshots.length : ''}
                </span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-[88vw] sm:w-80 max-w-sm flex flex-col">
              <SheetHeader className="sr-only"><SheetTitle>Recent and saved hashes</SheetTitle></SheetHeader>
              {sidePanel}
            </SheetContent>
          </Sheet>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="text" className="text-xs">Text</TabsTrigger>
              <TabsTrigger value="file" className="text-xs">Files</TabsTrigger>
              <TabsTrigger value="compare" className="text-xs">Compare</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Inline statistics — hidden on small to save space */}
          {tab === 'text' && (
            <div className="hidden md:flex items-center gap-3 ml-2 pl-3 border-l border-border/60 text-[11px] text-muted-foreground">
              <Stat label="Chars" value={input.length} />
              <Stat label="Lines" value={(input.match(/\n/g)?.length || 0) + (input ? 1 : 0)} />
              <Stat label="Bytes" value={new Blob([input]).size} />
              <Stat label="Hashes" value={results.filter(r => !r.error).length} />
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Auto / Manual compute toggle + manual Compute button */}
            <Button
              size="sm"
              variant="outline"
              className="h-9 px-2 sm:px-3"
              data-testid="hash-auto-toggle-btn"
              onClick={() => setAutoCompute(!autoCompute)}
              title={autoCompute ? 'Auto: hashes regenerate on input change. Click to switch to Manual.' : 'Manual: click Compute to hash. Click to switch to Auto.'}
            >
              {autoCompute
                ? <><Zap className="h-3.5 w-3.5 sm:mr-1.5 text-emerald-400" /><span className="hidden sm:inline">Auto</span></>
                : <><Pause className="h-3.5 w-3.5 sm:mr-1.5 text-amber-400" /><span className="hidden sm:inline">Manual</span></>}
            </Button>
            {!autoCompute && (
              <Button
                size="sm"
                className={cn(
                  'h-9 px-2 sm:px-3 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white',
                  isStale && 'ring-2 ring-amber-400/60'
                )}
                data-testid="hash-compute-btn"
                onClick={() => runCompute(input)}
                disabled={!input || busy}
                title={isStale ? 'Results are stale — click to recompute' : 'Compute hashes now'}
              >
                <Play className="h-3.5 w-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">Compute</span>
                {isStale && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={saveSnapshot} disabled={!results.length} data-testid="save-snapshot-btn">
              <Save className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Save</span>
            </Button>
            <Select onValueChange={(v) => exportData(v)}>
              <SelectTrigger className="w-[92px] sm:w-[120px] h-9"><SelectValue placeholder="Export…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="txt">.txt</SelectItem>
                <SelectItem value="csv">.csv</SelectItem>
                <SelectItem value="json">.json</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </header>

        <ScrollArea className="flex-1">
          <div className="p-3 sm:p-6 space-y-4 max-w-6xl mx-auto w-full">
            {tab === 'text' && (
              <TextHashView
                input={input} setInput={setInput}
                selected={selected} setSelected={setSelected}
                results={results} busy={busy}
                onHashEmpty={hashEmptyString}
              />
            )}
            {tab === 'file' && (
              <FileHashView
                files={files} setFiles={setFiles} busy={filesBusy}
                handleFiles={handleFiles}
                selected={selected}
                duplicateGroups={duplicateGroups}
              />
            )}
            {tab === 'compare' && (
              <CompareView hashA={hashA} setHashA={setHashA} hashB={hashB} setHashB={setHashB} cmp={cmp} />
            )}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}

function SidePanel({
  history, snapshots, sideSearch, setSideSearch, snapTab, setSnapTab,
  clearHistory, removeHistory, filteredHistory, filteredSnapshots,
  loadToInput, saveRecent, deleteSnapshot,
}) {
  return (
    <>
      <div className="p-4 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 via-cyan-500 to-emerald-500 grid place-items-center shadow-lg shadow-blue-500/20 shrink-0">
            <Hash className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold leading-tight truncate">Hash Generator</div>
            <div className="text-[11px] text-muted-foreground">14 algorithms · persisted</div>
          </div>
        </div>
      </div>

      {/* Shared search */}
      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="side-search-input"
            className="h-8 pl-7 text-xs"
            placeholder="Search by text or hash…"
            value={sideSearch}
            onChange={(e) => setSideSearch(e.target.value)}
          />
        </div>
      </div>

      <Tabs value={snapTab} onValueChange={setSnapTab} className="px-3 pt-3">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="recent" className="text-xs" data-testid="tab-recent">
            <Clock className="h-3 w-3 mr-1" />Recent
            <Badge variant="secondary" className="ml-1.5 text-[9px] h-4 px-1">{history.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="snapshots" className="text-xs" data-testid="tab-saved">
            <Save className="h-3 w-3 mr-1" />Saved
            <Badge variant="secondary" className="ml-1.5 text-[9px] h-4 px-1">{snapshots.length}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Action row */}
      <div className="px-3 pt-2 pb-1">
        {snapTab === 'recent' ? (
          <Button
            variant="outline"
            size="sm"
            data-testid="clear-all-recent-btn"
            className="w-full h-8 text-xs"
            disabled={!history.length}
            onClick={() => { clearHistory(); toast.success('Cleared recent'); }}
          >
            <Trash2 className="h-3 w-3 mr-1.5" /> Clear all recent
          </Button>
        ) : (
          <div className="text-[10px] text-muted-foreground px-1">
            {filteredSnapshots.length} saved · click load to restore input
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 px-3 pb-3 min-h-0">
        {snapTab === 'recent' ? (
          filteredHistory.length === 0 ? (
            <EmptyHint icon={Clock} title={history.length ? 'No matches' : 'No recent yet'} subtitle={history.length ? 'Try a different search' : 'Generated hashes will appear here.'} />
          ) : filteredHistory.slice(0, 80).map(h => (
            <Card key={h.id} className="p-2.5 mb-1.5 glass min-w-0" data-testid="recent-item">
              <div className="flex items-center gap-1.5 mb-1 min-w-0">
                <Badge variant="secondary" className="text-[10px] font-mono shrink-0">{h.label}</Badge>
                <span className="text-[9px] text-muted-foreground ml-auto shrink-0">{new Date(h.time).toLocaleTimeString()}</span>
              </div>
              <div className="text-[11px] font-mono break-all text-foreground/80 line-clamp-1" title={h.value}>{h.value}</div>
              <div className="text-[10px] text-muted-foreground truncate mt-0.5" title={h.fullInput ?? h.preview}>{h.preview || '(empty)'}</div>
              <div className="flex items-center gap-1 mt-1.5">
                <Button
                  size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
                  data-testid="recent-load-btn"
                  onClick={() => loadToInput(h.fullInput ?? h.preview ?? '')}
                  title="Load text into input"
                >
                  <CornerDownLeft className="h-3 w-3 mr-1" />Load
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
                  data-testid="recent-save-btn"
                  onClick={() => saveRecent(h)}
                  title="Save to snapshots"
                >
                  <BookmarkPlus className="h-3 w-3 mr-1" />Save
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-6 px-2 text-[10px] ml-auto"
                  onClick={() => { navigator.clipboard.writeText(h.value); toast.success('Copied'); }}
                  title="Copy hash"
                >
                  <Copy className="h-3 w-3" />
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-rose-400 hover:text-rose-300"
                  data-testid="recent-delete-btn"
                  onClick={() => { removeHistory(h.id); toast('Removed'); }}
                  title="Delete this entry"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          ))
        ) : (
          filteredSnapshots.length === 0 ? (
            <EmptyHint icon={Save} title={snapshots.length ? 'No matches' : 'No saved snapshots'} subtitle={snapshots.length ? 'Try a different search' : 'Ctrl+S or click Save.'} />
          ) : filteredSnapshots.map(s => (
            <Card key={s.id} className="p-2.5 mb-1.5 glass min-w-0" data-testid="saved-item">
              <div className="flex items-start gap-2 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate" title={s.title}>{s.title}</div>
                  <div className="text-[10px] text-muted-foreground truncate" title={s.input}>{s.input || '(empty)'}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.hashes.slice(0, 5).map((h, i) => (
                      <Badge key={`${h.algorithm}-${i}`} variant="outline" className="text-[9px] h-4 px-1 font-mono">{h.label}</Badge>
                    ))}
                    {s.hashes.length > 5 && <Badge variant="outline" className="text-[9px] h-4 px-1">+{s.hashes.length - 5}</Badge>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                <Button
                  size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
                  data-testid="saved-load-btn"
                  onClick={() => loadToInput(s.input)}
                  title="Load text into input"
                >
                  <CornerDownLeft className="h-3 w-3 mr-1" />Load
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
                  onClick={() => { navigator.clipboard.writeText(s.hashes.map(h => `${h.label}: ${h.value}`).join('\n')); toast.success('Copied hashes'); }}
                  title="Copy all hashes"
                >
                  <Copy className="h-3 w-3 mr-1" />Copy
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-6 px-2 text-[10px] ml-auto text-rose-400 hover:text-rose-300"
                  data-testid="saved-unsave-btn"
                  onClick={() => { deleteSnapshot(s.id); toast('Unsaved'); }}
                  title="Unsave"
                >
                  <BookmarkX className="h-3 w-3 mr-1" />Unsave
                </Button>
              </div>
            </Card>
          ))
        )}
      </ScrollArea>
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div className="flex items-baseline gap-1">
      <span className="font-mono font-semibold text-foreground/90">{typeof value === 'number' ? value.toLocaleString() : value}</span>
      <span className="uppercase tracking-wider text-[9px]">{label}</span>
    </div>
  );
}

function EmptyHint({ icon: Icon, title, subtitle }) {
  return (
    <div className="text-center p-6 text-muted-foreground">
      <Icon className="h-6 w-6 mx-auto mb-2 opacity-60" />
      <div className="text-xs font-medium">{title}</div>
      {subtitle && <div className="text-[10px] mt-1">{subtitle}</div>}
    </div>
  );
}

function StatGrid({ items }) {
  // Kept for backwards compatibility; new inline Stat is used in the header.
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((it, i) => (
        <div key={i} className="rounded-lg bg-card/50 border border-border/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.label}</div>
          <div className="font-mono text-lg font-semibold">{typeof it.value === 'number' ? it.value.toLocaleString() : it.value}</div>
        </div>
      ))}
    </div>
  );
}

function TextHashView({ input, setInput, selected, setSelected, results, busy, onHashEmpty }) {
  const onPaste = async () => {
    try { const t = await navigator.clipboard.readText(); setInput(t); toast.success('Pasted from clipboard'); }
    catch { toast.error('Clipboard read denied'); }
  };

  return (
    <>
      <Card className="glass p-3 sm:p-4 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Input</Label>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            <span className="whitespace-nowrap">{input.length} chars</span>
            <span className="hidden sm:inline">·</span>
            <span className="whitespace-nowrap">{(input.match(/\n/g)?.length || 0) + (input ? 1 : 0)} lines</span>
            <span className="hidden sm:inline">·</span>
            <span className="whitespace-nowrap">{new Blob([input]).size} B</span>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onPaste}>
              <FileText className="h-3 w-3 sm:mr-1" /><span className="hidden sm:inline">Paste</span>
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setInput('')}>
              <X className="h-3 w-3 sm:mr-1" /><span className="hidden sm:inline">Clear</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={onHashEmpty}
              data-testid="hash-empty-string-btn"
              title='Hashes for the empty string "" — useful for sanity-checking known constants'
            >
              <Hash className="h-3 w-3 sm:mr-1" /><span className="hidden sm:inline">Hash &quot;&quot;</span>
            </Button>
          </div>
        </div>
        <Textarea
          className="min-h-[140px] font-mono text-sm bg-background/40 break-all"
          placeholder="Paste or type text to hash… (Ctrl+Enter to force regenerate)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </Card>

      <Card className="glass p-3 sm:p-4 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Algorithms</Label>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelected(HASH_ALGORITHMS.map(a => a.id))}>All</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelected(['md5', 'sha1', 'sha256', 'sha512'])}>Common</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelected([])}>None</Button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {HASH_ALGORITHMS.map(a => (
            <label key={a.id} className={cn('flex items-center gap-2 p-2 rounded-md border cursor-pointer transition min-w-0',
              selected.includes(a.id) ? 'border-blue-500/40 bg-blue-500/10' : 'border-border/60 hover:border-foreground/20')}>
              <Checkbox checked={selected.includes(a.id)} onCheckedChange={(c) => {
                if (c) setSelected([...selected, a.id]); else setSelected(selected.filter(x => x !== a.id));
              }} />
              <span className="text-xs font-mono truncate">{a.label}</span>
            </label>
          ))}
        </div>
      </Card>

      <div>
        <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5" /> Results <Badge variant="secondary" className="text-[10px]">{results.length}</Badge>
          {busy && <span className="ml-auto flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" /> Computing…</span>}
        </div>
        <div className="space-y-2">
          <AnimatePresence>
            {results.map(r => (
              <motion.div key={r.algorithm} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <ResultCard r={r} />
              </motion.div>
            ))}
          </AnimatePresence>
          {!results.length && !busy && (
            <Card className="glass p-12 text-center text-sm text-muted-foreground">
              <div>Type something above. Hashes will be generated instantly with Web Workers.</div>
              <div className="mt-4">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onHashEmpty}
                  data-testid="hash-empty-string-empty-state-btn"
                >
                  <Hash className="h-3.5 w-3.5 mr-1.5" />
                  Or hash the empty string
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function ResultCard({ r }) {
  if (r.error) {
    return <Card className="glass p-3 border-rose-500/40"><div className="text-xs text-rose-400">{r.algorithm}: {r.error}</div></Card>;
  }
  return (
    <Card className="glass p-3 group hover:border-foreground/20 transition min-w-0">
      <div className="flex items-start sm:items-center gap-2 sm:gap-3 min-w-0">
        <div className="flex flex-col items-center justify-center w-14 sm:w-20 shrink-0 py-1 rounded-md bg-gradient-to-br from-blue-500/15 to-cyan-500/15 border border-blue-500/20">
          <div className="text-[10px] sm:text-[11px] font-semibold font-mono">{r.label}</div>
          <div className="text-[9px] text-muted-foreground hidden sm:block">{r.length} chars</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[11px] sm:text-[12.5px] break-all">{r.value}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            <span className="sm:hidden">{r.length} chars · </span>
            Generated in {r.durationMs} ms
          </div>
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => { navigator.clipboard.writeText(r.value); toast.success(`Copied ${r.label}`); }}>
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
}

function FileHashView({ files, setFiles, busy, handleFiles, selected, duplicateGroups }) {
  const inputRef = useRef(null);
  return (
    <>
      <Card
        className="glass p-8 border-dashed border-2 hover:border-foreground/40 transition cursor-pointer"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
      >
        <div className="text-center">
          <FileUp className="h-8 w-8 mx-auto mb-3 text-blue-400" />
          <div className="font-medium mb-1">Drop files or click to upload</div>
          <div className="text-xs text-muted-foreground">Hashes all selected algorithms · duplicate detection · up to any size</div>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        </div>
      </Card>

      {busy && <Card className="glass p-4 text-center text-xs text-muted-foreground"><span className="inline-block h-2 w-2 rounded-full bg-blue-400 animate-pulse mr-2" />Hashing files…</Card>}

      {duplicateGroups.length > 0 && (
        <Card className="glass p-3 border-amber-500/40 bg-amber-500/5">
          <div className="text-xs font-medium text-amber-300 mb-1">⚠ {duplicateGroups.length} duplicate group{duplicateGroups.length === 1 ? '' : 's'} found</div>
          {duplicateGroups.map(([hash, group]) => (
            <div key={hash} className="text-[11px] text-muted-foreground">
              {group.length} files share hash <span className="font-mono">{hash.slice(0, 12)}…</span>: {group.map(g => g.name).join(', ')}
            </div>
          ))}
        </Card>
      )}

      <div className="space-y-2">
        {files.map((f, i) => (
          <Card key={i} className="glass p-3">
            <div className="flex items-center gap-3 mb-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{f.name}</div>
                <div className="text-[11px] text-muted-foreground">{(f.size / 1024).toFixed(1)} KB · modified {new Date(f.lastModified).toLocaleDateString()}</div>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-1">
              {selected.map(algoId => {
                const v = f.hashes[algoId];
                if (!v) return null;
                return (
                  <div key={algoId} className="flex items-center gap-2 text-[11.5px]">
                    <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono shrink-0 w-16 justify-center">{algoId.toUpperCase()}</Badge>
                    <span className="font-mono truncate flex-1">{v}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(v); toast.success('Copied'); }}>
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
        {!files.length && !busy && (
          <Card className="glass p-8 text-center text-sm text-muted-foreground">No files yet</Card>
        )}
      </div>
    </>
  );
}

function CompareView({ hashA, setHashA, hashB, setHashB, cmp }) {
  return (
    <>
      <Card className="glass p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Hash A</Label>
            <Textarea className="font-mono text-xs mt-1.5 min-h-[100px]" value={hashA} onChange={(e) => setHashA(e.target.value)} placeholder="Paste first hash" />
            <div className="text-[10px] text-muted-foreground mt-1">{cmp.lenA} chars</div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Hash B</Label>
            <Textarea className="font-mono text-xs mt-1.5 min-h-[100px]" value={hashB} onChange={(e) => setHashB(e.target.value)} placeholder="Paste second hash" />
            <div className="text-[10px] text-muted-foreground mt-1">{cmp.lenB} chars</div>
          </div>
        </div>
        {hashA && hashB && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-5">
            <div className={cn('p-5 rounded-xl border flex items-center gap-4',
              cmp.match
                ? 'bg-emerald-500/10 border-emerald-500/40'
                : 'bg-rose-500/10 border-rose-500/40')}>
              <div className={cn('h-12 w-12 rounded-full grid place-items-center', cmp.match ? 'bg-emerald-500/20' : 'bg-rose-500/20')}>
                {cmp.match ? <Check className="h-6 w-6 text-emerald-400" /> : <X className="h-6 w-6 text-rose-400" />}
              </div>
              <div className="flex-1">
                <div className={cn('font-semibold text-base', cmp.match ? 'text-emerald-300' : 'text-rose-300')}>
                  {cmp.match ? 'Exact Match' : 'Hashes do not match'}
                </div>
                <div className="text-xs text-muted-foreground">
                  Character similarity: {cmp.percent}% · Lengths: {cmp.lenA} vs {cmp.lenB}
                </div>
              </div>
              <div className="text-3xl font-mono font-bold">{cmp.percent}%</div>
            </div>
          </motion.div>
        )}
      </Card>
    </>
  );
}
