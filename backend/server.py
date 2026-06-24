"""
Proxy backend for DevHub.

The Next.js application (located in /app/frontend) handles ALL business logic,
including its own /api/* routes implemented under app/api/[[...path]]/route.js.

However, the Emergent ingress routes /api/* to port 8001 (this FastAPI service)
and / -> 3000 (Next.js). To keep the Next.js APIs working unchanged, this
service proxies every /api/* request to localhost:3000/api/*.
"""
from fastapi import FastAPI, Request, Response
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
import httpx
import os

NEXT_ORIGIN = os.environ.get("NEXT_ORIGIN", "http://localhost:3000")

app = FastAPI(title="DevHub API Proxy")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

client = httpx.AsyncClient(timeout=120.0, follow_redirects=False)


@app.on_event("shutdown")
async def _shutdown():
    await client.aclose()


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


@app.get("/healthz")
async def healthz():
    return {"ok": True}


@app.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def proxy(path: str, request: Request):
    url = f"{NEXT_ORIGIN}/api/{path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    headers = {
        k: v for k, v in request.headers.items() if k.lower() not in HOP_BY_HOP
    }
    body = await request.body()

    upstream = await client.request(
        request.method,
        url,
        headers=headers,
        content=body,
    )

    resp_headers = {
        k: v
        for k, v in upstream.headers.items()
        if k.lower() not in HOP_BY_HOP
    }
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=resp_headers,
        media_type=upstream.headers.get("content-type"),
    )
