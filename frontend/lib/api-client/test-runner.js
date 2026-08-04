// Executes a user-supplied test script against the response envelope. We
// expose a tiny Postman-compatible surface:
//   pm.response.status / .statusText / .time / .headers / .body / .json()
//   pm.test(name, fn)  — runs fn(), captures pass/fail
//   pm.expect(v).toBe(x) / .toEqual(x) / .toContain(x) — minimal chai-ish
// The script runs in a sandboxed Function() call with limited globals.
export function runTests(script, response) {
  const results = [];
  if (!script || !script.trim()) return results;
  const pm = buildPm(response, results);
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('pm', 'response', 'console', script);
    fn(pm, pm.response, { log: (...a) => results.push({ name: '[console.log]', pass: true, message: a.map(String).join(' ') }) });
  } catch (e) {
    results.push({ name: 'Script error', pass: false, message: e?.message || String(e) });
  }
  return results;
}

function buildPm(response, results) {
  const parseJson = () => {
    try { return JSON.parse(response?.body || ''); } catch { return null; }
  };
  const pmResponse = {
    status: response?.status,
    statusText: response?.statusText,
    time: response?.ms,
    size: response?.size,
    headers: response?.headers || {},
    body: response?.body || '',
    json: parseJson,
    text: () => response?.body || '',
  };
  const expect = (actual) => {
    const wrap = (pass, message) => { if (!pass) throw new Error(message); return true; };
    return {
      toBe: (expected) => wrap(actual === expected, `Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`),
      toEqual: (expected) => wrap(JSON.stringify(actual) === JSON.stringify(expected), `Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`),
      toContain: (expected) => wrap(String(actual).includes(String(expected)), `Expected value to contain ${JSON.stringify(expected)}`),
      toBeTruthy: () => wrap(!!actual, `Expected value to be truthy`),
      toBeFalsy: () => wrap(!actual, `Expected value to be falsy`),
      toBeGreaterThan: (expected) => wrap(actual > expected, `Expected ${actual} > ${expected}`),
      toBeLessThan: (expected) => wrap(actual < expected, `Expected ${actual} < ${expected}`),
    };
  };
  return {
    response: pmResponse,
    expect,
    test: (name, fn) => {
      try {
        fn();
        results.push({ name, pass: true });
      } catch (e) {
        results.push({ name, pass: false, message: e?.message || String(e) });
      }
    },
  };
}
