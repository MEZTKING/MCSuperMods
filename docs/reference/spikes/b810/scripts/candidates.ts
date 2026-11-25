/**
 * B810 V7: rename candidates between two versions, from data only.
 *
 * node docs/reference/spikes/b810/scripts/candidates.ts --from-registries <registries.json>
 *   --to-registries <registries.json> --symbols <symbols.json> --from-version <v> --to-version <v>
 *   [--out <file.json>]
 *
 * 1. Registries are matched by member overlap (Jaccard), not by name: a registry whose members
 *    live on under another name is "moved", even when its old name is reused by another registry.
 * 2. Inside each matched pair, every removed member is paired with every added member and scored:
 *    name (stemmed token overlap, shared affixes) and, where the registry has a dispatcher in the
 *    mcdoc tree, shape (the dispatched struct's field set at each version).
 * 3. Field moves: in every dispatcher member and named type that changed, a removed field and an
 *    added field with the same value signature.
 */
import '../../../../../tools/shared/workspace-hooks.ts';

const { readFileSync, writeFileSync } = await import('node:fs');
const schemas = await import('../../../../../packages/schemas/src/index.ts');
type SchemaNode = import('../../../../../packages/schemas/src/index.ts').SchemaNode;
type SchemaIndex = import('../../../../../packages/schemas/src/index.ts').SchemaIndex;

const args = process.argv.slice(2);
const arg = (name: string, fallback?: string): string => {
  const i = args.indexOf(`--${name}`);
  if (i >= 0 && args[i + 1] !== undefined) return args[i + 1] as string;
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
};
type Registries = Record<string, string[]>;
const regA = JSON.parse(readFileSync(arg('from-registries'), 'utf8')) as Registries;
const regB = JSON.parse(readFileSync(arg('to-registries'), 'utf8')) as Registries;
const raw = JSON.parse(readFileSync(arg('symbols'), 'utf8'));
const symbols = schemas.parseVanillaMcdocSymbols(raw);
const ia = schemas.createSchemaIndex(symbols, { mcVersion: arg('from-version') });
const ib = schemas.createSchemaIndex(symbols, { mcVersion: arg('to-version') });

// ---------- 1. registry matching by members ----------
const jaccard = (x: Set<string>, y: Set<string>) => {
  let inter = 0;
  for (const v of x) if (y.has(v)) inter++;
  const union = x.size + y.size - inter;
  return union === 0 ? 1 : inter / union;
};
const setsA = Object.fromEntries(Object.entries(regA).map(([k, v]) => [k, new Set(v)]));
const setsB = Object.fromEntries(Object.entries(regB).map(([k, v]) => [k, new Set(v)]));
const pairs: { from: string; to: string; jaccard: number; kind: 'same' | 'moved' }[] = [];
// One-to-one: every (old, new) pair with overlap, best first; a pair is taken when neither side is
// taken yet. Same-name pairs win ties. Old registries left over keep their name if it still exists.
const all: { a: string; b: string; j: number }[] = [];
for (const a of Object.keys(regA)) for (const b of Object.keys(regB)) {
  const j = jaccard(setsA[a] as Set<string>, setsB[b] as Set<string>);
  if (j > 0 || a === b) all.push({ a, b, j: j + (a === b ? 0.05 : 0) });
}
all.sort((x, y) => y.j - x.j);
const takenA = new Set<string>();
const takenB = new Set<string>();
for (const { a, b, j } of all) {
  if (takenA.has(a) || takenB.has(b)) continue;
  if (a !== b && j < 0.5) continue;
  takenA.add(a);
  takenB.add(b);
  pairs.push({ from: a, to: b, jaccard: +Math.min(1, j - (a === b ? 0.05 : 0)).toFixed(3), kind: a === b ? 'same' : 'moved' });
}
for (const a of Object.keys(regA)) if (!takenA.has(a) && a in setsB && !takenB.has(a)) pairs.push({ from: a, to: a, jaccard: 0, kind: 'same' });
pairs.sort((x, y) => x.from.localeCompare(y.from));

// ---------- registry -> dispatcher, from the mcdoc tree ----------
/** A struct with a field `f` typed `string#id(R)` and a spread dispatcher keyed by `f` maps R to it. */
function dispatcherMap(index: SchemaIndex): Map<string, string> {
  const map = new Map<string, string>();
  const visit = (node: SchemaNode, depth: number) => {
    if (depth > 3) return;
    if (node.kind === 'union') {
      for (const m of node.members) visit(m, depth + 1);
      return;
    }
    if (node.kind !== 'struct') return;
    for (const sp of node.spreads) {
      if (sp.kind !== 'dispatcher' || sp.discriminator.length !== 1) continue;
      const key = sp.discriminator[0] as string;
      const field = node.fields.find((f) => f.key === key);
      let t = field?.type;
      if (t?.kind === 'union') t = t.members.find((m) => m.kind === 'string');
      if (t?.kind === 'string' && t.idRegistry) map.set(t.idRegistry.replace(/^minecraft:/, ''), sp.registry);
    }
  };
  for (const p of index.typePaths()) {
    try {
      visit(index.resolve(p), 0);
    } catch {
      /* skip */
    }
  }
  return map;
}
const mapA = dispatcherMap(ia);
const mapB = dispatcherMap(ib);

function fieldSet(index: SchemaIndex, dispatcher: string | undefined, key: string): Map<string, string> | undefined {
  if (!dispatcher) return undefined;
  const node = index.dispatch(dispatcher, key);
  if (!node) return undefined;
  const out = new Map<string, string>();
  const walk = (n: SchemaNode, depth: number) => {
    if (depth > 6) return;
    if (n.kind === 'reference') {
      try {
        walk(n.resolve(), depth + 1);
      } catch {
        /* skip */
      }
      return;
    }
    if (n.kind === 'union' && n.members.length === 1) return walk(n.members[0] as SchemaNode, depth + 1);
    if (n.kind === 'union') {
      for (const m of n.members) walk(m, depth + 1);
      return;
    }
    if (n.kind !== 'struct') return;
    for (const f of n.fields) out.set(f.key, `${f.optional ? '?' : ''}${f.type.kind}`);
    for (const s of n.spreads) walk(s, depth + 1);
  };
  walk(node, 0);
  return out;
}

// ---------- 2. member rename candidates ----------
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, '').replace(/e$/, '');
const tokens = (id: string) => new Set(id.split(/[_/.\-]+/).filter(Boolean).map(stem));
function nameScore(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  let j = jaccard(ta, tb);
  const la = a.split('/');
  const lb = b.split('/');
  // Same folder prefix for paths (textures, models).
  if (la.length > 1 && la.slice(0, -1).join('/') === lb.slice(0, -1).join('/')) j += 0.1;
  // One name contains the other (cache_once -> cache, random_offset -> offset).
  const ba = la.at(-1) as string;
  const bb = lb.at(-1) as string;
  if (ba.includes(bb) || bb.includes(ba)) j += 0.25;
  return Math.min(1, j);
}
interface Candidate {
  registry: string;
  toRegistry: string;
  from: string;
  to: string;
  name: number;
  shape: 'same' | 'superset' | 'subset' | 'similar' | 'differs' | 'none';
  fieldOverlap?: number;
  score: number;
}
const candidates: Candidate[] = [];
const memberDiff: Record<string, { removed: number; added: number }> = {};
for (const p of pairs) {
  const before = setsA[p.from] as Set<string>;
  const after = setsB[p.to] as Set<string>;
  const removed = [...before].filter((x) => !after.has(x));
  const added = [...after].filter((x) => !before.has(x));
  if (removed.length || added.length) memberDiff[`${p.from}${p.kind === 'moved' ? ` -> ${p.to}` : ''}`] = { removed: removed.length, added: added.length };
  if (!removed.length || !added.length) continue;
  const base = p.from.replace(/^tag\//, '');
  const dA = mapA.get(p.from) ?? mapA.get(base);
  const dB = mapB.get(p.to) ?? mapB.get(p.to.replace(/^tag\//, ''));
  for (const r of removed) {
    const fa = p.from.startsWith('tag/') ? undefined : fieldSet(ia, dA, r);
    for (const a of added) {
      const n = nameScore(r, a);
      const fb = p.to.startsWith('tag/') ? undefined : fieldSet(ib, dB, a);
      let shape: Candidate['shape'] = 'none';
      let overlap: number | undefined;
      if (fa && fb) {
        const ka = new Set(fa.keys());
        const kb = new Set(fb.keys());
        overlap = jaccard(ka, kb);
        const sameKeys = overlap === 1;
        const same = sameKeys && [...fa].every(([k, v]) => fb.get(k) === v);
        if (same) shape = 'same';
        else if ([...ka].every((k) => kb.has(k))) shape = 'superset';
        else if ([...kb].every((k) => ka.has(k))) shape = 'subset';
        else if (overlap >= 0.6) shape = 'similar';
        else shape = 'differs';
        if (ka.size === 0 && kb.size === 0) shape = 'same';
      }
      const shapeScore = { same: 0.5, superset: 0.4, subset: 0.3, similar: 0.3, differs: 0, none: 0 }[shape];
      const score = n + shapeScore;
      candidates.push({ registry: p.from, toRegistry: p.to, from: r, to: a, name: +n.toFixed(2), shape, ...(overlap === undefined ? {} : { fieldOverlap: +overlap.toFixed(2) }), score: +score.toFixed(2) });
    }
  }
}
// One-to-one, best first: a candidate is proposed when neither its removed nor its added member is
// taken; a removed member whose best score is shared by two free partners is left out (ambiguous).
const sorted = [...candidates].sort((x, y) => y.score - x.score || x.from.localeCompare(y.from));
const takenFrom = new Set<string>();
const takenTo = new Set<string>();
const proposed: Candidate[] = [];
const ambiguous: Candidate[] = [];
for (const c of sorted) {
  const kf = `${c.registry}\u0000${c.from}`;
  const kt = `${c.toRegistry}\u0000${c.to}`;
  if (takenFrom.has(kf) || takenTo.has(kt)) continue;
  const rivals = sorted.filter((d) => d !== c && d.registry === c.registry && d.from === c.from && d.score === c.score && !takenTo.has(`${d.toRegistry}\u0000${d.to}`));
  takenFrom.add(kf);
  if (rivals.length > 0) {
    ambiguous.push(c, ...rivals);
    continue;
  }
  takenTo.add(kt);
  proposed.push(c);
}

// ---------- 3. field moves ----------
function topFields(node: SchemaNode | undefined, depth = 0): Map<string, string> | undefined {
  if (!node || depth > 6) return undefined;
  if (node.kind === 'reference') {
    try {
      return topFields(node.resolve(), depth + 1);
    } catch {
      return undefined;
    }
  }
  if (node.kind === 'union' && node.members.length === 1) return topFields(node.members[0], depth + 1);
  if (node.kind !== 'struct') return undefined;
  const out = new Map<string, string>();
  for (const f of node.fields) out.set(f.key, JSON.stringify(shallow(f.type)));
  for (const s of node.spreads) {
    const inner = topFields(s, depth + 1);
    if (inner) for (const [k, v] of inner) out.set(k, v);
  }
  return out;
}
function shallow(n: SchemaNode): unknown {
  switch (n.kind) {
    case 'reference':
      return `@${n.path}`;
    case 'string':
      return `string${n.idRegistry ? `#${n.idRegistry}` : ''}`;
    case 'number':
      return n.numberKind;
    case 'list':
      return ['list', shallow(n.item)];
    case 'union':
      return ['union', ...n.members.map(shallow).map(String).sort()];
    case 'dispatcher':
      return `dispatch(${n.registry})`;
    case 'struct':
      return `struct(${n.fields.map((f) => f.key).sort().join(',')})`;
    default:
      return n.kind;
  }
}
const fieldMoves: { where: string; from: string; to: string; sameType: boolean; nameSimilar: boolean }[] = [];
const dispatchers = Object.keys(raw['mcdoc/dispatcher'] ?? {});
const sites: [string, SchemaNode | undefined, SchemaNode | undefined][] = [];
for (const d of dispatchers) for (const k of ia.dispatcherKeys(d)) if (ib.dispatcherKeys(d).includes(k)) sites.push([`${d}[${k}]`, ia.dispatch(d, k), ib.dispatch(d, k)]);
for (const p of ia.typePaths()) if (!p.includes('<anonymous') && ib.has(p)) {
  try {
    sites.push([p, ia.resolve(p), ib.resolve(p)]);
  } catch {
    /* skip */
  }
}
for (const [where, na, nb] of sites) {
  const fa = topFields(na);
  const fb = topFields(nb);
  if (!fa || !fb) continue;
  const gone = [...fa.keys()].filter((k) => !fb.has(k));
  const fresh = [...fb.keys()].filter((k) => !fa.has(k));
  for (const g of gone) for (const f of fresh) {
    const sameType = fa.get(g) === fb.get(f);
    const nameSimilar = nameScore(g, f) >= 0.3;
    if (sameType || nameSimilar) fieldMoves.push({ where, from: g, to: f, sameType, nameSimilar });
  }
}

const result = {
  registryPairs: pairs.filter((p) => p.kind === 'moved' || p.jaccard < 0.9),
  memberDiff,
  dispatcherMapSize: mapB.size,
  candidatesConsidered: candidates.length,
  proposed,
  ambiguous,
  fieldMoves,
};
const out = arg('out', '');
if (out) writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
console.log(
  JSON.stringify(
    {
      movedRegistries: pairs.filter((p) => p.kind === 'moved'),
      dispatcherMapSize: mapB.size,
      candidatesConsidered: candidates.length,
      proposed: proposed.length,
      fieldMoves: fieldMoves.length,
      fieldMovesSameType: fieldMoves.filter((f) => f.sameType).length,
    },
    null,
    1,
  ),
);
