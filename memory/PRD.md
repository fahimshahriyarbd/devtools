# DevHub — Developer Utility Platform

## Problem Statement
Clone https://github.com/fahimshahriyarbd/devtools into /app and make it runnable.

## Architecture
- **Frontend**: Next.js 15 (app router) on port 3000, Tailwind + shadcn/ui, Monaco editor, JSZip, hash-wasm, WebRTC.
- **Backend**: FastAPI on port 8001. Implements `/api/signal/*` (WebRTC signaling, MongoDB-persisted rooms) directly; proxies every other `/api/*` request to Next.js on 3000.
- **DB**: MongoDB (local) — collections `signal_rooms`, `signal_queues`.

## Tools shipped
- WiFi File Share (P2P WebRTC)
- WiFi Text Share (collaborative)
- Text Compare (Monaco diff)
- Folder Compare
- ZIP Compare
- JSON Studio (validate / convert)
- Hash Generator
- Random Generator

## Status — Jan 2026
- Repo cloned into /app, replacing the prior CRA skeleton.
- Backend deps installed via `pip install -r requirements.txt`.
- Frontend deps installed via `yarn install` (new lockfile generated).
- Supervisor running both services; homepage renders, `/healthz` OK.
- `.env` files preserved: backend uses `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS`; frontend keeps `REACT_APP_BACKEND_URL`.

## Next Action Items
- Smoke-test each tool route (`/wifi-file-share`, `/json-studio`, etc.) end-to-end.
- Optional: add `NEXT_PUBLIC_SITE_URL` to frontend `.env` so SEO/canonical tags match the preview domain.
