import { buildUrl, buildHeaders, buildBody, apiKeyQuery } from './sender';

function bodyPreview(request, env) {
  const b = request.body || { type: 'none' };
  if (b.type === 'formdata' || b.type === 'urlencoded') {
    return { kind: b.type, kvs: (b[b.type] || []).filter((x) => x.enabled !== false && x.key) };
  }
  const { body } = buildBody(request, env);
  return { kind: b.type, text: typeof body === 'string' ? body : '' };
}

export function genCurl(request, env) {
  const method = (request.method || 'GET').toUpperCase();
  const url = buildUrl(request.url, [...(request.params || []), ...apiKeyQuery(request, env)], env);
  const headers = buildHeaders(request, env);
  const bp = bodyPreview(request, env);
  const lines = [`curl --location --request ${method} '${url}'`];
  for (const [k, v] of Object.entries(headers)) lines.push(`  --header '${k}: ${String(v).replace(/'/g, "'\\''")}'`);
  if (bp.kind === 'formdata') {
    for (const kv of bp.kvs) lines.push(`  --form '${kv.key}=${kv.value}'`);
  } else if (bp.kind === 'urlencoded') {
    for (const kv of bp.kvs) lines.push(`  --data-urlencode '${kv.key}=${kv.value}'`);
  } else if (bp.text) {
    lines.push(`  --data-raw '${bp.text.replace(/'/g, "'\\''")}'`);
  }
  return lines.join(' \\\n');
}

export function genFetch(request, env) {
  const method = (request.method || 'GET').toUpperCase();
  const url = buildUrl(request.url, [...(request.params || []), ...apiKeyQuery(request, env)], env);
  const headers = buildHeaders(request, env);
  const bp = bodyPreview(request, env);
  const init = { method, headers };
  let bodyLine = '';
  if (bp.kind === 'formdata') {
    bodyLine = `const form = new FormData();\n${bp.kvs.map((k) => `form.append(${JSON.stringify(k.key)}, ${JSON.stringify(k.value)});`).join('\n')}\n`;
    init.body = '__FORM__';
  } else if (bp.kind === 'urlencoded') {
    bodyLine = `const params = new URLSearchParams();\n${bp.kvs.map((k) => `params.append(${JSON.stringify(k.key)}, ${JSON.stringify(k.value)});`).join('\n')}\n`;
    init.body = '__PARAMS__';
  } else if (bp.text) {
    init.body = bp.text;
  }
  const json = JSON.stringify(init, null, 2)
    .replace('"__FORM__"', 'form')
    .replace('"__PARAMS__"', 'params.toString()');
  return `${bodyLine}const response = await fetch(${JSON.stringify(url)}, ${json});\nconst data = await response.text();\nconsole.log(data);`;
}

export function genAxios(request, env) {
  const method = (request.method || 'GET').toLowerCase();
  const url = buildUrl(request.url, [...(request.params || []), ...apiKeyQuery(request, env)], env);
  const headers = buildHeaders(request, env);
  const bp = bodyPreview(request, env);
  const config = { method, url, headers };
  if (bp.kind === 'urlencoded') {
    config.data = Object.fromEntries(bp.kvs.map((k) => [k.key, k.value]));
  } else if (bp.kind === 'formdata') {
    return `import axios from 'axios';\nimport FormData from 'form-data';\nconst form = new FormData();\n${bp.kvs.map((k) => `form.append(${JSON.stringify(k.key)}, ${JSON.stringify(k.value)});`).join('\n')}\nconst response = await axios(${JSON.stringify({ method, url, headers }, null, 2)});\nconsole.log(response.data);`;
  } else if (bp.text) {
    try { config.data = JSON.parse(bp.text); } catch { config.data = bp.text; }
  }
  return `import axios from 'axios';\nconst response = await axios(${JSON.stringify(config, null, 2)});\nconsole.log(response.data);`;
}

export function genPython(request, env) {
  const method = (request.method || 'GET').toLowerCase();
  const url = buildUrl(request.url, [...(request.params || []), ...apiKeyQuery(request, env)], env);
  const headers = buildHeaders(request, env);
  const bp = bodyPreview(request, env);
  let dataLine = '';
  let dataKw = '';
  if (bp.kind === 'urlencoded') {
    dataLine = `data = ${JSON.stringify(Object.fromEntries(bp.kvs.map((k) => [k.key, k.value])))}\n`;
    dataKw = ', data=data';
  } else if (bp.kind === 'formdata') {
    dataLine = `files = ${JSON.stringify(Object.fromEntries(bp.kvs.map((k) => [k.key, k.value])))}\n`;
    dataKw = ', files=files';
  } else if (bp.text) {
    try { const j = JSON.parse(bp.text); dataLine = `json_data = ${JSON.stringify(j)}\n`; dataKw = ', json=json_data'; }
    catch { dataLine = `data = ${JSON.stringify(bp.text)}\n`; dataKw = ', data=data'; }
  }
  return `import requests\n\nurl = ${JSON.stringify(url)}\nheaders = ${JSON.stringify(headers, null, 2)}\n${dataLine}response = requests.${method}(url, headers=headers${dataKw})\nprint(response.status_code)\nprint(response.text)`;
}

export function genPhp(request, env) {
  const method = (request.method || 'GET').toUpperCase();
  const url = buildUrl(request.url, [...(request.params || []), ...apiKeyQuery(request, env)], env);
  const headers = buildHeaders(request, env);
  const bp = bodyPreview(request, env);
  const headerLines = Object.entries(headers).map(([k, v]) => `  '${k}: ${String(v).replace(/'/g, "\\'")}'`).join(",\n");
  let postLine = '';
  if (bp.kind === 'formdata') {
    postLine = `CURLOPT_POSTFIELDS => array(${bp.kvs.map((k) => `'${k.key}' => '${k.value}'`).join(', ')}),`;
  } else if (bp.kind === 'urlencoded') {
    postLine = `CURLOPT_POSTFIELDS => '${bp.kvs.map((k) => `${encodeURIComponent(k.key)}=${encodeURIComponent(k.value)}`).join('&')}',`;
  } else if (bp.text) {
    postLine = `CURLOPT_POSTFIELDS => '${bp.text.replace(/'/g, "\\'")}',`;
  }
  return `<?php\n$curl = curl_init();\ncurl_setopt_array($curl, array(\n  CURLOPT_URL => '${url}',\n  CURLOPT_RETURNTRANSFER => true,\n  CURLOPT_CUSTOMREQUEST => '${method}',\n  ${postLine}\n  CURLOPT_HTTPHEADER => array(\n${headerLines}\n  ),\n));\n$response = curl_exec($curl);\ncurl_close($curl);\necho $response;`;
}

export const GENERATORS = [
  { id: 'curl', label: 'cURL', lang: 'shell', run: genCurl },
  { id: 'fetch', label: 'JavaScript Fetch', lang: 'javascript', run: genFetch },
  { id: 'axios', label: 'Axios', lang: 'javascript', run: genAxios },
  { id: 'python', label: 'Python Requests', lang: 'python', run: genPython },
  { id: 'php', label: 'PHP cURL', lang: 'php', run: genPhp },
];
