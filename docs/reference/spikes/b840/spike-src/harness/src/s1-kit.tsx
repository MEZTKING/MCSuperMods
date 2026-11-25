// B840 S1: typing through the kit. A minimal host-side kit renderer (React 19, memoised by
// node identity), a plugin worker with the spike bootstrap, and timing from keydown to the
// frame after the character is in the DOM. Throwaway.
import { memo, useLayoutEffect, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { spikeBootstrapSource } from './spike-bootstrap.js';

type Node = { t: string; id?: string; c?: Node[]; [k: string]: unknown };
type Mode = 'whole' | 'whole-share' | 'diff';
type Field = 'host' | 'worker';

interface Mark { kind: 'field' | 'echo'; value: string; t: number }
const marks: Mark[] = [];
const keyTimes: number[] = [];
const responses: { renderMs: number; diffMs: number; bytes: number; applyMs: number; recvAt: number }[] = [];

function markPaint(kind: Mark['kind'], value: string): void {
  requestAnimationFrame(() => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => marks.push({ kind, value, t: performance.now() });
    ch.port2.postMessage(0);
  });
}

document.addEventListener('keydown', (e) => keyTimes.push(e.timeStamp), true);

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (v: any) => void>();
let setTreeRef: ((f: (t: Node | null) => Node | null) => void) | null = null;
let mode: Mode = 'whole';
let field: Field = 'host';
let commitStart = 0;

function call(method: string, args: unknown[]): Promise<any> {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker!.postMessage({ type: 'request', id, method, args });
  });
}

function applyPatches(tree: Node, patches: any[]): Node {
  let root = tree;
  for (const p of patches) {
    const path: number[] = p.path;
    const rebuild = (node: Node, depth: number): Node => {
      if (depth === path.length) {
        return p.op === 'replace' ? p.node : { ...p.props, c: node.c };
      }
      const c = node.c!.slice();
      c[path[depth]] = rebuild(c[path[depth]], depth + 1);
      return { ...node, c };
    };
    root = rebuild(root, 0);
  }
  return root;
}

function sameProps(a: Node, b: Node): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (k !== 'c' && a[k] !== b[k]) return false;
  return true;
}
function share(prev: Node | undefined, next: Node): Node {
  if (prev === undefined || prev.t !== next.t) return next;
  let childrenSame = (prev.c?.length ?? 0) === (next.c?.length ?? 0);
  const c = next.c?.map((child, i) => {
    const s = share(prev.c?.[i], child);
    if (s !== prev.c?.[i]) childrenSame = false;
    return s;
  });
  if (childrenSame && sameProps(prev, next)) return prev;
  return c === undefined ? next : { ...next, c };
}

function onAnswer(value: any): void {
  const recvAt = performance.now();
  const bytes = JSON.stringify(value).length;
  responses.push({ renderMs: value.renderMs, diffMs: value.diffMs, bytes, applyMs: -1, recvAt });
  commitStart = recvAt;
  setTreeRef!((old) => {
    if (value.patches) return applyPatches(old!, value.patches);
    if (mode === 'whole-share') return share(old ?? undefined, value.tree);
    return value.tree;
  });
}

let coalesce = false;
let inFlight = false;
let queued: unknown = null;
function sendEvent(event: unknown): void {
  if (coalesce) {
    // At most one event in flight; a newer change of the same field replaces a queued one.
    if (inFlight) { queued = event; return; }
    inFlight = true;
    void call('viewEvent', ['form', mode === 'diff' ? 'diff' : 'whole', event]).then((v) => {
      onAnswer(v);
      requestAnimationFrame(() => {
        inFlight = false;
        if (queued !== null) { const q = queued; queued = null; sendEvent(q); }
      });
    });
    return;
  }
  void call('viewEvent', ['form', mode === 'diff' ? 'diff' : 'whole', event]).then(onAnswer);
}

const HostField = memo(function HostField({ node }: { node: Node }) {
  const [local, setLocal] = useState(String(node.value ?? ''));
  useLayoutEffect(() => { if (local !== '') markPaint('field', local); }, [local]);
  return (
    <label className="kit-field">
      <span>{String(node.label)}</span>
      <input data-testid={`kit-${node.id}`} value={local} onChange={(e) => {
        setLocal(e.target.value);
        sendEvent({ type: 'change', node: node.id, value: e.target.value });
      }} />
    </label>
  );
});

const WorkerField = memo(function WorkerField({ node }: { node: Node }) {
  const value = String(node.value ?? '');
  useLayoutEffect(() => { if (value !== '') markPaint('field', value); }, [value]);
  return (
    <label className="kit-field">
      <span>{String(node.label)}</span>
      <input data-testid={`kit-${node.id}`} value={value} onChange={(e) =>
        sendEvent({ type: 'change', node: node.id, value: e.target.value })} />
    </label>
  );
});

const KitText = memo(function KitText({ node }: { node: Node }) {
  const text = String(node.text);
  useLayoutEffect(() => {
    if (node.id === 'echo' && text.length > 7) markPaint('echo', text.slice(7));
  }, [text, node.id]);
  return <p className={`kit-text tone-${String(node.tone ?? 'normal')}`}>{text}</p>;
});

const KitNode = memo(function KitNode({ node }: { node: Node }): ReactNode {
  const kids = node.c?.map((child, i) => <KitNode key={child.id ?? i} node={child} />);
  switch (node.t) {
    case 'Column': return <div className="kit-column">{kids}</div>;
    case 'Row': return <div className="kit-row">{kids}</div>;
    case 'Section': return <section className="kit-section"><h3>{String(node.title)}</h3>{kids}</section>;
    case 'Heading': return <h4 className="kit-heading">{String(node.text)}</h4>;
    case 'Text': return <KitText node={node} />;
    case 'Button': return <button type="button" className="kit-button" onClick={() => sendEvent({ type: 'click', node: node.id })}>{String(node.label)}</button>;
    case 'Toggle': return (
      <label className="kit-toggle"><input type="checkbox" checked={node.value === true}
        onChange={(e) => sendEvent({ type: 'change', node: node.id, value: e.target.checked })} />{String(node.label)}</label>
    );
    case 'TextField': return field === 'host' ? <HostField node={node} /> : <WorkerField node={node} />;
    default: return <div>unknown {node.t}</div>;
  }
});

function count(node: Node): number { return 1 + (node.c?.reduce((s, c) => s + count(c), 0) ?? 0); }

function App(): ReactNode {
  const [tree, setTree] = useState<Node | null>(null);
  setTreeRef = setTree;
  useLayoutEffect(() => {
    if (commitStart > 0 && responses.length > 0) {
      const last = responses[responses.length - 1];
      if (last.applyMs < 0) last.applyMs = performance.now() - commitStart;
    }
  });
  return tree === null ? <p>Loading</p> : <div data-testid="kit-root" data-nodes={count(tree)}><KitNode node={tree} /></div>;
}

let root: Root | null = null;

export async function s1Setup(n: number, m: Mode, f: Field, pluginText: string, co = false): Promise<number> {
  mode = m; field = f; coalesce = co; inFlight = false; queued = null;
  marks.length = 0; keyTimes.length = 0; responses.length = 0;
  worker?.terminate();
  pending.clear();
  const src = spikeBootstrapSource() + pluginText;
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  worker = new Worker(url, { name: 'spike-kit' });
  URL.revokeObjectURL(url);
  await new Promise<void>((resolve) => {
    worker!.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'ready') resolve();
      else if (msg.type === 'response') { pending.get(msg.id)?.(msg.value); pending.delete(msg.id); }
    });
  });
  const container = document.getElementById('kit')!;
  root?.unmount();
  root = createRoot(container);
  root.render(<App />);
  await new Promise((r) => setTimeout(r, 50));
  const first = await call('viewEvent', ['form', 'whole', { type: 'init', n }]);
  setTreeRef!(() => first.tree);
  await new Promise((r) => setTimeout(r, 200));
  // `whole` was used for the first tree; later answers use the mode's shape.
  await call('viewRender', ['form', 'whole']);
  marks.length = 0; keyTimes.length = 0; responses.length = 0;
  return Number(document.querySelector('[data-testid=kit-root]')?.getAttribute('data-nodes'));
}

function pct(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const s = values.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

export function s1Results(typed: string): unknown {
  const field: number[] = [];
  const echo: number[] = [];
  let lostField = 0, lostEcho = 0;
  for (let k = 0; k < typed.length; k++) {
    const expected = typed.slice(0, k + 1);
    const tk = keyTimes[k];
    const fm = marks.find((m) => m.kind === 'field' && m.value === expected);
    const em = marks.find((m) => m.kind === 'echo' && m.value === expected);
    if (fm && tk !== undefined) field.push(fm.t - tk); else lostField++;
    if (em && tk !== undefined) echo.push(em.t - tk); else lostEcho++;
  }
  const finalValue = (document.querySelector('[data-testid=kit-name]') as HTMLInputElement | null)?.value;
  const r = (xs: number[]) => ({ median: pct(xs, 50), p95: pct(xs, 95), max: pct(xs, 100), n: xs.length });
  return {
    keys: keyTimes.length,
    fieldPaint: r(field), echoPaint: r(echo), lostField, lostEcho,
    finalValueOk: finalValue === typed, finalValue,
    workerRenderMs: r(responses.map((x) => x.renderMs)),
    workerDiffMs: r(responses.map((x) => x.diffMs)),
    hostApplyMs: r(responses.map((x) => x.applyMs).filter((x) => x >= 0)),
    bytes: r(responses.map((x) => x.bytes)),
  };
}

/** S10: swaps the worker for a new bundle, keeps the React tree (and so host-held field values), restores them in the plugin. */
export async function s1Reload(pluginText: string): Promise<number> {
  const keptName = (document.querySelector('[data-testid=kit-name]') as HTMLInputElement | null)?.value ?? '';
  worker?.terminate();
  pending.clear();
  const src = spikeBootstrapSource() + pluginText;
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  worker = new Worker(url, { name: 'spike-kit' });
  URL.revokeObjectURL(url);
  await new Promise<void>((resolve) => {
    worker!.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'ready') resolve();
      else if (msg.type === 'response') { pending.get(msg.id)?.(msg.value); pending.delete(msg.id); }
    });
  });
  const n = Number(document.querySelector('[data-testid=kit-root]')?.getAttribute('data-nodes'));
  await call('viewEvent', ['form', 'whole', { type: 'init', n }]);
  const restored = await call('viewEvent', ['form', 'whole', { type: 'change', node: 'name', value: keptName }]);
  await new Promise<void>((resolve) => { setTreeRef!((old) => share(old ?? undefined, restored.tree)); requestAnimationFrame(() => resolve()); });
  return Number(document.querySelector('[data-testid=kit-root]')?.getAttribute('data-nodes'));
}
