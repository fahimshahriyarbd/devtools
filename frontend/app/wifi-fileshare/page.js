'use client';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';
import {
  Share2, Upload, Plus, LogIn, Copy, QrCode, Users, HardDrive, X,
  Download, FileText, FileImage, FileArchive, FileCode, Film, Music,
  File as FileIcon, Wifi, WifiOff, CheckCircle2, Loader2, Send, Trash2, Activity,
  ListChecks, Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { WebRTCRoom, createRoom, joinRoom } from '@/lib/webrtc-room';
import { cn } from '@/lib/utils';

const CHUNK_SIZE = 64 * 1024; // 64KB chunks (safe for WebRTC)
const LOW_WATER = 256 * 1024;
const HIGH_WATER = 1 * 1024 * 1024;

const iconForType = (name = '') => {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['png','jpg','jpeg','webp','svg','gif','heic'].includes(ext)) return FileImage;
  if (['zip','rar','7z','tar','gz'].includes(ext)) return FileArchive;
  if (['js','ts','jsx','tsx','json','py','go','rs','java','c','cpp','h','sh','html','css','md','xml','yaml','yml'].includes(ext)) return FileCode;
  if (['mp4','mov','webm','avi','mkv'].includes(ext)) return Film;
  if (['mp3','wav','ogg','flac','aac'].includes(ext)) return Music;
  if (['pdf','docx','txt','rtf'].includes(ext)) return FileText;
  return FileIcon;
};

const fmtBytes = (b) => {
  if (!b && b !== 0) return '—';
  const u = ['B','KB','MB','GB','TB'];
  let i = 0; while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(b < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
};

export default function WifiFileSharePage() {
  const params = useSearchParams();
  const autoCreate = params.get('create') === '1';

  const [mode, setMode] = useState('lobby'); // 'lobby' | 'in-room'
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [room, setRoom] = useState(null); // { id, hostId, devices }
  const [selfId, setSelfId] = useState(null);
  const [peers, setPeers] = useState([]); // [{id,name}]
  const [showQR, setShowQR] = useState(false);
  const [showJoinQR, setShowJoinQR] = useState(false);
  const [files, setFiles] = useState([]); // shared files metadata { id, name, size, type, ownerId, ownerName, hash, blobUrl?, receivedBytes }
  const [transfers, setTransfers] = useState([]); // active transfers { id, fileId, direction, peerId, peerName, total, sent, started, speed }
  const [activity, setActivity] = useState([]); // log entries
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const rtcRef = useRef(null);
  const incomingRef = useRef(new Map()); // fileId -> { meta, chunks:[], received }
  const xferStateRef = useRef(new Map()); // xferId -> { startedAt, lastTick, lastBytes, speed }

  useEffect(() => {
    const stored = localStorage.getItem('devhub.name');
    if (stored) setName(stored);
    else setName(`Device-${Math.random().toString(36).slice(2,6).toUpperCase()}`);
  }, []);

  useEffect(() => { if (name) localStorage.setItem('devhub.name', name); }, [name]);

  useEffect(() => { if (autoCreate && name) handleCreate(); /* eslint-disable-next-line */ }, [autoCreate, name]);

  useEffect(() => () => { rtcRef.current?.stop(); }, []);

  const logActivity = (text, icon = 'info') => {
    setActivity(a => [{ id: crypto.randomUUID(), text, icon, time: Date.now() }, ...a].slice(0, 100));
  };

  const wireRoom = useCallback((roomId, selfId, ownName) => {
    const r = new WebRTCRoom({
      roomId, selfId, name: ownName,
      onPeers: (devices) => {
        setPeers(devices.filter(d => d.id !== selfId));
      },
      onPeerJoined: (p) => {
        toast.success(`${p.name} joined`);
        logActivity(`${p.name} joined`, 'in');
      },
      onPeerLeft: (pid) => {
        logActivity(`Peer left`, 'out');
      },
      onConnState: () => setPeers(p => [...p]),
      onMessage: (peerId, data) => handlePeerMessage(peerId, data),
    });
    rtcRef.current = r;
    r.start();
  }, []);

  const handleCreate = async () => {
    try {
      const ownName = name || 'Host';
      const res = await createRoom({ name: ownName, kind: 'file' });
      if (!res?.room?.id) throw new Error(res?.error || 'Failed to create room');
      setRoom(res.room);
      setSelfId(res.youAre);
      setMode('in-room');
      setShowQR(true);
      wireRoom(res.room.id, res.youAre, ownName);
      toast.success(`Room created: ${res.room.id}`);
      logActivity(`Room created: ${res.room.id}`, 'info');
    } catch (e) {
      toast.error(e.message || 'Failed to create room');
    }
  };

  const handleJoin = async (codeArg) => {
    const code = (codeArg || joinCode).trim();
    if (!code) return toast.error('Enter a room code');
    try {
      const res = await joinRoom({ roomId: code, name, expectKind: 'file' });
      if (!res?.room?.id) throw new Error(res?.error || 'Join failed');
      setRoom(res.room);
      setSelfId(res.youAre);
      setMode('in-room');
      wireRoom(res.room.id, res.youAre, name);
      toast.success(`Joined ${res.room.id}`);
      logActivity(`Joined ${res.room.id}`, 'info');
    } catch (e) {
      toast.error(e.message || 'Could not join');
    }
  };

  const leaveRoom = () => {
    rtcRef.current?.stop();
    rtcRef.current = null;
    setRoom(null);
    setSelfId(null);
    setPeers([]);
    setFiles([]);
    setTransfers([]);
    setMode('lobby');
    setShowQR(false);
  };

  // ------- File messaging protocol -------
  // 1) header JSON {kind:'file-meta', id, name, size, type, hash?, ownerId, ownerName}
  // 2) chunks as ArrayBuffer with 4-byte header: 8-byte ascii fileId-suffix? Simpler: precede each chunk with a small JSON header? Too slow.
  // Strategy: send a 'file-start' control msg, then raw chunks tagged via a per-channel state machine.
  // To support multi-file interleaving per peer we use a 4-byte fileSeq prefix + first byte 0=meta, 1=chunk, 2=end
  // Simpler MVP: do not interleave per peer. Send file fully before next.

  const waitForPeerReady = async (peerId, timeoutMs = 12000) => {
    const r = rtcRef.current;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const p = r?.peers.get(peerId);
      if (p?.ready && p.dc?.readyState === 'open') return true;
      await new Promise(res => setTimeout(res, 200));
    }
    return false;
  };

  const sendFileToPeer = async (peerId, file) => {
    const fileId = crypto.randomUUID();
    const ownerName = name;
    const meta = { id: fileId, name: file.name, size: file.size, type: file.type, ownerId: selfId, ownerName };
    const r = rtcRef.current;
    if (!r) return;

    // Ensure peer connected
    const ok2 = await waitForPeerReady(peerId);
    if (!ok2) return toast.error('Peer not connected (timeout)');

    const ok = r.sendTo(peerId, JSON.stringify({ kind: 'file-meta', meta }));
    if (!ok) return toast.error('Peer not connected');

    const xferId = crypto.randomUUID();
    const xfer = { id: xferId, fileId, direction: 'out', peerId, peerName: peers.find(p => p.id === peerId)?.name || 'peer', total: file.size, sent: 0, started: Date.now(), speed: 0 };
    setTransfers(t => [...t, xfer]);
    xferStateRef.current.set(xferId, { startedAt: Date.now(), lastTick: Date.now(), lastBytes: 0, speed: 0 });

    // Add to local files list immediately so sender also sees it
    const blobUrl = URL.createObjectURL(file);
    setFiles(fs => [{ ...meta, blobUrl, receivedBytes: file.size, complete: true, local: true }, ...fs]);

    let offset = 0;
    const reader = file.stream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // value may be > 64KB. Split into CHUNK_SIZE.
      let v = value;
      while (v.byteLength > 0) {
        const slice = v.byteLength > CHUNK_SIZE ? v.subarray(0, CHUNK_SIZE) : v;
        v = v.byteLength > CHUNK_SIZE ? v.subarray(CHUNK_SIZE) : new Uint8Array(0);

        // Backpressure
        while ((r.bufferedAmount(peerId) || 0) > HIGH_WATER) {
          await new Promise(res => setTimeout(res, 20));
        }

        const tagged = new Uint8Array(36 + slice.byteLength);
        const idBytes = new TextEncoder().encode(fileId);
        tagged.set(idBytes, 0);
        tagged.set(slice, 36);
        const sentOk = r.sendTo(peerId, tagged.buffer);
        if (!sentOk) { toast.error('Connection dropped'); return; }

        offset += slice.byteLength;
        updateTransferProgress(xferId, offset);
      }
    }

    r.sendTo(peerId, JSON.stringify({ kind: 'file-end', fileId }));
    setTransfers(ts => ts.map(t => t.id === xferId ? { ...t, sent: file.size, done: true } : t));
    logActivity(`Sent "${file.name}" to ${peers.find(p => p.id === peerId)?.name}`, 'out');
    toast.success(`Sent ${file.name}`);
  };

  const updateTransferProgress = (xferId, sent) => {
    const st = xferStateRef.current.get(xferId);
    const now = Date.now();
    if (st) {
      const dt = now - st.lastTick;
      if (dt > 250) {
        st.speed = ((sent - st.lastBytes) / dt) * 1000; // B/s
        st.lastTick = now;
        st.lastBytes = sent;
        setTransfers(ts => ts.map(t => t.id === xferId ? { ...t, sent, speed: st.speed } : t));
      } else {
        setTransfers(ts => ts.map(t => t.id === xferId ? { ...t, sent } : t));
      }
    }
  };

  const broadcastFile = async (file) => {
    if (peers.length === 0) {
      // still add locally
      const meta = { id: crypto.randomUUID(), name: file.name, size: file.size, type: file.type, ownerId: selfId, ownerName: name };
      const url = URL.createObjectURL(file);
      setFiles(fs => [{ ...meta, blobUrl: url, receivedBytes: file.size, complete: true, local: true }, ...fs]);
      toast.info('No peers — file added locally');
      return;
    }
    for (const p of peers) {
      // Send a separate copy to each peer (already adds locally on first call)
      // To avoid duplicates locally, only first iteration adds locally; later sends skip local add.
      await sendFileToPeerSilent(p.id, file);
    }
    const meta = { id: crypto.randomUUID(), name: file.name, size: file.size, type: file.type, ownerId: selfId, ownerName: name };
    const url = URL.createObjectURL(file);
    setFiles(fs => [{ ...meta, blobUrl: url, receivedBytes: file.size, complete: true, local: true }, ...fs]);
  };

  const sendFileToPeerSilent = async (peerId, file) => {
    // Internal version that does not add to local files (used by broadcast)
    const fileId = crypto.randomUUID();
    const meta = { id: fileId, name: file.name, size: file.size, type: file.type, ownerId: selfId, ownerName: name };
    const r = rtcRef.current;
    if (!r) return;
    await waitForPeerReady(peerId);
    const ok = r.sendTo(peerId, JSON.stringify({ kind: 'file-meta', meta }));
    if (!ok) return;
    const xferId = crypto.randomUUID();
    setTransfers(t => [...t, { id: xferId, fileId, direction: 'out', peerId, peerName: peers.find(p => p.id === peerId)?.name || 'peer', total: file.size, sent: 0, started: Date.now(), speed: 0 }]);
    xferStateRef.current.set(xferId, { startedAt: Date.now(), lastTick: Date.now(), lastBytes: 0, speed: 0 });
    let offset = 0;
    const reader = file.stream().getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      let v = value;
      while (v.byteLength > 0) {
        const slice = v.byteLength > CHUNK_SIZE ? v.subarray(0, CHUNK_SIZE) : v;
        v = v.byteLength > CHUNK_SIZE ? v.subarray(CHUNK_SIZE) : new Uint8Array(0);
        while ((r.bufferedAmount(peerId) || 0) > HIGH_WATER) await new Promise(res => setTimeout(res, 20));
        const tagged = new Uint8Array(36 + slice.byteLength);
        tagged.set(new TextEncoder().encode(fileId), 0);
        tagged.set(slice, 36);
        if (!r.sendTo(peerId, tagged.buffer)) return;
        offset += slice.byteLength;
        updateTransferProgress(xferId, offset);
      }
    }
    r.sendTo(peerId, JSON.stringify({ kind: 'file-end', fileId }));
    setTransfers(ts => ts.map(t => t.id === xferId ? { ...t, sent: file.size, done: true } : t));
  };

  const handlePeerMessage = (peerId, data) => {
    if (typeof data === 'string') {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (msg.kind === 'file-meta') {
        incomingRef.current.set(msg.meta.id, { meta: msg.meta, chunks: [], received: 0, peerId });
        const xferId = crypto.randomUUID();
        setTransfers(t => [...t, { id: xferId, fileId: msg.meta.id, direction: 'in', peerId, peerName: msg.meta.ownerName, total: msg.meta.size, sent: 0, started: Date.now(), speed: 0 }]);
        xferStateRef.current.set(xferId, { startedAt: Date.now(), lastTick: Date.now(), lastBytes: 0, speed: 0, xferId });
        incomingRef.current.get(msg.meta.id).xferId = xferId;
        // Provisional file entry
        setFiles(fs => [{ ...msg.meta, receivedBytes: 0, complete: false, local: false }, ...fs]);
        logActivity(`Receiving "${msg.meta.name}" from ${msg.meta.ownerName}`, 'in');
      } else if (msg.kind === 'file-end') {
        const entry = incomingRef.current.get(msg.fileId);
        if (!entry) return;
        const blob = new Blob(entry.chunks, { type: entry.meta.type || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        setFiles(fs => fs.map(f => f.id === msg.fileId ? { ...f, blobUrl: url, receivedBytes: entry.meta.size, complete: true } : f));
        setTransfers(ts => ts.map(t => t.fileId === msg.fileId && t.direction === 'in' ? { ...t, sent: entry.meta.size, done: true } : t));
        incomingRef.current.delete(msg.fileId);
        toast.success(`Received ${entry.meta.name}`);
        logActivity(`Received "${entry.meta.name}"`, 'in');
      }
      return;
    }
    // Binary chunk - first 36 bytes are fileId (uuid)
    const buf = data instanceof ArrayBuffer ? data : data.buffer;
    const view = new Uint8Array(buf);
    const fileId = new TextDecoder().decode(view.subarray(0, 36)).replace(/\0+$/, '');
    const payload = view.subarray(36);
    const entry = incomingRef.current.get(fileId);
    if (!entry) return;
    entry.chunks.push(payload.slice().buffer);
    entry.received += payload.byteLength;
    setFiles(fs => fs.map(f => f.id === fileId ? { ...f, receivedBytes: entry.received } : f));
    if (entry.xferId) updateTransferProgress(entry.xferId, entry.received);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const fl = Array.from(e.dataTransfer.files || []);
    for (const f of fl) broadcastFile(f);
  };
  const onPick = (e) => {
    const fl = Array.from(e.target.files || []);
    for (const f of fl) broadcastFile(f);
    e.target.value = '';
  };

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u' && mode === 'in-room') {
        e.preventDefault();
        fileInputRef.current?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  // -------- UI --------
  if (mode === 'lobby' || !room) return (
    <LobbyView
      name={name} setName={setName}
      joinCode={joinCode} setJoinCode={setJoinCode}
      onCreate={handleCreate} onJoin={handleJoin}
    />
  );

  const leftPanel = (
    <LeftRoomPanel
      room={room}
      name={name}
      peers={peers}
      rtcRef={rtcRef}
      files={files}
      transfers={transfers}
      onShowQR={() => setShowQR(true)}
      onUpload={() => fileInputRef.current?.click()}
    />
  );
  const rightPanel = (
    <RightRoomPanel transfers={transfers} activity={activity} />
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <RoomHeader
        room={room} selfId={selfId} peers={peers}
        onLeave={leaveRoom} onShowQR={() => setShowQR(true)}
        leftPanel={leftPanel} rightPanel={rightPanel}
      />
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[280px_1fr_320px]">
        {/* Left panel — desktop */}
        <aside className="hidden lg:flex flex-col border-r border-border/60 bg-card/30 backdrop-blur">
          {leftPanel}
        </aside>

        {/* Center */}
        <section
          className="flex flex-col min-h-0 relative"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {dragOver && (
            <div className="absolute inset-0 z-20 bg-blue-500/10 backdrop-blur-sm border-2 border-dashed border-blue-400 rounded-xl m-3 grid place-items-center pointer-events-none">
              <div className="text-center">
                <Upload className="h-10 w-10 mx-auto mb-2 text-blue-400" />
                <div className="text-lg font-semibold">Drop to share</div>
                <div className="text-sm text-muted-foreground">Sends to all connected devices</div>
              </div>
            </div>
          )}
          <div className="p-4 flex items-center justify-between border-b border-border/60">
            <div className="text-sm text-muted-foreground">Shared files</div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setFiles([])} disabled={!files.length}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4">
              {files.length === 0 ? (
                <EmptyState onPick={() => fileInputRef.current?.click()} />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  <AnimatePresence>
                    {files.map(f => (
                      <motion.div key={f.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        <FileCard file={f} peers={peers} onSendTo={sendFileToPeer} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onPick} />
            </div>
          </ScrollArea>
        </section>

        {/* Right — desktop */}
        <aside className="hidden lg:flex flex-col border-l border-border/60 bg-card/30 backdrop-blur">
          {rightPanel}
        </aside>
      </div>

      {/* QR Dialog */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite devices</DialogTitle>
            <DialogDescription>Scan the QR code or share the room code</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="bg-white p-4 rounded-xl">
              <QRCodeCanvas
                value={typeof window !== 'undefined' ? `${window.location.origin}/wifi-fileshare?join=${room.id}` : ''}
                size={224} bgColor="#ffffff" fgColor="#000000"
              />
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Room code</div>
              <div className="font-mono text-xl font-semibold">{room.id}</div>
            </div>
            <Button variant="outline" className="w-full" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/wifi-fileshare?join=${room.id}`); toast.success('Invite link copied'); }}>
              <Copy className="h-4 w-4 mr-2" /> Copy invite link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Subcomponents ---
function LobbyView({ name, setName, joinCode, setJoinCode, onCreate, onJoin }) {
  const params = useSearchParams();
  const joinParam = params.get('join');
  useEffect(() => { if (joinParam) setJoinCode(joinParam); }, [joinParam, setJoinCode]);
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 grid place-items-center shadow-2xl shadow-violet-500/30 mb-4">
            <Share2 className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">WiFi File Share</h1>
          <p className="text-muted-foreground mt-2">Peer-to-peer, no servers, no accounts. Just share.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="glass p-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-9 w-9 rounded-lg bg-blue-500/15 grid place-items-center"><Plus className="h-4 w-4 text-blue-400" /></div>
              <div>
                <div className="font-semibold">Host a room</div>
                <div className="text-xs text-muted-foreground">Get a code & QR to share</div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Your display name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex's MacBook" />
              </div>
              <Button className="w-full bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600" onClick={onCreate} disabled={!name.trim()}>
                Create room
              </Button>
            </div>
          </Card>
          <Card className="glass p-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/15 grid place-items-center"><LogIn className="h-4 w-4 text-emerald-400" /></div>
              <div>
                <div className="font-semibold">Join a room</div>
                <div className="text-xs text-muted-foreground">Enter the code from your peer</div>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Your display name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pick a name" />
              </div>
              <div>
                <Label className="text-xs">Room code</Label>
                <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} placeholder="1234" className="font-mono text-center text-lg tracking-[0.4em]" maxLength={4} inputMode="numeric" />
              </div>
              <Button variant="outline" className="w-full" onClick={() => onJoin()} disabled={!joinCode.trim() || !name.trim()}>
                Join
              </Button>
            </div>
          </Card>
        </div>
        <div className="mt-6 text-center text-xs text-muted-foreground">
          Tip: use two browsers/tabs to test. Files transfer directly over WebRTC.
        </div>
      </div>
    </div>
  );
}

function RoomHeader({ room, peers, onLeave, onShowQR, leftPanel, rightPanel }) {
  return (
    <header className="flex flex-wrap items-center gap-2 sm:gap-3 p-3 sm:p-4 border-b border-border/60 bg-card/40 backdrop-blur">
      <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 grid place-items-center shrink-0">
        <Share2 className="h-4 w-4 text-white" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold"><span className="hidden sm:inline">WiFi File Share</span><span className="sm:hidden">Files</span></span>
          <Badge variant="secondary" className="font-mono text-[11px]">{room.id}</Badge>
        </div>
        <div className="text-[11px] text-muted-foreground flex items-center gap-2">
          <Wifi className="h-3 w-3 text-emerald-400" /> Live · {peers.length + 1} device{peers.length === 0 ? '' : 's'}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        {/* Mobile-only drawers — kept together so they share the same row */}
        <div className="flex items-center gap-1 lg:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button size="sm" variant="outline" className="h-9 px-2" data-testid="wifi-fileshare-left-btn" title="Room, devices, stats">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-[88vw] sm:w-80 max-w-sm flex flex-col">
              <SheetHeader className="sr-only"><SheetTitle>Room & devices</SheetTitle></SheetHeader>
              {leftPanel}
            </SheetContent>
          </Sheet>
          <Sheet>
            <SheetTrigger asChild>
              <Button size="sm" variant="outline" className="h-9 px-2" data-testid="wifi-fileshare-right-btn" title="Transfers & activity">
                <ListChecks className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0 w-[88vw] sm:w-80 max-w-sm flex flex-col">
              <SheetHeader className="sr-only"><SheetTitle>Transfers & activity</SheetTitle></SheetHeader>
              {rightPanel}
            </SheetContent>
          </Sheet>
        </div>
        <Button size="sm" variant="outline" onClick={onShowQR} className="h-9 px-2 sm:px-3"><QrCode className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Invite</span></Button>
        <Button size="sm" variant="ghost" onClick={onLeave} className="h-9 px-2 sm:px-3"><X className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Leave</span></Button>
      </div>
    </header>
  );
}

function LeftRoomPanel({ room, name, peers, rtcRef, files, transfers, onShowQR, onUpload }) {
  return (
    <div className="p-4 space-y-4 overflow-y-auto scrollbar-thin">
      <Card className="glass p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Room</div>
        <div className="font-mono text-sm font-semibold">{room.id}</div>
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => { navigator.clipboard.writeText(room.id); toast.success('Code copied'); }}>
            <Copy className="h-3.5 w-3.5 mr-1" /> Copy
          </Button>
          <Button size="sm" variant="outline" onClick={onShowQR}>
            <QrCode className="h-3.5 w-3.5" />
          </Button>
        </div>
      </Card>
      <Card className="glass p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Devices</div>
          <Badge variant="secondary" className="text-[10px]">{peers.length + 1}</Badge>
        </div>
        <DeviceRow self name={name} />
        {peers.map(p => {
          const rtc = rtcRef.current?.peers.get(p.id);
          return <DeviceRow key={p.id} name={p.name} ready={rtc?.ready} />;
        })}
      </Card>
      <Card className="glass p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <HardDrive className="h-3.5 w-3.5" /> Stats
        </div>
        <StatRow label="Files" value={files.length} />
        <StatRow label="Total" value={fmtBytes(files.reduce((s,f) => s + (f.size || 0), 0))} />
        <StatRow label="Active transfers" value={transfers.filter(t => !t.done).length} />
      </Card>
      <Button onClick={onUpload} className="w-full bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600">
        <Upload className="h-4 w-4 mr-2" /> Upload files
      </Button>
      <div className="text-[10px] text-center text-muted-foreground">Ctrl/⌘ + U to upload</div>
    </div>
  );
}

function RightRoomPanel({ transfers, activity }) {
  return (
    <Tabs defaultValue="transfers" className="flex flex-col flex-1 min-h-0">
      <TabsList className="m-3 grid grid-cols-2">
        <TabsTrigger value="transfers" className="text-xs">Transfers</TabsTrigger>
        <TabsTrigger value="activity" className="text-xs">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="transfers" className="flex-1 min-h-0 mt-0">
        <ScrollArea className="h-full px-3 pb-3">
          {transfers.length === 0 ? (
            <div className="text-xs text-muted-foreground p-3 text-center">No transfers yet</div>
          ) : transfers.slice().reverse().map(t => <TransferRow key={t.id} t={t} />)}
        </ScrollArea>
      </TabsContent>
      <TabsContent value="activity" className="flex-1 min-h-0 mt-0">
        <ScrollArea className="h-full px-3 pb-3">
          {activity.length === 0 ? (
            <div className="text-xs text-muted-foreground p-3 text-center">No activity yet</div>
          ) : activity.map(a => (
            <div key={a.id} className="flex items-start gap-2 py-1.5 text-xs">
              <Activity className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="truncate">{a.text}</div>
                <div className="text-[10px] text-muted-foreground">{new Date(a.time).toLocaleTimeString()}</div>
              </div>
            </div>
          ))}
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}

function DeviceRow({ self, name, ready }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="relative h-2 w-2">
        <div className={cn('h-2 w-2 rounded-full', self ? 'bg-blue-400' : ready ? 'bg-emerald-400' : 'bg-amber-400')} />
        {(self || ready) && <div className={cn('absolute inset-0 rounded-full', self ? 'bg-blue-400/40' : 'bg-emerald-400/40', 'pulse-ring')} />}
      </div>
      <div className="text-sm flex-1 truncate">{name}</div>
      {self ? <Badge variant="secondary" className="h-5 text-[10px]">You</Badge> :
        ready ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />}
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

function EmptyState({ onPick }) {
  return (
    <div className="h-[60vh] grid place-items-center">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 grid place-items-center border border-border">
          <Upload className="h-7 w-7 text-blue-400" />
        </div>
        <div className="font-semibold mb-1">Drop files here</div>
        <div className="text-sm text-muted-foreground mb-4">Or click below. Files are sent directly to peers via encrypted WebRTC.</div>
        <Button onClick={onPick} className="bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600">
          <Upload className="h-4 w-4 mr-2" /> Choose files
        </Button>
      </div>
    </div>
  );
}

function FileCard({ file, peers, onSendTo }) {
  const Icon = iconForType(file.name);
  const pct = file.size ? Math.min(100, Math.round((file.receivedBytes || 0) / file.size * 100)) : 100;
  const isImage = /^image\//.test(file.type) && file.blobUrl;
  return (
    <Card className="glass p-3 hover:border-foreground/20 transition">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 rounded-lg bg-muted/50 grid place-items-center shrink-0 overflow-hidden">
          {isImage ? <img src={file.blobUrl} alt="" className="h-full w-full object-cover" /> : <Icon className="h-5 w-5 text-muted-foreground" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate">{file.name}</div>
          <div className="text-[11px] text-muted-foreground">
            {fmtBytes(file.size)} · from {file.ownerName}{file.local ? ' (you)' : ''}
          </div>
          {!file.complete && (
            <div className="mt-2">
              <Progress value={pct} className="h-1" />
              <div className="text-[10px] text-muted-foreground mt-0.5">{pct}%</div>
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {file.complete && file.blobUrl && (
          <a href={file.blobUrl} download={file.name} className="flex-1">
            <Button size="sm" variant="outline" className="w-full h-8">
              <Download className="h-3.5 w-3.5 mr-1.5" /> Download
            </Button>
          </a>
        )}
        {file.local && peers.length > 0 && (
          <SendMenu peers={peers} onPick={(pid) => {
            // re-send original blob to specific peer
            fetch(file.blobUrl).then(r => r.blob()).then(b => {
              const newFile = new File([b], file.name, { type: file.type });
              onSendTo(pid, newFile);
            });
          }} />
        )}
      </div>
    </Card>
  );
}

function SendMenu({ peers, onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button size="sm" variant="outline" className="h-8" onClick={() => setOpen(o => !o)}>
        <Send className="h-3.5 w-3.5 mr-1.5" /> Send to
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-10 w-48 rounded-md border bg-popover p-1 shadow-md">
          {peers.map(p => (
            <button key={p.id} className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded" onClick={() => { setOpen(false); onPick(p.id); }}>
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TransferRow({ t }) {
  const pct = t.total ? Math.min(100, Math.round(t.sent / t.total * 100)) : 0;
  const speedMB = t.speed ? (t.speed / (1024 * 1024)) : 0;
  const remaining = t.total - t.sent;
  const etaSec = t.speed > 0 ? Math.ceil(remaining / t.speed) : null;
  return (
    <div className="py-2 border-b border-border/40 last:border-0">
      <div className="flex items-center justify-between text-xs gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', t.done ? 'bg-emerald-400' : 'bg-blue-400 animate-pulse')} />
          <span className="truncate">{t.direction === 'out' ? '→' : '←'} {t.peerName}</span>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">{fmtBytes(t.sent)}/{fmtBytes(t.total)}</span>
      </div>
      <Progress value={pct} className="h-1 mt-1.5" />
      <div className="flex justify-between mt-0.5 text-[10px] text-muted-foreground">
        <span>{pct}%</span>
        <span>{t.done ? 'Done' : speedMB ? `${speedMB.toFixed(2)} MB/s${etaSec != null ? ` · ${etaSec}s` : ''}` : '…'}</span>
      </div>
    </div>
  );
}
