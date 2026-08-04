'use client';
// WebRTC room with mandatory server-relay fallback.
//
// Critical design decisions (informed by the cross-device debugging round):
//
//  1. EVERY peer that appears in the signaling devices list is IMMEDIATELY
//     tracked locally with a placeholder entry. Previously only the
//     "initiator" side (lower selfId) created an entry — the non-initiator
//     side had no entry at all, so when the app called sendTo()/broadcast()
//     on that side, there was literally no peer to send to and the data was
//     silently dropped. This was the root cause of "files & text don't sync"
//     even after the relay endpoint existed.
//
//  2. The initiator side ALSO creates an RTCPeerConnection and tries direct
//     WebRTC. The non-initiator side waits for the offer to arrive via the
//     polling channel and then upgrades its placeholder to a real
//     PeerConnection.
//
//  3. sendTo() / broadcast() ALWAYS deliver data:
//        - If the data channel is open → use it (fast direct P2P)
//        - Otherwise → enqueue via /api/signal/relay (works on any network)
//     There is no scenario where calling sendTo on a known peer returns
//     "false" silently — the relay path is the always-on safety net.
//
//  4. The UI "ready" indicator is flipped to green within RELAY_UI_DELAY_MS
//     even if the direct data channel hasn't opened yet, so the participant
//     entry stops spinning. Underlying transport may still be relay, which
//     is transparent to the application code.
//
//  5. If the data channel eventually opens AFTER relay kicked in, we switch
//     subsequent sends to the direct path for better throughput.

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  {
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

const PC_CONFIG = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 4,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceTransportPolicy: 'all',
};

// How long to wait for the direct data channel to be PROVEN bidirectional
// (via the ping/pong handshake) before flipping the peer to relay mode so
// `sendTo` / `broadcast` start using the always-on server-relay path. This
// is the maximum time the user waits before *something* starts flowing.
const RELAY_UI_DELAY_MS = 1500;

// After dc.onopen fires we send an internal `__rtc-ping` message and wait
// for a `__rtc-pong` reply. If we don't see the pong within this window,
// we treat the data channel as broken (false-open) and switch to relay.
// This is the critical fix for the cross-device-on-same-LAN failure mode
// where mDNS host candidates make ICE think it's connected but no actual
// data flows over the underlying transport.
const DC_VERIFY_TIMEOUT_MS = 2500;

const DBG = true;
const log = (...a) => { if (DBG) try { console.log('[rtc]', ...a); } catch {} };

const bufToB64 = (buf) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
};
const b64ToBuf = (b64) => {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
};

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
    // peerId -> { pc, dc, name, ready, initiator, pendingIce, remoteSet,
    //             relayMode, relayTimer, relayBufAmt }
    this.peers = new Map();
    this.polling = false;
    this.alive = true;
  }

  async start() {
    this.polling = true;
    this._poll();
    this._refreshLoop();
  }

  stop() {
    this.alive = false;
    this.polling = false;
    for (const [, p] of this.peers) {
      try { p.dc?.close(); } catch {}
      try { p.pc?.close(); } catch {}
      if (p.relayTimer) clearTimeout(p.relayTimer);
    }
    this.peers.clear();
    fetch('/api/signal/leave', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: this.roomId, deviceId: this.selfId }),
      keepalive: true,
    }).catch(() => {});
  }

  // ---- periodic auto-refresh ------------------------------------------
  //
  // Every 5 seconds, scan all tracked peers and re-establish any that are
  // stuck. This catches three failure modes the initial handshake can't:
  //   1. PeerConnection ended up in 'failed' / 'disconnected' state silently
  //      (mobile sleep, NAT rebind, brief Wi-Fi drop) — we tear it down and
  //      re-create it, kicking ICE off again from a clean slate.
  //   2. ICE state went to 'failed' but connectionState is still stale — we
  //      issue an ICE restart on the offering side.
  //   3. No data channel ever opened AND the peer was never promoted to
  //      relay mode for some reason — we force-promote so sendTo/broadcast
  //      can still reach the peer over the polling relay.
  async _refreshLoop() {
    while (this.alive) {
      await new Promise(r => setTimeout(r, 5000));
      if (!this.alive) break;
      try { await this.refreshConnections({ silent: true }); } catch {}
    }
  }

  async refreshConnections({ silent = false } = {}) {
    const results = { healed: 0, restarted: 0, recreated: 0, promoted: 0 };
    for (const [peerId, p] of this.peers) {
      const dcUsable = p.dc?.readyState === 'open' && p.dcVerified;
      if (dcUsable) {
        results.healed++;
        continue;
      }

      // Only the lexicographically smaller selfId is the WebRTC "offerer".
      // The other side waits for the new offer to come in via signaling.
      if (p.initiator) {
        const pcDead =
          !p.pc ||
          ['failed', 'disconnected', 'closed'].includes(p.pc?.connectionState) ||
          ['failed', 'disconnected', 'closed'].includes(p.pc?.iceConnectionState) ||
          p.dcBroken;

        if (!p.pc) {
          await this._ensurePeerConnection(peerId, true).catch(() => {});
          results.recreated++;
        } else if (pcDead) {
          try { p.dc?.close(); } catch {}
          try { p.pc?.close(); } catch {}
          if (p.pingTimer) { clearTimeout(p.pingTimer); p.pingTimer = null; }
          p.pc = null;
          p.dc = null;
          p.remoteSet = false;
          p.pendingIce = [];
          p.dcVerified = false;
          p.dcBroken = false;
          await this._ensurePeerConnection(peerId, true).catch(() => {});
          results.recreated++;
        } else {
          await this._restartIce(peerId).catch(() => {});
          results.restarted++;
        }
      }

      // Make sure relay mode is at least available so sendTo never errors
      // out and the UI indicator stops spinning forever.
      if (!p.relayMode) {
        p.relayMode = true;
        p.ready = true;
        results.promoted++;
      }
    }
    if (!silent && DBG) log('refreshConnections', results);
    this.onConnState();
    return results;
  }

  // ---- main loop -------------------------------------------------------

  async _poll() {
    while (this.alive && this.polling) {
      try {
        // Wrap fetch in an inner try/catch so any sync throw from a browser-
        // extension-instrumented `window.fetch` (e.g. "Failed to fetch")
        // becomes a regular rejection that the outer catch absorbs cleanly.
        const r = await fetch(`/api/signal/poll?roomId=${this.roomId}&deviceId=${this.selfId}`).catch(() => null);
        if (r && r.ok) {
          const data = await r.json().catch(() => null);
          if (data && data.devices) {
            this.onPeers(data.devices, data.hostId);
            for (const d of data.devices) {
              if (d.id === this.selfId) continue;
              // ALWAYS track every peer we see — both sides. The placeholder
              // ensures sendTo() / broadcast() can always find the peer.
              this._trackPeer(d.id, d.name);
              // Only the lexicographically smaller selfId becomes the
              // WebRTC offerer — the other side waits for the offer.
              if (this.selfId < d.id) {
                this._ensurePeerConnection(d.id, true).catch(() => {});
              }
            }
          }
          if (data) {
            for (const msg of (data.messages || [])) {
              await this._handleMessage(msg).catch(() => {});
            }
          }
        }
      } catch (e) { /* swallow */ }
      await new Promise(r => setTimeout(r, 250));
    }
  }

  async _handleMessage(msg) {
    if (msg.type === 'peer-joined') {
      const them = msg.peer;
      this.onPeerJoined(them);
      this._trackPeer(them.id, them.name);
      if (this.selfId < them.id) {
        await this._ensurePeerConnection(them.id, true);
      }
    } else if (msg.type === 'peer-left') {
      const p = this.peers.get(msg.peerId);
      if (p) {
        try { p.pc?.close(); } catch {}
        if (p.relayTimer) clearTimeout(p.relayTimer);
      }
      this.peers.delete(msg.peerId);
      this.onPeerLeft(msg.peerId);
      this.onConnState();
    } else if (msg.type === 'signal') {
      await this._handleSignal(msg.from, msg.payload);
    } else if (msg.type === 'relay-data') {
      this._handleRelayData(msg);
    }
  }

  // ---- peer lifecycle --------------------------------------------------

  _trackPeer(peerId, peerName) {
    let entry = this.peers.get(peerId);
    if (entry) {
      if ((entry.name === 'Peer' || !entry.name) && peerName) entry.name = peerName;
      return entry;
    }
    log('track peer', peerId, peerName);
    entry = {
      pc: null,
      dc: null,
      name: peerName || 'Peer',
      ready: false,
      initiator: this.selfId < peerId,
      pendingIce: [],
      remoteSet: false,
      relayMode: false,
      relayTimer: null,
      // dcVerified gates whether we trust the direct data-channel path.
      // Set true only after a ping/pong round-trip over the channel —
      // dc.readyState='open' alone is NOT enough because ICE can claim
      // "connected" via mDNS host candidates when actual data does not
      // flow (the cross-device-same-LAN failure mode).
      dcVerified: false,
      dcBroken: false,
      pingId: null,
      pingTimer: null,
    };
    this.peers.set(peerId, entry);

    // UI-promotion timer: if the direct DC isn't verified within
    // RELAY_UI_DELAY_MS, engage relay mode so sendTo/broadcast start
    // flowing immediately via the always-on /api/signal/relay path.
    entry.relayTimer = setTimeout(() => {
      const p = this.peers.get(peerId);
      if (!p) return;
      // Skip relay only if dc is OPEN *and* verified.
      if (p.dc?.readyState === 'open' && p.dcVerified) return;
      if (!p.relayMode) {
        log('peer', peerId, 'promoted to relay mode after', RELAY_UI_DELAY_MS, 'ms (dc unverified)');
        p.relayMode = true;
        p.ready = true;
        this.onConnState();
      }
    }, RELAY_UI_DELAY_MS);
    return entry;
  }

  async _ensurePeerConnection(peerId, initiator) {
    const entry = this.peers.get(peerId);
    if (!entry) return;
    if (entry.pc) return;       // already wired up

    log('ensurePeerConnection', peerId, 'initiator=', initiator);
    const pc = new RTCPeerConnection(PC_CONFIG);
    entry.pc = pc;
    entry.initiator = initiator;

    pc.onicecandidate = (e) => {
      if (e.candidate) this._send(peerId, { kind: 'ice', candidate: e.candidate });
    };
    pc.onconnectionstatechange = () => {
      log('peer', peerId, 'pc.connectionState=', pc.connectionState);
      this.onConnState();
      if (pc.connectionState === 'failed' && entry.initiator) {
        this._restartIce(peerId).catch(() => {});
      }
    };
    pc.oniceconnectionstatechange = () => {
      log('peer', peerId, 'pc.iceConnectionState=', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed' && entry.initiator) {
        this._restartIce(peerId).catch(() => {});
      }
    };

    if (initiator) {
      const dc = pc.createDataChannel('data', { ordered: true });
      this._wireDataChannel(peerId, dc);
      entry.dc = dc;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this._send(peerId, { kind: 'sdp', sdp: pc.localDescription });
      } catch (e) { log('offer error', peerId, e); }
    } else {
      pc.ondatachannel = (e) => {
        entry.dc = e.channel;
        this._wireDataChannel(peerId, e.channel);
      };
    }
  }

  async _restartIce(peerId) {
    const entry = this.peers.get(peerId);
    if (!entry?.pc || !entry.initiator) return;
    try {
      const offer = await entry.pc.createOffer({ iceRestart: true });
      await entry.pc.setLocalDescription(offer);
      this._send(peerId, { kind: 'sdp', sdp: entry.pc.localDescription });
    } catch {}
  }

  _wireDataChannel(peerId, dc) {
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => {
      const p = this.peers.get(peerId);
      if (!p) return;
      log('peer', peerId, 'DATA CHANNEL OPEN (verifying with ping…)');
      // Send a verification ping. The data channel is NOT trusted for
      // application traffic until the peer replies with a matching pong.
      // This guards against the cross-device-same-LAN failure mode where
      // ICE reports "connected" via mDNS host candidates but no data
      // actually flows over the underlying SCTP transport.
      const pingId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
      p.pingId = pingId;
      p.pingSentAt = Date.now();
      try {
        dc.send(JSON.stringify({ __rtc: 'ping', id: pingId }));
      } catch (e) { log('peer', peerId, 'failed to send ping', e); }

      if (p.pingTimer) clearTimeout(p.pingTimer);
      p.pingTimer = setTimeout(() => {
        const pp = this.peers.get(peerId);
        if (!pp || pp.dcVerified) return;
        log('peer', peerId, 'DC VERIFICATION TIMEOUT — switching to relay');
        pp.dcBroken = true;
        pp.relayMode = true;
        pp.ready = true;
        // Close the unreliable dc so dc.readyState !== 'open' on next send
        try { pp.dc?.close(); } catch {}
        this.onConnState();
      }, DC_VERIFY_TIMEOUT_MS);

      this.onConnState();
    };
    dc.onclose = () => {
      const p = this.peers.get(peerId);
      if (p) {
        p.dcVerified = false;
        if (p.pingTimer) { clearTimeout(p.pingTimer); p.pingTimer = null; }
        // Fall back to relay if dc closes but peer is still in the room
        p.relayMode = this.peers.has(peerId);
        p.ready = p.relayMode;
      }
      this.onConnState();
    };
    dc.onerror = (e) => {
      log('peer', peerId, 'dc.onerror', e);
      const p = this.peers.get(peerId);
      if (p) {
        p.dcVerified = false;
        if (p.pingTimer) { clearTimeout(p.pingTimer); p.pingTimer = null; }
        p.relayMode = this.peers.has(peerId);
        p.ready = p.relayMode;
      }
      this.onConnState();
    };
    dc.onmessage = (e) => {
      const data = e.data;
      // Intercept internal handshake ping/pong messages BEFORE forwarding
      // anything to the application layer.
      if (typeof data === 'string' && data.length < 200 && data[0] === '{') {
        let m = null;
        try { m = JSON.parse(data); } catch { /* not JSON, fall through */ }
        if (m && m.__rtc === 'ping') {
          // Echo the ping back as a pong; also mark our side as verified
          // since clearly bytes are flowing in this direction.
          try { dc.send(JSON.stringify({ __rtc: 'pong', id: m.id })); } catch {}
          const p = this.peers.get(peerId);
          if (p) {
            p.dcVerified = true;
            p.dcBroken = false;
            p.relayMode = false;
            p.ready = true;
            if (p.pingTimer) { clearTimeout(p.pingTimer); p.pingTimer = null; }
            log('peer', peerId, 'DC VERIFIED (incoming ping → pong sent)');
            this.onConnState();
          }
          return;
        }
        if (m && m.__rtc === 'pong') {
          const p = this.peers.get(peerId);
          if (p && m.id === p.pingId) {
            p.dcVerified = true;
            p.dcBroken = false;
            p.relayMode = false;
            p.ready = true;
            if (p.pingTimer) { clearTimeout(p.pingTimer); p.pingTimer = null; }
            const rtt = Date.now() - (p.pingSentAt || Date.now());
            log('peer', peerId, `DC VERIFIED (pong received, rtt=${rtt}ms)`);
            this.onConnState();
          }
          return;
        }
      }
      this.onMessage(peerId, data);
    };
  }

  async _handleSignal(fromId, payload) {
    // Make sure we have a placeholder entry (in case signal arrives before
    // the devices list does).
    let entry = this.peers.get(fromId);
    if (!entry) entry = this._trackPeer(fromId, 'Peer');

    // For the non-initiator side, upgrade the placeholder to a real pc.
    if (!entry.pc) {
      await this._ensurePeerConnection(fromId, false);
      entry = this.peers.get(fromId);
    }
    if (!entry?.pc) return;

    if (payload.kind === 'sdp') {
      const desc = payload.sdp;
      try {
        await entry.pc.setRemoteDescription(desc);
        entry.remoteSet = true;
        if (entry.pendingIce.length) {
          const pending = entry.pendingIce.splice(0);
          for (const cand of pending) {
            try { await entry.pc.addIceCandidate(cand); } catch {}
          }
        }
        if (desc.type === 'offer') {
          const answer = await entry.pc.createAnswer();
          await entry.pc.setLocalDescription(answer);
          this._send(fromId, { kind: 'sdp', sdp: entry.pc.localDescription });
        }
      } catch (e) { log('sdp error', fromId, e); }
    } else if (payload.kind === 'ice') {
      if (!entry.remoteSet) {
        entry.pendingIce.push(payload.candidate);
        return;
      }
      try { await entry.pc.addIceCandidate(payload.candidate); } catch {}
    }
  }

  _handleRelayData(msg) {
    const fromId = msg.from;
    let p = this.peers.get(fromId);
    if (!p) {
      p = this._trackPeer(fromId, 'Peer');
    }
    if (!p.relayMode && !(p.dc?.readyState === 'open')) {
      p.relayMode = true;
      p.ready = true;
      log('peer', fromId, 'promoted to relay mode (incoming relay-data)');
      this.onConnState();
    }
    const data = msg.binary ? b64ToBuf(msg.data) : msg.data;
    this.onMessage(fromId, data);
  }

  _send(toId, payload) {
    fetch('/api/signal/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: this.roomId, fromId: this.selfId, toId, payload }),
    }).catch(() => {});
  }

  // ---- public send API -------------------------------------------------

  sendTo(peerId, data) {
    const p = this.peers.get(peerId);
    if (!p) {
      // Peer is genuinely unknown (not yet in devices list). Caller can
      // retry on the next tick; we don't want to silently relay to a peer
      // the server doesn't know about.
      return false;
    }
    // Trust the direct DC ONLY after the ping/pong handshake has verified
    // it's actually bidirectional. Otherwise (open-but-unverified, or
    // broken) fall through to relay so cross-device-LAN scenarios where
    // ICE reports a false "connected" still deliver messages.
    if (p.dc?.readyState === 'open' && p.dcVerified) {
      try {
        p.dc.send(data);
        return true;
      } catch (e) { log('dc.send threw, falling back to relay', e); }
    }
    // Fallback: ALWAYS use relay if the direct channel isn't usable. The
    // relay is just a POST to /api/signal/relay which the peer's poll
    // delivers within ~400 ms.
    this._sendViaRelay(peerId, data);
    return true;
  }

  broadcast(data) {
    let sent = 0;
    const relayTargets = [];
    for (const [pid, p] of this.peers) {
      if (p.dc?.readyState === 'open' && p.dcVerified) {
        try { p.dc.send(data); sent++; continue; } catch {}
      }
      relayTargets.push(pid);
    }
    if (relayTargets.length === 1) {
      this._sendViaRelay(relayTargets[0], data);
      sent++;
    } else if (relayTargets.length > 1) {
      this._sendViaRelayBroadcast(data);
      sent += relayTargets.length;
    }
    return sent;
  }

  // ---- relay send infrastructure ---------------------------------------
  //
  // CRITICAL: Relay sends to a given peer MUST happen in order. Without
  // this, fire-and-forget fetch() calls race against each other and the
  // backend's `messages` array ends up in an order different from what
  // the sender intended. For the file-share protocol this is fatal:
  //   - `file-end` can arrive before `file-meta` → receiver drops it →
  //     file never finalizes on the receiver and never appears in its UI.
  //   - Binary chunks arrive out of order → the reassembled Blob is
  //     corrupted.
  //   - Even text-share `text-update` can show stale text if a later
  //     update is delivered before an earlier one.
  //
  // We therefore maintain one Promise-chain per peer (`p.relayChain`) and
  // a single global chain for broadcasts (`this.broadcastChain`). Each
  // _sendViaRelay schedules its fetch onto the appropriate chain so the
  // POSTs hit the backend strictly in submission order. Awaiting the
  // response also guarantees that the previous message has been stored
  // in MongoDB before the next one is sent — eliminating cross-request
  // race conditions.

  async _doRelayFetch(body, sizeForRelease, p) {
    let attempt = 0;
    while (attempt < 4) {
      try {
        const r = await fetch('/api/signal/relay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (r.ok) {
          if (p) p.relayBufAmt = Math.max(0, (p.relayBufAmt || 0) - sizeForRelease);
          return true;
        }
        log('relay POST non-2xx', r.status, 'attempt', attempt);
      } catch (e) {
        log('relay POST network error', e?.message, 'attempt', attempt);
      }
      attempt++;
      // Exponential-ish backoff: 250 / 500 / 1000 / 2000 ms
      await new Promise(res => setTimeout(res, 250 * Math.pow(2, attempt - 1)));
    }
    log('relay POST gave up after retries — message lost');
    if (p) p.relayBufAmt = Math.max(0, (p.relayBufAmt || 0) - sizeForRelease);
    return false;
  }

  _sendViaRelay(toId, data) {
    const p = this.peers.get(toId);
    if (!p) return;
    const isBinary = (typeof data !== 'string');
    const payload = isBinary ? bufToB64(data) : data;
    const size = isBinary ? data.byteLength : (data.length || 0);
    p.relayBufAmt = (p.relayBufAmt || 0) + size;
    const body = {
      roomId: this.roomId, fromId: this.selfId, toId,
      data: payload, binary: isBinary,
    };
    // Chain THIS send onto the peer's serial queue. The chain swallows
    // any rejection so a single failed send doesn't permanently break
    // ordering for subsequent sends.
    p.relayChain = (p.relayChain || Promise.resolve()).then(
      () => this._doRelayFetch(body, size, p),
      () => this._doRelayFetch(body, size, p),
    );
  }

  _sendViaRelayBroadcast(data) {
    const isBinary = (typeof data !== 'string');
    const payload = isBinary ? bufToB64(data) : data;
    const size = isBinary ? data.byteLength : (data.length || 0);
    // Track per-peer in-flight bytes so file-share backpressure works.
    const tracked = [];
    for (const [, p] of this.peers) {
      if (p && (p.relayMode || p.dc?.readyState !== 'open' || !p.dcVerified)) {
        p.relayBufAmt = (p.relayBufAmt || 0) + size;
        tracked.push(p);
      }
    }
    const body = {
      roomId: this.roomId, fromId: this.selfId,
      data: payload, binary: isBinary,
    };
    const release = () => {
      for (const p of tracked) {
        p.relayBufAmt = Math.max(0, (p.relayBufAmt || 0) - size);
      }
    };
    // Serialise broadcasts onto a single global chain. The release happens
    // when the fetch resolves (or after retries are exhausted). We pass
    // null as the per-peer p so _doRelayFetch doesn't double-decrement.
    const doFetch = async () => {
      let attempt = 0;
      while (attempt < 4) {
        try {
          const r = await fetch('/api/signal/relay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (r.ok) { release(); return true; }
          log('broadcast relay non-2xx', r.status, 'attempt', attempt);
        } catch (e) {
          log('broadcast relay network error', e?.message, 'attempt', attempt);
        }
        attempt++;
        await new Promise(res => setTimeout(res, 250 * Math.pow(2, attempt - 1)));
      }
      log('broadcast relay gave up — message lost');
      release();
      return false;
    };
    this.broadcastChain = (this.broadcastChain || Promise.resolve()).then(doFetch, doFetch);
  }

  // Used by the file-share back-pressure throttle. Returns the number of
  // bytes still buffered in transit toward the peer — either inside the
  // RTCDataChannel buffer (direct path) or the in-flight POST queue (relay
  // path). The send loop pauses while this is above HIGH_WATER, so a single
  // value works for both transports.
  bufferedAmount(peerId) {
    const p = this.peers.get(peerId);
    if (!p) return 0;
    if (p.dc && p.dc.readyState === 'open' && p.dcVerified) return p.dc.bufferedAmount ?? 0;
    return p.relayBufAmt || 0;
  }
}

export async function createRoom({ name, kind = 'file', password }) {
  const hostId = crypto.randomUUID();
  const r = await fetch('/api/signal/create', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostId, hostName: name, kind, password }),
  });
  const data = await r.json();
  // Mirror the actual assigned name back to the caller so the UI can pick
  // up the deduped value if the backend had to rename the device.
  if (data?.room?.devices && data.youAre) {
    const me = data.room.devices.find((d) => d.id === data.youAre);
    if (me?.name) data.assignedName = me.name;
  }
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
  const data = await r.json();
  if (data?.room?.devices && data.youAre) {
    const me = data.room.devices.find((d) => d.id === data.youAre);
    if (me?.name) data.assignedName = me.name;
  }
  return data;
}

// Ask the backend whether the requested display name is already taken in
// the given room, and what unique alternative to suggest. Used by the
// lobby UI to live-preview a unique name BEFORE the user clicks Join.
export async function checkName({ roomId, name }) {
  try {
    const r = await fetch('/api/signal/check-name', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, name }),
    });
    if (!r.ok) return { taken: false, suggested: name, exists: false };
    return await r.json();
  } catch {
    return { taken: false, suggested: name, exists: false };
  }
}
