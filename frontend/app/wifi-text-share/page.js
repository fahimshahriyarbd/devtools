'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { QRCodeCanvas } from 'qrcode.react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from '@/components/ui/sheet';
import { Wifi, Plus, LogIn, Copy, QrCode, X, CheckCircle2, Loader2, Users, Lock, Unlock, RefreshCw, RadioTower } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { WebRTCRoom, createRoom, joinRoom, checkName } from '@/lib/webrtc-room';
import { cn } from '@/lib/utils';
import { useMobileSheet } from '@/hooks/use-mobile-sheet';

const Editor = dynamic(() => import('@monaco-editor/react').then(m => m.default), { ssr: false });
const LANGS = ['markdown','plaintext','javascript','typescript','json','html','css','python','go','sql','yaml'];

export default function WifiSharePage() {
  return (
    <Suspense fallback={null}>
      <WifiShareInner />
    </Suspense>
  );
}

function WifiShareInner() {
  const params = useSearchParams();
  const { resolvedTheme } = useTheme();
  const [mode, setMode] = useState('lobby');
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [room, setRoom] = useState(null);
  const [selfId, setSelfId] = useState(null);
  const [peers, setPeers] = useState([]);
  const [text, setText] = useState('# Welcome to WiFi Text Share\n\nStart typing... everyone sees changes live.');
  const [language, setLanguage] = useState('markdown');
  const [allowGuestEdits, setAllowGuestEdits] = useState(true);
  const [showQR, setShowQR] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useMobileSheet();
  const rtcRef = useRef(null);
  const applyingRemote = useRef(false);
  const editorRef = useRef(null);

  // Refs that mirror state — needed so the long-lived WebRTCRoom callbacks
  // ALWAYS see the latest values instead of the stale closure from when the
  // room was first wired up. (Without these, the host's snapshot kept sending
  // the initial welcome text, and the host-lock guard always read its initial
  // `true`, so toggling the lock had no effect on incoming guest edits.)
  const textRef = useRef(text);
  const languageRef = useRef(language);
  const allowGuestEditsRef = useRef(allowGuestEdits);
  const isHostRef = useRef(false);
  useEffect(() => { textRef.current = text; }, [text]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { allowGuestEditsRef.current = allowGuestEdits; }, [allowGuestEdits]);

  const isHost = !!(selfId && room && selfId === room.hostId);
  const canEdit = isHost || allowGuestEdits;
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  // Force-apply readOnly to Monaco whenever canEdit changes (belt + suspenders
  // alongside the `options.readOnly` prop, in case Monaco doesn't pick up the
  // option diff).
  useEffect(() => {
    const ed = editorRef.current;
    if (ed) ed.updateOptions({ readOnly: !canEdit });
  }, [canEdit]);

  useEffect(() => {
    const stored = localStorage.getItem('devhub.name');
    setName(stored || `User-${Math.random().toString(36).slice(2,5).toUpperCase()}`);
    const j = params.get('join'); if (j) setJoinCode(j);
  }, []);
  useEffect(() => () => rtcRef.current?.stop(), []);

  const wireRoom = useCallback((roomId, selfId, ownName, hostIdArg) => {
    const amHost = selfId === hostIdArg;
    // Track which peer IDs the host has successfully snapshotted so we can
    // re-send if a DC opens later than the initial 7.5s retry window.
    const snapshotSent = new Set();
    const sendSnapshotTo = (peerId) => {
      const rtc = rtcRef.current;
      const peer = rtc?.peers.get(peerId);
      const dcUsable = peer?.dc?.readyState === 'open' && peer?.dcVerified;
      if (!peer?.ready || (!dcUsable && !peer.relayMode)) return false;
      const snap = JSON.stringify({
        kind: 'snapshot',
        text: textRef.current,
        language: languageRef.current,
        allowGuestEdits: allowGuestEditsRef.current,
      });
      const ok = rtc.sendTo(peerId, snap);
      if (ok) snapshotSent.add(peerId);
      return ok;
    };
    const r = new WebRTCRoom({
      roomId, selfId, name: ownName,
      onPeers: (devices) => setPeers(devices.filter(d => d.id !== selfId)),
      onPeerJoined: (p) => {
        toast.success(`${p.name} joined`);
        // Only the host sends the authoritative snapshot (text + lang + edit-mode)
        // to avoid every peer racing with their own snapshot copies.
        if (!amHost) return;
        setTimeout(() => {
          if (sendSnapshotTo(p.id)) return;
          // not ready yet — retry
          let tries = 0;
          const iv = setInterval(() => {
            tries++;
            if (sendSnapshotTo(p.id)) { clearInterval(iv); }
            else if (tries > 30) clearInterval(iv);
          }, 250);
        }, 500);
      },
      onPeerLeft: (peerId) => { snapshotSent.delete(peerId); },
      onConnState: () => {
        setPeers(p => [...p]);
        // Safety net: if a peer's DC opens AFTER the initial retry window
        // expired, send a snapshot the moment we notice it's ready. This
        // is the most common reason "text not syncing" appeared in slow
        // networks — the initial 7.5s window expired before ICE finished.
        if (!amHost) return;
        const rtc = rtcRef.current;
        if (!rtc) return;
        for (const [peerId, peer] of rtc.peers) {
          const dcUsable = peer?.dc?.readyState === 'open' && peer?.dcVerified;
          if (peer?.ready && (dcUsable || peer.relayMode) && !snapshotSent.has(peerId)) {
            sendSnapshotTo(peerId);
          }
        }
      },
      onMessage: (peerId, data) => {
        if (typeof data !== 'string') return;
        try {
          const msg = JSON.parse(data);
          if (msg.kind === 'text-update') {
            // Host-locked: when host has disabled guest edits, ignore incoming
            // text-update messages from guests. (Read latest value via ref.)
            if (amHost && !allowGuestEditsRef.current) return;
            applyingRemote.current = true;
            setText(msg.text);
            setTimeout(() => { applyingRemote.current = false; }, 50);
            // Host re-broadcasts to all OTHER peers so 3+ peer rooms stay in
            // sync. IMPORTANT: exclude the original sender — echoing the
            // text-update back to the typing peer would clobber its in-flight
            // characters during fast typing bursts.
            if (amHost) {
              const rtc = rtcRef.current;
              if (rtc) {
                const fanout = JSON.stringify({ kind: 'text-update', text: msg.text });
                for (const [otherId] of rtc.peers) {
                  if (otherId !== peerId) rtc.sendTo(otherId, fanout);
                }
              }
            }
          } else if (msg.kind === 'snapshot') {
            applyingRemote.current = true;
            setText(msg.text || '');
            if (msg.language) setLanguage(msg.language);
            if (typeof msg.allowGuestEdits === 'boolean') setAllowGuestEdits(msg.allowGuestEdits);
            setTimeout(() => { applyingRemote.current = false; }, 50);
          } else if (msg.kind === 'lang') {
            setLanguage(msg.language);
          } else if (msg.kind === 'edit-mode') {
            // Only honor edit-mode updates if they came from the host.
            if (peerId === hostIdArg && typeof msg.allowGuestEdits === 'boolean') {
              setAllowGuestEdits(msg.allowGuestEdits);
              toast.info(msg.allowGuestEdits ? 'Host allowed editing for everyone' : 'Host locked the document — only host can edit');
            }
          }
        } catch { /* ignore malformed peer messages */ }
      },
    });
    rtcRef.current = r;
    r.start();
  }, []);

  const handleCreate = async () => {
    const ownName = name || 'Host';
    try {
      const res = await createRoom({ name: ownName, kind: 'text' });
      if (!res?.room?.id) throw new Error(res?.error || 'Failed to create room');
      const myName = res.assignedName || ownName;
      if (res.assignedName && res.assignedName !== ownName) {
        setName(myName);
        toast.info(`Display name set to "${myName}"`);
      }
      setRoom(res.room); setSelfId(res.youAre); setMode('in-room'); setShowQR(true);
      wireRoom(res.room.id, res.youAre, myName, res.room.hostId);
      toast.success(`Room created: ${res.room.id}`);
    } catch (e) { toast.error(e.message || 'Create failed'); }
  };
  const handleJoin = async () => {
    try {
      const code = joinCode.trim();
      const res = await joinRoom({ roomId: code, name, expectKind: 'text' });
      if (!res?.room?.id) throw new Error(res?.error || 'Join failed');
      const myName = res.assignedName || name;
      if (res.assignedName && res.assignedName !== name) {
        setName(myName);
        toast.info(`Name already taken — joined as "${myName}"`);
      }
      setRoom(res.room); setSelfId(res.youAre); setMode('in-room');
      wireRoom(res.room.id, res.youAre, myName, res.room.hostId);
      toast.success(`Joined ${res.room.id}`);
    } catch (e) { toast.error(e.message); }
  };
  const leave = () => {
    rtcRef.current?.stop(); rtcRef.current = null;
    setRoom(null); setSelfId(null); setPeers([]); setMode('lobby');
  };

  const handleRefreshConnections = async () => {
    const rtc = rtcRef.current;
    if (!rtc) return;
    const tid = toast.loading('Refreshing peer connections…');
    try {
      const res = await rtc.refreshConnections();
      const healthy = res.healed;
      const fixed = (res.restarted || 0) + (res.recreated || 0) + (res.promoted || 0);
      if (peers.length === 0) {
        toast.info('No peers to refresh yet', { id: tid });
      } else if (healthy === peers.length && fixed === 0) {
        toast.success(`All ${healthy} peer${healthy === 1 ? '' : 's'} already connected`, { id: tid });
      } else {
        toast.success(`Re-established ${fixed} of ${peers.length} peer connection${peers.length === 1 ? '' : 's'}`, { id: tid });
      }
      // Host: push a fresh snapshot to every peer after the refresh so anyone
      // that was stuck on stale text immediately catches up.
      if (isHostRef.current) {
        const snap = JSON.stringify({
          kind: 'snapshot',
          text: textRef.current,
          language: languageRef.current,
          allowGuestEdits: allowGuestEditsRef.current,
        });
        for (const [pid] of rtc.peers) rtc.sendTo(pid, snap);
      }
    } catch (e) {
      toast.error('Refresh failed', { id: tid });
    }
  };

  const onTextChange = (val) => {
    if (!canEdit) return;
    setText(val);
    if (applyingRemote.current) return;
    rtcRef.current?.broadcast(JSON.stringify({ kind: 'text-update', text: val }));
  };
  const onLangChange = (val) => {
    setLanguage(val);
    rtcRef.current?.broadcast(JSON.stringify({ kind: 'lang', language: val }));
  };
  const toggleEditMode = () => {
    if (!isHost) return;
    const next = !allowGuestEdits;
    setAllowGuestEdits(next);
    rtcRef.current?.broadcast(JSON.stringify({ kind: 'edit-mode', allowGuestEdits: next }));
    toast.success(next ? 'Editing unlocked for everyone' : 'Editing locked — only you can edit');
  };

  // Host can force a full snapshot to every connected peer. Useful when a
  // peer reports state drift or joined while ICE was still settling.
  // Guests can also trigger this: it pushes the guest's current view to all
  // other peers, which is helpful when the guest knows their local copy is
  // the most recent (e.g. after typing while a peer was offline).
  const resync = () => {
    const rtc = rtcRef.current;
    if (!rtc) return;
    const snap = JSON.stringify({
      kind: 'snapshot',
      text: textRef.current,
      language: languageRef.current,
      allowGuestEdits: allowGuestEditsRef.current,
    });
    let sent = 0;
    for (const [pid, peer] of rtc.peers) {
      const dcUsable = peer?.dc?.readyState === 'open' && peer?.dcVerified;
      if (peer?.ready && (dcUsable || peer.relayMode)) {
        if (rtc.sendTo(pid, snap)) sent++;
      }
    }
    toast.success(sent ? `Resynced ${sent} device${sent === 1 ? '' : 's'}` : 'No connected devices to resync');
  };

  // How many peers currently have an open data channel (=actually receiving
  // edits). Shown in the header so users can see at a glance when sync is
  // live vs. a peer is connected-but-not-ready.
  const readyPeerCount = peers.reduce((n, p) => {
    const pp = rtcRef.current?.peers.get(p.id);
    const dcUsable = pp?.dc?.readyState === 'open' && pp?.dcVerified;
    return n + (pp?.ready && (dcUsable || pp.relayMode) ? 1 : 0);
  }, 0);

  // Lobby: live-check that the requested display name isn't taken in the
  // target room. Debounced to avoid hammering the backend on every keystroke.
  const [nameHint, setNameHint] = useState(null);
  useEffect(() => {
    if (mode !== 'lobby') { setNameHint(null); return; }
    const code = (joinCode || '').trim();
    const n = (name || '').trim();
    if (code.length !== 4 || !n) { setNameHint(null); return; }
    let alive = true;
    const t = setTimeout(async () => {
      const res = await checkName({ roomId: code, name: n });
      if (!alive) return;
      if (!res?.exists) { setNameHint(null); return; }
      if (res.taken) setNameHint({ taken: true, suggested: res.suggested });
      else setNameHint(null);
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [joinCode, name, mode]);

  if (mode === 'lobby' || !room) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 grid place-items-center shadow-xl shadow-teal-500/20 mb-4">
            <Wifi className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">WiFi Text Share</h1>
          <p className="text-muted-foreground mt-2">Live collaborative editor over peer-to-peer connection.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="glass p-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/15 grid place-items-center"><Plus className="h-4 w-4 text-emerald-400" /></div>
              <div>
                <div className="font-semibold">Host a session</div>
                <div className="text-xs text-muted-foreground">Generate a code & share</div>
              </div>
            </div>
            <Label className="text-xs">Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mb-3" />
            <Button className="w-full bg-gradient-to-r from-emerald-500 to-teal-500" onClick={handleCreate}>Create</Button>
          </Card>
          <Card className="glass p-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-9 w-9 rounded-lg bg-blue-500/15 grid place-items-center"><LogIn className="h-4 w-4 text-blue-400" /></div>
              <div>
                <div className="font-semibold">Join a session</div>
                <div className="text-xs text-muted-foreground">Enter the room code</div>
              </div>
            </div>
            <Label className="text-xs">Display name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className={nameHint?.taken ? 'mb-1' : 'mb-3'} />
            {nameHint?.taken && (
              <div className="mb-3 flex items-center justify-between gap-2 text-[11px] text-amber-400">
                <span>That name is already in the room.</span>
                <button
                  type="button"
                  className="font-medium underline underline-offset-2 hover:text-amber-300"
                  onClick={() => { setName(nameHint.suggested); setNameHint(null); }}
                  data-testid="wifi-text-share-suggest-name-btn"
                >
                  Use &quot;{nameHint.suggested}&quot;
                </button>
              </div>
            )}
            <Label className="text-xs">Room code</Label>
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && joinCode.trim() && name.trim()) {
                  e.preventDefault();
                  handleJoin();
                }
              }}
              placeholder="1234"
              className="font-mono text-center text-lg tracking-[0.4em] mb-3"
              maxLength={4}
              inputMode="numeric"
              data-testid="wifi-text-share-room-code-input"
            />
            <Button variant="outline" className="w-full" onClick={handleJoin} data-testid="wifi-text-share-join-btn">Join</Button>
          </Card>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen">
      <header className="flex flex-wrap items-center gap-2 sm:gap-3 p-3 sm:p-4 border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 grid place-items-center shrink-0">
          <Wifi className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold flex items-center gap-2"><span className="hidden sm:inline">WiFi Text Share</span><span className="sm:hidden">Text</span> <Badge variant="secondary" className="font-mono text-[11px]">{room.id}</Badge></div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-2">
            <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {peers.length + 1} online</span>
            {peers.length > 0 && (
              <span
                className={cn(
                  'flex items-center gap-1',
                  readyPeerCount === peers.length ? 'text-emerald-400' : 'text-amber-400'
                )}
                data-testid="wifi-text-share-sync-status"
                title={readyPeerCount === peers.length ? 'All peers receiving edits live' : 'Waiting for some peers to connect'}
              >
                <RadioTower className="h-3 w-3" />
                {readyPeerCount}/{peers.length} synced
              </span>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {isHost && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefreshConnections}
              className="h-9 px-2 sm:px-3"
              data-testid="wifi-text-share-refresh-btn"
              title="Check & refresh peer connections (host only)"
            >
              <RefreshCw className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          )}
          {peers.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={resync}
              className="h-9 px-2 sm:px-3"
              data-testid="wifi-text-share-resync-btn"
              title="Push your current document to every connected device"
            >
              <RefreshCw className="h-3.5 w-3.5 sm:mr-1.5" />
              <span className="hidden sm:inline">Resync</span>
            </Button>
          )}
          {isHost && (
            <Button
              size="sm"
              variant={allowGuestEdits ? 'outline' : 'default'}
              onClick={toggleEditMode}
              className={cn(
                'h-9 px-2 sm:px-3',
                !allowGuestEdits && 'bg-amber-500/90 hover:bg-amber-500 text-white border-amber-500'
              )}
              data-testid="wifi-text-share-edit-lock-toggle"
              title={allowGuestEdits ? 'Editing is open to all — click to lock' : 'Editing is locked to host — click to unlock'}
            >
              {allowGuestEdits ? <Unlock className="h-3.5 w-3.5 sm:mr-1.5" /> : <Lock className="h-3.5 w-3.5 sm:mr-1.5" />}
              <span className="hidden sm:inline">{allowGuestEdits ? 'Everyone can edit' : 'Host-only edit'}</span>
            </Button>
          )}
          {!isHost && !allowGuestEdits && (
            <Badge variant="secondary" className="hidden sm:inline-flex h-9 px-2 items-center gap-1 text-[11px]" data-testid="wifi-text-share-readonly-badge">
              <Lock className="h-3 w-3" /> Read-only
            </Badge>
          )}
          <Select value={language} onValueChange={onLangChange}>
            <SelectTrigger className="h-9 w-24 sm:w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{LANGS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Button
            size="sm" variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text || '');
                toast.success('Text copied to clipboard');
              } catch {
                toast.error('Could not copy — clipboard blocked');
              }
            }}
            className="h-9 px-2 sm:px-3"
            disabled={!text}
            data-testid="wifi-text-share-copy-text-btn"
            title="Copy entire text to clipboard"
          >
            <Copy className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Copy text</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowQR(true)} className="h-9 px-2 sm:px-3"><QrCode className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Invite</span></Button>

          {/* Mobile participants drawer (the desktop right sidebar is hidden < lg) */}
          <Sheet open={participantsOpen} onOpenChange={setParticipantsOpen}>
            <SheetTrigger asChild>
              <Button
                size="sm" variant="outline"
                className="lg:hidden h-9 px-2"
                data-testid="wifi-text-share-participants-btn"
                title="Participants"
              >
                <Users className="h-3.5 w-3.5" />
                <span className="ml-1 text-xs">{peers.length + 1}</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0 w-[88vw] sm:w-72 max-w-sm flex flex-col">
              <SheetHeader className="sr-only"><SheetTitle>Participants</SheetTitle></SheetHeader>
              <div className="p-4 border-b border-border/60">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Participants</div>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-1">
                <Person name={name} self />
                {peers.map(p => {
                  const ready = rtcRef.current?.peers.get(p.id)?.ready;
                  return <Person key={p.id} name={p.name} ready={ready} />;
                })}
              </div>
            </SheetContent>
          </Sheet>

          <Button size="sm" variant="ghost" onClick={leave} className="h-9 px-2 sm:px-3"><X className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Leave</span></Button>
        </div>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_240px]">
        <div className="min-h-0 p-3">
          <Card className="glass h-full overflow-hidden">
            <Editor
              height="100%"
              value={text}
              onChange={(v) => onTextChange(v || '')}
              language={language}
              theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
              onMount={(editor) => {
                editorRef.current = editor;
                editor.updateOptions({ readOnly: !canEdit });
                // One-click dismiss for Monaco's suggestion popup — any
                // mousedown outside the suggest widget closes it immediately
                // (default Monaco behaviour effectively needs two clicks).
                const dismiss = (e) => {
                  const t = e.target;
                  if (t && t.closest && t.closest('.suggest-widget')) return;
                  try { editor.trigger('outside-click', 'hideSuggestWidget', null); } catch { /* noop */ }
                };
                document.addEventListener('mousedown', dismiss, true);
                editor.onDidDispose?.(() => document.removeEventListener('mousedown', dismiss, true));
              }}
              options={{ fontSize: 13, minimap: { enabled: false }, wordWrap: 'on', automaticLayout: true, scrollBeyondLastLine: false, readOnly: !canEdit }}
            />
          </Card>
        </div>
        <aside className="hidden lg:flex flex-col border-l border-border/60 p-3 gap-3">
          <Card className="glass p-3">
            <div className="text-[11px] uppercase text-muted-foreground mb-2">Participants</div>
            <Person name={name} self />
            {peers.map(p => {
              const ready = rtcRef.current?.peers.get(p.id)?.ready;
              return <Person key={p.id} name={p.name} ready={ready} />;
            })}
          </Card>
        </aside>
      </div>

      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Invite</DialogTitle><DialogDescription>Scan or share the link</DialogDescription></DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-xl">
              <QRCodeCanvas value={typeof window !== 'undefined' ? `${window.location.origin}/wifi-text-share?join=${room.id}` : ''} size={220} />
            </div>
            <div className="font-mono text-lg font-semibold">{room.id}</div>
            <Button variant="outline" className="w-full" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/wifi-text-share?join=${room.id}`); toast.success('Link copied'); }}>
              <Copy className="h-4 w-4 mr-2" /> Copy invite link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Person({ name, self, ready }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className={cn('h-2 w-2 rounded-full', self ? 'bg-emerald-400' : ready ? 'bg-blue-400' : 'bg-amber-400')} />
      <div className="text-sm flex-1 truncate">{name}</div>
      {self ? <Badge variant="secondary" className="h-5 text-[10px]">You</Badge> :
        ready ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
    </div>
  );
}
