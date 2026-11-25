// B840 harness page: exposes `window.spike` for the Playwright drivers. Throwaway.
import { bootstrapSource } from '../../../wt-B840/app/src/renderer/src/plugins/sandbox/worker-bootstrap.ts';
import { s1Reload, s1Results, s1Setup } from './s1-kit.tsx';
import { spikeBootstrapSource } from './spike-bootstrap.js';

const text = (path: string) => fetch(path).then((r) => r.text());

function stats(xs: number[]) {
  const s = xs.slice().sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
  return { n: s.length, mean: +mean.toFixed(3), median: +at(50)?.toFixed(3), p95: +at(95)?.toFixed(3), max: +at(100)?.toFixed(3) };
}

/** Records rAF intervals on the page's thread while `during` runs. */
async function uiJank<T>(during: () => Promise<T>): Promise<{ result: T; raf: ReturnType<typeof stats>; over50: number }> {
  const intervals: number[] = [];
  let last = performance.now();
  let on = true;
  const tick = () => { const now = performance.now(); intervals.push(now - last); last = now; if (on) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const result = await during();
  on = false;
  return { result, raf: stats(intervals.slice(1)), over50: intervals.filter((x) => x > 50).length };
}

function spawn(source: string, onMessage?: (m: any, w: Worker) => void): Worker {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  const w = new Worker(url);
  URL.revokeObjectURL(url);
  if (onMessage) w.addEventListener('message', (e) => onMessage(e.data, w));
  return w;
}

function readyAndCall(w: Worker) {
  let next = 1;
  const pending = new Map<number, (m: any) => void>();
  let ready!: () => void;
  const readyP = new Promise<void>((r) => { ready = r; });
  w.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'ready') ready();
    else if (m.type === 'response') { pending.get(m.id)?.(m); pending.delete(m.id); }
  });
  return {
    ready: readyP,
    call(method: string, args: unknown[]): Promise<any> {
      const id = next++;
      return new Promise((resolve) => { pending.set(id, resolve); w.postMessage({ type: 'request', id, method, args }); });
    },
  };
}

// ---- S2 canvas ----
async function s2(contextKind: '2d' | 'webgl2', how: 'transfer' | 'bitmap' | 'probe') {
  const plugin = await text('./plugins/canvas.js');
  const host = document.getElementById('cv') as HTMLCanvasElement;
  const fresh = document.createElement('canvas');
  fresh.width = 512; fresh.height = 512;
  host.replaceWith(fresh); fresh.id = 'cv';
  const recv: number[] = [], apply: number[] = [];
  let bitmapCtx: ImageBitmapRenderingContext | null = null;
  if (how === 'bitmap') bitmapCtx = fresh.getContext('bitmaprenderer');
  return uiJank(() => new Promise<any>((resolve) => {
    const w = spawn(spikeBootstrapSource() + plugin, (m) => {
      if (m.type === 'ready') {
        if (how === 'transfer') {
          const off = fresh.transferControlToOffscreen();
          w.postMessage({ type: 'canvas', canvas: off, options: { context: contextKind, frames: 90 } }, [off]);
        } else {
          w.postMessage({ type: 'canvas', options: { context: contextKind, frames: 90, probeOnly: how === 'probe' } });
        }
      } else if (m.type === 'bitmap') {
        recv.push(performance.timeOrigin + performance.now() - m.meta.sentAt);
        const s = performance.now();
        bitmapCtx!.transferFromImageBitmap(m.bitmap);
        apply.push(performance.now() - s);
      } else if (m.type === 'canvas-report') {
        if (m.data.done || m.data.error || how === 'probe') {
          w.terminate();
          resolve({
            contexts: m.data.contexts, error: m.data.error,
            workerDraw: m.data.drawMs ? stats(m.data.drawMs) : null,
            workerInterval: m.data.intervals ? stats(m.data.intervals) : null,
            workerPostBitmap: m.data.postMs?.length ? stats(m.data.postMs) : null,
            hostReceiveLatency: recv.length ? stats(recv) : null,
            hostApply: apply.length ? stats(apply) : null,
            framesReceived: recv.length,
          });
        }
      }
    });
  }));
}

// ---- S3 srcdoc frame ----
async function s3(busyMs: number) {
  const holder = document.getElementById('frames')!;
  holder.innerHTML = '';
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.width = '520'; frame.height = '520';
  frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src msm-app://app/frame-probe.js; style-src 'unsafe-inline'"><canvas id="c" width="512" height="512"></canvas><script>window.__inline = true;</script><script src="msm-app://app/frame-probe.js"></script>`;
  const probe = new Promise<any>((resolve) => {
    const on = (e: MessageEvent) => { if (e.source === frame.contentWindow && e.data?.type === 'frame-probe') { window.removeEventListener('message', on); resolve(e.data.r); } };
    window.addEventListener('message', on);
  });
  const t0 = performance.now();
  holder.appendChild(frame);
  const probeResult = await probe;
  const loadMs = performance.now() - t0;
  const drawn = await uiJank(() => new Promise<any>((resolve) => {
    const on = (e: MessageEvent) => { if (e.source === frame.contentWindow && e.data?.type === 'frame-drawn') { window.removeEventListener('message', on); resolve(stats(e.data.drawMs)); } };
    window.addEventListener('message', on);
    frame.contentWindow!.postMessage({ type: 'draw', frames: 90, busyMs }, '*');
  }));
  return { probe: probeResult, loadMs, frameDraw: drawn.result, pageRaf: drawn.raf, pageFramesOver50ms: drawn.over50 };
}

// ---- S4 idle workers and hogs ----
const idleWorkers: Worker[] = [];
async function s4Idle(n: number) {
  const plugin = await text('./plugins/idle.js');
  const boot = bootstrapSource();
  for (let i = 0; i < n; i++) {
    const w = spawn(boot + plugin);
    await new Promise<void>((r) => w.addEventListener('message', (e) => { if (e.data.type === 'ready') r(); }));
    idleWorkers.push(w);
  }
  return idleWorkers.length;
}
function s4StopIdle() { for (const w of idleWorkers.splice(0)) w.terminate(); }
const hogEvents: any[] = [];
async function s4Hog(kind: 'heap' | 'arraybuffer', capMb: number) {
  const plugin = await text('./plugins/hog.js');
  const w = spawn(spikeBootstrapSource() + plugin);
  const rc = readyAndCall(w);
  w.addEventListener('error', (e) => hogEvents.push({ t: performance.now(), type: 'error', message: e.message }));
  await rc.ready;
  const t0 = performance.now();
  const answer = await Promise.race([
    rc.call('call', [kind, [capMb]]),
    new Promise((r) => setTimeout(() => r({ timeout: true }), 120_000)),
  ]);
  return { answer, ms: performance.now() - t0, events: hogEvents.slice(), pageAlive: true };
}

// ---- S4 a frame of another origin ----
let framePort: MessagePort | null = null;
async function s4Frame() {
  const holder = document.getElementById('frames')!;
  const frame = document.createElement('iframe');
  frame.src = 'msm-plugin://p1/host.html';
  frame.style.display = 'none';
  const loaded = new Promise<void>((r) => frame.addEventListener('load', () => r()));
  holder.appendChild(frame);
  await Promise.race([loaded, new Promise((r) => setTimeout(r, 5000))]);
  const ch = new MessageChannel();
  framePort = ch.port1;
  const first = new Promise<any>((r) => { ch.port1.onmessage = (e) => r(e.data); });
  frame.contentWindow!.postMessage({ type: 'connect' }, '*', [ch.port2]);
  const hello = await Promise.race([first, new Promise((r) => setTimeout(() => r({ type: 'no answer (frame blocked?)' }), 3000))]);
  if (hello.type !== 'frame-ready') return { hello };
  // Round trip page -> frame -> page.
  const rtt: number[] = [];
  for (let i = 0; i < 500; i++) {
    const s = performance.now();
    await new Promise<void>((r) => { framePort!.onmessage = () => r(); framePort!.postMessage({ cmd: 'echo', i }); });
    rtt.push(performance.now() - s);
  }
  const origin = await new Promise<any>((r) => { framePort!.onmessage = (e) => r(e.data); framePort!.postMessage({ cmd: 'origin' }); });
  // Worker inside the frame: round trip page -> frame -> worker -> frame -> page.
  const plugin = await text('./plugins/hog.js');
  const events: any[] = [];
  const pending = new Map<number, (m: any) => void>();
  let ready!: () => void;
  const readyP = new Promise<void>((r) => { ready = r; });
  framePort.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'ready') ready();
    else if (m.type === 'response') { pending.get(m.id)?.(m); pending.delete(m.id); }
    else events.push(m);
  };
  framePort.postMessage({ cmd: 'spawn', code: spikeBootstrapSource() + plugin });
  await readyP;
  let id = 1;
  const call = (method: string, args: unknown[]) => new Promise<any>((r) => { const i = id++; pending.set(i, r); framePort!.postMessage({ cmd: 'toWorker', msg: { type: 'request', id: i, method, args } }); });
  const wrtt: number[] = [];
  for (let i = 0; i < 500; i++) { const s = performance.now(); await call('call', ['ping', []]); wrtt.push(performance.now() - s); }
  (window as any).__frameCall = call;
  (window as any).__frameEvents = events;
  return { hello, origin, pageFrameRtt: stats(rtt), pageFrameWorkerRtt: stats(wrtt) };
}
async function s4FrameHog(capMb: number) {
  const call = (window as any).__frameCall;
  const t0 = performance.now();
  const answer = await Promise.race([call('call', ['heap', [capMb]]), new Promise((r) => setTimeout(() => r({ timeout: true }), 90_000))]);
  return { answer, ms: performance.now() - t0, events: (window as any).__frameEvents };
}

// ---- S5 host calls ----
let elements: unknown[] = [];
async function s5() {
  const plugin = await text('./plugins/hostcall.js');
  elements = await fetch('./data/elements.json').then((r) => r.json());
  const oneMb = elements.slice(0, Math.round(elements.length * (1_000_000 / JSON.stringify(elements).length)));
  const postCost: number[] = [];
  const w = spawn(spikeBootstrapSource() + plugin);
  const rc = readyAndCall(w);
  w.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type !== 'hostcall') return;
    let value: unknown = null;
    if (m.name === 'ping') value = m.args[0];
    else if (m.name === 'oneMb') value = oneMb;
    else if (m.name === 'project') value = elements;
    else if (m.name === 'page') value = elements.slice(m.args[0], m.args[0] + m.args[1]);
    else if (m.name === 'ids') value = elements.map((x: any) => x.id);
    const s = performance.now();
    w.postMessage({ type: 'hostreply', id: m.id, ok: true, value });
    postCost.push(performance.now() - s);
    if (m.name === 'project') (window as any).__projectPostMs = performance.now() - s;
  });
  await rc.ready;
  const out: Record<string, unknown> = {};
  out.small = (await rc.call('call', ['small', [2000]])).value;
  out.oneMb = (await rc.call('call', ['oneMb', [50]])).value;
  out.oneMbBytes = JSON.stringify(oneMb).length;
  out.projectBytes = JSON.stringify(elements).length;
  out.projectElements = elements.length;
  const pj = await uiJank(async () => (await rc.call('call', ['project', [5]])).value);
  out.projectWhole = pj.result; out.projectWholePageRaf = pj.raf; out.projectWholeHostPostMs = (window as any).__projectPostMs;
  out.projectPages = (await rc.call('call', ['pages', [100]])).value;
  out.ids = (await rc.call('call', ['ids', [5]])).value;
  // Host -> worker: the project as an argument of a request (what a whole-project call costs today).
  const s = performance.now();
  const reply = rc.call('call', ['echoSize', [elements]]);
  const postMs = performance.now() - s;
  out.hostToWorkerProjectArgPostMs = postMs;
  out.hostToWorkerProjectArgRoundTripMs = ((await reply), performance.now() - s);
  // Structured clone limits: big buffers copied (not transferred).
  const sizes: Record<string, unknown> = {};
  for (const mb of [64, 256, 512]) {
    try {
      const buf = new Uint8Array(mb * 1024 * 1024);
      const t = performance.now();
      const r = await rc.call('call', ['echoSize', [buf]]);
      sizes[`${mb}MB copy`] = { ms: +(performance.now() - t).toFixed(1), ok: r.ok };
    } catch (e) { sizes[`${mb}MB copy`] = String(e); }
  }
  out.cloneSizes = sizes;
  w.terminate();
  return out;
}

// ---- S7 leaks under the real bootstrap ----
async function s7(appAsset?: { js: string; json?: string; font?: string }) {
  const plugin = await text('./plugins/probe.js');
  const w = spawn(bootstrapSource() + plugin);
  const rc = readyAndCall(w);
  const errors: string[] = [];
  w.addEventListener('error', (e) => errors.push(String(e.message)));
  await rc.ready;
  const answer = await rc.call('lower', ['spike:probe', { appAsset }, {}]);
  w.terminate();
  return { answer, errors };
}

// ---- S10 hot reload ----
async function s10Start() {
  const marks: any[] = [];
  (window as any).__reload = marks;
  await s1Setup(500, 'diff', 'host', await text('./plugins/kit-form.js'));
  (window as any).spikeBridge.onPluginChanged(async (m: any) => {
    const recvAt = performance.timeOrigin + performance.now();
    const t0 = performance.now();
    // Restart: a new worker, the new tree, painted; host-held field values survive in React state.
    const nodes = await s1Reload(m.text);
    const ch = new MessageChannel();
    await new Promise<void>((r) => requestAnimationFrame(() => { ch.port1.onmessage = () => r(); ch.port2.postMessage(0); }));
    marks.push({ name: m.name, seenAt: m.seenAt, readAt: m.readAt, recvAt, restartAndPaintMs: performance.now() - t0, paintedAt: performance.timeOrigin + performance.now(), nodes });
  });
  return true;
}

(window as any).spike = { s1Setup, s1Results, s1Reload, s2, s3, s4Idle, s4StopIdle, s4Hog, s4Frame, s4FrameHog, s5, s7, s10Start, text, stats };
document.title = 'B840 ready';
