import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Server-side proxy used by the API Client tool to bypass browser CORS.
// The client posts { url, method, headers, body } and we forward it,
// returning status / headers / base64-encoded body so binary responses
// (e.g. images) survive the round-trip cleanly. This is intentionally
// scoped to the API Client feature — disable via the Proxy toggle on
// each request if not needed.
export async function POST(request) {
  let payload;
  try { payload = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { url, method = 'GET', headers = {}, body = null, followRedirects = true } = payload || {};
  if (!url || typeof url !== 'string') return NextResponse.json({ error: 'url is required' }, { status: 400 });

  const init = { method, headers, redirect: followRedirects ? 'follow' : 'manual' };
  if (body && !['GET', 'HEAD'].includes(method.toUpperCase())) init.body = body;

  try {
    const resp = await fetch(url, init);
    const buf = Buffer.from(await resp.arrayBuffer());
    const out = {};
    resp.headers.forEach((v, k) => { out[k] = v; });
    return NextResponse.json({
      status: resp.status,
      statusText: resp.statusText,
      headers: out,
      bodyBase64: buf.toString('base64'),
    });
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Fetch failed' }, { status: 502 });
  }
}
