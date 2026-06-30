// JSON utility helpers used by the JSON Validator/Beautifier page.
import JSON5 from 'json5';
import yaml from 'js-yaml';
import { JSONPath } from 'jsonpath-plus';

// --------- Parsing ----------
// Parse JSON strictly; fall back to JSON5 (comments / trailing commas) so users
// can paste JSONC and still get a structured result. The `lenient` flag tells
// the caller which path succeeded so the UI can surface "Parsed as JSON5".
export function parseJsonSafe(text) {
  const t = (text ?? '').trim();
  if (!t) return { ok: false, empty: true };
  try {
    const data = JSON.parse(text);
    return { ok: true, data, lenient: false };
  } catch (strictErr) {
    try {
      const data = JSON5.parse(text);
      return { ok: true, data, lenient: true, strictError: strictErr };
    } catch (lenientErr) {
      return { ok: false, error: lenientErr, strictError: strictErr };
    }
  }
}

// Extract line/column from a JSON parse error message.
// V8 messages look like:  "Unexpected token x in JSON at position 42"
// JSON5 messages look like: "JSON5: invalid character 'x' at 3:10"
export function locateError(text, err) {
  if (!err) return null;
  const msg = String(err.message || err);
  // JSON5 includes "at LINE:COL"
  const m5 = msg.match(/at (\d+):(\d+)/);
  if (m5) return { line: Number(m5[1]), column: Number(m5[2]), message: msg };
  // V8 includes "at position N"
  const mPos = msg.match(/position (\d+)/);
  if (mPos) {
    const pos = Number(mPos[1]);
    const slice = text.slice(0, pos);
    const line = slice.split('\n').length;
    const column = pos - slice.lastIndexOf('\n');
    return { line, column, message: msg };
  }
  return { line: 1, column: 1, message: msg };
}

// --------- Formatting ----------
export function beautify(text, indent = 2) {
  const r = parseJsonSafe(text);
  if (!r.ok) throw r.error || new Error('Invalid JSON');
  const i = indent === 'tab' ? '\t' : Number(indent) || 2;
  return JSON.stringify(r.data, null, i);
}

export function minify(text) {
  const r = parseJsonSafe(text);
  if (!r.ok) throw r.error || new Error('Invalid JSON');
  return JSON.stringify(r.data);
}

export function sortKeys(text, { recursive = true, indent = 2 } = {}) {
  const r = parseJsonSafe(text);
  if (!r.ok) throw r.error || new Error('Invalid JSON');
  const i = indent === 'tab' ? '\t' : Number(indent) || 2;
  const sorted = sortValue(r.data, recursive);
  return JSON.stringify(sorted, null, i);
}

function sortValue(v, recursive) {
  if (Array.isArray(v)) return recursive ? v.map(x => sortValue(x, true)) : v;
  if (v && typeof v === 'object') {
    return Object.keys(v).sort().reduce((acc, k) => {
      acc[k] = recursive ? sortValue(v[k], true) : v[k];
      return acc;
    }, {});
  }
  return v;
}

// --------- String escape helpers ----------
export function escapeForString(text) {
  // Produce a JSON-string-safe representation: useful when embedding JSON
  // into source code (drops the wrapping quotes so user can paste between
  // their own quotes).
  return JSON.stringify(text).slice(1, -1);
}

export function unescapeJsonString(text) {
  // Allow either a quoted string or raw escaped contents.
  const t = text.startsWith('"') ? text : `"${text}"`;
  return JSON.parse(t);
}

// --------- Stats ----------
export function computeStats(data) {
  let keys = 0, arrays = 0, objects = 0, strings = 0, numbers = 0, booleans = 0, nulls = 0;
  let maxDepth = 0;
  const walk = (v, depth) => {
    if (depth > maxDepth) maxDepth = depth;
    if (v === null) { nulls += 1; return; }
    if (Array.isArray(v)) { arrays += 1; v.forEach(x => walk(x, depth + 1)); return; }
    switch (typeof v) {
      case 'object': {
        objects += 1;
        for (const k of Object.keys(v)) { keys += 1; walk(v[k], depth + 1); }
        return;
      }
      case 'string': strings += 1; return;
      case 'number': numbers += 1; return;
      case 'boolean': booleans += 1; return;
    }
  };
  walk(data, 0);
  return { keys, arrays, objects, strings, numbers, booleans, nulls, depth: maxDepth };
}

// --------- Conversion ----------
export function toYaml(data) {
  return yaml.dump(data, { indent: 2, lineWidth: 120, noRefs: true });
}

export function toXml(data, rootName = 'root') {
  const escape = (s) => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
  const build = (v, name, depth) => {
    const pad = '  '.repeat(depth);
    if (v === null || v === undefined) return `${pad}<${name} />`;
    if (Array.isArray(v)) return v.map(x => build(x, name, depth)).join('\n');
    if (typeof v === 'object') {
      const inner = Object.entries(v).map(([k, val]) => build(val, sanitizeXmlName(k), depth + 1)).join('\n');
      return `${pad}<${name}>\n${inner}\n${pad}</${name}>`;
    }
    return `${pad}<${name}>${escape(v)}</${name}>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n${build(data, sanitizeXmlName(rootName), 0)}`;
}

function sanitizeXmlName(n) {
  return String(n).replace(/[^A-Za-z0-9_-]/g, '_').replace(/^[^A-Za-z_]/, '_');
}

// Tabular CSV for an array of flat (or shallowly nested) objects.
export function toCsv(data) {
  if (!Array.isArray(data)) throw new Error('CSV export requires a top-level array');
  if (!data.length) return '';
  const headers = [...new Set(data.flatMap(row => row && typeof row === 'object' ? Object.keys(row) : []))];
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = data.map(r => headers.map(h => esc(r?.[h])).join(','));
  return [headers.join(','), ...rows].join('\n');
}

// Generate a TypeScript interface tree from a sample value.
// Top-level entry point produces `interface Root { ... }` plus dependent
// interfaces for nested object shapes (named via a deterministic key path).
export function toTypeScript(data, rootName = 'Root') {
  const out = [];
  const inferType = (v, name) => {
    if (v === null) return 'null';
    if (Array.isArray(v)) {
      if (!v.length) return 'unknown[]';
      const types = [...new Set(v.map(x => inferType(x, name)))];
      const elem = types.length === 1 ? types[0] : `(${types.join(' | ')})`;
      return `${elem}[]`;
    }
    if (typeof v === 'object') {
      const lines = Object.entries(v).map(([k, val]) => {
        const childName = capitalize(k);
        const optional = val === null ? '?' : '';
        return `  ${needsQuotes(k) ? JSON.stringify(k) : k}${optional}: ${inferType(val, childName)};`;
      });
      out.push(`export interface ${name} {\n${lines.join('\n')}\n}`);
      return name;
    }
    return typeof v;
  };
  inferType(data, rootName);
  // Reverse so root ends up first.
  return out.reverse().join('\n\n');
}

function capitalize(s) {
  return String(s).replace(/[^A-Za-z0-9_]/g, '_').replace(/^([a-z])/, (_, c) => c.toUpperCase()) || 'Item';
}
function needsQuotes(k) { return !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k); }

// --------- JSONPath ----------
export function jsonPathQuery(data, path) {
  if (!path) return [];
  const res = JSONPath({ path, json: data, resultType: 'all' });
  return res.map(r => ({ path: r.path, value: r.value }));
}

// --------- Samples ----------
export const JSON_SAMPLES = [
  {
    name: 'User profile',
    text: `{
  "id": "usr_8c4a3f",
  "name": "Ada Lovelace",
  "email": "ada@example.com",
  "active": true,
  "roles": ["admin", "engineer"],
  "preferences": { "theme": "dark", "notifications": false },
  "createdAt": "2024-06-12T10:24:00Z",
  "lastLogin": null
}`,
  },
  {
    name: 'Array of records',
    text: `[
  { "id": 1, "title": "First", "tags": ["a", "b"] },
  { "id": 2, "title": "Second", "tags": [] },
  { "id": 3, "title": "Third", "tags": ["x"] }
]`,
  },
  {
    name: 'Nested config',
    text: `{
  "server": { "host": "0.0.0.0", "port": 8080, "tls": { "enabled": true, "cert": "/etc/tls/cert.pem" } },
  "database": { "url": "postgres://localhost/app", "pool": { "min": 2, "max": 10 } },
  "features": { "beta": true, "experiments": ["fast-mode", "tree-view"] }
}`,
  },
];
