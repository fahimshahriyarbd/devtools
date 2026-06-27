'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, useCallback } from 'react';
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
import { Wifi, Plus, LogIn, Copy, QrCode, X, CheckCircle2, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { WebRTCRoom, createRoom, joinRoom } from '@/lib/webrtc-room';
import { cn } from '@/lib/utils';

const Editor = dynamic(() => import('@monaco-editor/react').then(m => m.default), { ssr: false });
const LANGS = ['markdown','plaintext','javascript','typescript','json','html','css','python','go','sql','yaml'];

export default function WifiSharePage() {
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
  const [showQR, setShowQR] = useState(false);
  const rtcRef = useRef(null);
  const applyingRemote = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem('devhub.name');
    setName(stored || `User-${Math.random().toString(36).slice(2,5).toUpperCase()}`);
    const j = params.get('join'); if (j) setJoinCode(j);
  }, []);
  useEffect(() => () => rtcRef.current?.stop(), []);

  const wireRoom = useCallback((roomId, selfId, ownName) => {
    const r = new WebRTCRoom({
      roomId, selfId, name: ownName,
      onPeers: (devices) => setPeers(devices.filter(d => d.id !== selfId)),
      onPeerJoined: (p) => {
        toast.success(`${p.name} joined`);
        // Send current text to new peer
        setTimeout(() => {
          const peer = rtcRef.current?.peers.get(p.id);
          if (peer?.ready) rtcRef.current.sendTo(p.id, JSON.stringify({ kind: 'snapshot', text, language }));
          else {
            // try a few times
            let tries = 0;
            const iv = setInterval(() => {
              tries++;
              const pp = rtcRef.current?.peers.get(p.id);
              if (pp?.ready) { rtcRef.current.sendTo(p.id, JSON.stringify({ kind: 'snapshot', text, language })); clearInterval(iv); }
              else if (tries > 30) clearInterval(iv);
            }, 250);
          }
        }, 500);
      },
      onPeerLeft: () => {},
      onConnState: () => setPeers(p => [...p]),
      onMessage: (peerId, data) => {
        if (typeof data !== 'string') return;
        try {
          const msg = JSON.parse(data);
          if (msg.kind === 'text-update') {
            applyingRemote.current = true;
            setText(msg.text);
            setTimeout(() => { applyingRemote.current = false; }, 50);
          } else if (msg.kind === 'snapshot') {
            applyingRemote.current = true;
            setText(msg.text || '');
            if (msg.language) setLanguage(msg.language);
            setTimeout(() => { applyingRemote.current = false; }, 50);
          } else if (msg.kind === 'lang') {
            setLanguage(msg.language);
          }
        } catch {}
      },
    });
    rtcRef.current = r;
    r.start();
  }, [text, language]);

  const handleCreate = async () => {
    const ownName = name || 'Host';
    try {
      const res = await createRoom({ name: ownName, kind: 'text' });
      if (!res?.room?.id) throw new Error(res?.error || 'Failed to create room');
      setRoom(res.room); setSelfId(res.youAre); setMode('in-room'); setShowQR(true);
      wireRoom(res.room.id, res.youAre, ownName);
      toast.success(`Room created: ${res.room.id}`);
    } catch (e) { toast.error(e.message || 'Create failed'); }
  };
  const handleJoin = async () => {
    try {
      const code = joinCode.trim();
      const res = await joinRoom({ roomId: code, name, expectKind: 'text' });
      if (!res?.room?.id) throw new Error(res?.error || 'Join failed');
      setRoom(res.room); setSelfId(res.youAre); setMode('in-room');
      wireRoom(res.room.id, res.youAre, name);
      toast.success(`Joined ${res.room.id}`);
    } catch (e) { toast.error(e.message); }
  };
  const leave = () => {
    rtcRef.current?.stop(); rtcRef.current = null;
    setRoom(null); setSelfId(null); setPeers([]); setMode('lobby');
  };

  const onTextChange = (val) => {
    setText(val);
    if (applyingRemote.current) return;
    rtcRef.current?.broadcast(JSON.stringify({ kind: 'text-update', text: val }));
  };
  const onLangChange = (val) => {
    setLanguage(val);
    rtcRef.current?.broadcast(JSON.stringify({ kind: 'lang', language: val }));
  };

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
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mb-3" />
            <Label className="text-xs">Room code</Label>
            <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="1234" className="font-mono text-center text-lg tracking-[0.4em] mb-3" maxLength={4} inputMode="numeric" />
            <Button variant="outline" className="w-full" onClick={handleJoin}>Join</Button>
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
          <div className="text-[11px] text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> {peers.length + 1} online</div>
        </div>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Select value={language} onValueChange={onLangChange}>
            <SelectTrigger className="h-9 w-24 sm:w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{LANGS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => setShowQR(true)} className="h-9 px-2 sm:px-3"><QrCode className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Invite</span></Button>

          {/* Mobile participants drawer (the desktop right sidebar is hidden < lg) */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                size="sm" variant="outline"
                className="lg:hidden h-9 px-2"
                data-testid="wifi-share-participants-btn"
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
              options={{ fontSize: 13, minimap: { enabled: false }, wordWrap: 'on', automaticLayout: true, scrollBeyondLastLine: false }}
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
              <QRCodeCanvas value={typeof window !== 'undefined' ? `${window.location.origin}/wifi-share?join=${room.id}` : ''} size={220} />
            </div>
            <div className="font-mono text-lg font-semibold">{room.id}</div>
            <Button variant="outline" className="w-full" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/wifi-share?join=${room.id}`); toast.success('Link copied'); }}>
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
