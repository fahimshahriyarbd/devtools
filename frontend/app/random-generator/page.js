'use client';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dice5, Copy, Download, Save, Star, Trash2, Search, Check, X, Zap,
  Key, Hash as HashIcon, Fingerprint, Shield, Ticket, ChevronRight, Plus, FolderOpen, Pencil, Clock,
  PanelLeft, PanelRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { GENERATOR_TYPES, generateMany, generateOne, analyzeStrength } from '@/lib/random-utils';
import { useRandomStore } from '@/lib/stores';

const QUICK_ACTIONS = [
  { id: 'password', label: 'Password', icon: Shield },
  { id: 'uuid-v4', label: 'UUID', icon: Fingerprint },
  { id: 'api-key', label: 'API Key', icon: Key },
  { id: 'jwt-secret', label: 'JWT Secret', icon: Shield },
  { id: 'nanoid', label: 'NanoID', icon: HashIcon },
];

export default function RandomGeneratorPage() {
  const {
    type, setType, options, setOptions, count, setCount,
    lastResults, setLastResults, history, addHistory, clearHistory, removeHistory, toggleHistoryFav,
    collections, addCollection, renameCollection, deleteCollection, addToCollection, removeFromCollection,
  } = useRandomStore();

  const [view, setView] = useState('cards'); // cards | table
  const [historySearch, setHistorySearch] = useState('');
  const [historyType, setHistoryType] = useState('all');
  const [historyFavOnly, setHistoryFavOnly] = useState(false);
  const [newCollName, setNewCollName] = useState('');
  const [activeColl, setActiveColl] = useState(collections[0]?.id || null);

  const typeMeta = useMemo(() => GENERATOR_TYPES.find(t => t.id === type) || GENERATOR_TYPES[0], [type]);

  const generate = () => {
    const arr = generateMany(type, count, options);
    setLastResults(arr);
    addHistory(arr.map(v => ({ id: crypto.randomUUID(), time: Date.now(), type, value: v, length: v.length })));
    toast.success(`Generated ${arr.length} ${typeMeta.label}${arr.length === 1 ? '' : 's'}`);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'Enter') { e.preventDefault(); generate(); }
      else if (ctrl && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) {
        // Only intercept Ctrl+C if nothing's selected
        if (lastResults[0]) { navigator.clipboard.writeText(lastResults[0]); toast.success('Copied'); e.preventDefault(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line
  }, [type, options, count, lastResults]);

  // Stats based on the first result
  const firstValue = lastResults[0] || '';
  const stats = useMemo(() => analyzeStrength(firstValue), [firstValue]);
  const uniqueRatio = useMemo(() => {
    if (!lastResults.length) return 100;
    return Math.round((new Set(lastResults).size / lastResults.length) * 100);
  }, [lastResults]);

  const filteredHistory = useMemo(() => {
    let h = history;
    if (historyType !== 'all') h = h.filter(x => x.type === historyType);
    if (historyFavOnly) h = h.filter(x => x.favorite);
    if (historySearch) {
      const q = historySearch.toLowerCase();
      h = h.filter(x => x.value.toLowerCase().includes(q));
    }
    return h;
  }, [history, historyType, historySearch, historyFavOnly]);

  const exportData = (format, source = 'current') => {
    const arr = source === 'history' ? history.map(h => h.value) : lastResults;
    let data = '', filename = '', mime = 'text/plain';
    if (format === 'json') {
      data = JSON.stringify(arr, null, 2); filename = `random-${source}.json`; mime = 'application/json';
    } else if (format === 'csv') {
      data = 'value\n' + arr.map(v => `"${v.replace(/"/g, '""')}"`).join('\n'); filename = `random-${source}.csv`;
    } else {
      data = arr.join('\n'); filename = `random-${source}.txt`;
    }
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="flex h-screen min-w-0">
      {/* Left sidebar — desktop */}
      <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r border-border/60 bg-card/30 backdrop-blur">
        <LeftPanel
          options={options}
          setType={setType}
          setLastResults={setLastResults}
          addHistory={addHistory}
          history={history}
          collections={collections}
          activeColl={activeColl} setActiveColl={setActiveColl}
          addCollection={addCollection} renameCollection={renameCollection} deleteCollection={deleteCollection}
          removeFromCollection={removeFromCollection}
          newCollName={newCollName} setNewCollName={setNewCollName}
        />
      </aside>

      {/* Center */}
      <Tabs value={Object.values({}).length ? 'a' : 'a'} className="flex-1 min-w-0 flex flex-col">
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="flex flex-wrap items-center gap-2 sm:gap-3 p-3 sm:p-4 border-b border-border/60 bg-card/40 backdrop-blur">
            {/* Mobile drawer triggers — grouped together so they always sit on the same row */}
            <div className="flex items-center gap-1 xl:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    size="sm" variant="outline" className="lg:hidden h-9 px-2"
                    data-testid="mobile-left-panel-btn"
                    title="Quick actions, collections, recent"
                  >
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-[88vw] sm:w-80 max-w-sm flex flex-col">
                  <SheetHeader className="sr-only"><SheetTitle>Quick actions & collections</SheetTitle></SheetHeader>
                  <LeftPanel
                    options={options}
                    setType={setType}
                    setLastResults={setLastResults}
                    addHistory={addHistory}
                    history={history}
                    collections={collections}
                    activeColl={activeColl} setActiveColl={setActiveColl}
                    addCollection={addCollection} renameCollection={renameCollection} deleteCollection={deleteCollection}
                    removeFromCollection={removeFromCollection}
                    newCollName={newCollName} setNewCollName={setNewCollName}
                  />
                </SheetContent>
              </Sheet>

              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    size="sm" variant="outline" className="h-9 px-2"
                    data-testid="mobile-right-panel-btn"
                    title="Strength, stats, history"
                  >
                    <PanelRight className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="p-0 w-[88vw] sm:w-80 max-w-sm flex flex-col">
                  <SheetHeader className="sr-only"><SheetTitle>Strength, stats, history</SheetTitle></SheetHeader>
                  <RightPanel
                    stats={stats}
                    uniqueRatio={uniqueRatio}
                    history={history}
                    clearHistory={clearHistory}
                    historySearch={historySearch} setHistorySearch={setHistorySearch}
                    historyType={historyType} setHistoryType={setHistoryType}
                    historyFavOnly={historyFavOnly} setHistoryFavOnly={setHistoryFavOnly}
                    filteredHistory={filteredHistory}
                    toggleHistoryFav={toggleHistoryFav}
                    removeHistory={removeHistory}
                  />
                </SheetContent>
              </Sheet>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-[150px] sm:w-[220px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(
                    GENERATOR_TYPES.reduce((acc, t) => { (acc[t.category] = acc[t.category] || []).push(t); return acc; }, {})
                  ).map(([cat, list]) => (
                    <div key={cat}>
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">{cat}</div>
                      {list.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                    </div>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="secondary" className="text-[10px] hidden sm:inline-flex">{typeMeta.category}</Badge>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Tabs value={view} onValueChange={setView}>
                <TabsList className="h-9">
                  <TabsTrigger value="cards" className="text-xs">Cards</TabsTrigger>
                  <TabsTrigger value="table" className="text-xs">Table</TabsTrigger>
                </TabsList>
              </Tabs>
              <Select onValueChange={(v) => exportData(v)}>
                <SelectTrigger className="w-[92px] sm:w-[120px] h-9"><SelectValue placeholder="Export…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="txt">.txt</SelectItem>
                  <SelectItem value="csv">.csv</SelectItem>
                  <SelectItem value="json">.json</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={generate} className="bg-gradient-to-r from-fuchsia-500 to-purple-500 hover:from-fuchsia-600 hover:to-purple-600">
                <Zap className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Generate</span>
              </Button>
            </div>
          </header>

          <ScrollArea className="flex-1">
            <div className="p-3 sm:p-4 space-y-4 max-w-5xl mx-auto w-full">
              <OptionsCard type={type} options={options} setOptions={setOptions} count={count} setCount={setCount} />
              <ResultsView results={lastResults} view={view} collections={collections} activeColl={activeColl} setActiveColl={setActiveColl} addToCollection={addToCollection} />
            </div>
          </ScrollArea>
        </main>
      </Tabs>

      {/* Right sidebar — desktop */}
      <aside className="hidden xl:flex flex-col w-80 shrink-0 border-l border-border/60 bg-card/30 backdrop-blur">
        <RightPanel
          stats={stats}
          uniqueRatio={uniqueRatio}
          history={history}
          clearHistory={clearHistory}
          historySearch={historySearch} setHistorySearch={setHistorySearch}
          historyType={historyType} setHistoryType={setHistoryType}
          historyFavOnly={historyFavOnly} setHistoryFavOnly={setHistoryFavOnly}
          filteredHistory={filteredHistory}
          toggleHistoryFav={toggleHistoryFav}
          removeHistory={removeHistory}
        />
      </aside>
    </div>
  );
}

function LeftPanel({
  options, setType, setLastResults, addHistory,
  history, collections, activeColl, setActiveColl,
  addCollection, renameCollection, deleteCollection, removeFromCollection,
  newCollName, setNewCollName,
}) {
  return (
    <>
      <div className="p-4 border-b border-border/60">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-fuchsia-500 via-purple-500 to-indigo-500 grid place-items-center shadow-lg shadow-fuchsia-500/20 shrink-0">
            <Dice5 className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold leading-tight truncate">Random Generator</div>
            <div className="text-[11px] text-muted-foreground">20 types · cryptographic</div>
          </div>
        </div>
      </div>
      <div className="p-3 border-b border-border/60">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Quick actions</div>
        <div className="grid grid-cols-2 gap-1.5">
          {QUICK_ACTIONS.map(qa => {
            const Icon = qa.icon;
            return (
              <button
                key={qa.id}
                className="flex flex-col items-start gap-1 p-2 rounded-md bg-card/40 border border-border/60 hover:border-foreground/30 transition group"
                onClick={() => {
                  setType(qa.id);
                  const v = generateOne(qa.id, options);
                  setLastResults([v]);
                  addHistory([{ id: crypto.randomUUID(), time: Date.now(), type: qa.id, value: v, length: v.length }]);
                  navigator.clipboard.writeText(v);
                  toast.success(`Generated & copied ${qa.label}`);
                }}
              >
                <Icon className="h-3.5 w-3.5 text-fuchsia-400" />
                <span className="text-[11px]">{qa.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <Tabs defaultValue="collections" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-3 mt-3 grid grid-cols-2">
          <TabsTrigger value="collections" className="text-xs">Collections</TabsTrigger>
          <TabsTrigger value="recent" className="text-xs">Recent</TabsTrigger>
        </TabsList>
        <TabsContent value="collections" className="flex-1 mt-0 min-h-0">
          <CollectionsPanel
            collections={collections}
            active={activeColl} setActive={setActiveColl}
            addCollection={addCollection} renameCollection={renameCollection} deleteCollection={deleteCollection}
            removeFromCollection={removeFromCollection}
            newCollName={newCollName} setNewCollName={setNewCollName}
          />
        </TabsContent>
        <TabsContent value="recent" className="flex-1 mt-0 min-h-0">
          <ScrollArea className="h-full px-3 pb-3">
            {history.slice(0, 40).map(h => (
              <div key={h.id} className="group flex items-start gap-2 p-2 rounded-md hover:bg-accent/50 mb-1 min-w-0">
                <Badge variant="outline" className="text-[9px] h-4 px-1 mt-0.5 font-mono shrink-0">{h.type}</Badge>
                <div className="text-[11px] font-mono truncate flex-1 min-w-0">{h.value}</div>
                <button onClick={() => { navigator.clipboard.writeText(h.value); toast.success('Copied'); }}><Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" /></button>
              </div>
            ))}
            {!history.length && <div className="text-center text-xs text-muted-foreground py-8">No history yet</div>}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </>
  );
}

function RightPanel({
  stats, uniqueRatio, history, clearHistory,
  historySearch, setHistorySearch, historyType, setHistoryType,
  historyFavOnly, setHistoryFavOnly,
  filteredHistory, toggleHistoryFav, removeHistory,
}) {
  return (
    <>
      <div className="p-4 border-b border-border/60">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Strength</div>
        <StrengthMeter stats={stats} />
      </div>
      <div className="p-4 border-b border-border/60 grid grid-cols-2 gap-2">
        <Stat label="Length" value={stats.length} />
        <Stat label="Entropy" value={`${stats.entropy} bits`} />
        <Stat label="Unique chars" value={stats.unique || 0} />
        <Stat label="Batch unique" value={`${uniqueRatio}%`} />
      </div>
      <div className="p-4 border-b border-border/60">
        <div className="flex items-center gap-2 mb-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">History</div>
          <Badge variant="secondary" className="text-[9px] h-4">{history.length}</Badge>
          <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" onClick={() => clearHistory()}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
        <div className="space-y-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-8 pl-7 text-xs" placeholder="Search history…" value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Select value={historyType} onValueChange={setHistoryType}>
              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {GENERATOR_TYPES.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <button onClick={() => setHistoryFavOnly(v => !v)} className={cn('h-8 w-8 rounded-md border grid place-items-center shrink-0', historyFavOnly ? 'bg-amber-500/15 border-amber-500/40' : 'border-border/60')}>
              <Star className={cn('h-3.5 w-3.5', historyFavOnly ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
            </button>
          </div>
        </div>
      </div>
      <ScrollArea className="flex-1 p-3 min-h-0">
        {filteredHistory.slice(0, 100).map(h => (
          <div key={h.id} className="group flex items-start gap-2 p-2 rounded-md hover:bg-accent/50 mb-1 min-w-0">
            <button onClick={() => toggleHistoryFav(h.id)} className="shrink-0">
              <Star className={cn('h-3 w-3 mt-0.5', h.favorite ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">{h.type}</Badge>
                <span className="text-[9px] text-muted-foreground">{new Date(h.time).toLocaleTimeString()}</span>
              </div>
              <div className="text-[11px] font-mono truncate">{h.value}</div>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { navigator.clipboard.writeText(h.value); toast.success('Copied'); }}>
              <Copy className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeHistory(h.id)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
        {!filteredHistory.length && <div className="text-center text-xs text-muted-foreground py-8">No matches</div>}
      </ScrollArea>
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-card/50 border border-border/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <motion.div key={String(value)} initial={{ y: 4, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="font-mono text-sm font-semibold mt-0.5">{value}</motion.div>
    </div>
  );
}

function StrengthMeter({ stats }) {
  const color = {
    weak: 'from-rose-500 to-red-500',
    medium: 'from-amber-500 to-orange-500',
    strong: 'from-emerald-500 to-teal-500',
    'very-strong': 'from-fuchsia-500 to-purple-500',
    none: 'from-muted to-muted',
  }[stats.strength];
  const percent = Math.min(100, (stats.bits / 100) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-medium">{stats.label}</span>
        <span className="text-xs text-muted-foreground font-mono">{stats.bits} bits</span>
      </div>
      <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 0.4 }} className={cn('h-full bg-gradient-to-r', color)} />
      </div>
      <div className="text-[10px] text-muted-foreground mt-2 flex justify-between">
        <span>Est. crack time</span>
        <span className="font-mono">{stats.crackTime}</span>
      </div>
    </div>
  );
}

function OptionsCard({ type, options, setOptions, count, setCount }) {
  const isPassword = type === 'password';
  const isString = type === 'string';
  const supportsLength = !['uuid-v4', 'uuid-v1', 'uuid-v7', 'session-token', 'bearer-token', 'oauth-state', 'db-key', 'tracking-id'].includes(type);
  const supportsPrefix = ['password', 'string', 'api-key'].includes(type);

  return (
    <Card className="glass p-3 sm:p-4 min-w-0">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-4 min-w-0">
          {supportsLength && (
            <div>
              <div className="flex justify-between mb-1.5">
                <Label className="text-xs">Length</Label>
                <span className="text-xs font-mono">{options.length}</span>
              </div>
              <Slider value={[options.length]} min={1} max={128} step={1} onValueChange={(v) => setOptions({ length: v[0] })} />
            </div>
          )}
          <div>
            <div className="flex justify-between mb-1.5">
              <Label className="text-xs">Count</Label>
              <span className="text-xs font-mono">{count}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[1, 10, 50, 100, 500, 1000].map(n => (
                <button key={n} onClick={() => setCount(n)} className={cn('flex-1 min-w-[44px] h-8 rounded-md text-xs border transition px-2',
                  count === n ? 'bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-200' : 'border-border/60 hover:border-foreground/30')}>{n}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-3">
          {(isPassword || isString) && (
            <div className="grid grid-cols-2 gap-2">
              <Toggle label="Lowercase" checked={options.lower !== false} onChange={(v) => setOptions({ lower: v })} />
              <Toggle label="Uppercase" checked={options.upper !== false} onChange={(v) => setOptions({ upper: v })} />
              <Toggle label="Numbers" checked={options.digits !== false} onChange={(v) => setOptions({ digits: v })} />
              {isPassword && <Toggle label="Symbols" checked={!!options.symbols} onChange={(v) => setOptions({ symbols: v })} />}
              <Toggle label="Exclude ambiguous" checked={!!options.excludeAmbiguous} onChange={(v) => setOptions({ excludeAmbiguous: v })} />
            </div>
          )}
          {supportsPrefix && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Prefix</Label>
                <Input className="h-8 font-mono text-xs mt-1" value={options.prefix || ''} onChange={(e) => setOptions({ prefix: e.target.value })} />
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Suffix</Label>
                <Input className="h-8 font-mono text-xs mt-1" value={options.suffix || ''} onChange={(e) => setOptions({ suffix: e.target.value })} />
              </div>
            </div>
          )}
          {isString && (
            <div>
              <Label className="text-[10px] uppercase text-muted-foreground">Custom character set (overrides toggles)</Label>
              <Input className="h-8 font-mono text-xs mt-1" placeholder="e.g. ABCDEF0123456789" value={options.customSet || ''} onChange={(e) => setOptions({ customSet: e.target.value })} />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-2 p-2 rounded-md border border-border/60 hover:border-foreground/20 cursor-pointer">
      <span className="text-xs">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function ResultsView({ results, view, collections, activeColl, setActiveColl, addToCollection }) {
  if (!results.length) {
    return (
      <Card className="glass p-12 text-center text-sm text-muted-foreground">
        Click <span className="text-foreground">Generate</span> or press <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">Ctrl + Enter</kbd> to start.
      </Card>
    );
  }
  const targetColl = collections.find(c => c.id === activeColl);
  const saveOne = (v) => {
    if (!activeColl) { toast.error('Pick a collection in "Save to…" first'); return; }
    addToCollection(activeColl, v);
    toast.success(`Saved to ${targetColl?.name || 'collection'}`);
  };

  if (view === 'table') {
    return (
      <Card className="glass overflow-hidden">
        <div className="px-3 py-2 flex items-center gap-2 border-b border-border/60 bg-card/40">
          <span className="text-xs text-muted-foreground">{results.length} result{results.length === 1 ? '' : 's'}</span>
          <Button size="sm" variant="ghost" className="h-7 ml-auto" onClick={() => { navigator.clipboard.writeText(results.join('\n')); toast.success(`Copied all ${results.length}`); }}>
            <Copy className="h-3 w-3 mr-1.5" /> Copy all
          </Button>
          <Select value={activeColl || ''} onValueChange={setActiveColl}>
            <SelectTrigger className="h-7 w-[160px] text-xs" data-testid="save-target-select"><SelectValue placeholder="Save to…" /></SelectTrigger>
            <SelectContent>
              {collections.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card/80 backdrop-blur">
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/60">
                <th className="px-3 py-2 w-12">#</th>
                <th className="px-3 py-2">Value</th>
                <th className="px-3 py-2 w-20 text-right">Length</th>
                <th className="px-3 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {results.map((v, i) => (
                <tr key={i} className="border-b border-border/40 hover:bg-accent/30">
                  <td className="px-3 py-1.5 text-xs text-muted-foreground font-mono">{i + 1}</td>
                  <td className="px-3 py-1.5 font-mono text-xs break-all">{v}</td>
                  <td className="px-3 py-1.5 text-xs text-right text-muted-foreground">{v.length}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(v); toast.success('Copied'); }} title="Copy">
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon" variant="ghost" className="h-6 w-6"
                        data-testid="result-save-btn"
                        onClick={() => saveOne(v)}
                        title={activeColl ? `Save to ${targetColl?.name}` : 'Pick a collection first'}
                      >
                        <Save className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }
  return (
    <>
      <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
        <span>{results.length} result{results.length === 1 ? '' : 's'}</span>
        <Button size="sm" variant="ghost" className="h-7 ml-auto" onClick={() => { navigator.clipboard.writeText(results.join('\n')); toast.success(`Copied all ${results.length}`); }}>
          <Copy className="h-3 w-3 mr-1.5" /> Copy all
        </Button>
        <Select value={activeColl || ''} onValueChange={setActiveColl}>
          <SelectTrigger className="h-7 w-[160px] text-xs" data-testid="save-target-select"><SelectValue placeholder="Save to…" /></SelectTrigger>
          <SelectContent>
            {collections.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <AnimatePresence>
          {results.slice(0, 200).map((v, i) => (
            <motion.div key={i + v} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.005 }}>
              <Card className="glass p-3 group">
                <div className="font-mono text-[12.5px] break-all">{v}</div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>#{i + 1} · {v.length} chars</span>
                  <div className="flex items-center gap-0.5">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(v); toast.success('Copied'); }} title="Copy">
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      size="icon" variant="ghost" className="h-6 w-6"
                      data-testid="result-save-btn"
                      onClick={() => saveOne(v)}
                      title={activeColl ? `Save to ${targetColl?.name}` : 'Pick a collection first'}
                    >
                      <Save className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      {results.length > 200 && (
        <div className="text-center text-xs text-muted-foreground py-3">
          Showing first 200 of {results.length}. Use Table view or Export to see all.
        </div>
      )}
    </>
  );
}

function CollectionsPanel({ collections, active, setActive, addCollection, renameCollection, deleteCollection, removeFromCollection, newCollName, setNewCollName }) {
  const activeC = collections.find(c => c.id === active);
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 flex gap-1.5">
        <Input className="h-7 text-xs" placeholder="New collection name" value={newCollName} onChange={(e) => setNewCollName(e.target.value)} />
        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => { if (newCollName.trim()) { addCollection(newCollName.trim()); setNewCollName(''); toast.success('Created'); } }}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="px-3 mb-1 max-h-32 overflow-auto">
        {collections.map(c => (
          <div
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => setActive(c.id)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(c.id); } }}
            className={cn('w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer hover:bg-accent/50',
              active === c.id && 'bg-accent text-accent-foreground')}
          >
            <FolderOpen className="h-3 w-3" />
            <span className="flex-1 truncate">{c.name}</span>
            <Badge variant="secondary" className="text-[9px] h-4">{c.items.length}</Badge>
            <button type="button" onClick={(e) => { e.stopPropagation(); const n = prompt('Rename collection', c.name); if (n) renameCollection(c.id, n); }} title="Rename"><Pencil className="h-2.5 w-2.5 text-muted-foreground" /></button>
            <button type="button" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${c.name}?`)) deleteCollection(c.id); }} title="Delete"><Trash2 className="h-2.5 w-2.5 text-muted-foreground hover:text-rose-400" /></button>
          </div>
        ))}
      </div>
      <div className="border-t border-border/60 pt-2 px-3 text-[10px] uppercase tracking-wider text-muted-foreground">Items in {activeC?.name || '—'}</div>
      <ScrollArea className="flex-1 px-3 pb-3">
        {activeC?.items.length ? activeC.items.map(it => (
          <div key={it.id} className="group flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 mb-1">
            <div className="text-[11px] font-mono truncate flex-1">{it.value}</div>
            <button onClick={() => { navigator.clipboard.writeText(it.value); toast.success('Copied'); }}><Copy className="h-3 w-3 text-muted-foreground hover:text-foreground" /></button>
            <button onClick={() => removeFromCollection(activeC.id, it.id)}><X className="h-3 w-3 text-muted-foreground hover:text-rose-400" /></button>
          </div>
        )) : <div className="text-center text-xs text-muted-foreground py-6">Empty</div>}
      </ScrollArea>
    </div>
  );
}
