import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// In-memory store. Survives across requests on a single Node instance.
const g = globalThis;
if (!g.__devhubStore) {
  g.__devhubStore = {
    rooms: new Map(), // roomId -> Room
  };
  // GC: remove idle rooms after 2h, dead devices after 30s of no poll
  setInterval(() => {
    const now = Date.now();
    for (const [id, r] of g.__devhubStore.rooms) {
      for (const [did, d] of r.devices) {
        if (now - (d.lastSeen || d.joinedAt) > 30_000) {
          r.devices.delete(did);
          r.queues.delete(did);
          for (const [pid] of r.devices) {
            r.queues.get(pid)?.push({ type: 'peer-left', peerId: did });
          }
        }
      }
      if (r.devices.size === 0 && now - r.createdAt > 60_000) {
        g.__devhubStore.rooms.delete(id);
      }
      if (now - r.createdAt > 2 * 3600_000) {
        g.__devhubStore.rooms.delete(id);
      }
    }
  }, 10_000);
}
const store = g.__devhubStore;

function roomCode() {
  // 4-digit numeric code, shared namespace
  const n = Math.floor(1000 + Math.random() * 9000);
  return String(n);
}

function serializeRoom(r) {
  return {
    id: r.id,
    hostId: r.hostId,
    kind: r.kind,
    hasPassword: !!r.password,
    devices: Array.from(r.devices.values()).map(d => ({ id: d.id, name: d.name, joinedAt: d.joinedAt })),
    createdAt: r.createdAt,
  };
}

function handleCreate(body) {
  const kind = body.kind === 'text' ? 'text' : 'file';
  let id;
  for (let tries = 0; tries < 50; tries++) {
    id = roomCode();
    if (!store.rooms.has(id)) break;
  }
  const hostId = body.hostId || crypto.randomUUID();
  const room = {
    id,
    kind,
    hostId,
    password: body.password || null,
    devices: new Map(),
    queues: new Map(),
    createdAt: Date.now(),
    sharedText: '',
  };
  room.devices.set(hostId, { id: hostId, name: body.hostName || 'Host', joinedAt: Date.now(), lastSeen: Date.now() });
  room.queues.set(hostId, []);
  store.rooms.set(id, room);
  return { room: serializeRoom(room), youAre: hostId };
}

function handleJoin(body) {
  const r = store.rooms.get(String(body.roomId || '').toUpperCase());
  if (!r) return { error: 'Room not found', code: 404 };
  if (body.expectKind && r.kind !== body.expectKind) {
    return { error: `This code belongs to a ${r.kind === 'text' ? 'Text' : 'File'} share room. Open the matching tool.`, code: 409 };
  }
  if (r.password && r.password !== body.password) return { error: 'Invalid password', code: 401 };
  const deviceId = body.deviceId || crypto.randomUUID();
  if (!r.devices.has(deviceId)) {
    r.devices.set(deviceId, { id: deviceId, name: body.name || 'Guest', joinedAt: Date.now(), lastSeen: Date.now() });
    r.queues.set(deviceId, []);
    for (const [pid] of r.devices) {
      if (pid !== deviceId) {
        r.queues.get(pid)?.push({
          type: 'peer-joined',
          peer: { id: deviceId, name: r.devices.get(deviceId).name }
        });
      }
    }
  } else {
    r.devices.get(deviceId).lastSeen = Date.now();
  }
  return { room: serializeRoom(r), youAre: deviceId };
}

export async function GET(request, { params }) {
  const p = (await params).path || [];
  const url = new URL(request.url);

  if (p[0] === 'health') return NextResponse.json({ ok: true, t: Date.now() });

  if (p[0] === 'signal' && p[1] === 'poll') {
    const roomId = (url.searchParams.get('roomId') || '').toUpperCase();
    const deviceId = url.searchParams.get('deviceId');
    const r = store.rooms.get(roomId);
    if (!r) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    const q = r.queues.get(deviceId);
    if (!q) return NextResponse.json({ error: 'Not joined' }, { status: 403 });
    const dev = r.devices.get(deviceId);
    if (dev) dev.lastSeen = Date.now();
    const messages = q.splice(0);
    return NextResponse.json({
      messages,
      devices: Array.from(r.devices.values()).map(d => ({ id: d.id, name: d.name, joinedAt: d.joinedAt })),
      hostId: r.hostId,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request, { params }) {
  const p = (await params).path || [];
  let body = {};
  try { body = await request.json(); } catch {}

  if (p[0] === 'signal' && p[1] === 'create') {
    return NextResponse.json(handleCreate(body));
  }

  if (p[0] === 'signal' && p[1] === 'join') {
    const r = handleJoin(body);
    if (r.error) return NextResponse.json({ error: r.error }, { status: r.code || 400 });
    return NextResponse.json(r);
  }

  if (p[0] === 'signal' && p[1] === 'send') {
    const { roomId, fromId, toId, payload } = body;
    const r = store.rooms.get((roomId || '').toUpperCase());
    if (!r) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    const q = r.queues.get(toId);
    if (!q) return NextResponse.json({ error: 'Peer not found' }, { status: 404 });
    q.push({ type: 'signal', from: fromId, payload });
    return NextResponse.json({ ok: true });
  }

  if (p[0] === 'signal' && p[1] === 'broadcast') {
    const { roomId, fromId, payload } = body;
    const r = store.rooms.get((roomId || '').toUpperCase());
    if (!r) return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    for (const [pid, q] of r.queues) {
      if (pid !== fromId) q.push({ type: 'broadcast', from: fromId, payload });
    }
    return NextResponse.json({ ok: true });
  }

  if (p[0] === 'signal' && p[1] === 'leave') {
    const r = store.rooms.get((body.roomId || '').toUpperCase());
    if (r) {
      r.devices.delete(body.deviceId);
      r.queues.delete(body.deviceId);
      for (const [pid] of r.devices) {
        r.queues.get(pid)?.push({ type: 'peer-left', peerId: body.deviceId });
      }
      if (r.devices.size === 0) store.rooms.delete(r.id);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
