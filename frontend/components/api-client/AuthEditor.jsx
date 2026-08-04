'use client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// The Authorization pane. Postman-style dropdown to pick an auth flavour,
// then render the fields specific to that flavour. All changes flow up
// via patchAuth() so the request store stays the single source of truth.
export default function AuthEditor({ auth, onChange }) {
  const patch = (p) => onChange({ ...auth, ...p });
  const patchSub = (key, p) => onChange({ ...auth, [key]: { ...auth[key], ...p } });
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Label className="text-xs w-24 text-muted-foreground">Auth type</Label>
        <Select value={auth.type || 'none'} onValueChange={(v) => patch({ type: v })}>
          <SelectTrigger className="h-8 w-56" data-testid="auth-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Auth</SelectItem>
            <SelectItem value="bearer">Bearer Token</SelectItem>
            <SelectItem value="basic">Basic Auth</SelectItem>
            <SelectItem value="apikey">API Key</SelectItem>
            <SelectItem value="oauth2">OAuth 2.0</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {auth.type === 'none' && (
        <div className="text-xs text-muted-foreground p-4 rounded-md bg-muted/30">
          This request will be sent without any authorization headers.
        </div>
      )}

      {auth.type === 'bearer' && (
        <div className="space-y-2 w-full">
          <Label className="text-xs">Token</Label>
          <Input
            value={auth.bearer?.token || ''}
            onChange={(e) => patchSub('bearer', { token: e.target.value })}
            placeholder="eyJhbGciOi..."
            className="font-mono h-9 text-sm w-full"
            data-testid="auth-bearer-token"
          />
          <div className="text-[11px] text-muted-foreground">Adds <span className="font-mono">Authorization: Bearer &lt;token&gt;</span> to headers.</div>
        </div>
      )}

      {auth.type === 'basic' && (
        <div className="grid md:grid-cols-2 gap-3 w-full">
          <div className="space-y-2">
            <Label className="text-xs">Username</Label>
            <Input
              value={auth.basic?.username || ''}
              onChange={(e) => patchSub('basic', { username: e.target.value })}
              className="h-9 text-sm w-full"
              data-testid="auth-basic-user"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Password</Label>
            <Input
              type="password"
              value={auth.basic?.password || ''}
              onChange={(e) => patchSub('basic', { password: e.target.value })}
              className="h-9 text-sm w-full"
              data-testid="auth-basic-pass"
            />
          </div>
        </div>
      )}

      {auth.type === 'apikey' && (
        <div className="space-y-3 w-full">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Key</Label>
              <Input
                value={auth.apikey?.key || ''}
                onChange={(e) => patchSub('apikey', { key: e.target.value })}
                className="h-9 text-sm font-mono w-full"
                data-testid="auth-apikey-key"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Value</Label>
              <Input
                value={auth.apikey?.value || ''}
                onChange={(e) => patchSub('apikey', { value: e.target.value })}
                className="h-9 text-sm font-mono w-full"
                data-testid="auth-apikey-value"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Add to</Label>
            <Select value={auth.apikey?.addTo || 'header'} onValueChange={(v) => patchSub('apikey', { addTo: v })}>
              <SelectTrigger className="h-8 w-40" data-testid="auth-apikey-addto">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="header">Header</SelectItem>
                <SelectItem value="query">Query Params</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {auth.type === 'oauth2' && (
        <div className="space-y-3 w-full">
          <div className="text-xs text-muted-foreground p-3 rounded-md bg-muted/30">
            OAuth 2.0 grant flows require redirect handling that can&apos;t run purely client-side. This
            pane accepts an already-obtained access token — paste one below and it will be sent
            as an <span className="font-mono">Authorization</span> header.
          </div>
          <div className="grid md:grid-cols-[1fr_160px] gap-3 w-full">
            <div className="space-y-2">
              <Label className="text-xs">Access Token</Label>
              <Input
                value={auth.oauth2?.accessToken || ''}
                onChange={(e) => patchSub('oauth2', { accessToken: e.target.value })}
                className="h-9 text-sm font-mono w-full"
                data-testid="auth-oauth2-token"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Token Prefix</Label>
              <Input
                value={auth.oauth2?.tokenName || 'Bearer'}
                onChange={(e) => patchSub('oauth2', { tokenName: e.target.value })}
                className="h-9 text-sm font-mono w-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
