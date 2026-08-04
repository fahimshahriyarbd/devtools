'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Send, Save, Code, Settings2 } from 'lucide-react';
import KeyValueEditor from './KeyValueEditor';
import AuthEditor from './AuthEditor';
import BodyEditor from './BodyEditor';
import { cn } from '@/lib/utils';

const Editor = dynamic(() => import('@monaco-editor/react').then((m) => m.default), { ssr: false });

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const METHOD_COLOR = {
  GET: 'text-emerald-400',
  POST: 'text-amber-400',
  PUT: 'text-blue-400',
  PATCH: 'text-violet-400',
  DELETE: 'text-rose-400',
  HEAD: 'text-cyan-400',
  OPTIONS: 'text-fuchsia-400',
};

function paramsCount(rows) { return (rows || []).filter((r) => r.enabled !== false && r.key).length; }

export default function RequestBuilder({
  tab,
  request,
  onChange,
  onSend,
  onSave,
  onOpenCode,
  activePane,
  onActivePaneChange,
  activeEnvName,
  running,
}) {
  const { theme } = useTheme();
  const set = (patch) => onChange({ ...request, ...patch });
  const [urlFocus, setUrlFocus] = useState(false);

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* URL bar */}
      <div className="px-3 py-2 flex flex-wrap items-center gap-2 border-b border-border/60 bg-card/20">
        <Select value={request.method} onValueChange={(v) => set({ method: v })}>
          <SelectTrigger className={cn('h-9 w-[110px] font-mono font-bold text-xs', METHOD_COLOR[request.method] || 'text-muted-foreground')} data-testid="method-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METHODS.map((m) => (
              <SelectItem key={m} value={m} className={cn('font-mono font-bold', METHOD_COLOR[m])} data-testid={`method-opt-${m}`}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1 min-w-[240px] relative">
          <Input
            value={request.url}
            onChange={(e) => set({ url: e.target.value })}
            placeholder="Enter request URL (use {{variable}} for env vars)"
            className="h-9 font-mono text-sm"
            onFocus={() => setUrlFocus(true)}
            onBlur={() => setUrlFocus(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSend(); }}
            data-testid="url-input"
          />
        </div>
        <Button onClick={onSend} disabled={running} className="h-9 bg-violet-500 hover:bg-violet-600 text-white" data-testid="send-btn">
          <Send className="h-3.5 w-3.5 mr-1.5" /> {running ? 'Sending…' : 'Send'}
        </Button>
        <Button variant="outline" onClick={onSave} className="h-9" data-testid="save-btn">
          <Save className="h-3.5 w-3.5 mr-1.5" /> Save
        </Button>
        <Button variant="outline" onClick={onOpenCode} className="h-9" data-testid="code-btn">
          <Code className="h-3.5 w-3.5 mr-1.5" /> Code
        </Button>
      </div>

      {/* Env + settings pill row */}
      <div className="px-3 py-1.5 flex items-center gap-3 border-b border-border/60 text-[11px] text-muted-foreground bg-card/10">
        <span>Env: <span className="text-foreground font-medium">{activeEnvName || 'none'}</span></span>
        <div className="flex items-center gap-1.5 ml-auto">
          <Switch id={`proxy-${tab.id}`} checked={!!request.settings?.useProxy} onCheckedChange={(v) => set({ settings: { ...request.settings, useProxy: v } })} className="scale-75" data-testid="proxy-toggle" />
          <Label htmlFor={`proxy-${tab.id}`} className="text-[11px] cursor-pointer">Proxy (bypass CORS)</Label>
        </div>
        <div className="flex items-center gap-1.5">
          <Switch id={`redir-${tab.id}`} checked={request.settings?.followRedirects !== false} onCheckedChange={(v) => set({ settings: { ...request.settings, followRedirects: v } })} className="scale-75" />
          <Label htmlFor={`redir-${tab.id}`} className="text-[11px] cursor-pointer">Follow redirects</Label>
        </div>
      </div>

      {/* Panes */}
      <Tabs value={activePane} onValueChange={onActivePaneChange} className="px-3 pt-2">
        <TabsList className="h-8">
          <TabsTrigger value="params" className="h-6 text-xs" data-testid="pane-params">
            Params{paramsCount(request.params) > 0 && <Badge variant="secondary" className="ml-1.5 h-4 text-[9px] px-1">{paramsCount(request.params)}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="auth" className="h-6 text-xs" data-testid="pane-auth">Authorization</TabsTrigger>
          <TabsTrigger value="headers" className="h-6 text-xs" data-testid="pane-headers">
            Headers{paramsCount(request.headers) > 0 && <Badge variant="secondary" className="ml-1.5 h-4 text-[9px] px-1">{paramsCount(request.headers)}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="body" className="h-6 text-xs" data-testid="pane-body">
            Body{request.body?.type !== 'none' && <span className="ml-1.5 text-[9px] text-violet-300">•</span>}
          </TabsTrigger>
          <TabsTrigger value="tests" className="h-6 text-xs" data-testid="pane-tests">Tests</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex-1 min-h-0 overflow-auto scrollbar-thin px-3 py-3">
        {activePane === 'params' && (
          <KeyValueEditor rows={request.params} onChange={(rows) => set({ params: rows })} keyPlaceholder="Key" valuePlaceholder="Value" testIdPrefix="params" />
        )}
        {activePane === 'headers' && (
          <KeyValueEditor rows={request.headers} onChange={(rows) => set({ headers: rows })} keyPlaceholder="Header" valuePlaceholder="Value" testIdPrefix="headers" />
        )}
        {activePane === 'auth' && (
          <AuthEditor auth={request.auth} onChange={(auth) => set({ auth })} />
        )}
        {activePane === 'body' && (
          <BodyEditor body={request.body} onChange={(body) => set({ body })} theme={theme} />
        )}
        {activePane === 'tests' && (
          <div className="space-y-2">
            <div className="text-[11px] text-muted-foreground">
              Write JavaScript that runs after the response. Available: <span className="font-mono">pm.response</span>, <span className="font-mono">pm.test(name, fn)</span>, <span className="font-mono">pm.expect(v)</span>.
            </div>
            <div className="h-[300px] border border-border/60 rounded-md overflow-hidden">
              <Editor
                value={request.tests || ''}
                onChange={(v) => set({ tests: v || '' })}
                language="javascript"
                theme={theme === 'dark' ? 'vs-dark' : 'light'}
                options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: 'on', scrollBeyondLastLine: false, automaticLayout: true }}
              />
            </div>
            <details className="text-[11px] text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">Example snippets</summary>
              <pre className="mt-2 p-3 bg-muted/30 rounded-md font-mono whitespace-pre-wrap">{`pm.test("status is 200", () => {
  pm.expect(pm.response.status).toBe(200);
});

pm.test("response has id field", () => {
  const body = pm.response.json();
  pm.expect(body).toBeTruthy();
  pm.expect(body.id).toBeTruthy();
});

pm.test("responds under 500 ms", () => {
  pm.expect(pm.response.time).toBeLessThan(500);
});`}</pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
