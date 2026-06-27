'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Braces, Copy, Download, Save, Trash2, Search, Check, X, AlertTriangle,
  Sparkles, FileText, CornerDownLeft, BookmarkPlus, BookmarkX, Clock,
  ChevronRight, ChevronDown, ListTree, Code2, FileCode2, FlaskConical,
  ArrowDownAZ, Minimize2, Maximize2, Wand2, ClipboardPaste, Eraser, Beaker, Database,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  parseJsonSafe, locateError, beautify, minify, sortKeys,
  escapeForString, unescapeJsonString, computeStats,
  toYaml, toXml, toCsv, toTypeScript, jsonPathQuery, JSON_SAMPLES,
} from '@/lib/json-utils';
import { useJsonStore } from '@/lib/stores';

const Editor = dynamic(() => import('@monaco-editor/react').then(m => m.default), { ssr: false });

export default function JsonValidatorPage() {
  const { resolvedTheme } = useTheme();
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const {
    input, setInput, indent, setIndent, wordWrap, setWordWrap,
    history, addHistory, clearHistory,
    snapshots, addSnapshot, deleteSnapshot,
  } = useJsonStore();

  const [sidePane, setSidePane] = useState('tree'); // tree | query | convert | schema | stats
  const [sideSearch, setSideSearch] = useState('');
  const [snapTab, setSnapTab] = useState('recent');
  const [jpathExpr, setJpathExpr] = useState('$..*');
  const [convertTo, setConvertTo] = useState('yaml');
  const [schemaText, setSchemaText] = useState('');
  const [schemaResult, setSchemaResult] = useState(null);
  // Global expand/collapse for the Tree view.
  // `treeForce` carries `{ open, nonce }`: TreeNode re-syncs its local `open`
  // state whenever `nonce` increments, so clicking the toggle expands or
  // collapses every node regardless of its prior state.
  const [treeForce, setTreeForce] = useState({ open: null, nonce: 0 });
  const historyTimer = useRef(null);

  // Live parse — drives validation status, tree, stats, conversion, etc.
  const parsed = useMemo(() => parseJsonSafe(input), [input]);
  const stats = useMemo(() => (parsed.ok ? computeStats(parsed.data) : null), [parsed]);
  const errLoc = useMemo(() => (parsed.ok ? null : locateError(input, parsed.error || parsed.strictError)), [input, parsed]);

  // Monaco error markers — surfaces the parse error inline at the right line.
  useEffect(() => {
    const monaco = monacoRef.current;
    const ed = editorRef.current;
    if (!monaco || !ed) return;
    const model = ed.getModel();
    if (!model) return;
    if (!parsed.ok && errLoc) {
      monaco.editor.setModelMarkers(model, 'json-validator', [{
        startLineNumber: errLoc.line,
        startColumn: Math.max(1, errLoc.column - 1),
        endLineNumber: errLoc.line,
        endColumn: errLoc.column + 2,
        message: errLoc.message,
        severity: monaco.MarkerSeverity.Error,
      }]);
    } else {
      monaco.editor.setModelMarkers(model, 'json-validator', []);
    }
  }, [parsed, errLoc]);

  // Debounce history capture so each keystroke doesn't generate a new entry.
  useEffect(() => {
    if (!input.trim()) return;
    if (historyTimer.current) clearTimeout(historyTimer.current);
    historyTimer.current = setTimeout(() => {
      addHistory({
        id: crypto.randomUUID(),
        time: Date.now(),
        preview: input.slice(0, 80),
        fullInput: input,
        valid: parsed.ok,
        size: new Blob([input]).size,
      });
    }, 1500);
    return () => clearTimeout(historyTimer.current);
  }, [input, parsed.ok, addHistory]);

  // ---------- Actions ----------
  const onBeautify = () => {
    try { setInput(beautify(input, indent)); toast.success('Beautified'); }
    catch (e) { toast.error(e.message || 'Invalid JSON'); }
  };
  const onMinify = () => {
    try { setInput(minify(input)); toast.success('Minified'); }
    catch (e) { toast.error(e.message); }
  };
  const onSortKeys = () => {
    try { setInput(sortKeys(input, { indent })); toast.success('Keys sorted'); }
    catch (e) { toast.error(e.message); }
  };
  const onEscape = () => {
    if (!input) return;
    setInput(escapeForString(input));
    toast.success('Escaped');
  };
  const onUnescape = () => {
    try { setInput(unescapeJsonString(input)); toast.success('Unescaped'); }
    catch (e) { toast.error('Not an escaped string'); }
  };
  const onPaste = async () => {
    try { const t = await navigator.clipboard.readText(); setInput(t); toast.success('Pasted'); }
    catch { toast.error('Clipboard read denied'); }
  };
  const onCopy = () => {
    if (!input) return;
    navigator.clipboard.writeText(input); toast.success('Copied');
  };
  const onDownload = (ext = 'json') => {
    const blob = new Blob([input || ''], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `data.${ext}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const onClear = () => { setInput(''); toast('Cleared'); };
  const onLoadSample = (idx) => { setInput(JSON_SAMPLES[idx].text); toast.success(`Loaded "${JSON_SAMPLES[idx].name}"`); };

  const saveSnapshot = () => {
    if (!input.trim()) return toast.error('Nothing to save');
    const title = `Snapshot ${new Date().toLocaleString()}`;
    addSnapshot({ id: crypto.randomUUID(), title, time: Date.now(), input });
    toast.success('Snapshot saved');
  };

  const loadToInput = (text) => { setInput(text ?? ''); toast.success('Loaded into editor'); };

  // ---------- Filters ----------
  const filteredHistory = useMemo(() => {
    if (!sideSearch) return history;
    const q = sideSearch.toLowerCase();
    return history.filter(x => (x.fullInput || '').toLowerCase().includes(q) || (x.preview || '').toLowerCase().includes(q));
  }, [history, sideSearch]);
  const filteredSnapshots = useMemo(() => {
    if (!sideSearch) return snapshots;
    const q = sideSearch.toLowerCase();
    return snapshots.filter(s => (s.title || '').toLowerCase().includes(q) || (s.input || '').toLowerCase().includes(q));
  }, [snapshots, sideSearch]);

  // ---------- Side pane content ----------
  const sidePanel = (
    <SidePanel
      history={history}
      snapshots={snapshots}
      sideSearch={sideSearch}
      setSideSearch={setSideSearch}
      snapTab={snapTab}
      setSnapTab={setSnapTab}
      clearHistory={clearHistory}
      filteredHistory={filteredHistory}
      filteredSnapshots={filteredSnapshots}
      loadToInput={loadToInput}
      saveAsSnapshot={(h) => {
        addSnapshot({
          id: crypto.randomUUID(),
          title: `Snippet · ${new Date(h.time).toLocaleString()}`,
          time: Date.now(),
          input: h.fullInput ?? h.preview ?? '',
        });
        toast.success('Saved to snapshots');
      }}
      deleteSnapshot={deleteSnapshot}
    />
  );

  return (
    <TooltipProvider>
      <div className="flex h-screen min-w-0">
        {/* Left sidebar — desktop */}
        <aside className="hidden lg:flex flex-col w-80 shrink-0 border-r border-border/60 bg-card/30 backdrop-blur">
          {sidePanel}
        </aside>

        {/* Center */}
        <main className="flex-1 min-w-0 flex flex-col">
          {/* Toolbar */}
          <header className="flex flex-wrap items-center gap-2 p-3 sm:p-4 border-b border-border/60 bg-card/40 backdrop-blur">
            {/* Mobile drawer */}
            <Sheet>
              <SheetTrigger asChild>
                <Button size="sm" variant="outline" className="lg:hidden h-9 px-2" data-testid="json-mobile-history-btn" title="Recent & Saved">
                  <Clock className="h-4 w-4" />
                  {history.length + snapshots.length > 0 && (
                    <span className="ml-1.5 text-xs">{history.length + snapshots.length}</span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-[88vw] sm:w-80 max-w-sm flex flex-col">
                <SheetHeader className="sr-only"><SheetTitle>Recent and saved JSON</SheetTitle></SheetHeader>
                {sidePanel}
              </SheetContent>
            </Sheet>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" onClick={onBeautify} className="h-9 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white" data-testid="json-beautify-btn">
                  <Wand2 className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Beautify</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Format with current indent</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={onMinify} className="h-9" data-testid="json-minify-btn">
                  <Minimize2 className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Minify</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>One-line compact</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={onSortKeys} className="h-9" data-testid="json-sort-btn">
                  <ArrowDownAZ className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Sort</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sort keys alphabetically (recursive)</TooltipContent>
            </Tooltip>

            {/* Indent picker */}
            <Select value={String(indent)} onValueChange={(v) => setIndent(v === 'tab' ? 'tab' : Number(v))}>
              <SelectTrigger className="w-[88px] h-9" data-testid="json-indent-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 spaces</SelectItem>
                <SelectItem value="4">4 spaces</SelectItem>
                <SelectItem value="tab">Tab</SelectItem>
              </SelectContent>
            </Select>

            {/* Secondary actions */}
            <div className="hidden md:flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" onClick={onEscape} className="h-9">\&quot;esc&quot;</Button>
                </TooltipTrigger>
                <TooltipContent>Escape for string embed</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button size="sm" variant="ghost" onClick={onUnescape} className="h-9">unesc</Button>
                </TooltipTrigger>
                <TooltipContent>Unescape from string</TooltipContent>
              </Tooltip>
            </div>

            {/* Sample dropdown */}
            <Select onValueChange={(v) => onLoadSample(Number(v))}>
              <SelectTrigger className="w-[110px] h-9"><SelectValue placeholder="Sample" /></SelectTrigger>
              <SelectContent>
                {JSON_SAMPLES.map((s, i) => <SelectItem key={s.name} value={String(i)}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="ml-auto flex items-center gap-2">
              {/* Validation badge */}
              <ValidationBadge parsed={parsed} errLoc={errLoc} input={input} />
              <Button size="sm" variant="ghost" onClick={onPaste} className="h-9 px-2" title="Paste">
                <ClipboardPaste className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={onCopy} className="h-9 px-2" title="Copy">
                <Copy className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={saveSnapshot} className="h-9 px-2" title="Save snapshot" data-testid="json-save-btn">
                <Save className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDownload('json')} className="h-9 px-2 hidden sm:inline-flex" title="Download .json">
                <Download className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={onClear} className="h-9 px-2" title="Clear">
                <Eraser className="h-4 w-4" />
              </Button>
            </div>
          </header>

          {/* Workspace: editor + inspector */}
          <div className="flex-1 min-h-0 flex flex-col xl:flex-row">
            {/* Editor */}
            <div className="flex-1 min-w-0 min-h-[40vh] xl:min-h-0 border-b xl:border-b-0 xl:border-r border-border/60">
              <Editor
                height="100%"
                language="json"
                theme={resolvedTheme === 'dark' ? 'vs-dark' : 'vs'}
                value={input}
                onChange={(v) => setInput(v ?? '')}
                onMount={(ed, monaco) => {
                  editorRef.current = ed;
                  monacoRef.current = monaco;
                  // Disable Monaco's built-in JSON validation since we own it
                  // (lets us surface JSON5 fallback parsing without conflicting markers).
                  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({ validate: false, allowComments: true, trailingCommas: 'ignore' });
                }}
                options={{
                  fontSize: 13,
                  minimap: { enabled: false },
                  wordWrap: wordWrap ? 'on' : 'off',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  padding: { top: 12, bottom: 12 },
                  bracketPairColorization: { enabled: true },
                  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                  formatOnPaste: false,
                }}
              />
            </div>

            {/* Inspector (right or bottom) */}
            <aside className="w-full xl:w-[420px] xl:shrink-0 flex flex-col min-h-0 bg-card/20">
              <Tabs value={sidePane} onValueChange={setSidePane} className="flex-1 flex flex-col min-h-0">
                <TabsList className="mx-3 mt-3 grid grid-cols-5">
                  <TabsTrigger value="tree" className="text-xs" data-testid="json-tab-tree"><ListTree className="h-3 w-3 sm:mr-1" /><span className="hidden sm:inline">Tree</span></TabsTrigger>
                  <TabsTrigger value="query" className="text-xs" data-testid="json-tab-query"><Search className="h-3 w-3 sm:mr-1" /><span className="hidden sm:inline">Query</span></TabsTrigger>
                  <TabsTrigger value="convert" className="text-xs" data-testid="json-tab-convert"><FileCode2 className="h-3 w-3 sm:mr-1" /><span className="hidden sm:inline">Convert</span></TabsTrigger>
                  <TabsTrigger value="schema" className="text-xs" data-testid="json-tab-schema"><FlaskConical className="h-3 w-3 sm:mr-1" /><span className="hidden sm:inline">Schema</span></TabsTrigger>
                  <TabsTrigger value="stats" className="text-xs" data-testid="json-tab-stats"><Beaker className="h-3 w-3 sm:mr-1" /><span className="hidden sm:inline">Stats</span></TabsTrigger>
                </TabsList>

                <TabsContent value="tree" className="flex-1 min-h-0 mt-3">
                  {parsed.ok && (
                    <div className="flex items-center gap-1.5 px-3 pb-2">
                      <Button
                        size="sm" variant="outline" className="h-7 text-[11px] px-2"
                        data-testid="json-tree-toggle-btn"
                        onClick={() => setTreeForce(s => ({ open: !s.open, nonce: s.nonce + 1 }))}
                        title={treeForce.open ? 'Collapse all nodes' : 'Expand all nodes'}
                      >
                        {treeForce.open
                          ? <><Minimize2 className="h-3 w-3 mr-1" />Collapse all</>
                          : <><Maximize2 className="h-3 w-3 mr-1" />Expand all</>}
                      </Button>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        {treeForce.open === null ? 'default view' : (treeForce.open ? 'all expanded' : 'all collapsed')}
                      </span>
                    </div>
                  )}
                  <ScrollArea className="h-full px-3 pb-3">
                    {parsed.ok ? (
                      <TreeView data={parsed.data} forceOpen={treeForce.open} forceNonce={treeForce.nonce} />
                    ) : (
                      <SidePaneHint title="No tree available" subtitle={input ? 'Fix the JSON to view tree.' : 'Paste JSON to inspect.'} icon={ListTree} />
                    )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="query" className="flex-1 min-h-0 mt-3">
                  <div className="px-3 pb-3 h-full flex flex-col">
                    <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">JSONPath</Label>
                    <Input
                      className="h-9 mt-1.5 font-mono text-xs"
                      placeholder="e.g. $.store.book[*].author"
                      value={jpathExpr}
                      onChange={(e) => setJpathExpr(e.target.value)}
                      data-testid="json-query-input"
                    />
                    <div className="text-[10px] text-muted-foreground mt-1">
                      Examples: <button className="underline" onClick={() => setJpathExpr('$..*')}>$..*</button>{' '}
                      · <button className="underline" onClick={() => setJpathExpr('$..[?(@.id)]')}>$..[?(@.id)]</button>
                    </div>
                    <ScrollArea className="flex-1 mt-3 -mx-3 px-3 min-h-0">
                      <QueryResults parsed={parsed} expr={jpathExpr} />
                    </ScrollArea>
                  </div>
                </TabsContent>

                <TabsContent value="convert" className="flex-1 min-h-0 mt-3">
                  <div className="px-3 pb-3 h-full flex flex-col">
                    <div className="flex items-center gap-2">
                      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Target</Label>
                      <Select value={convertTo} onValueChange={setConvertTo}>
                        <SelectTrigger className="h-8 w-[140px] text-xs ml-auto"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yaml">YAML</SelectItem>
                          <SelectItem value="xml">XML</SelectItem>
                          <SelectItem value="csv">CSV (array)</SelectItem>
                          <SelectItem value="ts">TypeScript</SelectItem>
                          <SelectItem value="qs">Query string</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <ConvertPane parsed={parsed} target={convertTo} />
                  </div>
                </TabsContent>

                <TabsContent value="schema" className="flex-1 min-h-0 mt-3">
                  <SchemaPane
                    parsed={parsed}
                    schemaText={schemaText}
                    setSchemaText={setSchemaText}
                    result={schemaResult}
                    setResult={setSchemaResult}
                  />
                </TabsContent>

                <TabsContent value="stats" className="flex-1 min-h-0 mt-3">
                  <ScrollArea className="h-full px-3 pb-3">
                    <StatsPane stats={stats} input={input} parsed={parsed} />
                  </ScrollArea>
                </TabsContent>
              </Tabs>

              {/* Footer toggle */}
              <div className="border-t border-border/60 px-3 py-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                <Label htmlFor="json-wrap" className="text-[11px] flex items-center gap-2 cursor-pointer">
                  <Switch id="json-wrap" checked={wordWrap} onCheckedChange={setWordWrap} className="scale-75" />
                  Word wrap
                </Label>
                <span className="ml-auto font-mono">{new Blob([input]).size.toLocaleString()} B</span>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}

// ============================================================
// Sub-components
// ============================================================

function ValidationBadge({ parsed, errLoc, input }) {
  if (!input.trim()) {
    return <Badge variant="secondary" className="text-[10px] gap-1"><FileText className="h-3 w-3" /> Empty</Badge>;
  }
  if (parsed.ok && !parsed.lenient) {
    return <Badge className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 gap-1"><Check className="h-3 w-3" /> Valid JSON</Badge>;
  }
  if (parsed.ok && parsed.lenient) {
    return <Badge className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 gap-1"><AlertTriangle className="h-3 w-3" /> JSON5 (lenient)</Badge>;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge className="text-[10px] bg-rose-500/15 text-rose-300 border border-rose-500/30 gap-1 cursor-help" data-testid="json-error-badge">
          <X className="h-3 w-3" /> Error{errLoc && ` · Ln ${errLoc.line}:${errLoc.column}`}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm text-xs">{errLoc?.message || 'Invalid JSON'}</TooltipContent>
    </Tooltip>
  );
}

function SidePanel({
  history, snapshots, sideSearch, setSideSearch, snapTab, setSnapTab,
  clearHistory, filteredHistory, filteredSnapshots,
  loadToInput, saveAsSnapshot, deleteSnapshot,
}) {
  return (
    <>
      <div className="p-4 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 grid place-items-center shadow-lg shadow-emerald-500/20 shrink-0">
            <Braces className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold leading-tight truncate">JSON Studio</div>
            <div className="text-[11px] text-muted-foreground">Validate · Beautify · Inspect</div>
          </div>
        </div>
      </div>

      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            data-testid="json-side-search-input"
            className="h-8 pl-7 text-xs"
            placeholder="Search by content…"
            value={sideSearch}
            onChange={(e) => setSideSearch(e.target.value)}
          />
        </div>
      </div>

      <Tabs value={snapTab} onValueChange={setSnapTab} className="px-3 pt-3">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="recent" className="text-xs" data-testid="json-tab-recent">
            <Clock className="h-3 w-3 mr-1" /> Recent
            <Badge variant="secondary" className="ml-1.5 text-[9px] h-4 px-1">{history.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="saved" className="text-xs" data-testid="json-tab-saved">
            <Save className="h-3 w-3 mr-1" /> Saved
            <Badge variant="secondary" className="ml-1.5 text-[9px] h-4 px-1">{snapshots.length}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="px-3 pt-2 pb-1">
        {snapTab === 'recent' ? (
          <Button
            variant="outline" size="sm"
            data-testid="json-clear-recent-btn"
            className="w-full h-8 text-xs"
            disabled={!history.length}
            onClick={() => { clearHistory(); toast.success('Cleared recent'); }}
          >
            <Trash2 className="h-3 w-3 mr-1.5" /> Clear all recent
          </Button>
        ) : (
          <div className="text-[10px] text-muted-foreground px-1">
            {filteredSnapshots.length} saved · click load to restore
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 px-3 pb-3 min-h-0">
        {snapTab === 'recent' ? (
          filteredHistory.length === 0 ? (
            <SidePaneHint icon={Clock} title={history.length ? 'No matches' : 'No recent yet'} subtitle={history.length ? 'Try a different search' : 'Paste JSON to start.'} />
          ) : filteredHistory.slice(0, 80).map(h => (
            <Card key={h.id} className="p-2.5 mb-1.5 glass" data-testid="json-recent-item">
              <div className="flex items-center gap-1.5 mb-1">
                {h.valid
                  ? <Badge className="text-[9px] h-4 px-1 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">valid</Badge>
                  : <Badge className="text-[9px] h-4 px-1 bg-rose-500/15 text-rose-300 border border-rose-500/30">error</Badge>}
                <span className="text-[9px] text-muted-foreground font-mono">{(h.size || 0).toLocaleString()} B</span>
                <span className="text-[9px] text-muted-foreground ml-auto">{new Date(h.time).toLocaleTimeString()}</span>
              </div>
              <div className="text-[11px] font-mono text-foreground/80 line-clamp-2 break-all" title={h.fullInput}>{h.preview || '(empty)'}</div>
              <div className="flex items-center gap-1 mt-1.5">
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" data-testid="json-recent-load-btn" onClick={() => loadToInput(h.fullInput ?? h.preview ?? '')}>
                  <CornerDownLeft className="h-3 w-3 mr-1" />Load
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" data-testid="json-recent-save-btn" onClick={() => saveAsSnapshot(h)}>
                  <BookmarkPlus className="h-3 w-3 mr-1" />Save
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] ml-auto" onClick={() => { navigator.clipboard.writeText(h.fullInput ?? h.preview ?? ''); toast.success('Copied'); }}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          ))
        ) : (
          filteredSnapshots.length === 0 ? (
            <SidePaneHint icon={Save} title={snapshots.length ? 'No matches' : 'No saved'} subtitle={snapshots.length ? 'Try a different search' : 'Click the save icon.'} />
          ) : filteredSnapshots.map(s => (
            <Card key={s.id} className="p-2.5 mb-1.5 glass" data-testid="json-saved-item">
              <div className="text-xs font-medium truncate" title={s.title}>{s.title}</div>
              <div className="text-[10px] text-muted-foreground line-clamp-2 break-all mt-0.5" title={s.input}>{s.input || '(empty)'}</div>
              <div className="flex items-center gap-1 mt-1.5">
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" data-testid="json-saved-load-btn" onClick={() => loadToInput(s.input)}>
                  <CornerDownLeft className="h-3 w-3 mr-1" />Load
                </Button>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => { navigator.clipboard.writeText(s.input); toast.success('Copied'); }}>
                  <Copy className="h-3 w-3 mr-1" />Copy
                </Button>
                <Button
                  size="sm" variant="ghost"
                  className="h-6 px-2 text-[10px] ml-auto text-rose-400 hover:text-rose-300"
                  data-testid="json-saved-unsave-btn"
                  onClick={() => { deleteSnapshot(s.id); toast('Unsaved'); }}
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

function SidePaneHint({ icon: Icon, title, subtitle }) {
  return (
    <div className="text-center p-6 text-muted-foreground">
      <Icon className="h-6 w-6 mx-auto mb-2 opacity-60" />
      <div className="text-xs font-medium">{title}</div>
      {subtitle && <div className="text-[10px] mt-1">{subtitle}</div>}
    </div>
  );
}

// ---------- Tree view ----------
function TreeView({ data, forceOpen, forceNonce }) {
  return (
    <div className="font-mono text-[12px] leading-relaxed">
      <TreeNode label="$" value={data} depth={0} isRoot forceOpen={forceOpen} forceNonce={forceNonce} />
    </div>
  );
}

function TreeNode({ label, value, depth, isRoot, forceOpen, forceNonce }) {
  const [open, setOpen] = useState(depth < 2);
  // Whenever the user clicks "Expand all" or "Collapse all", `forceNonce`
  // increments and we adopt the new global state. After that the user can
  // still toggle individual nodes by clicking — the override only applies
  // at the moment of the explicit toggle, not on every render.
  useEffect(() => {
    if (forceOpen === null || forceOpen === undefined) return;
    setOpen(forceOpen);
  }, [forceNonce, forceOpen]);
  const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const isCollection = type === 'array' || type === 'object';
  const entries = isCollection ? (type === 'array' ? value.map((v, i) => [i, v]) : Object.entries(value)) : [];
  const count = entries.length;

  const labelEl = (
    <span className={cn('select-none', isRoot ? 'text-muted-foreground' : 'text-foreground/90')}>
      {String(label)}
    </span>
  );

  if (!isCollection) {
    return (
      <div className="flex items-start gap-1.5 group">
        <span className="w-3 shrink-0" />
        {labelEl}
        <span className="text-muted-foreground">:</span>
        <ValueChip value={value} type={type} />
        <button
          className="opacity-0 group-hover:opacity-100 ml-auto text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => { navigator.clipboard.writeText(typeof value === 'string' ? value : JSON.stringify(value)); toast.success('Value copied'); }}
          title="Copy value"
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 hover:bg-accent/30 rounded px-0.5 -mx-0.5"
      >
        {open ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
        {labelEl}
        <span className="text-muted-foreground">{type === 'array' ? `[${count}]` : `{${count}}`}</span>
      </button>
      {open && (
        <div className="ml-3 border-l border-border/40 pl-2">
          {entries.map(([k, v]) => (
            <TreeNode key={String(k)} label={k} value={v} depth={depth + 1} forceOpen={forceOpen} forceNonce={forceNonce} />
          ))}
        </div>
      )}
    </div>
  );
}

function ValueChip({ value, type }) {
  if (type === 'string') return <span className="text-emerald-300 break-all">&quot;{value}&quot;</span>;
  if (type === 'number') return <span className="text-amber-300">{String(value)}</span>;
  if (type === 'boolean') return <span className="text-fuchsia-300">{String(value)}</span>;
  if (type === 'null') return <span className="text-rose-300">null</span>;
  return <span>{String(value)}</span>;
}

// ---------- Query results ----------
function QueryResults({ parsed, expr }) {
  if (!parsed.ok) return <SidePaneHint icon={Search} title="Invalid JSON" subtitle="Fix the JSON to query." />;
  let results = [];
  let error = null;
  try { results = jsonPathQuery(parsed.data, expr); }
  catch (e) { error = e.message; }
  if (error) return <div className="text-xs text-rose-300 font-mono p-2 bg-rose-500/10 border border-rose-500/30 rounded">{error}</div>;
  if (!results.length) {
    return <SidePaneHint icon={Search} title="No matches" subtitle="Try $..* to see everything." />;
  }
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] text-muted-foreground">{results.length} match{results.length === 1 ? '' : 'es'}</div>
      {results.slice(0, 200).map((r, i) => (
        <Card key={i} className="p-2 glass">
          <div className="text-[10px] text-muted-foreground font-mono truncate" title={r.path}>{r.path}</div>
          <pre className="text-[11px] font-mono whitespace-pre-wrap break-all mt-0.5 max-h-32 overflow-auto">{prettyValue(r.value)}</pre>
        </Card>
      ))}
      {results.length > 200 && <div className="text-[10px] text-muted-foreground text-center pt-2">Showing first 200 of {results.length}</div>}
    </div>
  );
}

function prettyValue(v) {
  try { return typeof v === 'string' ? `"${v}"` : JSON.stringify(v, null, 2); }
  catch { return String(v); }
}

// ---------- Convert pane ----------
function ConvertPane({ parsed, target }) {
  const result = useMemo(() => {
    if (!parsed.ok) return { error: 'Fix the JSON to convert.' };
    try {
      switch (target) {
        case 'yaml': return { text: toYaml(parsed.data) };
        case 'xml': return { text: toXml(parsed.data) };
        case 'csv': return { text: toCsv(parsed.data) };
        case 'ts': return { text: toTypeScript(parsed.data) };
        case 'qs': {
          if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data))
            return { error: 'Query string needs a flat object at the root.' };
          const usp = new URLSearchParams();
          for (const [k, v] of Object.entries(parsed.data)) {
            if (Array.isArray(v)) v.forEach(x => usp.append(k, typeof x === 'object' ? JSON.stringify(x) : String(x)));
            else if (v !== null && v !== undefined) usp.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
          }
          return { text: usp.toString() };
        }
        default: return { text: '' };
      }
    } catch (e) {
      return { error: e.message };
    }
  }, [parsed, target]);

  return (
    <div className="flex-1 min-h-0 mt-2 flex flex-col">
      {result.error ? (
        <div className="text-xs text-rose-300 font-mono p-2 bg-rose-500/10 border border-rose-500/30 rounded">{result.error}</div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1.5">
            <span>{(result.text || '').length.toLocaleString()} chars</span>
            <Button size="sm" variant="ghost" className="h-6 px-2 ml-auto text-[10px]" onClick={() => { navigator.clipboard.writeText(result.text || ''); toast.success('Copied'); }}>
              <Copy className="h-3 w-3 mr-1" /> Copy
            </Button>
          </div>
          <ScrollArea className="flex-1 -mx-3 px-3 min-h-0">
            <pre className="font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap break-all bg-card/30 border border-border/60 rounded-md p-3">{result.text}</pre>
          </ScrollArea>
        </>
      )}
    </div>
  );
}

// ---------- Schema pane ----------
function SchemaPane({ parsed, schemaText, setSchemaText, result, setResult }) {
  const validate = async () => {
    if (!parsed.ok) return toast.error('Fix the JSON first');
    let schema;
    try { schema = JSON.parse(schemaText); }
    catch { return toast.error('Schema is not valid JSON'); }
    try {
      const { default: Ajv } = await import('ajv');
      const { default: addFormats } = await import('ajv-formats');
      const ajv = new Ajv({ allErrors: true, strict: false });
      try { addFormats(ajv); } catch { /* noop */ }
      const v = ajv.compile(schema);
      const ok = v(parsed.data);
      setResult({ ok, errors: v.errors || [] });
    } catch (e) {
      setResult({ ok: false, errors: [{ message: e.message }] });
    }
  };

  return (
    <div className="px-3 pb-3 h-full flex flex-col">
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Schema (JSON Schema)</Label>
      <textarea
        className="font-mono text-[11.5px] h-40 rounded-md border border-border/60 bg-background/30 p-2 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
        placeholder={`{\n  "type": "object",\n  "required": ["id", "name"],\n  "properties": {\n    "id": { "type": "string" },\n    "name": { "type": "string" }\n  }\n}`}
        value={schemaText}
        onChange={(e) => setSchemaText(e.target.value)}
        data-testid="json-schema-input"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={validate} className="h-8 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600" data-testid="json-schema-validate-btn">
          <Check className="h-3 w-3 mr-1.5" /> Validate
        </Button>
        {result && (
          result.ok
            ? <Badge className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 gap-1"><Check className="h-3 w-3" /> Matches schema</Badge>
            : <Badge className="text-[10px] bg-rose-500/15 text-rose-300 border border-rose-500/30 gap-1"><X className="h-3 w-3" /> {result.errors.length} issue{result.errors.length === 1 ? '' : 's'}</Badge>
        )}
      </div>
      <ScrollArea className="flex-1 mt-3 -mx-3 px-3 min-h-0">
        {result && !result.ok && (
          <div className="space-y-1.5">
            {result.errors.map((e, i) => (
              <div key={i} className="text-[11px] font-mono p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-200">
                <span className="text-rose-400">{e.instancePath || '/'}</span> {e.message}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ---------- Stats pane ----------
function StatsPane({ stats, input, parsed }) {
  const size = new Blob([input || '']).size;
  const lines = (input.match(/\n/g)?.length || 0) + (input ? 1 : 0);
  const items = [
    { label: 'Size', value: `${size.toLocaleString()} B` },
    { label: 'Lines', value: lines.toLocaleString() },
    { label: 'Keys', value: stats?.keys ?? 0 },
    { label: 'Depth', value: stats?.depth ?? 0 },
    { label: 'Objects', value: stats?.objects ?? 0 },
    { label: 'Arrays', value: stats?.arrays ?? 0 },
    { label: 'Strings', value: stats?.strings ?? 0 },
    { label: 'Numbers', value: stats?.numbers ?? 0 },
    { label: 'Booleans', value: stats?.booleans ?? 0 },
    { label: 'Nulls', value: stats?.nulls ?? 0 },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {items.map(it => (
          <Card key={it.label} className="glass p-2.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.label}</div>
            <motion.div key={String(it.value)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="font-mono text-sm font-semibold mt-0.5">
              {typeof it.value === 'number' ? it.value.toLocaleString() : it.value}
            </motion.div>
          </Card>
        ))}
      </div>
      {parsed.lenient && (
        <Card className="glass p-3 border-amber-500/30">
          <div className="text-[11px] text-amber-300 font-medium mb-0.5">Parsed as JSON5</div>
          <div className="text-[10px] text-muted-foreground">Your input has comments or trailing commas — strict JSON wouldn&apos;t accept it. Click <strong>Beautify</strong> to normalize.</div>
        </Card>
      )}
    </div>
  );
}
