// Interpolates {{var}} placeholders using an environment's variables.
export function interpolate(input, env) {
  if (input == null) return input;
  const vars = new Map();
  (env?.variables || []).forEach((v) => {
    if (v.enabled !== false && v.key) vars.set(v.key, v.value ?? '');
  });
  const substitute = (s) => String(s).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (m, k) => (vars.has(k) ? vars.get(k) : m));
  if (typeof input === 'string') return substitute(input);
  if (Array.isArray(input)) return input.map((x) => interpolate(x, env));
  if (typeof input === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(input)) out[substitute(k)] = interpolate(v, env);
    return out;
  }
  return input;
}

// Build a final URL string from base url + params list.
export function buildUrl(rawUrl, params, env) {
  let url = interpolate(rawUrl || '', env).trim();
  const enabled = (params || []).filter((p) => p.enabled !== false && p.key);
  if (!enabled.length) return url;
  const qs = enabled
    .map((p) => `${encodeURIComponent(interpolate(p.key, env))}=${encodeURIComponent(interpolate(p.value ?? '', env))}`)
    .join('&');
  return url + (url.includes('?') ? '&' : '?') + qs;
}

// Build the final Headers dict — includes auth injection.
export function buildHeaders(request, env) {
  const out = {};
  for (const h of request.headers || []) {
    if (h.enabled === false || !h.key) continue;
    out[interpolate(h.key, env)] = interpolate(h.value ?? '', env);
  }
  const a = request.auth || { type: 'none' };
  if (a.type === 'bearer' && a.bearer?.token) {
    out['Authorization'] = `Bearer ${interpolate(a.bearer.token, env)}`;
  } else if (a.type === 'basic') {
    const u = interpolate(a.basic?.username || '', env);
    const p = interpolate(a.basic?.password || '', env);
    const enc = typeof btoa !== 'undefined' ? btoa(`${u}:${p}`) : Buffer.from(`${u}:${p}`).toString('base64');
    out['Authorization'] = `Basic ${enc}`;
  } else if (a.type === 'apikey' && a.apikey?.key) {
    if ((a.apikey.addTo || 'header') === 'header') {
      out[interpolate(a.apikey.key, env)] = interpolate(a.apikey.value ?? '', env);
    }
  } else if (a.type === 'oauth2' && a.oauth2?.accessToken) {
    out['Authorization'] = `${a.oauth2.tokenName || 'Bearer'} ${interpolate(a.oauth2.accessToken, env)}`;
  }
  return out;
}

// Query params added by API key auth (when addTo=query).
export function apiKeyQuery(request, env) {
  const a = request.auth || {};
  if (a.type === 'apikey' && a.apikey?.key && a.apikey?.addTo === 'query') {
    return [{ key: interpolate(a.apikey.key, env), value: interpolate(a.apikey.value ?? '', env), enabled: true }];
  }
  return [];
}

// Build the body payload as { body, contentTypeHint }.
export function buildBody(request, env) {
  const b = request.body || { type: 'none' };
  if (b.type === 'none') return { body: undefined, contentType: null };
  if (b.type === 'json') return { body: interpolate(b.json || '', env), contentType: 'application/json' };
  if (b.type === 'text') return { body: interpolate(b.text || '', env), contentType: 'text/plain' };
  if (b.type === 'javascript') return { body: interpolate(b.javascript || '', env), contentType: 'application/javascript' };
  if (b.type === 'xml') return { body: interpolate(b.xml || '', env), contentType: 'application/xml' };
  if (b.type === 'html') return { body: interpolate(b.html || '', env), contentType: 'text/html' };
  if (b.type === 'urlencoded') {
    const params = new URLSearchParams();
    for (const kv of b.urlencoded || []) {
      if (kv.enabled === false || !kv.key) continue;
      params.append(interpolate(kv.key, env), interpolate(kv.value ?? '', env));
    }
    return { body: params.toString(), contentType: 'application/x-www-form-urlencoded' };
  }
  if (b.type === 'formdata') {
    const fd = new FormData();
    for (const kv of b.formdata || []) {
      if (kv.enabled === false || !kv.key) continue;
      fd.append(interpolate(kv.key, env), interpolate(kv.value ?? '', env));
    }
    // Browser sets multipart boundary automatically — we intentionally omit
    // contentType so fetch generates the correct boundary token.
    return { body: fd, contentType: null };
  }
  return { body: undefined, contentType: null };
}

function parseHeaders(h) {
  const out = {};
  if (!h) return out;
  if (typeof h.forEach === 'function') { h.forEach((v, k) => { out[k] = v; }); return out; }
  return h;
}

function cookiesFromHeaders(headers) {
  const raw = headers['set-cookie'] || headers['Set-Cookie'] || '';
  if (!raw) return [];
  return String(raw).split(/,(?=\s*[\w-]+=)/).map((c) => c.trim()).filter(Boolean);
}

// Executes the request. Returns the response envelope.
export async function sendRequest(request, env, { onProgress } = {}) {
  const t0 = performance.now();
  const method = (request.method || 'GET').toUpperCase();
  const extraQuery = apiKeyQuery(request, env);
  const url = buildUrl(request.url, [...(request.params || []), ...extraQuery], env);
  const headers = buildHeaders(request, env);
  const { body, contentType } = buildBody(request, env);
  if (contentType && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = contentType;
  }
  const useProxy = !!request.settings?.useProxy;

  let target = url;
  let fetchInit = {
    method,
    headers,
    body: ['GET', 'HEAD'].includes(method) ? undefined : body,
    redirect: request.settings?.followRedirects === false ? 'manual' : 'follow',
  };

  if (useProxy) {
    // FormData over a JSON proxy is out of scope — surface a helpful error.
    if (body instanceof FormData) {
      return { error: 'Proxy mode does not support multipart form-data. Disable proxy or use urlencoded body.', ms: 0 };
    }
    target = '/api/proxy';
    fetchInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        method,
        headers,
        body: typeof body === 'string' ? body : null,
        followRedirects: request.settings?.followRedirects !== false,
      }),
    };
  }

  try {
    if (onProgress) onProgress({ stage: 'sending' });
    const resp = await fetch(target, fetchInit);
    let respHeaders = parseHeaders(resp.headers);
    let status = resp.status;
    let statusText = resp.statusText;
    let arrBuf;
    if (useProxy) {
      const proxied = await resp.json();
      if (proxied.error) return { error: proxied.error, ms: Math.round(performance.now() - t0) };
      status = proxied.status;
      statusText = proxied.statusText;
      respHeaders = proxied.headers || {};
      const b64 = proxied.bodyBase64 || '';
      const bin = atob(b64);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      arrBuf = buf.buffer;
    } else {
      arrBuf = await resp.arrayBuffer();
    }
    const t1 = performance.now();
    const size = arrBuf.byteLength;
    let text = '';
    try { text = new TextDecoder('utf-8', { fatal: false }).decode(arrBuf); } catch { text = ''; }
    return {
      status,
      statusText,
      ms: Math.round(t1 - t0),
      size,
      headers: respHeaders,
      cookies: cookiesFromHeaders(respHeaders),
      body: text,
      // Keep the raw binary around for downloads.
      rawBase64: btoa(String.fromCharCode(...new Uint8Array(arrBuf))),
    };
  } catch (e) {
    return { error: e?.message || 'Network error', ms: Math.round(performance.now() - t0) };
  }
}
