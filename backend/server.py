"""
DevHub backend.

Two responsibilities:
  1. Implements the /api/signal/* signaling endpoints DIRECTLY (with MongoDB
     persistence) so room state survives any Next.js dev-mode hot reloads or
     module-cache resets — this was the root cause of "Room not found" when a
     guest tried to join a room a host had just created.

  2. Proxies every other /api/* request to the local Next.js app on port 3000
     so all other tool APIs (json-studio, hash-generator, etc.) keep working.
"""
from __future__ import annotations

import asyncio
import os
import random
import time
import uuid
from typing import Any

import httpx
from fastapi import FastAPI, Request, Response
from motor.motor_asyncio import AsyncIOMotorClient
from starlette.middleware.cors import CORSMiddleware

NEXT_ORIGIN = os.environ.get("NEXT_ORIGIN", "http://localhost:3000")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

DEVICE_TIMEOUT_S = 30          # device considered gone after this idle window
ROOM_EMPTY_TTL_S = 60          # remove empty rooms after this much idle
ROOM_MAX_AGE_S = 2 * 3600      # hard cap on room lifetime
GC_INTERVAL_S = 10

app = FastAPI(title="DevHub API")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

mongo: AsyncIOMotorClient = AsyncIOMotorClient(MONGO_URL)
db = mongo[DB_NAME]
rooms_col = db["signal_rooms"]
queues_col = db["signal_queues"]   # one document per (roomId, deviceId)

client = httpx.AsyncClient(timeout=120.0, follow_redirects=False)


# ---------- helpers ----------

def now_ms() -> int:
    return int(time.time() * 1000)


def serialize_room(r: dict) -> dict:
    devices = r.get("devices", {})
    return {
        "id": r["_id"],
        "hostId": r.get("hostId"),
        "kind": r.get("kind", "file"),
        "hasPassword": bool(r.get("password")),
        "devices": [
            {"id": d["id"], "name": d.get("name", "Peer"), "joinedAt": d.get("joinedAt", 0)}
            for d in devices.values()
        ],
        "createdAt": r.get("createdAt", 0),
    }


async def _room_code_unique() -> str:
    """Return a 4-digit room code that is not currently in use."""
    for _ in range(80):
        code = f"{random.randint(1000, 9999)}"
        if not await rooms_col.find_one({"_id": code}):
            return code
    # Fallback to a 5-digit code if all 4-digit codes happen to be taken
    return f"{random.randint(10000, 99999)}"


async def _enqueue(room_id: str, device_id: str, msg: dict) -> None:
    await queues_col.update_one(
        {"roomId": room_id, "deviceId": device_id},
        {"$push": {"messages": msg}, "$setOnInsert": {"createdAt": now_ms()}},
        upsert=True,
    )


async def _enqueue_to_all(room: dict, msg: dict, exclude_device: str | None = None) -> None:
    for d_id in room.get("devices", {}).keys():
        if d_id == exclude_device:
            continue
        await _enqueue(room["_id"], d_id, msg)


# ---------- garbage collector ----------

async def _gc_loop() -> None:
    while True:
        try:
            await asyncio.sleep(GC_INTERVAL_S)
            now = now_ms()
            async for r in rooms_col.find({}):
                rid = r["_id"]
                devices: dict = r.get("devices", {}) or {}
                stale_device_ids: list[str] = []
                for did, d in devices.items():
                    last_seen = d.get("lastSeen") or d.get("joinedAt") or 0
                    if now - last_seen > DEVICE_TIMEOUT_S * 1000:
                        stale_device_ids.append(did)

                if stale_device_ids:
                    for did in stale_device_ids:
                        devices.pop(did, None)
                        await queues_col.delete_many({"roomId": rid, "deviceId": did})
                        # notify remaining peers
                        for other_id in devices.keys():
                            await _enqueue(rid, other_id, {"type": "peer-left", "peerId": did})
                    await rooms_col.update_one({"_id": rid}, {"$set": {"devices": devices}})

                created_at = r.get("createdAt", 0)
                if (not devices) and (now - created_at > ROOM_EMPTY_TTL_S * 1000):
                    await rooms_col.delete_one({"_id": rid})
                    await queues_col.delete_many({"roomId": rid})
                elif now - created_at > ROOM_MAX_AGE_S * 1000:
                    await rooms_col.delete_one({"_id": rid})
                    await queues_col.delete_many({"roomId": rid})
        except Exception:
            # never let the GC kill the event loop
            await asyncio.sleep(GC_INTERVAL_S)


@app.on_event("startup")
async def _startup() -> None:
    await rooms_col.create_index("createdAt")
    await queues_col.create_index([("roomId", 1), ("deviceId", 1)], unique=True)
    asyncio.create_task(_gc_loop())


@app.on_event("shutdown")
async def _shutdown() -> None:
    await client.aclose()
    mongo.close()


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True}


# ---------- signaling endpoints ----------

@app.post("/api/signal/create")
async def signal_create(request: Request) -> Response:
    body: dict[str, Any] = await _read_json(request)
    kind = "text" if body.get("kind") == "text" else "file"
    host_id = body.get("hostId") or str(uuid.uuid4())
    host_name = body.get("hostName") or "Host"
    password = body.get("password") or None

    code = await _room_code_unique()
    now = now_ms()
    host = {"id": host_id, "name": host_name, "joinedAt": now, "lastSeen": now}
    room = {
        "_id": code,
        "kind": kind,
        "hostId": host_id,
        "password": password,
        "devices": {host_id: host},
        "createdAt": now,
    }
    await rooms_col.insert_one(room)
    await queues_col.update_one(
        {"roomId": code, "deviceId": host_id},
        {"$setOnInsert": {"messages": [], "createdAt": now}},
        upsert=True,
    )
    return _json({"room": serialize_room(room), "youAre": host_id})


@app.post("/api/signal/join")
async def signal_join(request: Request) -> Response:
    body: dict[str, Any] = await _read_json(request)
    raw_id = str(body.get("roomId") or "").strip().upper()
    if not raw_id:
        return _json({"error": "Room code is required"}, status=400)
    room = await rooms_col.find_one({"_id": raw_id})
    if not room:
        return _json({"error": "Room not found"}, status=404)

    expect_kind = body.get("expectKind")
    if expect_kind and room.get("kind") != expect_kind:
        nice = "Text" if room.get("kind") == "text" else "File"
        return _json(
            {
                "error": (
                    f"This code belongs to a {nice} share room. "
                    "Open the matching tool."
                )
            },
            status=409,
        )

    if room.get("password") and room["password"] != body.get("password"):
        return _json({"error": "Invalid password"}, status=401)

    device_id = body.get("deviceId") or str(uuid.uuid4())
    name = body.get("name") or "Guest"
    now = now_ms()

    devices: dict = room.get("devices", {}) or {}
    is_new = device_id not in devices
    devices[device_id] = {
        "id": device_id,
        "name": name,
        "joinedAt": devices.get(device_id, {}).get("joinedAt", now),
        "lastSeen": now,
    }
    await rooms_col.update_one({"_id": raw_id}, {"$set": {"devices": devices}})

    # Ensure this device has a queue
    await queues_col.update_one(
        {"roomId": raw_id, "deviceId": device_id},
        {"$setOnInsert": {"messages": [], "createdAt": now}},
        upsert=True,
    )

    if is_new:
        # Notify existing peers
        for other_id in devices.keys():
            if other_id == device_id:
                continue
            await _enqueue(
                raw_id,
                other_id,
                {"type": "peer-joined", "peer": {"id": device_id, "name": name}},
            )

    room["devices"] = devices
    return _json({"room": serialize_room(room), "youAre": device_id})


@app.get("/api/signal/poll")
async def signal_poll(request: Request) -> Response:
    room_id = (request.query_params.get("roomId") or "").upper()
    device_id = request.query_params.get("deviceId") or ""
    if not room_id or not device_id:
        return _json({"error": "Missing roomId or deviceId"}, status=400)

    room = await rooms_col.find_one({"_id": room_id})
    if not room:
        return _json({"error": "Room not found"}, status=404)

    devices: dict = room.get("devices", {}) or {}
    if device_id not in devices:
        return _json({"error": "Not joined"}, status=403)

    # Update lastSeen
    now = now_ms()
    devices[device_id]["lastSeen"] = now
    await rooms_col.update_one({"_id": room_id}, {"$set": {f"devices.{device_id}.lastSeen": now}})

    # Pop pending messages atomically: read the existing array, then set it
    # to empty in a single Mongo round-trip. find_one_and_update with
    # return_document=False returns the PRE-update document so we don't lose
    # any messages that were queued between our read and clear.
    pending_doc = await queues_col.find_one_and_update(
        {"roomId": room_id, "deviceId": device_id},
        {"$set": {"messages": []}, "$setOnInsert": {"createdAt": now}},
        upsert=True,
        return_document=False,
    )
    messages = (pending_doc or {}).get("messages", []) if pending_doc else []

    return _json(
        {
            "messages": messages,
            "devices": [
                {"id": d["id"], "name": d.get("name", "Peer"), "joinedAt": d.get("joinedAt", 0)}
                for d in devices.values()
            ],
            "hostId": room.get("hostId"),
        }
    )


@app.post("/api/signal/send")
async def signal_send(request: Request) -> Response:
    body: dict[str, Any] = await _read_json(request)
    room_id = str(body.get("roomId") or "").upper()
    from_id = body.get("fromId")
    to_id = body.get("toId")
    payload = body.get("payload")
    if not room_id or not from_id or not to_id:
        return _json({"error": "Missing fields"}, status=400)

    room = await rooms_col.find_one({"_id": room_id})
    if not room:
        return _json({"error": "Room not found"}, status=404)
    if to_id not in (room.get("devices") or {}):
        return _json({"error": "Peer not found"}, status=404)

    await _enqueue(room_id, to_id, {"type": "signal", "from": from_id, "payload": payload})
    return _json({"ok": True})


@app.post("/api/signal/broadcast")
async def signal_broadcast(request: Request) -> Response:
    body: dict[str, Any] = await _read_json(request)
    room_id = str(body.get("roomId") or "").upper()
    from_id = body.get("fromId")
    payload = body.get("payload")
    if not room_id or not from_id:
        return _json({"error": "Missing fields"}, status=400)
    room = await rooms_col.find_one({"_id": room_id})
    if not room:
        return _json({"error": "Room not found"}, status=404)
    await _enqueue_to_all(
        room, {"type": "broadcast", "from": from_id, "payload": payload}, exclude_device=from_id
    )
    return _json({"ok": True})


@app.post("/api/signal/relay")
async def signal_relay(request: Request) -> Response:
    """
    Server-side message relay used as a fallback when the WebRTC data channel
    cannot open between two peers (e.g. when TURN is unreachable or the
    network blocks UDP entirely). Each relay message is delivered via the
    same per-device polling queue so it arrives within ~400 ms.

    Body shape:
      { roomId, fromId, toId?, data, binary? }   -- toId omitted = broadcast
      `data` is a JSON-serialisable string (text-share) or a base64 string
      (file-share binary chunk). `binary: true` marks it as base64-encoded
      so the receiver knows to decode back to ArrayBuffer.
    """
    body: dict[str, Any] = await _read_json(request)
    room_id = str(body.get("roomId") or "").upper()
    from_id = body.get("fromId")
    to_id = body.get("toId")
    data = body.get("data")
    binary = bool(body.get("binary"))
    if not room_id or not from_id or data is None:
        return _json({"error": "Missing fields"}, status=400)
    room = await rooms_col.find_one({"_id": room_id})
    if not room:
        return _json({"error": "Room not found"}, status=404)

    msg = {"type": "relay-data", "from": from_id, "data": data, "binary": binary}
    if to_id:
        if to_id not in (room.get("devices") or {}):
            return _json({"error": "Peer not found"}, status=404)
        await _enqueue(room_id, to_id, msg)
    else:
        await _enqueue_to_all(room, msg, exclude_device=from_id)
    return _json({"ok": True})


@app.post("/api/signal/leave")
async def signal_leave(request: Request) -> Response:
    body: dict[str, Any] = await _read_json(request)
    room_id = str(body.get("roomId") or "").upper()
    device_id = body.get("deviceId")
    if not room_id or not device_id:
        return _json({"ok": True})
    room = await rooms_col.find_one({"_id": room_id})
    if not room:
        return _json({"ok": True})
    devices: dict = room.get("devices", {}) or {}
    if device_id in devices:
        devices.pop(device_id, None)
        await rooms_col.update_one({"_id": room_id}, {"$set": {"devices": devices}})
        await queues_col.delete_many({"roomId": room_id, "deviceId": device_id})
        for other_id in devices.keys():
            await _enqueue(room_id, other_id, {"type": "peer-left", "peerId": device_id})
        if not devices:
            await rooms_col.delete_one({"_id": room_id})
            await queues_col.delete_many({"roomId": room_id})
    return _json({"ok": True})


# ---------- generic helpers ----------

async def _read_json(request: Request) -> dict[str, Any]:
    try:
        return await request.json()
    except Exception:
        return {}


def _json(data: Any, status: int = 200) -> Response:
    import json
    return Response(
        content=json.dumps(data),
        status_code=status,
        media_type="application/json",
    )


# ---------- catch-all proxy for everything else (non-signal /api/*) ----------

HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "host",
    "content-length",
    "content-encoding",
}


@app.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
    include_in_schema=False,
)
async def proxy(path: str, request: Request) -> Response:
    # /api/signal/* is handled by the explicit routes above. Anything else
    # falls through to Next.js (json-studio, hash-generator, etc.).
    url = f"{NEXT_ORIGIN}/api/{path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP}
    body = await request.body()

    upstream = await client.request(
        request.method,
        url,
        headers=headers,
        content=body,
    )

    resp_headers = {
        k: v for k, v in upstream.headers.items() if k.lower() not in HOP_BY_HOP
    }
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=resp_headers,
        media_type=upstream.headers.get("content-type"),
    )
