// Random / token generation utilities
import { customAlphabet, nanoid } from 'nanoid';

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?/\\|`~';
const AMBIGUOUS = 'O0Il1|`\'"';

export const GENERATOR_TYPES = [
  { id: 'password', label: 'Password', category: 'Security' },
  { id: 'string', label: 'Random String', category: 'Strings' },
  { id: 'uuid-v4', label: 'UUID v4', category: 'Identifiers' },
  { id: 'uuid-v1', label: 'UUID v1 (time-based)', category: 'Identifiers' },
  { id: 'uuid-v7', label: 'UUID v7 (time-ordered)', category: 'Identifiers' },
  { id: 'nanoid', label: 'NanoID', category: 'Identifiers' },
  { id: 'api-key', label: 'API Key', category: 'Security' },
  { id: 'jwt-secret', label: 'JWT Secret', category: 'Security' },
  { id: 'session-token', label: 'Session Token', category: 'Security' },
  { id: 'bearer-token', label: 'Bearer Token', category: 'Security' },
  { id: 'oauth-state', label: 'OAuth State', category: 'Security' },
  { id: 'hex', label: 'Hex String', category: 'Encoding' },
  { id: 'base64', label: 'Base64', category: 'Encoding' },
  { id: 'url-safe', label: 'URL-Safe String', category: 'Encoding' },
  { id: 'license-key', label: 'License Key', category: 'Codes' },
  { id: 'coupon', label: 'Coupon Code', category: 'Codes' },
  { id: 'invite', label: 'Invite Code', category: 'Codes' },
  { id: 'tracking-id', label: 'Tracking ID', category: 'Codes' },
  { id: 'db-key', label: 'Database Key', category: 'Identifiers' },
  { id: 'pin', label: 'Numeric PIN', category: 'Codes' },
];

function randomBytes(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

function randomFromAlphabet(alphabet, length) {
  // Use customAlphabet for crypto-strong selection without modulo bias
  const gen = customAlphabet(alphabet, length);
  return gen();
}

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
function toBase64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function toBase64Url(bytes) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// UUID v1 (time-based with random node) — RFC 4122 compliant
function uuidV1() {
  // Build a 60-bit timestamp (number of 100-ns intervals since 1582-10-15)
  const GREGORIAN_EPOCH = -12219292800000;
  const now = Date.now() - GREGORIAN_EPOCH;
  const intervals = BigInt(now) * 10000n;
  const high = Number((intervals >> 48n) & 0x0fffn) | 0x1000;
  const mid = Number((intervals >> 32n) & 0xffffn);
  const low = Number(intervals & 0xffffffffn);
  const clockSeq = (crypto.getRandomValues(new Uint16Array(1))[0] & 0x3fff) | 0x8000;
  const node = randomBytes(6);
  node[0] |= 0x01; // multicast bit (random node)
  const hex = (n, w) => n.toString(16).padStart(w, '0');
  return `${hex(low, 8)}-${hex(mid, 4)}-${hex(high, 4)}-${hex(clockSeq, 4)}-${toHex(node)}`;
}

// UUID v7 — time-ordered, RFC 9562
function uuidV7() {
  const ts = BigInt(Date.now());
  const tsBytes = new Uint8Array(6);
  for (let i = 5; i >= 0; i--) { tsBytes[i] = Number(ts >> BigInt((5 - i) * 8) & 0xffn); }
  const rand = randomBytes(10);
  // Set version 7 in byte 6 (high nibble)
  rand[0] = (rand[0] & 0x0f) | 0x70;
  // Set variant in byte 8
  rand[2] = (rand[2] & 0x3f) | 0x80;
  const all = new Uint8Array(16);
  all.set(tsBytes, 0); all.set(rand, 6);
  const h = toHex(all);
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

export function generateOne(type, opts = {}) {
  const length = Math.max(1, Math.min(10000, opts.length || 16));
  switch (type) {
    case 'password': {
      let alphabet = '';
      if (opts.lower !== false) alphabet += LOWER;
      if (opts.upper !== false) alphabet += UPPER;
      if (opts.digits !== false) alphabet += DIGITS;
      if (opts.symbols) alphabet += SYMBOLS;
      if (opts.excludeAmbiguous) alphabet = alphabet.split('').filter(c => !AMBIGUOUS.includes(c)).join('');
      if (!alphabet) alphabet = LOWER + DIGITS;
      return (opts.prefix || '') + randomFromAlphabet(alphabet, length) + (opts.suffix || '');
    }
    case 'string': {
      const alphabet = opts.customSet || (LOWER + UPPER + DIGITS);
      return (opts.prefix || '') + randomFromAlphabet(alphabet, length) + (opts.suffix || '');
    }
    case 'uuid-v4': return crypto.randomUUID();
    case 'uuid-v1': return uuidV1();
    case 'uuid-v7': return uuidV7();
    case 'nanoid': return nanoid(length);
    case 'api-key': {
      const prefix = opts.prefix ?? 'sk_';
      return prefix + randomFromAlphabet(LOWER + UPPER + DIGITS, Math.max(24, length));
    }
    case 'jwt-secret': return toBase64Url(randomBytes(Math.max(32, length)));
    case 'session-token': return toBase64Url(randomBytes(32));
    case 'bearer-token': return toBase64Url(randomBytes(48));
    case 'oauth-state': return toBase64Url(randomBytes(24));
    case 'hex': return toHex(randomBytes(Math.max(1, Math.ceil(length / 2)))).slice(0, length);
    case 'base64': return toBase64(randomBytes(length)).slice(0, length);
    case 'url-safe': return toBase64Url(randomBytes(length)).slice(0, length);
    case 'license-key': {
      // XXXXX-XXXXX-XXXXX-XXXXX
      const seg = () => randomFromAlphabet(UPPER + DIGITS, 5);
      const segs = opts.segments || 4;
      return Array.from({ length: segs }, seg).join('-');
    }
    case 'coupon': return randomFromAlphabet(UPPER + DIGITS, length);
    case 'invite': return randomFromAlphabet(UPPER + DIGITS, Math.min(length, 10));
    case 'tracking-id': return 'trk_' + randomFromAlphabet(LOWER + DIGITS, 20);
    case 'db-key': return toHex(randomBytes(12));
    case 'pin': return randomFromAlphabet(DIGITS, Math.min(length, 12));
    default: return crypto.randomUUID();
  }
}

export function generateMany(type, count, opts) {
  return Array.from({ length: Math.max(1, Math.min(10000, count || 1)) }, () => generateOne(type, opts));
}

// Entropy/strength calculation for a string
export function analyzeStrength(value) {
  if (!value) return { entropy: 0, bits: 0, strength: 'none', label: 'Empty', crackTime: '—', distribution: {} };
  const charsets = [
    { name: 'lower', test: /[a-z]/, size: 26 },
    { name: 'upper', test: /[A-Z]/, size: 26 },
    { name: 'digits', test: /[0-9]/, size: 10 },
    { name: 'symbols', test: /[^a-zA-Z0-9]/, size: 32 },
  ];
  let pool = 0;
  const used = {};
  for (const c of charsets) {
    if (c.test.test(value)) { pool += c.size; used[c.name] = true; }
  }
  const bits = value.length * Math.log2(Math.max(2, pool));
  // Estimate crack time at 10^10 attempts/sec
  const seconds = Math.pow(2, bits) / 1e10;
  const crackTime = humanTime(seconds);
  const strength = bits < 28 ? 'weak' : bits < 50 ? 'medium' : bits < 80 ? 'strong' : 'very-strong';
  const label = { weak: 'Weak', medium: 'Medium', strong: 'Strong', 'very-strong': 'Very strong' }[strength];
  // Char distribution
  const dist = {};
  for (const c of value) dist[c] = (dist[c] || 0) + 1;
  const unique = Object.keys(dist).length;
  return { entropy: +bits.toFixed(1), bits: +bits.toFixed(1), strength, label, crackTime, charset: used, unique, length: value.length };
}

function humanTime(seconds) {
  if (!isFinite(seconds)) return 'eternity';
  if (seconds < 1) return 'instant';
  const units = [
    [60, 'seconds'], [60, 'minutes'], [24, 'hours'], [30, 'days'],
    [12, 'months'], [100, 'years'], [10, 'centuries'], [1000, 'millennia'],
  ];
  let n = seconds, label = 'seconds';
  for (const [div, lbl] of units) {
    if (n < div) { label = lbl; break; }
    n = n / div; label = lbl;
  }
  if (n > 1e6) return `${n.toExponential(1)} ${label}`;
  return `${n.toFixed(n > 10 ? 0 : 1)} ${label}`;
}
