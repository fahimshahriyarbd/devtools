'use client';
import dynamic from 'next/dynamic';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GitCompareArrows, Copy, ArrowLeftRight, Eraser, Play, Pencil, ClipboardPaste } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';

const Editor = dynamic(() => import('@monaco-editor/react').then(m => m.default), { ssr: false });
const DiffEditor = dynamic(() => import('@monaco-editor/react').then(m => m.DiffEditor), { ssr: false });

const LANGS = ['plaintext', 'javascript', 'typescript', 'json', 'html', 'css', 'python', 'java', 'go', 'rust', 'sql', 'yaml', 'xml', 'markdown'];

const EXAMPLE_A = '';
const EXAMPLE_B = '';

export default function TextComparePage() {
  const { resolvedTheme } = useTheme();
  const [mode, setMode] = useState('edit'); // 'edit' | 'diff'
  const [language, setLanguage] = useState('javascript');
  const [renderSideBySide, setSideBySide] = useState(true);
  const [ignoreWhitespace, setIgnoreWs] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);

  // Live editor refs (source of truth in edit mode)
  const originalRef = useRef(EXAMPLE_A);
  const modifiedRef = useRef(EXAMPLE_B);
  const origEditorRef = useRef(null);
  const modEditorRef = useRef(null);
  const diffEditorRef = useRef(null);

  // Snapshots used for diff (only updated when "Compare" clicked)
  const [snapshot, setSnapshot] = useState({ a: EXAMPLE_A, b: EXAMPLE_B, key: 0 });
  const [stats, setStats] = useState({ added: 0, removed: 0 });

  const [editVersion, setEditVersion] = useState(0); // bump to force editor reload

  // Keep BOTH panes of the diff editor in sync with wordWrap toggle.
  // Monaco's DiffEditor has TWO internal override layers (wordWrapOverride1 + wordWrapOverride2)
  // that block wrap on the original (left, read-only) pane. We must set BOTH overrides,
  // not just `wordWrap`, for wrap to actually take effect on the original pane.
  useEffect(() => {
    const ed = diffEditorRef.current;
    if (!ed) return;
    const value = wordWrap ? 'on' : 'off';
    // In INLINE mode, the original (left) editor isn't rendered — but Monaco
    // still uses its computed line heights to lay out the inline view zones.
    // If we let the original editor wrap (override1/2 = 'on'), the unchanged
    // rows in the inline diff get inflated with huge gaps. Keep wrap OFF on
    // the original pane in inline mode; only the modified pane wraps.
    const isInline = mode === 'diff' && !renderSideBySide;
    const origVal = isInline ? 'off' : value;
    const origOpts = {
      wordWrap: origVal,
      wordWrapOverride1: origVal,
      wordWrapOverride2: origVal,
      wrappingStrategy: 'advanced',
    };
    const modOpts = {
      wordWrap: value,
      wordWrapOverride1: value,
      wordWrapOverride2: value,
      wrappingStrategy: 'advanced',
    };
    try { ed.updateOptions({ diffWordWrap: value }); } catch { /* noop */ }
    const orig = ed.getOriginalEditor();
    const mod = ed.getModifiedEditor();
    orig.updateOptions(origOpts);
    mod.updateOptions(modOpts);
    requestAnimationFrame(() => {
      try { orig.layout(); mod.layout(); } catch { /* noop */ }
    });
  }, [wordWrap, mode, renderSideBySide]);

  const beforeMountDiff = (monaco) => {
    monaco.editor.defineTheme('devhub-dark', {
      base: 'vs-dark', inherit: true, rules: [],
      colors: {
        'diffEditor.insertedLineBackground': '#22c55e1f',
        'diffEditor.removedLineBackground': '#ef44441f',
        'diffEditor.insertedTextBackground': '#22c55e80',
        'diffEditor.removedTextBackground': '#ef444480',
        'diffEditorGutter.insertedLineBackground': '#22c55e22',
        'diffEditorGutter.removedLineBackground': '#ef444422',
      },
    });
    monaco.editor.defineTheme('devhub-light', {
      base: 'vs', inherit: true, rules: [],
      colors: {
        'diffEditor.insertedLineBackground': '#16a34a1f',
        'diffEditor.removedLineBackground': '#dc26261f',
        'diffEditor.insertedTextBackground': '#16a34a80',
        'diffEditor.removedTextBackground': '#dc262680',
        'diffEditorGutter.insertedLineBackground': '#16a34a22',
        'diffEditorGutter.removedLineBackground': '#dc262622',
      },
    });
  };

  const compute = (a, b) => {
    const la = a.split('\n'); const lb = b.split('\n');
    const setA = new Set(la); const setB = new Set(lb);
    let added = 0, removed = 0;
    for (const l of lb) if (!setA.has(l)) added++;
    for (const l of la) if (!setB.has(l)) removed++;
    return { added, removed };
  };

  const runCompare = useCallback(() => {
    const a = origEditorRef.current?.getValue() ?? originalRef.current;
    const b = modEditorRef.current?.getValue() ?? modifiedRef.current;
    originalRef.current = a;
    modifiedRef.current = b;
    setSnapshot({ a, b, key: Date.now() });
    setStats(compute(a, b));
    setMode('diff');
  }, []);

  const goEdit = () => setMode('edit');

  const swap = () => {
    if (mode === 'edit') {
      const a = origEditorRef.current?.getValue() ?? originalRef.current;
      const b = modEditorRef.current?.getValue() ?? modifiedRef.current;
      originalRef.current = b;
      modifiedRef.current = a;
      setEditVersion(v => v + 1);
    } else {
      setSnapshot(s => ({ a: s.b, b: s.a, key: Date.now() }));
      setStats(s => ({ added: s.removed, removed: s.added }));
    }
  };

  const clear = () => {
    originalRef.current = '';
    modifiedRef.current = '';
    if (mode === 'edit') {
      setEditVersion(v => v + 1);
    } else {
      setSnapshot({ a: '', b: '', key: Date.now() });
      setStats({ added: 0, removed: 0 });
    }
  };

  // Show this page's toasts at the bottom-right (overrides the global top-right Toaster).
  const TOAST_POS = { position: 'bottom-right' };

  const copyResult = () => {
    const val = mode === 'edit'
      ? (modEditorRef.current?.getValue() ?? modifiedRef.current)
      : snapshot.b;
    try { navigator.clipboard.writeText(val); } catch { /* noop */ }
    toast.success('Copied modified', TOAST_POS);
  };

  const pasteInto = useCallback(async (which) => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        toast.error('Clipboard is empty', { position: 'bottom-right' });
        return;
      }
      const editor = which === 'original' ? origEditorRef.current : modEditorRef.current;
      if (editor) {
        const sel = editor.getSelection();
        const id = { major: 1, minor: 1 };
        editor.executeEdits('paste-button', [{ identifier: id, range: sel, text, forceMoveMarkers: true }]);
        editor.pushUndoStop();
        editor.focus();
      } else {
        // Editor not mounted yet — seed the value via re-key
        if (which === 'original') originalRef.current = text;
        else modifiedRef.current = text;
        setEditVersion(v => v + 1);
      }
      toast.success(`Pasted into ${which === 'original' ? 'Original' : 'Modified'}`, { position: 'bottom-right' });
    } catch (e) {
      toast.error('Clipboard access denied. Use Ctrl/⌘+V instead.', { position: 'bottom-right' });
    }
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <header className="flex flex-wrap items-center gap-3 p-4 border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="flex items-center gap-2 mr-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 grid place-items-center">
            <GitCompareArrows className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="font-semibold leading-tight">Text Compare</div>
            <div className="text-[11px] text-muted-foreground">{mode === 'edit' ? 'Edit both panes, then Compare' : 'Diff view'}</div>
          </div>
        </div>

        {mode === 'diff' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">+{stats.added}</span>
            <span className="px-2 py-1 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">−{stats.removed}</span>
          </div>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{LANGS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
          </Select>

          {mode === 'diff' && (
            <>
              <Tabs value={renderSideBySide ? 'side' : 'inline'} onValueChange={(v) => setSideBySide(v === 'side')}>
                <TabsList className="h-9">
                  <TabsTrigger value="side" className="text-xs">Side by side</TabsTrigger>
                  <TabsTrigger value="inline" className="text-xs">Inline</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-2">
                <Switch id="ws" checked={ignoreWhitespace} onCheckedChange={setIgnoreWs} />
                <Label htmlFor="ws" className="text-xs">Ignore whitespace</Label>
              </div>
            </>
          )}

          <div className="flex items-center gap-2">
            <Switch id="wrap" checked={wordWrap} onCheckedChange={setWordWrap} />
            <Label htmlFor="wrap" className="text-xs">Wrap</Label>
          </div>

          <Button variant="outline" size="sm" onClick={swap}><ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />Swap</Button>
          <Button variant="outline" size="sm" onClick={clear}><Eraser className="h-3.5 w-3.5 mr-1.5" />Clear</Button>
          <Button variant="outline" size="sm" onClick={copyResult}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />Copy result
          </Button>

          {mode === 'edit' ? (
            <Button
              size="sm"
              onClick={runCompare}
              className="bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600 text-white"
            >
              <Play className="h-3.5 w-3.5 mr-1.5" /> Compare
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={goEdit}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0 p-4">
        {mode === 'edit' ? (
          <div className="grid grid-cols-2 gap-3 h-full">
            <EditorPane
              title="Original"
              value={originalRef.current}
              language={language}
              theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
              wordWrap={wordWrap}
              version={editVersion}
              onMount={(ed) => { origEditorRef.current = ed; }}
              onChange={(v) => { originalRef.current = v; }}
              onPaste={() => pasteInto('original')}
              testId="original"
              accent="from-orange-500/30 to-rose-500/30"
            />
            <EditorPane
              title="Modified"
              value={modifiedRef.current}
              language={language}
              theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
              wordWrap={wordWrap}
              version={editVersion}
              onMount={(ed) => { modEditorRef.current = ed; }}
              onChange={(v) => { modifiedRef.current = v; }}
              onPaste={() => pasteInto('modified')}
              testId="modified"
              accent="from-blue-500/30 to-violet-500/30"
            />
          </div>
        ) : (
          <Card className="glass h-full overflow-hidden diff-outer-scroll">
            <DiffEditor
              key={`${snapshot.key}-${renderSideBySide ? 'sbs' : 'inl'}`}
              height="100%"
              original={snapshot.a}
              modified={snapshot.b}
              language={language}
              theme={resolvedTheme === 'dark' ? 'devhub-dark' : 'devhub-light'}
              beforeMount={beforeMountDiff}
              onMount={(ed) => {
                diffEditorRef.current = ed;
                const orig = ed.getOriginalEditor();
                const mod = ed.getModifiedEditor();
                orig.updateOptions({ scrollbar: { horizontal: 'hidden', vertical: 'visible', verticalScrollbarSize: 8 } });
                mod.updateOptions({ scrollbar: { horizontal: 'visible', vertical: 'visible', verticalScrollbarSize: 8, horizontalScrollbarSize: 8 } });
                // Force-apply wordWrap. Monaco's DiffEditor sets wordWrapOverride
                // internally on the original editor and caches the layout. We
                // replicate the user's "toggle off → on" so it sticks on mount.
                // NOTE: in INLINE mode the original editor isn't rendered but
                // its line-heights still drive the inline view-zone gaps —
                // keep wrap OFF on the original in that case.
                const value = wordWrap ? 'on' : 'off';
                const origTarget = renderSideBySide ? value : 'off';
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
                renderSideBySide,
                ignoreTrimWhitespace: ignoreWhitespace,
                wordWrap: wordWrap ? 'on' : 'off',
                diffWordWrap: wordWrap ? 'on' : 'off',
                readOnly: true,
                automaticLayout: true,
                minimap: { enabled: false },
                fontSize: 13,
                scrollBeyondLastLine: false,
                renderMarginRevertIcon: false,
                diffAlgorithm: 'advanced',
                hideUnchangedRegions: { enabled: false },
                scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
              }}
            />
          </Card>
        )}
      </div>
    </div>
  );
}

function EditorPane({ title, value, language, theme, wordWrap, version, onMount, onChange, accent, onPaste, testId }) {
  return (
    <Card className="glass relative overflow-hidden flex flex-col h-full">
      <div className={`absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br ${accent} opacity-30 blur-2xl pointer-events-none`} />
      <div className="px-3 py-2 border-b border-border/60 text-[11px] uppercase tracking-wider text-muted-foreground flex items-center justify-between">
        <span>{title}</span>
        <div className="flex items-center gap-2">
          {onPaste && (
            <button
              type="button"
              onClick={onPaste}
              data-testid={`paste-btn-${testId || title.toLowerCase()}`}
              className="inline-flex items-center gap-1 normal-case font-medium px-2 py-0.5 rounded-md border border-border/60 bg-background/40 text-foreground/80 hover:bg-accent/60 hover:text-foreground transition"
              title="Paste from clipboard"
            >
              <ClipboardPaste className="h-3 w-3" /> Paste
            </button>
          )}
          <span className="font-mono normal-case text-muted-foreground/70">{language}</span>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <Editor
          key={version}
          height="100%"
          defaultValue={value}
          language={language}
          theme={theme}
          onMount={onMount}
          onChange={(v) => onChange(v ?? '')}
          options={{
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 13,
            wordWrap: wordWrap ? 'on' : 'off',
            scrollBeyondLastLine: false,
            padding: { top: 8 },
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, alwaysConsumeMouseWheel: false },
          }}
        />
      </div>
    </Card>
  );
}
