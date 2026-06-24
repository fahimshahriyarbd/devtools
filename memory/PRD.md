# DevHub – Developer Utility Platform

## Original Problem Statement
> https://github.com/fahimshahriyarbd/devhub import this hole code base so that I can edit here

User wants the GitHub repository imported into the Emergent workspace so they can edit and iterate on it. User chose to import directly into `/app` and asked to inspect the stack.

## Architecture
- **Frontend** (`/app/frontend`): Next.js 15 (App Router) + React 18 + Tailwind + Radix UI + shadcn-style components + framer-motion. Runs on port 3000 via `yarn start` → `next dev`.
- **Backend** (`/app/backend`): Thin FastAPI proxy on port 8001. Forwards all `/api/*` requests to the Next.js API routes at `http://localhost:3000/api/*`. This is required because the Emergent ingress routes `/api/*` to 8001 while the actual Next.js API handlers live inside the frontend service.
- **Next.js API** (`app/api/[[...path]]/route.js`): catch-all signaling server (in-memory store) supporting room create/join, peer signaling, broadcast, leave, health.
- **Frontend tools**: Dashboard, ZIP Compare, Text Compare, Hash Generator, Random Generator, WiFi Text Share, WiFi File Share.

## Setup / Important Notes
- `package.json` `start` script changed to `next dev` so supervisor's `yarn start` boots the dev server with hot reload.
- `httpx` added to `backend/requirements.txt` for the proxy.
- `/app/frontend/.env` retains the protected `REACT_APP_BACKEND_URL` plus `NEXT_PUBLIC_BASE_URL` and `CORS_ORIGINS`.
- Backend `.env` keeps `MONGO_URL`, `DB_NAME`, `CORS_ORIGINS` (unused by the current proxy but preserved).
- Supervisor processes (read-only config): `frontend` (port 3000), `backend` (port 8001), `mongodb`.

## What's Been Implemented (2026-01)
- [x] Imported fahimshahriyarbd/devhub into `/app` (frontend at `/app/frontend`).
- [x] Installed all yarn dependencies.
- [x] Replaced default FastAPI scaffold with a Next.js→FastAPI proxy so `/api/*` works through the Emergent ingress.
- [x] Verified home page renders and `/api/health` returns `{ok:true}` through the proxy.

## Backlog / Awaiting User Direction
- [ ] User to specify which changes/features to implement next (no specific feature was requested in the initial import message).

## User Personas
- Developers using DevHub utilities (ZIP diff, text diff, hash, random, WiFi LAN sharing) without accounts.
