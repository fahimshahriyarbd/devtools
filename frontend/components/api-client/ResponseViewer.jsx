'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Download, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function statusColor(status) {
  if (!status) return 'bg-muted text-muted-foreground border-border';
  if (status < 200) return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
  if (status < 300) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (status < 400) return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
  if (status < 500) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
}

function fmtSize(n) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function tryPrettyJson(text) {
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return null; }
}

function JsonNode({ name, value, depth = 0 }) {
  const [open, setOpen] = useState(depth < 2);
  const isArr = Array.isArray(value);
  const isObj = value && typeof value === 'object';
  if (!isObj) {
    let cls = 'text-emerald-300';
    if (typeof value === 'number') cls = 'text-amber-300';
    else if (typeof value === 'boolean') cls = 'text-blue-300';
    else if (value === null) cls = 'text-muted-foreground italic';
    const disp = value === null ? 'null' : typeof value === 'string' ? `"${value}"` : String(value);
    return (
      <div className="flex gap-2 font-mono text-[12px]">
        {name != null && <span className="text-violet-300">{typeof name === 'number' ? name : `"${name}"`}</span>}
        {name != null && <span className="text-muted-foreground">:</span>}
        <span className={cls}>{disp}</span>
      </div>
    );
  }
  const entries = isArr ? value.map((v, i) => [i, v]) : Object.entries(value);
  return (
    <div className="font-mono text-[12px]">
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {name != null && <span className="text-violet-300">{typeof name === 'number' ? name : `"${name}"`}:</span>}
        <span className="text-muted-foreground">{isArr ? `[${entries.length}]` : `{${entries.length}}`}</span>
      </button>
      {open && (
        <div className="ml-4 border-l border-border/50 pl-3 mt-0.5 space-y-0.5">
          {entries.map(([k, v]) => (
            <JsonNode key={String(k)} name={k} value={v} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ResponseViewer({ response, running }) {
  const [view, setView] = useState('body');
  const [bodyMode, setBodyMode] = useState('pretty');

  if (running) {
    return (
      <Card className="h-full grid place-items-center text-sm text-muted-foreground">
        <div className="animate-pulse">Sending request…</div>
      </Card>
    );
  }

  if (!response) {
    return (
      <Card className="h-full grid place-items-center text-sm text-muted-foreground p-8 text-center">
        <div>
          <div className="font-medium mb-1">No response yet</div>
          <div className="text-xs">Send a request to see the response here.</div>
        </div>
      </Card>
    );
  }

  if (response.error) {
    return (
      <Card className="h-full p-6 border-rose-500/30 bg-rose-500/5">
        <div className="text-rose-300 font-medium mb-2">Request failed</div>
        <div className="text-sm text-rose-200/80 font-mono break-words">{response.error}</div>
        <div className="text-xs text-muted-foreground mt-4">Elapsed: {response.ms} ms</div>
        <div className="text-xs text-muted-foreground mt-2">Tip: if this is a browser CORS block, toggle the <span className="font-mono">Proxy</span> setting.</div>
      </Card>
    );
  }

  const prettyJson = tryPrettyJson(response.body);
  const copyBody = async () => {
    try { await navigator.clipboard.writeText(response.body || ''); toast.success('Body copied'); }
    catch { toast.error('Copy failed'); }
  };
  const downloadBody = () => {
    const blob = new Blob([response.body || ''], { type: response.headers?.['content-type'] || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'response';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const testResults = response.testResults || [];
  const passed = testResults.filter((t) => t.pass).length;
  const failed = testResults.length - passed;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-border/60 bg-card/40 flex-wrap">
        <Badge className={cn('border', statusColor(response.status))} data-testid="response-status">
          {response.status} {response.statusText}
        </Badge>
        <div className="text-[11px] text-muted-foreground">Time: <span className="font-mono text-foreground">{response.ms} ms</span></div>
        <div className="text-[11px] text-muted-foreground">Size: <span className="font-mono text-foreground">{fmtSize(response.size)}</span></div>
        {testResults.length > 0 && (
          <div className="text-[11px] flex items-center gap-2">
            <span className="text-emerald-300">✓ {passed} passed</span>
            {failed > 0 && <span className="text-rose-300">✗ {failed} failed</span>}
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={copyBody} data-testid="response-copy">
            <Copy className="h-3 w-3 mr-1" /> Copy
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={downloadBody} data-testid="response-download">
            <Download className="h-3 w-3 mr-1" /> Download
          </Button>
        </div>
      </div>

      <Tabs value={view} onValueChange={setView} className="px-3 pt-2">
        <TabsList className="h-8">
          <TabsTrigger value="body" className="h-6 text-xs">Body</TabsTrigger>
          <TabsTrigger value="headers" className="h-6 text-xs">Headers ({Object.keys(response.headers || {}).length})</TabsTrigger>
          <TabsTrigger value="cookies" className="h-6 text-xs">Cookies ({(response.cookies || []).length})</TabsTrigger>
          <TabsTrigger value="tests" className="h-6 text-xs">Tests ({testResults.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex-1 min-h-0">
        {view === 'body' && (
          <div className="h-full flex flex-col">
            <div className="px-3 py-2 flex items-center gap-2">
              <Tabs value={bodyMode} onValueChange={setBodyMode}>
                <TabsList className="h-7">
                  {prettyJson && <TabsTrigger value="tree" className="h-5 text-[11px]">Tree</TabsTrigger>}
                  <TabsTrigger value="pretty" className="h-5 text-[11px]">Pretty</TabsTrigger>
                  <TabsTrigger value="raw" className="h-5 text-[11px]">Raw</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <ScrollArea className="flex-1 min-h-0 px-3 pb-3">
              {bodyMode === 'tree' && prettyJson ? (
                <div className="bg-muted/30 rounded-md p-3 overflow-auto">
                  <JsonNode value={JSON.parse(response.body)} />
                </div>
              ) : (
                <pre className="text-[12px] font-mono whitespace-pre-wrap break-words bg-muted/30 rounded-md p-3" data-testid="response-body">
                  {bodyMode === 'pretty' && prettyJson ? prettyJson : (response.body || '')}
                </pre>
              )}
            </ScrollArea>
          </div>
        )}
        {view === 'headers' && (
          <ScrollArea className="h-full px-3 py-2">
            <table className="w-full text-[12px] font-mono">
              <tbody>
                {Object.entries(response.headers || {}).map(([k, v]) => (
                  <tr key={k} className="border-b border-border/40">
                    <td className="py-1.5 pr-4 text-violet-300 align-top w-[280px] break-all">{k}</td>
                    <td className="py-1.5 break-all text-foreground/90">{String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        )}
        {view === 'cookies' && (
          <ScrollArea className="h-full px-3 py-2">
            {(response.cookies || []).length === 0 ? (
              <div className="text-xs text-muted-foreground p-6">No cookies set by the response.</div>
            ) : (
              <ul className="space-y-1 text-[12px] font-mono">
                {response.cookies.map((c, i) => <li key={i} className="break-all">{c}</li>)}
              </ul>
            )}
          </ScrollArea>
        )}
        {view === 'tests' && (
          <ScrollArea className="h-full px-3 py-2">
            {testResults.length === 0 ? (
              <div className="text-xs text-muted-foreground p-6">No tests were run for this request.</div>
            ) : (
              <ul className="space-y-1">
                {testResults.map((t, i) => (
                  <li key={i} className={cn('text-[12px] px-3 py-2 rounded-md border', t.pass ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-rose-500/10 border-rose-500/30 text-rose-200')}>
                    <div className="font-medium">{t.pass ? '✓' : '✗'} {t.name}</div>
                    {t.message && <div className="text-[11px] mt-0.5 font-mono opacity-80">{t.message}</div>}
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
