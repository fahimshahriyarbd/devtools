// Hash utilities using hash-wasm (supports MD5, SHA1/2/3 family, BLAKE2, CRC32, Adler32)
import {
  md5, sha1, sha224, sha256, sha384, sha512,
  sha3, blake2b, blake2s, crc32, adler32,
} from 'hash-wasm';

export const HASH_ALGORITHMS = [
  { id: 'md5', label: 'MD5', length: 32, family: 'legacy', fn: (d) => md5(d) },
  { id: 'sha1', label: 'SHA-1', length: 40, family: 'sha', fn: (d) => sha1(d) },
  { id: 'sha224', label: 'SHA-224', length: 56, family: 'sha2', fn: (d) => sha224(d) },
  { id: 'sha256', label: 'SHA-256', length: 64, family: 'sha2', fn: (d) => sha256(d) },
  { id: 'sha384', label: 'SHA-384', length: 96, family: 'sha2', fn: (d) => sha384(d) },
  { id: 'sha512', label: 'SHA-512', length: 128, family: 'sha2', fn: (d) => sha512(d) },
  { id: 'sha3-224', label: 'SHA3-224', length: 56, family: 'sha3', fn: (d) => sha3(d, 224) },
  { id: 'sha3-256', label: 'SHA3-256', length: 64, family: 'sha3', fn: (d) => sha3(d, 256) },
  { id: 'sha3-384', label: 'SHA3-384', length: 96, family: 'sha3', fn: (d) => sha3(d, 384) },
  { id: 'sha3-512', label: 'SHA3-512', length: 128, family: 'sha3', fn: (d) => sha3(d, 512) },
  { id: 'blake2b', label: 'BLAKE2b', length: 128, family: 'blake', fn: (d) => blake2b(d) },
  { id: 'blake2s', label: 'BLAKE2s', length: 64, family: 'blake', fn: (d) => blake2s(d) },
  { id: 'crc32', label: 'CRC32', length: 8, family: 'checksum', fn: (d) => crc32(d) },
  { id: 'adler32', label: 'Adler32', length: 8, family: 'checksum', fn: (d) => adler32(d) },
];

export function getAlgo(id) {
  return HASH_ALGORITHMS.find(a => a.id === id);
}

export async function computeHash(input, algoId) {
  const algo = getAlgo(algoId);
  if (!algo) throw new Error('Unknown algorithm: ' + algoId);
  const t0 = performance.now();
  const value = await algo.fn(input);
  const t1 = performance.now();
  return { algorithm: algo.id, label: algo.label, value, length: value.length, durationMs: +(t1 - t0).toFixed(2) };
}

export async function computeAll(input, ids) {
  const list = ids || HASH_ALGORITHMS.map(a => a.id);
  const results = await Promise.all(list.map(id => computeHash(input, id).catch(e => ({ algorithm: id, error: e.message }))));
  return results;
}

export async function hashFile(file, ids) {
  const buf = new Uint8Array(await file.arrayBuffer());
  return computeAll(buf, ids);
}

export function compareHashes(a, b) {
  if (!a || !b) return { match: false, percent: 0, lenA: a?.length || 0, lenB: b?.length || 0 };
  const A = a.trim().toLowerCase();
  const B = b.trim().toLowerCase();
  if (A === B) return { match: true, percent: 100, lenA: A.length, lenB: B.length };
  // Character-by-character similarity (Hamming-like for equal length)
  let same = 0;
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i++) if (A[i] && B[i] && A[i] === B[i]) same++;
  return { match: false, percent: Math.round((same / len) * 100), lenA: A.length, lenB: B.length };
}
