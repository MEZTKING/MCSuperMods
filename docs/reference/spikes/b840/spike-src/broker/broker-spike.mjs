// B840 S6: a throwaway broker in Electron's main process, two ways: Node's own https client with
// a `lookup` hook (the address is checked on the exact answer used to connect) and Electron's
// `net` (Chromium's stack). Local servers only; 127.0.0.2 stands in for a public address and
// 127.0.0.1 for a private one. Run: xvfb-run -a electron broker-spike.mjs (or with
// ELECTRON_RUN_AS_NODE=1 for the Node half only).
import https from 'node:https';
import http from 'node:http';
import dns from 'node:dns';
import net from 'node:net';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Electron's ready waits for the main module's top-level await, so everything runs in main().
async function main() {
const here = dirname(fileURLToPath(import.meta.url));
const key = readFileSync(join(here, 'key.pem'));
const cert = readFileSync(join(here, 'cert.pem'));
const results = {};
let connections = 0;

// --- test servers ---
const server = https.createServer({ key, cert }, (req, res) => {
  const u = new URL(req.url, 'https://x');
  if (u.pathname === '/ok') { res.end(JSON.stringify({ ok: true, cookie: req.headers.cookie ?? null, auth: req.headers.authorization ?? null })); return; }
  if (u.pathname === '/redirect-other') { res.writeHead(302, { location: 'https://other.test:' + port + '/ok' }); res.end(); return; }
  if (u.pathname === '/redirect-same') { res.writeHead(302, { location: '/ok' }); res.end(); return; }
  if (u.pathname === '/big') { // 50 MB stream
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    const chunk = Buffer.alloc(64 * 1024, 1);
    let sent = 0;
    const pump = () => { while (sent < 50 * 1024 * 1024) { sent += chunk.length; if (!res.write(chunk)) { res.once('drain', pump); return; } } res.end(); };
    pump();
    return;
  }
  if (u.pathname === '/hang') return; // never answers
  res.writeHead(404); res.end();
});
server.on('connection', () => { connections++; });
await new Promise((r) => server.listen(0, '0.0.0.0', r));
const port = server.address().port;

// --- the policy ---
const ALLOWED = new Set(['plugin.test']);
/** Private, loopback, link-local and other non-public ranges; 127.0.0.2 is treated as public here only. */
function forbidden(ip) {
  if (ip === '127.0.0.2') return false; // stand-in for a public address in this test
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === '::1' || v6 === '::' || v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('::ffff:');
}
// Fake DNS for the test names (a real broker uses dns.lookup itself, all addresses).
const FAKE = { 'plugin.test': '127.0.0.2', 'other.test': '127.0.0.2', 'rebind.test': '127.0.0.1' };
function checkedLookup(hostname, options, callback) {
  const answer = FAKE[hostname];
  const done = (err, address, family) => {
    if (err) return callback(err);
    if (forbidden(address)) { const e = new Error(`refused: ${hostname} resolves to ${address}`); e.code = 'EBROKER'; return callback(e); }
    callback(null, address, family);
  };
  if (answer) return options.all ? (forbidden(answer) ? done(null, answer, 4) : callback(null, [{ address: answer, family: 4 }])) : done(null, answer, 4);
  dns.lookup(hostname, { ...options, all: false }, done);
}

/** The Node broker: one request, no redirects followed, a byte cap and a deadline. */
function nodeFetch(urlText, { capBytes = 10 * 1024 * 1024, timeoutMs = 30000 } = {}) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(urlText); } catch { return resolve({ refused: 'bad url' }); }
    if (url.protocol !== 'https:') return resolve({ refused: 'not https' });
    if (net.isIP(url.hostname.replace(/^\[|\]$/g, '')) !== 0) return resolve({ refused: 'address literal' });
    if (!ALLOWED.has(url.hostname)) return resolve({ refused: `host ${url.hostname} not approved` });
    const started = performance.now();
    const req = https.request(url, { method: 'GET', lookup: checkedLookup, agent: false, ca: cert, headers: { 'user-agent': 'MCSuperMods plugin' }, timeout: timeoutMs }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400) {
        const next = new URL(res.headers.location ?? '', url);
        res.resume();
        return resolve({ status: res.statusCode, redirectTo: next.href, followed: false, note: ALLOWED.has(next.hostname) ? 'same approved host: the broker may follow by calling itself again' : 'other host: refused' });
      }
      let bytes = 0;
      const chunks = [];
      res.on('data', (c) => {
        bytes += c.length;
        if (bytes > capBytes) { req.destroy(new Error('cap')); resolve({ refused: `over ${capBytes} bytes`, bytesRead: bytes, ms: +(performance.now() - started).toFixed(1) }); return; }
        chunks.push(c);
      });
      res.on('end', () => resolve({ status: res.statusCode, bytes, body: bytes < 2000 ? Buffer.concat(chunks).toString() : undefined, ms: +(performance.now() - started).toFixed(1) }));
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); resolve({ refused: `no answer in ${timeoutMs} ms` }); });
    req.on('error', (e) => resolve({ refused: e.code === 'EBROKER' ? e.message : `error ${e.code ?? e.message}` }));
    req.end();
  });
}

const before = () => connections;
let c0 = before();
results.node = {};
results.node.ok = await nodeFetch(`https://plugin.test:${port}/ok`);
c0 = before();
results.node.notApproved = await nodeFetch(`https://other.test:${port}/ok`);
results.node.addressLiteral = await nodeFetch(`https://127.0.0.1:${port}/ok`);
results.node.decimalLiteral = await nodeFetch(`https://2130706433:${port}/ok`);
results.node.http = await nodeFetch(`http://plugin.test:${port}/ok`);
ALLOWED.add('rebind.test');
c0 = before();
results.node.resolvesPrivate = { ...(await nodeFetch(`https://rebind.test:${port}/ok`)), serverSawConnection: before() > c0 };
ALLOWED.delete('rebind.test');
results.node.redirectOther = await nodeFetch(`https://plugin.test:${port}/redirect-other`);
results.node.redirectSame = await nodeFetch(`https://plugin.test:${port}/redirect-same`);
const heapBefore = process.memoryUsage().rss;
results.node.big = await nodeFetch(`https://plugin.test:${port}/big`);
results.node.bigRssGrowthMb = +((process.memoryUsage().rss - heapBefore) / 1048576).toFixed(1);
results.node.hang = await nodeFetch(`https://plugin.test:${port}/hang`, { timeoutMs: 1000 });
results.node.proxyEnv = { HTTPS_PROXY: process.env.HTTPS_PROXY ? 'set' : 'unset', note: "node:https ignores HTTPS_PROXY and the system proxy" };

// --- Electron's net, when run as Electron ---
if (process.versions.electron && !process.env.ELECTRON_RUN_AS_NODE) {
  const electron = await import('electron');
  const { app, net: enet, session } = electron.default ?? electron;
  console.error('waiting for ready'); await app.whenReady(); console.error('ready');
  const ses = session.fromPartition('b840-broker', { cache: false });
  ses.setCertificateVerifyProc((req, cb) => cb(req.hostname.endsWith('.test') || req.hostname === 'localhost' ? 0 : -3));
  results.electron = { hasResolveHost: typeof enet.resolveHost };
  const seen = [];
  ses.webRequest.onBeforeRequest((d, cb) => { seen.push({ stage: 'before', url: d.url }); cb({}); });
  ses.webRequest.onResponseStarted((d) => { seen.push({ stage: 'responseStarted', url: d.url, ip: d.ip }); });
  const efetch = (url, redirect = 'manual') => new Promise((resolve) => {
    const r = enet.request({ url, session: ses, redirect, credentials: 'omit', useSessionCookies: false });
    const t0 = performance.now();
    r.on('redirect', (status, method, redirectUrl) => { r.abort(); resolve({ redirect: status, to: redirectUrl, aborted: true }); });
    r.on('response', (res) => { let bytes = 0; res.on('data', (c) => { bytes += c.length; if (bytes > 10 * 1024 * 1024) { r.abort(); resolve({ capped: bytes, ms: +(performance.now() - t0).toFixed(1) }); } }); res.on('end', () => resolve({ status: res.statusCode, bytes })); });
    r.on('error', (e) => resolve({ error: String(e.message) }));
    r.end();
  });
  // Electron's net cannot use the fake names; localhost is the private case it must refuse.
  const c1 = connections;
  console.error('efetch 1'); results.electron.localhostOk = await efetch(`https://localhost:${port}/ok`);
  results.electron.serverSawConnectionBeforeAnyAddressCheck = connections > c1;
  results.electron.redirectManual = await efetch(`https://localhost:${port}/redirect-other`);
  console.error('efetch big'); results.electron.bigCapped = await efetch(`https://localhost:${port}/big`);
  if (typeof enet.resolveHost === 'function') {
    try { results.electron.resolveHostLocalhost = await enet.resolveHost('localhost'); } catch (e) { results.electron.resolveHostLocalhost = String(e); }
  }
  results.electron.webRequestStages = seen.slice(0, 6);
  results.electron.note = 'webRequest shows the address only at onResponseStarted, after the request was sent; resolveHost then request is a second lookup (rebinding window)';
  writeFileSync(join(here, 'results-s6.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  server.close();
  app.quit();
} else {
  writeFileSync(join(here, 'results-s6-node.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  server.close();
}

}
void main();
