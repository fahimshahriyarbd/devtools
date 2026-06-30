'use client';
import { useEffect, useMemo, useRef, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeCanvas } from 'qrcode.react';
import {
  Share2, Upload, Plus, LogIn, Copy, QrCode, Users, HardDrive, X,
  Download, FileText, FileImage, FileArchive, FileCode, Film, Music,
  File as FileIcon, Wifi, WifiOff, CheckCircle2, Loader2, Send, Trash2, Activity,
  ListChecks, Menu, FolderUp, RefreshCw,
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
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { WebRTCRoom, createRoom, joinRoom, checkName } from '@/lib/webrtc-room';
import { cn } from '@/lib/utils';
import { useMobileSheet } from '@/hooks/use-mobile-sheet';
import JSZip from 'jszip';

const CHUNK_SIZE = 16 * 1024; // 16KB chunks — safe for both WebRTC and the
                              // server-relay fallback. Base64-encoded over
                              // HTTP this is ~22KB per POST, well under any
                              // production ingress / proxy body-size limit
                              // (most default to 1MB but some CDN edges or
                              // managed-K8s ingresses cap at 64KB by default).
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

// Re-wrap a File with a new name (e.g. its full folder path) so the send
// pipeline transmits the relative path to the receiver. Returns a new File
// that owns the original bytes — the original File object is left alone.
const relabelFile = (file, newName) => {
  try {
    return new File([file], newName, { type: file.type, lastModified: file.lastModified });
  } catch {
    // Older browsers without File constructor — fall back to mutating a copy.
    const f = file;
    Object.defineProperty(f, 'name', { value: newName, configurable: true });
    return f;
  }
};

// Recursively walk drag-and-dropped FileSystemEntry items and resolve to a
// flat list of Files whose names carry the full relative folder path.
const collectFilesFromEntries = async (entries) => {
  const out = [];
  const walk = async (entry, prefix) => {
    if (!entry) return;
    if (entry.isFile) {
      await new Promise((res) => {
        entry.file((f) => {
          out.push(relabelFile(f, prefix ? `${prefix}/${f.name}` : f.name));
          res();
        }, () => res());
      });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      // readEntries returns up to 100 at a time — loop until empty.
      const readAll = () => new Promise((res) => {
        const all = [];
        const pump = () => reader.readEntries((batch) => {
          if (!batch.length) return res(all);
          all.push(...batch);
          pump();
        }, () => res(all));
        pump();
      });
      const children = await readAll();
      const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
      for (const c of children) await walk(c, nextPrefix);
    }
  };
  for (const e of entries) await walk(e, '');
  return out;
};

// Bundle a list of Files (whose `name` already carries a relative path like
// "myfolder/sub/a.txt") into a single .zip File named "<rootName>.zip".
// The zip preserves the folder hierarchy exactly so unzipping on the
// receiver restores the original tree.
const zipFilesToFolder = async (filesWithPaths, rootName) => {
  const zip = new JSZip();
  for (const f of filesWithPaths) {
    zip.file(f.name, f);
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  const safeName = (rootName || 'folder').replace(/[\\/]/g, '_');
  return new File([blob], `${safeName}.zip`, { type: 'application/zip' });
};

export default function WifiFileSharePage() {
  return (
    <Suspense fallback={null}>
      <WifiFileShareInner />
    </Suspense>
  );
}

function WifiFileShareInner() {
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
  const [autoBroadcast, setAutoBroadcast] = useState(true);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const rtcRef = useRef(null);
  const incomingRef = useRef(new Map()); // fileId -> { meta, chunks:[], received }
  const xferStateRef = useRef(new Map()); // xferId -> { startedAt, lastTick, lastBytes, speed }
  // Holds local file ids the user removed so any in-flight outgoing send loops
  // can short-circuit. Used as a cancel signal — keyed by the same `localId`
  // that identifies a file in the UI list.
  const canceledRef = useRef(new Set());

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

  // Remove a single file from THIS user's view. If it's still receiving from
  // a peer, drop the in-progress incoming buffer. If it's a local file being
  // sent to peers, mark it canceled so the send loop exits at its next chunk.
  // Also revokes the blob URL and drops related rows from the Transfers panel.
  const removeFile = useCallback((id) => {
    canceledRef.current.add(id);
    // Stop incoming (id === incoming fileId for received files)
    if (incomingRef.current.has(id)) {
      incomingRef.current.delete(id);
    }
    setFiles(fs => {
      const target = fs.find(f => f.id === id);
      if (target?.blobUrl) {
        try { URL.revokeObjectURL(target.blobUrl); } catch { /* noop */ }
      }
      return fs.filter(f => f.id !== id);
    });
    // Drop any transfer rows tied to this file — incoming rows match on
    // `fileId`, outgoing rows match on `localId`.
    setTransfers(ts => ts.filter(t => t.fileId !== id && t.localId !== id));
    logActivity('Removed file from your view', 'info');
  }, []);

  // Wipe every file from THIS user's view and abort all in-flight transfers
  // owned by this device. Other peers keep their copies.
  const clearAllFiles = useCallback(() => {
    setFiles(fs => {
      fs.forEach(f => {
        canceledRef.current.add(f.id);
        if (f.blobUrl) { try { URL.revokeObjectURL(f.blobUrl); } catch { /* noop */ } }
      });
      return [];
    });
    for (const k of incomingRef.current.keys()) canceledRef.current.add(k);
    incomingRef.current.clear();
    setTransfers([]);
    logActivity('Cleared all files', 'info');
  }, []);

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
      const myName = res.assignedName || ownName;
      if (res.assignedName && res.assignedName !== ownName) {
        setName(myName);
        toast.info(`Display name set to "${myName}"`);
      }
      setRoom(res.room);
      setSelfId(res.youAre);
      setMode('in-room');
      setShowQR(true);
      wireRoom(res.room.id, res.youAre, myName);
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
      const myName = res.assignedName || name;
      if (res.assignedName && res.assignedName !== name) {
        setName(myName);
        toast.info(`Name already taken — joined as "${myName}"`);
      }
      setRoom(res.room);
      setSelfId(res.youAre);
      setMode('in-room');
      wireRoom(res.room.id, res.youAre, myName);
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
      logActivity('Refreshed peer connections', 'info');
    } catch (e) {
      toast.error('Refresh failed', { id: tid });
    }
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
      // Peer is usable if EITHER the direct data channel is open AND has
      // been verified bidirectional via ping/pong, OR the room has
      // promoted it to relay mode (server-side message relay over polling).
      // The send pipeline in webrtc-room.sendTo() picks the right transport
      // automatically, so callers only need to know the peer is reachable.
      const dcUsable = p?.dc?.readyState === 'open' && p?.dcVerified;
      if (p?.ready && (dcUsable || p.relayMode)) return true;
      await new Promise(res => setTimeout(res, 200));
    }
    return false;
  };

  const sendFileToPeer = async (peerId, file, localId = null) => {
    const fileId = crypto.randomUUID();
    const ownerName = name;
    const meta = { id: fileId, name: file.name, size: file.size, type: file.type, ownerId: selfId, ownerName };
    const r = rtcRef.current;
    if (!r) return;
    const peerName = peers.find(p => p.id === peerId)?.name || 'peer';

    if (localId) setOutgoingProgress(localId, peerId, peerName, 0, file.size, false);

    // Ensure peer connected
    const ok2 = await waitForPeerReady(peerId);
    if (!ok2) {
      if (localId) clearOutgoingPeer(localId, peerId);
      return toast.error('Peer not connected (timeout)');
    }

    const ok = r.sendTo(peerId, JSON.stringify({ kind: 'file-meta', meta }));
    if (!ok) {
      if (localId) clearOutgoingPeer(localId, peerId);
      return toast.error('Peer not connected');
    }

    const xferId = crypto.randomUUID();
    const xfer = { id: xferId, fileId, localId, direction: 'out', peerId, peerName, total: file.size, sent: 0, started: Date.now(), speed: 0 };
    setTransfers(t => [...t, xfer]);
    xferStateRef.current.set(xferId, { startedAt: Date.now(), lastTick: Date.now(), lastBytes: 0, speed: 0 });

    // Note: file is already shown in the local files list (this fn is only used
    // for re-sending an existing local file via "Send to"). Do NOT add again
    // or it would appear duplicated each time the user sends.

    let offset = 0;
    const reader = file.stream().getReader();
    while (true) {
      if (localId && canceledRef.current.has(localId)) {
        try { await reader.cancel(); } catch { /* noop */ }
        if (localId) clearOutgoingPeer(localId, peerId);
        return;
      }
      const { done, value } = await reader.read();
      if (done) break;
      // value may be > 64KB. Split into CHUNK_SIZE.
      let v = value;
      while (v.byteLength > 0) {
        if (localId && canceledRef.current.has(localId)) {
          try { await reader.cancel(); } catch { /* noop */ }
          if (localId) clearOutgoingPeer(localId, peerId);
          return;
        }
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
        if (!sentOk) {
          if (localId) clearOutgoingPeer(localId, peerId);
          toast.error('Connection dropped');
          return;
        }

        offset += slice.byteLength;
        updateTransferProgress(xferId, offset);
        if (localId) setOutgoingProgress(localId, peerId, peerName, offset, file.size, false);
      }
    }

    r.sendTo(peerId, JSON.stringify({ kind: 'file-end', fileId }));
    setTransfers(ts => ts.map(t => t.id === xferId ? { ...t, sent: file.size, done: true } : t));
    if (localId) setOutgoingProgress(localId, peerId, peerName, file.size, file.size, true);
    logActivity(`Sent "${file.name}" to ${peerName}`, 'out');
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

  const addFileLocally = (file) => {
    const localId = crypto.randomUUID();
    const meta = { id: localId, name: file.name, size: file.size, type: file.type, ownerId: selfId, ownerName: name };
    const url = URL.createObjectURL(file);
    setFiles(fs => [{ ...meta, blobUrl: url, receivedBytes: file.size, complete: true, local: true, outgoing: {} }, ...fs]);
    return localId;
  };

  const setOutgoingProgress = (localId, peerId, peerName, sent, total, done) => {
    setFiles(fs => fs.map(f => {
      if (f.id !== localId) return f;
      const outgoing = { ...(f.outgoing || {}) };
      outgoing[peerId] = { peerName, sent, total, done: !!done };
      return { ...f, outgoing };
    }));
  };

  const clearOutgoingPeer = (localId, peerId) => {
    setFiles(fs => fs.map(f => {
      if (f.id !== localId) return f;
      const outgoing = { ...(f.outgoing || {}) };
      delete outgoing[peerId];
      return { ...f, outgoing };
    }));
  };

  const broadcastFile = async (file) => {
    // Add to local list IMMEDIATELY so the upload feels instant
    const localId = addFileLocally(file);
    if (peers.length === 0) {
      toast.info('No peers — file added locally');
      return;
    }
    // Seed outgoing entries so the card shows "Sending to N…" right away
    for (const p of peers) {
      setOutgoingProgress(localId, p.id, p.name, 0, file.size, false);
    }
    // Send to all peers in parallel
    await Promise.all(peers.map(p => sendFileToPeerSilent(p.id, file, localId)));
  };

  const sendFileToPeerSilent = async (peerId, file, localId = null) => {
    // Internal version that does not add to local files (used by broadcast)
    const fileId = crypto.randomUUID();
    const meta = { id: fileId, name: file.name, size: file.size, type: file.type, ownerId: selfId, ownerName: name };
    const r = rtcRef.current;
    if (!r) return;
    const peerName = peers.find(p => p.id === peerId)?.name || 'peer';
    if (localId) setOutgoingProgress(localId, peerId, peerName, 0, file.size, false);

    const ready = await waitForPeerReady(peerId);
    if (!ready) {
      if (localId) clearOutgoingPeer(localId, peerId);
      toast.error(`Couldn't reach ${peerName} — WebRTC not connected`);
      logActivity(`Failed to send "${file.name}" to ${peerName} (not connected)`, 'out');
      return;
    }
    const ok = r.sendTo(peerId, JSON.stringify({ kind: 'file-meta', meta }));
    if (!ok) {
      if (localId) clearOutgoingPeer(localId, peerId);
      toast.error(`Couldn't reach ${peerName}`);
      return;
    }
    const xferId = crypto.randomUUID();
    setTransfers(t => [...t, { id: xferId, fileId, localId, direction: 'out', peerId, peerName, total: file.size, sent: 0, started: Date.now(), speed: 0 }]);
    xferStateRef.current.set(xferId, { startedAt: Date.now(), lastTick: Date.now(), lastBytes: 0, speed: 0 });
    let offset = 0;
    const reader = file.stream().getReader();
    while (true) {
      if (localId && canceledRef.current.has(localId)) {
        try { await reader.cancel(); } catch { /* noop */ }
        if (localId) clearOutgoingPeer(localId, peerId);
        return;
      }
      const { done, value } = await reader.read();
      if (done) break;
      let v = value;
      while (v.byteLength > 0) {
        if (localId && canceledRef.current.has(localId)) {
          try { await reader.cancel(); } catch { /* noop */ }
          if (localId) clearOutgoingPeer(localId, peerId);
          return;
        }
        const slice = v.byteLength > CHUNK_SIZE ? v.subarray(0, CHUNK_SIZE) : v;
        v = v.byteLength > CHUNK_SIZE ? v.subarray(CHUNK_SIZE) : new Uint8Array(0);
        while ((r.bufferedAmount(peerId) || 0) > HIGH_WATER) await new Promise(res => setTimeout(res, 20));
        const tagged = new Uint8Array(36 + slice.byteLength);
        tagged.set(new TextEncoder().encode(fileId), 0);
        tagged.set(slice, 36);
        if (!r.sendTo(peerId, tagged.buffer)) {
          if (localId) clearOutgoingPeer(localId, peerId);
          return;
        }
        offset += slice.byteLength;
        updateTransferProgress(xferId, offset);
        if (localId) setOutgoingProgress(localId, peerId, peerName, offset, file.size, false);
      }
    }
    r.sendTo(peerId, JSON.stringify({ kind: 'file-end', fileId }));
    setTransfers(ts => ts.map(t => t.id === xferId ? { ...t, sent: file.size, done: true } : t));
    if (localId) setOutgoingProgress(localId, peerId, peerName, file.size, file.size, true);
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

  const onDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const items = e.dataTransfer.items;
    // Prefer the items API so folder drops can be walked recursively.
    // Falls back to flat files when the browser doesn't expose entries.
    const entries = items
      ? Array.from(items).map(i => i.webkitGetAsEntry?.()).filter(Boolean)
      : [];
    if (entries.length && entries.some(en => en && en.isDirectory)) {
      // Mixed drop: zip each directory into one file, send loose files normally.
      const looseFiles = [];
      for (const en of entries) {
        if (en.isDirectory) {
          const inside = await collectFilesFromEntries([en]);
          // Strip the top-level folder name from each path inside the zip so
          // the archive root *is* that folder.
          const rebased = inside.map(f => {
            const rest = f.name.startsWith(`${en.name}/`)
              ? f.name.slice(en.name.length + 1)
              : f.name;
            return relabelFile(f, rest);
          });
          const toastId = toast.loading(`Zipping "${en.name}"…`);
          try {
            const zipped = await zipFilesToFolder(rebased, en.name);
            toast.success(`Zipped "${en.name}" (${rebased.length} files)`, { id: toastId });
            autoBroadcast ? broadcastFile(zipped) : addFileLocally(zipped);
          } catch (err) {
            toast.error(`Failed to zip "${en.name}"`, { id: toastId });
          }
        } else if (en.isFile) {
          await new Promise((res) => en.file((f) => { looseFiles.push(f); res(); }, () => res()));
        }
      }
      for (const f of looseFiles) autoBroadcast ? broadcastFile(f) : addFileLocally(f);
      return;
    }
    const fl = Array.from(e.dataTransfer.files || []);
    for (const f of fl) autoBroadcast ? broadcastFile(f) : addFileLocally(f);
  };
  const onPick = (e) => {
    const fl = Array.from(e.target.files || []);
    for (const f of fl) autoBroadcast ? broadcastFile(f) : addFileLocally(f);
    e.target.value = '';
  };
  const onPickFolder = async (e) => {
    const fl = Array.from(e.target.files || []);
    e.target.value = '';
    if (!fl.length) return;
    // Group files by their root folder (first path segment) so picking
    // multiple sibling folders produces one .zip per folder. With the standard
    // webkitdirectory picker the user can only pick one folder at a time, so
    // typically this is a single group — but the grouping keeps the code
    // robust for browsers/cases where multiple roots come through.
    const groups = new Map(); // rootName -> Array<{ path, file }>
    for (const f of fl) {
      const rel = f.webkitRelativePath || f.name;
      const [root, ...rest] = rel.split('/');
      const inner = rest.length ? rest.join('/') : f.name;
      const key = rest.length ? root : '__loose__';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(relabelFile(f, inner));
    }
    for (const [rootName, items] of groups) {
      if (rootName === '__loose__') {
        // No folder structure (unlikely from the directory picker) — send each
        // file individually.
        for (const f of items) autoBroadcast ? broadcastFile(f) : addFileLocally(f);
        continue;
      }
      const toastId = toast.loading(`Zipping "${rootName}"… (${items.length} files)`);
      try {
        const zipped = await zipFilesToFolder(items, rootName);
        toast.success(`Zipped "${rootName}" → ${zipped.name}`, { id: toastId });
        autoBroadcast ? broadcastFile(zipped) : addFileLocally(zipped);
      } catch (err) {
        toast.error(`Failed to zip "${rootName}"`, { id: toastId });
      }
    }
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
      autoBroadcast={autoBroadcast}
      onToggleAutoBroadcast={setAutoBroadcast}
      onShowQR={() => setShowQR(true)}
      onUpload={() => fileInputRef.current?.click()}
      onUploadFolder={() => folderInputRef.current?.click()}
    />
  );
  const rightPanel = (
    <RightRoomPanel transfers={transfers} activity={activity} />
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <RoomHeader
        room={room} selfId={selfId} peers={peers}
        isHost={!!(selfId && room && selfId === room.hostId)}
        onLeave={leaveRoom} onShowQR={() => setShowQR(true)}
        onRefresh={handleRefreshConnections}
        leftPanel={leftPanel} rightPanel={rightPanel}
      />
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[280px_1fr_240px]">
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
                <div className="text-lg font-semibold">Drop files or folder to share</div>
                <div className="text-sm text-muted-foreground">
                  {autoBroadcast ? 'Sends to all connected devices' : 'Added to your library only — use "Send to" to share'}
                </div>
              </div>
            </div>
          )}
          <div className="p-4 flex items-center justify-between border-b border-border/60">
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              Shared files
              {files.some(f => f.local && Object.values(f.outgoing || {}).some(o => !o.done)) && (
                <span
                  className="inline-flex items-center gap-1 text-xs text-blue-400"
                  data-testid="sending-indicator"
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Sending…
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={clearAllFiles} disabled={!files.length} data-testid="clear-files-btn">
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4">
              {files.length === 0 ? (
                <EmptyState onPick={() => fileInputRef.current?.click()} onPickFolder={() => folderInputRef.current?.click()} />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  <AnimatePresence>
                    {files.map(f => (
                      <motion.div key={f.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full">
                        <FileCard file={f} peers={peers} onSendTo={sendFileToPeer} onRemove={removeFile} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onPick} data-testid="file-input" />
              <input
                ref={(el) => {
                  folderInputRef.current = el;
                  if (el) {
                    // `webkitdirectory` / `directory` are non-standard attrs that
                    // React doesn't render reliably — set them on the DOM node so
                    // the picker opens in folder-selection mode.
                    el.setAttribute('webkitdirectory', '');
                    el.setAttribute('directory', '');
                  }
                }}
                type="file"
                multiple
                className="hidden"
                onChange={onPickFolder}
                data-testid="folder-input"
              />
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
                value={typeof window !== 'undefined' ? `${window.location.origin}/wifi-file-share?join=${room.id}` : ''}
                size={224} bgColor="#ffffff" fgColor="#000000"
              />
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Room code</div>
              <div className="font-mono text-xl font-semibold">{room.id}</div>
            </div>
            <Button variant="outline" className="w-full" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/wifi-file-share?join=${room.id}`); toast.success('Invite link copied'); }}>
              <Copy className="h-4 w-4 mr-2" /> Copy invite link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Subcomponents ---
function LobbyView(props) {
  return (
    <Suspense fallback={null}>
      <LobbyViewInner {...props} />
    </Suspense>
  );
}

function LobbyViewInner({ name, setName, joinCode, setJoinCode, onCreate, onJoin }) {
  const params = useSearchParams();
  const joinParam = params.get('join');
  const [nameHint, setNameHint] = useState(null);
  useEffect(() => { if (joinParam) setJoinCode(joinParam); }, [joinParam, setJoinCode]);

  // Live-check name uniqueness against the target room. Runs when the user
  // has typed a full 4-digit code and entered a name; debounces to avoid
  // hammering the backend on every keystroke.
  useEffect(() => {
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
  }, [joinCode, name]);
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
                {nameHint?.taken && (
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-amber-400">
                    <span>That name is already in the room.</span>
                    <button
                      type="button"
                      className="font-medium underline underline-offset-2 hover:text-amber-300"
                      onClick={() => { setName(nameHint.suggested); setNameHint(null); }}
                      data-testid="wifi-file-share-suggest-name-btn"
                    >
                      Use &quot;{nameHint.suggested}&quot;
                    </button>
                  </div>
                )}
              </div>
              <div>
                <Label className="text-xs">Room code</Label>
                <Input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && joinCode.trim() && name.trim()) {
                      e.preventDefault();
                      onJoin();
                    }
                  }}
                  placeholder="1234"
                  className="font-mono text-center text-lg tracking-[0.4em]"
                  maxLength={4}
                  inputMode="numeric"
                  data-testid="wifi-file-share-room-code-input"
                />
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

function RoomHeader({ room, peers, isHost, onLeave, onShowQR, onRefresh, leftPanel, rightPanel }) {
  const [leftSheetOpen, setLeftSheetOpen] = useMobileSheet();
  const [rightSheetOpen, setRightSheetOpen] = useMobileSheet();
  return (
    <header className="flex flex-wrap items-center gap-2 sm:gap-3 p-3 sm:p-4 border-b border-border/60 bg-card/40 backdrop-blur">
      {/* Mobile-only: left sidebar button sits where the brand icon would be */}
      <Sheet open={leftSheetOpen} onOpenChange={setLeftSheetOpen}>
        <SheetTrigger asChild>
          <Button
            size="sm" variant="outline" className="lg:hidden h-9 px-2 shrink-0"
            data-testid="wifi-file-share-left-btn"
            title="Room, devices, stats"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-[88vw] sm:w-80 max-w-sm flex flex-col">
          <SheetHeader className="sr-only"><SheetTitle>Room & devices</SheetTitle></SheetHeader>
          {leftPanel}
        </SheetContent>
      </Sheet>

      {/* Brand icon — desktop only (was the "bluetooth-looking" Share2 icon on mobile) */}
      <div className="hidden lg:grid h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 via-violet-500 to-fuchsia-500 place-items-center shrink-0">
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
        {isHost && (
          <Button
            size="sm" variant="outline" onClick={onRefresh}
            className="h-9 px-2 sm:px-3"
            data-testid="wifi-file-share-refresh-btn"
            title="Check & refresh peer connections (host only)"
          >
            <RefreshCw className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onShowQR} className="h-9 px-2 sm:px-3"><QrCode className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Invite</span></Button>
        <Button size="sm" variant="ghost" onClick={onLeave} className="h-9 px-2 sm:px-3"><X className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Leave</span></Button>

        {/* Mobile-only: right sidebar button at the far right */}
        <Sheet open={rightSheetOpen} onOpenChange={setRightSheetOpen}>
          <SheetTrigger asChild>
            <Button
              size="sm" variant="outline" className="lg:hidden h-9 px-2 shrink-0"
              data-testid="wifi-file-share-right-btn"
              title="Transfers & activity"
            >
              <ListChecks className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="p-0 w-[88vw] sm:w-80 max-w-sm flex flex-col">
            <SheetHeader className="sr-only"><SheetTitle>Transfers & activity</SheetTitle></SheetHeader>
            {rightPanel}
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

function LeftRoomPanel({ room, name, peers, rtcRef, files, transfers, autoBroadcast, onToggleAutoBroadcast, onShowQR, onUpload, onUploadFolder }) {
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
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Label htmlFor="auto-broadcast-toggle" className="text-sm font-medium cursor-pointer">
              Auto-send to everyone
            </Label>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Any new file added is sent to all connected devices automatically.
            </div>
          </div>
          <Switch
            id="auto-broadcast-toggle"
            data-testid="auto-broadcast-toggle"
            checked={autoBroadcast}
            onCheckedChange={onToggleAutoBroadcast}
          />
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
      <Button onClick={onUpload} className="w-full bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600" data-testid="upload-files-btn">
        <Upload className="h-4 w-4 mr-2" /> Upload files
      </Button>
      <Button onClick={onUploadFolder} variant="outline" className="w-full" data-testid="upload-folder-btn">
        <FolderUp className="h-4 w-4 mr-2" /> Upload folder
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

function EmptyState({ onPick, onPickFolder }) {
  return (
    <div className="h-[60vh] grid place-items-center">
      <div className="text-center max-w-sm">
        <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 grid place-items-center border border-border">
          <Upload className="h-7 w-7 text-blue-400" />
        </div>
        <div className="font-semibold mb-1">Drop files or a folder here</div>
        <div className="text-sm text-muted-foreground mb-4">Or pick one below. Everything is sent directly to peers via encrypted WebRTC.</div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
          <Button onClick={onPick} className="bg-gradient-to-r from-blue-500 to-violet-500 hover:from-blue-600 hover:to-violet-600" data-testid="empty-choose-files-btn">
            <Upload className="h-4 w-4 mr-2" /> Choose files
          </Button>
          <Button onClick={onPickFolder} variant="outline" data-testid="empty-choose-folder-btn">
            <FolderUp className="h-4 w-4 mr-2" /> Choose folder
          </Button>
        </div>
      </div>
    </div>
  );
}

function FileCard({ file, peers, onSendTo, onRemove }) {
  const pct = file.size ? Math.min(100, Math.round((file.receivedBytes || 0) / file.size * 100)) : 100;

  // Aggregate outgoing-send state (only meaningful for local files being sent to peers)
  const outgoing = file.outgoing || {};
  const outgoingEntries = Object.values(outgoing);
  const activeSends = outgoingEntries.filter(o => !o.done);
  const isSending = activeSends.length > 0;
  const totalSent = outgoingEntries.reduce((s, o) => s + (o.sent || 0), 0);
  const totalToSend = outgoingEntries.reduce((s, o) => s + (o.total || 0), 0);
  const sendPct = totalToSend ? Math.min(100, Math.round((totalSent / totalToSend) * 100)) : 0;
  const isTransferring = isSending || !file.complete;

  return (
    <Card
      className={cn(
        'glass p-3 hover:border-foreground/20 transition relative h-full flex flex-col',
        isSending && 'border-blue-400/60 shadow-lg shadow-blue-500/10'
      )}
      data-testid={`file-card-${file.id}`}
    >
      {/* Animated shimmer overlay while sending — wrapped in its OWN
          overflow-hidden container so the Send-to dropdown (positioned
          absolute below the card) isn't clipped. */}
      {isSending && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl z-0" aria-hidden>
          <motion.div
            className="absolute inset-0"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }}
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.10) 50%, transparent 100%)',
            }}
          />
        </div>
      )}
      <div className="flex items-start gap-3 relative flex-1 min-h-0 overflow-hidden">
        <div className="min-w-0 flex-1">
          {(() => {
            const parts = (file.name || '').split('/');
            const base = parts.pop();
            const folder = parts.join('/');
            return (
              <>
                {folder && (
                  <div className="text-[10px] text-muted-foreground/80 truncate font-mono" title={folder}>{folder}/</div>
                )}
                <div className="font-medium text-sm truncate" title={file.name}>{base}</div>
              </>
            );
          })()}
          <div className="text-[11px] text-muted-foreground truncate">
            {fmtBytes(file.size)} · from {file.ownerName}{file.local ? ' (you)' : ''}
          </div>

          {/* Receiving (download) progress */}
          {!file.complete && (
            <div className="mt-2">
              <Progress value={pct} className="h-1" />
              <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                <Loader2 className="h-2.5 w-2.5 animate-spin text-blue-400" />
                Receiving · {pct}%
              </div>
            </div>
          )}

          {/* Sending (upload) progress */}
          {file.local && isSending && (
            <div className="mt-2" data-testid={`file-card-sending-${file.id}`}>
              <Progress value={sendPct} className="h-1" />
              <div className="text-[10px] mt-0.5 flex items-center gap-1.5 text-blue-300">
                <motion.span
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ repeat: Infinity, duration: 1.2 }}
                  className="inline-flex items-center gap-1"
                >
                  <Send className="h-2.5 w-2.5" />
                  Sending to {activeSends.length} {activeSends.length === 1 ? 'device' : 'devices'}
                </motion.span>
                <span className="text-muted-foreground">· {sendPct}%</span>
              </div>
            </div>
          )}

          {/* Status line — always rendered for complete files so cards have
              uniform height regardless of send history. */}
          {file.complete && !isSending && (
            <div
              className="mt-2 text-[10px] flex items-center gap-1"
              data-testid={`file-card-status-${file.id}`}
            >
              {outgoingEntries.length > 0 ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                  <span className="text-emerald-400 truncate">
                    {file.local ? 'Sent' : 'Forwarded'} to {outgoingEntries.length} {outgoingEntries.length === 1 ? 'device' : 'devices'}
                  </span>
                </>
              ) : file.local ? (
                <>
                  <HardDrive className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground truncate">Saved locally — not sent</span>
                </>
              ) : (
                <>
                  <Download className="h-3 w-3 text-blue-400" />
                  <span className="text-muted-foreground truncate">Received from {file.ownerName}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-stretch gap-2 relative shrink-0">
        {file.complete && file.blobUrl && (
          <a
            href={file.blobUrl}
            download={file.name.split('/').pop()}
            className="flex-1 min-w-0"
          >
            <Button size="sm" variant="outline" className="w-full h-8 min-w-0 px-2">
              <Download className="h-3.5 w-3.5 shrink-0" />
              <span className="ml-1.5 truncate">Download</span>
            </Button>
          </a>
        )}
        {file.complete && file.blobUrl && peers.length > 0 && (
          <div className="flex-1 min-w-0">
            <SendMenu peers={peers} onPick={(pid) => {
              // Re-send the blob to a specific peer. Works for both local files
              // and files we received from another peer (so received files can
              // be forwarded).
              fetch(file.blobUrl).then(r => r.blob()).then(b => {
                const newFile = new File([b], file.name, { type: file.type });
                onSendTo(pid, newFile, file.id);
              });
            }} />
          </div>
        )}
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            'h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10',
            isTransferring && 'ml-auto'
          )}
          onClick={() => onRemove?.(file.id)}
          data-testid={`remove-file-${file.id}`}
          title={isTransferring ? 'Stop transfer & remove from your view' : 'Remove from your view'}
          aria-label="Remove file"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Card>
  );
}

function SendMenu({ peers, onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative w-full">
      <Button
        size="sm" variant="outline"
        className="h-8 px-2 w-full min-w-0"
        onClick={() => setOpen(o => !o)}
        data-testid="send-to-menu-trigger"
        title="Send this file to a specific peer"
      >
        <Send className="h-3.5 w-3.5 shrink-0" />
        <span className="ml-1.5 truncate">Send to</span>
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-md border bg-popover p-1 shadow-md">
          {peers.map(p => (
            <button
              key={p.id}
              data-testid={`send-to-peer-${p.id}`}
              className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded"
              onClick={() => { setOpen(false); onPick(p.id); }}
            >
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
