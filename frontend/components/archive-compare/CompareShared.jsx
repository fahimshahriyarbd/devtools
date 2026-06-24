'use client';
import dynamic from 'next/dynamic';
import { useRef, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Minus, Pencil, FileCode, ChevronRight, Download, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const DiffEditor = dynamic(() => import('@monaco-editor/react').then(m => m.DiffEditor), { ssr: false });
const Editor = dynamic(() => import('@monaco-editor/react').then(m => m.default), { ssr: false });

/* ---------- helpers ---------- */

export const TEXT_EXT = /\.(txt|md|json|js|jsx|ts|tsx|html|css|scss|less|xml|yaml|yml|toml|ini|env|conf|sh|bash|py|go|rs|rb|php|java|kt|swift|c|cc|cpp|h|hpp|sql|csv|log|gitignore|gitattributes|prettierrc|eslintrc|babelrc|dockerfile)$/i;

export const LANG_MAP = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  json: 'json', html: 'html', css: 'css', scss: 'scss', md: 'markdown',
  py: 'python', go: 'go', rs: 'rust', rb: 'ruby', php: 'php', java: 'java',
  c: 'c', cc: 'cpp', cpp: 'cpp', h: 'cpp', hpp: 'cpp', sql: 'sql', sh: 'shell',
  bash: 'shell', xml: 'xml', yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini',
  conf: 'ini', env: 'ini', txt: 'plaintext', log: 'plaintext', csv: 'plaintext',
};

export function isTextLike(path) { return TEXT_EXT.test(path); }
export function langFromPath(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  return LANG_MAP[ext] || 'plaintext';
}
export function decodeText(bytes) {
  if (!bytes) return null;
  try { return new TextDecoder('utf-8', { fatal: false }).decode(bytes); } catch { return ''; }
}
export function fmtSize(b) {
  if (b == null) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

export async function hashBytes(bytes) {
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ---------- diff computation ---------- */

export function computeDiff(left, right) {
  if (!left || !right) return null;
  const mapL = new Map(left.entries.map(e => [e.path, e]));
  const mapR = new Map(right.entries.map(e => [e.path, e]));
  const all = new Set([...mapL.keys(), ...mapR.keys()]);
  const rows = [];
  for (const p of all) {
    const a = mapL.get(p); const b = mapR.get(p);
    let status;
    if (a && !b) status = 'removed';
    else if (!a && b) status = 'added';
    else if (a.hash !== b.hash) status = 'modified';
    else status = 'unchanged';
    rows.push({ path: p, status, left: a, right: b });
  }
  rows.sort((x, y) => x.path.localeCompare(y.path));
  const stats = rows.reduce((s, r) => { s[r.status]++; return s; }, { added: 0, removed: 0, modified: 0, unchanged: 0 });
  return { rows, stats };
}

/* ---------- presentational components ---------- */

export function RowItem({ row, selected, onClick }) {
  const Icon = row.status === 'added' ? Plus : row.status === 'removed' ? Minus : row.status === 'modified' ? Pencil : FileCode;
  const color = row.status === 'added' ? 'text-emerald-400' : row.status === 'removed' ? 'text-rose-400' : row.status === 'modified' ? 'text-blue-400' : 'text-muted-foreground';
  const dotBg = row.status === 'added' ? 'bg-emerald-500/10' : row.status === 'removed' ? 'bg-rose-500/10' : row.status === 'modified' ? 'bg-blue-500/10' : 'bg-muted/40';
  return (
    <button onClick={onClick}
      data-testid={`compare-row-${row.path}`}
      className={cn('w-full text-left flex items-center gap-3 px-3 py-2 rounded-md text-sm font-mono group transition',
        selected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50')}
    >
      <span className={cn('h-6 w-6 rounded-md grid place-items-center shrink-0', dotBg)}>
        <Icon className={cn('h-3.5 w-3.5', color)} />
      </span>
      <span className="truncate flex-1">{row.path}</span>
      <span className="text-[10px] text-muted-foreground hidden sm:inline">
        {row.status === 'added' && fmtSize(row.right?.size)}
        {row.status === 'removed' && fmtSize(row.left?.size)}
        {row.status === 'modified' && `${fmtSize(row.left?.size)} → ${fmtSize(row.right?.size)}`}
        {row.status === 'unchanged' && fmtSize(row.left?.size)}
      </span>
      <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition" />
    </button>
  );
}

export function StatusBadge({ status }) {
  const cls = {
    added: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    removed: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
    modified: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    unchanged: 'bg-muted text-muted-foreground border-border',
  }[status];
  return <Badge className={cn('border', cls)}>{status}</Badge>;
}

/* ---------- full-screen preview ---------- */

export function PreviewDialog({ row, prev, next, onPrev, onNext, onClose, theme, sideBySide, setSideBySide, ignoreWs, setIgnoreWs, wrap, setWrap, baseLabel = 'Base', compareLabel = 'Compare' }) {
  const isText = isTextLike(row.path);
  const leftText = isText ? decodeText(row.left?.bytes) : null;
  const rightText = isText ? decodeText(row.right?.bytes) : null;
  const lang = langFromPath(row.path);
  const diffEditorRef = useRef(null);

  useEffect(() => {
    const ed = diffEditorRef.current;
    if (!ed) return;
    const value = wrap ? 'on' : 'off';
    // In INLINE mode, the original editor isn't rendered but its line heights
    // drive inline view-zone gaps. Keep wrap OFF on the original in inline.
    const origVal = sideBySide ? value : 'off';
    const origOpts = {
      wordWrap: origVal, wordWrapOverride1: origVal, wordWrapOverride2: origVal, wrappingStrategy: 'advanced',
    };
    const modOpts = {
      wordWrap: value, wordWrapOverride1: value, wordWrapOverride2: value, wrappingStrategy: 'advanced',
    };
    try { ed.updateOptions({ diffWordWrap: value }); } catch { /* noop */ }
    const orig = ed.getOriginalEditor();
    const mod = ed.getModifiedEditor();
    orig.updateOptions(origOpts);
    mod.updateOptions(modOpts);
    requestAnimationFrame(() => {
      try { orig.layout(); mod.layout(); } catch { /* noop */ }
    });
  }, [wrap, sideBySide, row?.path]);

  const download = (which) => {
    const entry = which === 'L' ? row.left : row.right;
    if (!entry) return;
    const blob = new Blob([entry.bytes]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = row.path.split('/').pop();
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-border/60 bg-card/40 backdrop-blur shrink-0">
        <Button size="sm" variant="ghost" onClick={onClose} data-testid="preview-close-btn">
          <X className="h-4 w-4 mr-1" /> Close
        </Button>
        <div className="h-5 w-px bg-border" />
        <StatusBadge status={row.status} />
        <div className="font-mono text-sm truncate flex-1 min-w-[200px]" title={row.path}>{row.path}</div>

        <div className="hidden md:flex items-center gap-3 text-xs text-muted-foreground">
          {row.left && <span>{baseLabel}: {fmtSize(row.left.size)}</span>}
          {row.left && row.right && <span>→</span>}
          {row.right && <span>{compareLabel}: {fmtSize(row.right.size)}</span>}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {isText && row.status === 'modified' && (
            <>
              <div className="hidden sm:flex items-center gap-2">
                <Switch id="ws" checked={ignoreWs} onCheckedChange={setIgnoreWs} />
                <Label htmlFor="ws" className="text-xs">Ignore whitespace</Label>
              </div>
              <Tabs value={sideBySide ? 'side' : 'inline'} onValueChange={(v) => setSideBySide(v === 'side')}>
                <TabsList className="h-8">
                  <TabsTrigger value="side" className="text-xs h-6">Side by side</TabsTrigger>
                  <TabsTrigger value="inline" className="text-xs h-6">Inline</TabsTrigger>
                </TabsList>
              </Tabs>
            </>
          )}
          {isText && (
            <div className="hidden sm:flex items-center gap-2">
              <Switch id="wrap" checked={wrap} onCheckedChange={setWrap} />
              <Label htmlFor="wrap" className="text-xs">Wrap</Label>
            </div>
          )}
          {row.left && <Button size="sm" variant="outline" onClick={() => download('L')}><Download className="h-3.5 w-3.5 mr-1.5" />{baseLabel}</Button>}
          {row.right && <Button size="sm" variant="outline" onClick={() => download('R')}><Download className="h-3.5 w-3.5 mr-1.5" />{compareLabel}</Button>}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 relative diff-outer-scroll">
        {isText ? (
          (row.status === 'modified' || row.status === 'unchanged') ? (
            <DiffEditor
              key={`${row.path}-${sideBySide ? 'sbs' : 'inl'}`}
              height="100%"
              original={leftText || ''}
              modified={rightText || ''}
              language={lang}
              theme={theme === 'dark' ? 'devhub-dark' : 'devhub-light'}
              beforeMount={(monaco) => {
                if (monaco.editor.__devhubThemesDefined) return;
                monaco.editor.__devhubThemesDefined = true;
                monaco.editor.defineTheme('devhub-dark', {
                  base: 'vs-dark', inherit: true, rules: [],
                  colors: {
                    'diffEditor.insertedLineBackground': '#22c55e1f',
                    'diffEditor.removedLineBackground': '#ef44441f',
                    'diffEditor.insertedTextBackground': '#22c55e80',
                    'diffEditor.removedTextBackground': '#ef444480',
                  },
                });
                monaco.editor.defineTheme('devhub-light', {
                  base: 'vs', inherit: true, rules: [],
                  colors: {
                    'diffEditor.insertedLineBackground': '#16a34a1f',
                    'diffEditor.removedLineBackground': '#dc26261f',
                    'diffEditor.insertedTextBackground': '#16a34a80',
                    'diffEditor.removedTextBackground': '#dc262680',
                  },
                });
              }}
              onMount={(ed) => {
                diffEditorRef.current = ed;
                const orig = ed.getOriginalEditor();
                const mod = ed.getModifiedEditor();
                const baseScroll = { scrollbar: { vertical: 'visible', verticalScrollbarSize: 8, horizontalScrollbarSize: 8 } };
                orig.updateOptions(baseScroll);
                mod.updateOptions(baseScroll);
                const value = wrap ? 'on' : 'off';
                const origTarget = sideBySide ? value : 'off';
                const off = { wordWrap: 'off', wordWrapOverride1: 'off', wordWrapOverride2: 'off' };
                const origOn = { wordWrap: origTarget, wordWrapOverride1: origTarget, wordWrapOverride2: origTarget, wrappingStrategy: 'advanced' };
                const modOn = { wordWrap: value, wordWrapOverride1: value, wordWrapOverride2: value, wrappingStrategy: 'advanced' };
                orig.updateOptions(off); mod.updateOptions(off);
                requestAnimationFrame(() => {
                  orig.updateOptions(origOn); mod.updateOptions(modOn);
                  try { orig.layout(); mod.layout(); } catch { /* noop */ }
                });
              }}
              options={{
                renderSideBySide: sideBySide,
                ignoreTrimWhitespace: ignoreWs,
                readOnly: true,
                originalEditable: false,
                automaticLayout: true,
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: wrap ? 'on' : 'off',
                diffWordWrap: wrap ? 'on' : 'off',
                scrollBeyondLastLine: false,
                diffAlgorithm: 'advanced',
                hideUnchangedRegions: { enabled: false },
                scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
              }}
            />
          ) : (
            <SingleEditorView
              text={(row.status === 'added' ? rightText : leftText) || ''}
              lang={lang}
              theme={theme}
              kind={row.status}
              wrap={wrap}
            />
          )
        ) : (
          <BinaryView row={row} />
        )}
      </div>

      {/* Nav footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border/60 bg-card/40 backdrop-blur shrink-0 text-xs">
        <Button size="sm" variant="ghost" disabled={!prev} onClick={onPrev} data-testid="preview-prev-btn">
          ← Previous {prev && <span className="ml-1.5 text-muted-foreground font-mono truncate max-w-[200px]">{prev.path}</span>}
        </Button>
        <div className="text-muted-foreground hidden sm:block">Esc to close</div>
        <Button size="sm" variant="ghost" disabled={!next} onClick={onNext} data-testid="preview-next-btn">
          {next && <span className="mr-1.5 text-muted-foreground font-mono truncate max-w-[200px]">{next.path}</span>} Next →
        </Button>
      </div>
    </div>
  );
}

function SingleEditorView({ text, lang, theme, kind, wrap }) {
  const bannerCls = kind === 'added'
    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
    : 'bg-rose-500/10 text-rose-300 border-rose-500/30';
  return (
    <div className="h-full flex flex-col">
      <div className={cn('text-xs px-4 py-1.5 border-b', bannerCls)}>
        {kind === 'added' ? '✚ This file was added in the new side' : '− This file was removed in the new side'}
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          value={text}
          language={lang}
          theme={theme === 'dark' ? 'vs-dark' : 'light'}
          options={{ readOnly: true, automaticLayout: true, minimap: { enabled: false }, fontSize: 13, wordWrap: wrap ? 'on' : 'off', scrollBeyondLastLine: false, scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 } }}
        />
      </div>
    </div>
  );
}

function BinaryView({ row }) {
  const isImage = /\.(png|jpe?g|webp|gif|svg|bmp|ico)$/i.test(row.path);
  const [leftUrl, rightUrl] = useImageUrls(isImage ? row : null);
  if (isImage) {
    return (
      <div className="h-full grid grid-cols-1 md:grid-cols-2 gap-0">
        <ImagePane title="Base" url={leftUrl} entry={row.left} />
        <ImagePane title="Compare" url={rightUrl} entry={row.right} border />
      </div>
    );
  }
  return (
    <div className="h-full grid place-items-center text-center p-8">
      <div>
        <div className="mx-auto h-14 w-14 rounded-2xl bg-muted/50 grid place-items-center mb-3">
          <FileCode className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="font-medium mb-1">Binary file</div>
        <div className="text-sm text-muted-foreground">
          {row.left && <span>Base: {fmtSize(row.left.size)}</span>}
          {row.left && row.right && <span> · </span>}
          {row.right && <span>Compare: {fmtSize(row.right.size)}</span>}
        </div>
        {row.status === 'modified' && (
          <div className="mt-2 text-xs text-muted-foreground font-mono">
            Hash differs: {row.left.hash.slice(0, 8)}… vs {row.right.hash.slice(0, 8)}…
          </div>
        )}
      </div>
    </div>
  );
}

function useImageUrls(row) {
  const ref = useRef({ key: null, urls: [null, null] });
  const key = row ? row.path + (row.left?.hash || '') + (row.right?.hash || '') : null;
  if (ref.current.key !== key) {
    ref.current.urls.forEach(u => u && URL.revokeObjectURL(u));
    if (row) {
      const make = (e) => e ? URL.createObjectURL(new Blob([e.bytes])) : null;
      ref.current = { key, urls: [make(row.left), make(row.right)] };
    } else {
      ref.current = { key: null, urls: [null, null] };
    }
  }
  return ref.current.urls;
}

function ImagePane({ title, url, entry, border }) {
  return (
    <div className={cn('flex flex-col min-h-0 bg-card/30', border && 'border-l border-border/60')}>
      <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
        {title} {entry && <span className="ml-2 text-foreground/60 normal-case font-mono">{fmtSize(entry.size)}</span>}
      </div>
      <div className="flex-1 min-h-0 grid place-items-center p-4 overflow-auto scrollbar-thin">
        {url ? <img src={url} alt={title} className="max-w-full max-h-full object-contain rounded-md shadow-lg" /> :
          <span className="text-muted-foreground text-sm">— not present —</span>}
      </div>
    </div>
  );
}
