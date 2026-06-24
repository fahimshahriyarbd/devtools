'use client';
// WebRTC P2P room logic. Establishes mesh data-channel connections between peers
// in a signaling room. Used for both file transfer and text collaboration.

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

export class WebRTCRoom {
  constructor({ roomId, selfId, name, onPeers, onMessage, onPeerJoined, onPeerLeft, onConnState }) {
    this.roomId = roomId;
    this.selfId = selfId;
    this.name = name;
    this.onPeers = onPeers || (() => {});
    this.onMessage = onMessage || (() => {});
    this.onPeerJoined = onPeerJoined || (() => {});
    this.onPeerLeft = onPeerLeft || (() => {});
    this.onConnState = onConnState || (() => {});
    this.peers = new Map(); // peerId -> { pc, dc, name, ready }
    this.polling = false;
    this.alive = true;
  }

  async start() {
    this.polling = true;
    this._poll();
  }

  stop() {
    this.alive = false;
    this.polling = false;
    for (const [, p] of this.peers) {
      try { p.dc?.close(); } catch {}
      try { p.pc?.close(); } catch {}
    }
    this.peers.clear();
    // Best-effort leave
    fetch('/api/signal/leave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: this.roomId, deviceId: this.selfId }),
      keepalive: true,
    }).catch(() => {});
  }

  async _poll() {
    while (this.alive && this.polling) {
      try {
        const r = await fetch(`/api/signal/poll?roomId=${this.roomId}&deviceId=${this.selfId}`);
        if (r.ok) {
          const data = await r.json();
          if (data.devices) {
            this.onPeers(data.devices, data.hostId);
            // Initiate connections to any peer we don't have yet (deterministic)
            for (const d of data.devices) {
              if (d.id === this.selfId) continue;
              if (this.peers.has(d.id)) continue;
              if (this.selfId < d.id) {
                this._createConnection(d.id, d.name, true).catch(() => {});
              }
            }
          }
          for (const msg of (data.messages || [])) {
            await this._handleMessage(msg);
          }
        }
      } catch (e) { /* ignore */ }
      await new Promise(r => setTimeout(r, 700));
    }
  }

  async _handleMessage(msg) {
    if (msg.type === 'peer-joined') {
      // Existing peer initiates connection to new peer if our id < their id (deterministic)
      const them = msg.peer;
      this.onPeerJoined(them);
      if (this.selfId < them.id) {
        await this._createConnection(them.id, them.name, true);
      }
    } else if (msg.type === 'peer-left') {
      const p = this.peers.get(msg.peerId);
      if (p) { try { p.pc.close(); } catch {} }
      this.peers.delete(msg.peerId);
      this.onPeerLeft(msg.peerId);
      this.onConnState();
    } else if (msg.type === 'signal') {
      await this._handleSignal(msg.from, msg.payload);
    }
  }

  async _createConnection(peerId, peerName, initiator) {
    if (this.peers.has(peerId)) return;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const entry = { pc, dc: null, name: peerName, ready: false, initiator };
    this.peers.set(peerId, entry);

    pc.onicecandidate = (e) => {
      if (e.candidate) this._send(peerId, { kind: 'ice', candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => {
      this.onConnState();
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        // mark not ready
        entry.ready = false;
      }
    };

    if (initiator) {
      const dc = pc.createDataChannel('data', { ordered: true });
      this._wireDataChannel(peerId, dc);
      entry.dc = dc;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this._send(peerId, { kind: 'sdp', sdp: pc.localDescription });
    } else {
      pc.ondatachannel = (e) => {
        entry.dc = e.channel;
        this._wireDataChannel(peerId, e.channel);
      };
    }
  }

  _wireDataChannel(peerId, dc) {
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => {
      const p = this.peers.get(peerId);
      if (p) p.ready = true;
      this.onConnState();
    };
    dc.onclose = () => {
      const p = this.peers.get(peerId);
      if (p) p.ready = false;
      this.onConnState();
    };
    dc.onmessage = (e) => {
      this.onMessage(peerId, e.data);
    };
  }

  async _handleSignal(fromId, payload) {
    let entry = this.peers.get(fromId);
    if (!entry) {
      await this._createConnection(fromId, 'Peer', false);
      entry = this.peers.get(fromId);
    }
    if (payload.kind === 'sdp') {
      const desc = payload.sdp;
      await entry.pc.setRemoteDescription(desc);
      if (desc.type === 'offer') {
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        this._send(fromId, { kind: 'sdp', sdp: entry.pc.localDescription });
      }
    } else if (payload.kind === 'ice') {
      try { await entry.pc.addIceCandidate(payload.candidate); } catch {}
    }
  }

  _send(toId, payload) {
    fetch('/api/signal/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: this.roomId, fromId: this.selfId, toId, payload }),
    }).catch(() => {});
  }

  sendTo(peerId, data) {
    const p = this.peers.get(peerId);
    if (p && p.ready && p.dc?.readyState === 'open') {
      p.dc.send(data);
      return true;
    }
    return false;
  }

  broadcast(data) {
    let sent = 0;
    for (const [, p] of this.peers) {
      if (p.ready && p.dc?.readyState === 'open') {
        try { p.dc.send(data); sent++; } catch {}
      }
    }
    return sent;
  }

  bufferedAmount(peerId) {
    const p = this.peers.get(peerId);
    return p?.dc?.bufferedAmount ?? 0;
  }
}

export async function createRoom({ name, kind = 'file', password }) {
  const hostId = crypto.randomUUID();
  const r = await fetch('/api/signal/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostId, hostName: name, kind, password }),
  });
  const data = await r.json();
  return data;
}

export async function joinRoom({ roomId, name, password, expectKind }) {
  const deviceId = crypto.randomUUID();
  const r = await fetch('/api/signal/join', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId, deviceId, name, password, expectKind }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: 'Join failed' }));
    throw new Error(err.error || 'Join failed');
  }
  return r.json();
}
