/**
 * B810 throwaway differ (V1, V3, V4, V5): compares two target folders' vendored data.
 *
 * node docs/reference/spikes/b810/scripts/differ.ts --from <target folder> --to <target folder>
 *   --from-version <mc version> --to-version <mc version> [--mcdoc gated|refs|drift|both]
 *   [--symbols <symbols.json to use for gated mode>] [--out <file.json>]
 *
 * mcdoc modes:
 *   gated  one symbols.json (the newer target's, or --symbols) resolved at both versions;
 *   refs   the older target's symbols at the older version against the newer's at the newer;
 *   drift  both targets' symbols at the OLDER version: what differs only because the refs differ.
 * Reads only the vendored files of the two folders (and --symbols). Writes one JSON report.
 */
import '../../../../../tools/shared/workspace-hooks.ts';

const { readFileSync, writeFileSync } = await import('node:fs');
const { join } = await import('node:path');
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
const fromDir = arg('from');
const toDir = arg('to');
const fromVersion = arg('from-version');
const toVersion = arg('to-version');
const mode = arg('mcdoc', 'gated');
const out = arg('out', '');

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const vendor = (dir: string, file: string): string => join(dir, 'vendor', file);

// ---------- registries ----------
type Registries = Record<string, string[]>;
function diffRegistries(a: Registries, b: Registries) {
  const addedRegistries = Object.keys(b).filter((k) => !(k in a)).sort();
  const removedRegistries = Object.keys(a).filter((k) => !(k in b)).sort();
  const moved: Record<string, string> = {};
  for (const gone of removedRegistries) {
    const members = [...(a[gone] ?? [])].sort().join('\n');
    for (const added of addedRegistries) {
      if ([...(b[added] ?? [])].sort().join('\n') === members) moved[gone] = added;
    }
  }
  const removed: Registries = {};
  const added: Registries = {};
  for (const [name, ids] of Object.entries(a)) {
    if (!(name in b)) continue;
    const kept = new Set(b[name]);
    const r = ids.filter((id) => !kept.has(id)).sort();
    if (r.length > 0) removed[name] = r;
  }
  for (const [name, ids] of Object.entries(b)) {
    if (!(name in a)) continue;
    const had = new Set(a[name]);
    const n = ids.filter((id) => !had.has(id)).sort();
    if (n.length > 0) added[name] = n;
  }
  // Removed registries not explained by a move count as removed members too.
  for (const gone of removedRegistries) {
    if (!(gone in moved)) removed[gone] = [...(a[gone] ?? [])].sort();
  }
  const stillElsewhere: Record<string, Record<string, string[]>> = {};
  for (const [name, ids] of Object.entries(removed)) {
    for (const id of ids) {
      const where = Object.keys(b)
        .filter((o) => b[o]?.includes(id))
        .sort();
      if (where.length > 0) stillElsewhere[name] = { ...stillElsewhere[name], [id]: where };
    }
  }
  const count = (r: Registries) => Object.values(r).reduce((n, l) => n + l.length, 0);
  return {
    counts: {
      registriesBefore: Object.keys(a).length,
      registriesAfter: Object.keys(b).length,
      addedRegistries: addedRegistries.length,
      removedRegistries: removedRegistries.length,
      removedMembers: count(removed),
      addedMembers: count(added),
      registriesWithRemovals: Object.keys(removed).length,
      registriesWithAdditions: Object.keys(added).length,
    },
    addedRegistries,
    removedRegistries,
    moved,
    removed,
    added,
    stillElsewhere,
  };
}

// ---------- mcdoc ----------
const isAnon = (path: string) => path.includes('<anonymous');
function rangeSig(r: { min?: number; max?: number } | undefined): string {
  return r === undefined ? '' : `(${r.min ?? ''}..${r.max ?? ''})`;
}
/** A shallow canonical signature: named references by path, anonymous ones inlined. */
function sig(node: SchemaNode, depth = 0, seen: Set<string> = new Set()): string {
  if (depth > 8) return '…';
  switch (node.kind) {
    case 'reference': {
      if (!isAnon(node.path)) return `@${node.path}`;
      if (seen.has(node.path)) return '@cycle';
      const next = new Set(seen);
      next.add(node.path);
      try {
        return sig(node.resolve(), depth + 1, next);
      } catch {
        return `@missing(${node.path})`;
      }
    }
    case 'struct': {
      const fields = node.fields
        .map((f) => `${f.keyType ? `[${sig(f.keyType, depth + 1, seen)}]` : f.key}${f.optional ? '?' : ''}:${sig(f.type, depth + 1, seen)}`)
        .sort();
      const spreads = node.spreads.map((s) => `...${sig(s, depth + 1, seen)}`).sort();
      return `{${[...fields, ...spreads].join(',')}}`;
    }
    case 'list':
      return `[${sig(node.item, depth + 1, seen)}]${rangeSig(node.lengthRange)}`;
    case 'tuple':
      return `(${node.items.map((i) => sig(i, depth + 1, seen)).join(',')})`;
    case 'string':
      return `string${node.idRegistry ? `#id(${node.idRegistry})` : ''}${rangeSig(node.lengthRange)}`;
    case 'number':
      return `${node.numberKind}${rangeSig(node.range)}`;
    case 'enum':
      return `enum(${node.values.map((v) => String(v.value)).sort().join('|')})`;
    case 'literal':
      return `lit(${String(node.value)})`;
    case 'union':
      return `union(${node.members.map((m) => sig(m, depth + 1, seen)).sort().join('|')})`;
    case 'dispatcher':
      return `dispatch(${node.registry})`;
    case 'unsupported':
      return `unsupported(${node.rawKind})`;
    default:
      return node.kind;
  }
}

/** Deep field paths of a node: path -> set of leaf signatures; references followed once per branch. */
function fieldPaths(root: SchemaNode, cap = 20000): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const add = (path: string, s: string) => {
    if (out.size >= cap && !out.has(path)) return;
    let set = out.get(path);
    if (!set) {
      set = new Set();
      out.set(path, set);
    }
    set.add(s);
  };
  const walk = (node: SchemaNode, path: string, stack: string[], depth: number) => {
    if (depth > 16 || out.size >= cap) return;
    switch (node.kind) {
      case 'reference': {
        if (stack.includes(node.path)) {
          add(path, `@cycle(${isAnon(node.path) ? 'anon' : node.path})`);
          return;
        }
        let next: SchemaNode;
        try {
          next = node.resolve();
        } catch {
          add(path, `@missing(${node.path})`);
          return;
        }
        walk(next, path, [...stack, node.path], depth);
        return;
      }
      case 'struct':
        for (const f of node.fields) {
          const key = f.keyType ? '*' : f.key;
          const fp = `${path}.${key}`;
          add(fp, f.optional ? '(optional)' : '(required)');
          walk(f.type, fp, stack, depth + 1);
        }
        for (const s of node.spreads) walk(s, path, stack, depth);
        if (node.fields.length === 0 && node.spreads.length === 0) add(path, '{}');
        return;
      case 'list':
        walk(node.item, `${path}[]`, stack, depth + 1);
        return;
      case 'tuple':
        node.items.forEach((i, n) => walk(i, `${path}[${n}]`, stack, depth + 1));
        return;
      case 'union':
        for (const m of node.members) walk(m, path, stack, depth);
        return;
      default:
        add(path, sig(node, 4));
    }
  };
  walk(root, '', [], 0);
  return out;
}

/** Top-level fields of a struct-like node (references and one-member unions unwrapped). */
function topFields(node: SchemaNode | undefined, depth = 0): Map<string, { optional: boolean; sig: string }> | undefined {
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
  const out = new Map<string, { optional: boolean; sig: string }>();
  for (const f of node.fields) out.set(f.keyType ? `[${sig(f.keyType)}]` : f.key, { optional: f.optional, sig: sig(f.type) });
  node.spreads.forEach((sp, i) => {
    const inner = topFields(sp, depth + 1);
    if (inner) for (const [k, v] of inner) out.set(k, v);
    else out.set(`...${i}`, { optional: false, sig: sig(sp) });
  });
  return out;
}
export interface FieldDiff {
  addedRequired: string[];
  addedOptional: string[];
  removed: string[];
  madeOptional: string[];
  madeRequired: string[];
  retyped: string[];
  notStruct?: true;
}
function fieldDiff(a: SchemaNode | undefined, b: SchemaNode | undefined): FieldDiff {
  const fa = topFields(a);
  const fb = topFields(b);
  const d: FieldDiff = { addedRequired: [], addedOptional: [], removed: [], madeOptional: [], madeRequired: [], retyped: [] };
  if (!fa || !fb) return { ...d, notStruct: true };
  for (const [k, v] of fb) {
    const o = fa.get(k);
    if (!o) (v.optional ? d.addedOptional : d.addedRequired).push(k);
    else {
      if (o.optional && !v.optional) d.madeRequired.push(k);
      if (!o.optional && v.optional) d.madeOptional.push(k);
      if (o.sig !== v.sig) d.retyped.push(k);
    }
  }
  for (const k of fa.keys()) if (!fb.has(k)) d.removed.push(k);
  return d;
}
/** Breaking: data valid before may be invalid after. */
function breaking(d: FieldDiff): boolean {
  return d.addedRequired.length + d.removed.length + d.madeRequired.length + d.retyped.length > 0 || d.notStruct === true;
}

function mcdocDiff(a: SchemaIndex, b: SchemaIndex, dispatchers: string[]) {
  // Named types.
  const named = new Set([...a.typePaths(), ...b.typePaths()].filter((p) => !isAnon(p)));
  const typesChanged: { path: string; before: string; after: string; fields?: FieldDiff }[] = [];
  let typesCompared = 0;
  const typesOnlyBefore: string[] = [];
  const typesOnlyAfter: string[] = [];
  for (const path of [...named].sort()) {
    const ha = a.has(path);
    const hb = b.has(path);
    if (!ha) {
      typesOnlyAfter.push(path);
      continue;
    }
    if (!hb) {
      typesOnlyBefore.push(path);
      continue;
    }
    typesCompared++;
    let sa: string;
    let sb: string;
    try {
      sa = sig(a.resolve(path));
      sb = sig(b.resolve(path));
    } catch (e) {
      typesChanged.push({ path, before: 'error', after: String(e) });
      continue;
    }
    if (sa !== sb) typesChanged.push({ path, before: sa, after: sb, fields: fieldDiff(a.resolve(path), b.resolve(path)) });
  }
  // Dispatchers.
  const dispatcherChanges: Record<
    string,
    { added: string[]; removed: string[]; changed: { key: string; before: string; after: string; fields: FieldDiff }[] }
  > = {};
  let membersCompared = 0;
  for (const d of dispatchers) {
    const ka = a.dispatcherKeys(d);
    const kb = b.dispatcherKeys(d);
    const sa = new Set(ka);
    const sb = new Set(kb);
    const added = kb.filter((k) => !sa.has(k));
    const removed = ka.filter((k) => !sb.has(k));
    const changed: { key: string; before: string; after: string; fields: FieldDiff }[] = [];
    for (const k of ka.filter((k) => sb.has(k))) {
      membersCompared++;
      const na = a.dispatch(d, k);
      const nb = b.dispatch(d, k);
      if (!na || !nb) continue;
      const x = sig(na);
      const y = sig(nb);
      if (x !== y) changed.push({ key: k, before: x, after: y, fields: fieldDiff(na, nb) });
    }
    if (added.length || removed.length || changed.length) dispatcherChanges[d] = { added, removed, changed };
  }
  // Resources, deep.
  const resources = [...new Set([...a.dispatcherKeys('minecraft:resource'), ...b.dispatcherKeys('minecraft:resource')])].sort();
  const resourceChanges: Record<string, { added: string[]; removed: string[]; retyped: { path: string; before: string[]; after: string[] }[]; pathsBefore: number; pathsAfter: number }> = {};
  for (const r of resources) {
    const na = a.dispatch('minecraft:resource', r);
    const nb = b.dispatch('minecraft:resource', r);
    const pa = na ? fieldPaths(na) : new Map<string, Set<string>>();
    const pb = nb ? fieldPaths(nb) : new Map<string, Set<string>>();
    const added = [...pb.keys()].filter((p) => !pa.has(p)).sort();
    const removed = [...pa.keys()].filter((p) => !pb.has(p)).sort();
    const retyped: { path: string; before: string[]; after: string[] }[] = [];
    for (const [p, s] of pa) {
      const t = pb.get(p);
      if (!t) continue;
      const x = [...s].sort();
      const y = [...t].sort();
      if (x.join('|') !== y.join('|')) retyped.push({ path: p, before: x, after: y });
    }
    if (added.length || removed.length || retyped.length || !na || !nb) {
      resourceChanges[r] = { added, removed, retyped, pathsBefore: pa.size, pathsAfter: pb.size };
    }
  }
  const dc = Object.values(dispatcherChanges);
  return {
    counts: {
      namedTypes: named.size,
      typesCompared,
      typesChanged: typesChanged.length,
      typesOnlyBefore: typesOnlyBefore.length,
      typesOnlyAfter: typesOnlyAfter.length,
      dispatchers: dispatchers.length,
      dispatchersChanged: dc.length,
      dispatcherMembersCompared: membersCompared,
      dispatcherKeysAdded: dc.reduce((n, x) => n + x.added.length, 0),
      dispatcherKeysRemoved: dc.reduce((n, x) => n + x.removed.length, 0),
      dispatcherMembersChanged: dc.reduce((n, x) => n + x.changed.length, 0),
      resources: resources.length,
      resourcesChanged: Object.keys(resourceChanges).length,
      resourceFieldsAdded: Object.values(resourceChanges).reduce((n, x) => n + x.added.length, 0),
      resourceFieldsRemoved: Object.values(resourceChanges).reduce((n, x) => n + x.removed.length, 0),
      resourceFieldsRetyped: Object.values(resourceChanges).reduce((n, x) => n + x.retyped.length, 0),
      typesBreaking: typesChanged.filter((t) => t.fields && breaking(t.fields)).length,
      membersBreaking: dc.reduce((n, x) => n + x.changed.filter((c) => breaking(c.fields)).length, 0),
      fieldChanges: [...typesChanged.map((t) => t.fields), ...dc.flatMap((x) => x.changed.map((c) => c.fields))].reduce(
        (acc, f) => {
          if (!f) return acc;
          for (const k of ['addedRequired', 'addedOptional', 'removed', 'madeOptional', 'madeRequired', 'retyped'] as const) acc[k] += f[k].length;
          if (f.notStruct) acc.notStruct++;
          return acc;
        },
        { addedRequired: 0, addedOptional: 0, removed: 0, madeOptional: 0, madeRequired: 0, retyped: 0, notStruct: 0 },
      ),
    },
    typesChanged,
    typesOnlyBefore,
    typesOnlyAfter,
    dispatcherChanges,
    resourceChanges,
  };
}

// ---------- commands ----------
interface CmdNode {
  type: string;
  /** Since 26.4-snapshot-8 the report nests argument information here (type and properties). */
  argument?: { type: string; [k: string]: unknown };
  children?: Record<string, CmdNode>;
  executable?: boolean;
  parser?: string;
  properties?: unknown;
  redirect?: string[];
}
function flattenCommands(root: CmdNode): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (node: CmdNode, path: string[]) => {
    for (const [name, child] of Object.entries(node.children ?? {})) {
      const label = child.type === 'literal' ? name : `<${name}>`;
      if (child.argument && child.parser === undefined) {
        const { type, ...props } = child.argument;
        child.parser = type;
        if (Object.keys(props).length) child.properties = props;
      }
      const p = [...path, label];
      const desc = [
        child.type === 'argument' ? `${child.parser}${child.properties ? JSON.stringify(child.properties) : ''}` : 'literal',
        child.executable ? 'exec' : '',
        child.redirect ? `->${child.redirect.join(' ')}` : '',
      ]
        .filter(Boolean)
        .join(' ');
      out.set(p.join(' '), desc);
      walk(child, p);
    }
  };
  walk(root, []);
  return out;
}
function diffCommands(a: CmdNode, b: CmdNode) {
  const fa = flattenCommands(a);
  const fb = flattenCommands(b);
  const added = [...fb.keys()].filter((k) => !fa.has(k)).sort();
  const removed = [...fa.keys()].filter((k) => !fb.has(k)).sort();
  const changed = [...fa.keys()]
    .filter((k) => fb.has(k) && fa.get(k) !== fb.get(k))
    .sort()
    .map((k) => ({ path: k, before: fa.get(k), after: fb.get(k) }));
  const rootsA = Object.keys(a.children ?? {});
  const rootsB = Object.keys(b.children ?? {});
  // Collapse: report only the topmost added/removed path of each subtree.
  const top = (list: string[]) => list.filter((p) => !list.some((q) => q !== p && p.startsWith(`${q} `)));
  const parsers = (f: Map<string, string>) => {
    const s = new Map<string, number>();
    for (const v of f.values()) {
      const p = v.split(' ')[0] as string;
      if (p !== 'literal') s.set(p.replace(/\{.*$/, ''), (s.get(p.replace(/\{.*$/, '')) ?? 0) + 1);
    }
    return s;
  };
  const pa = parsers(fa);
  const pb = parsers(fb);
  return {
    counts: {
      nodesBefore: fa.size,
      nodesAfter: fb.size,
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      addedTop: top(added).length,
      removedTop: top(removed).length,
      rootsBefore: rootsA.length,
      rootsAfter: rootsB.length,
    },
    rootsAdded: rootsB.filter((r) => !rootsA.includes(r)),
    rootsRemoved: rootsA.filter((r) => !rootsB.includes(r)),
    parsersAdded: [...pb.keys()].filter((p) => !pa.has(p)).sort(),
    parsersRemoved: [...pa.keys()].filter((p) => !pb.has(p)).sort(),
    addedTop: top(added),
    removedTop: top(removed),
    changed,
  };
}

// ---------- blocks ----------
type Blocks = Record<string, [Record<string, string[]>, Record<string, string>]>;
function diffBlocks(a: Blocks, b: Blocks) {
  const added = Object.keys(b).filter((k) => !(k in a)).sort();
  const removed = Object.keys(a).filter((k) => !(k in b)).sort();
  const changed: {
    block: string;
    propsAdded: string[];
    propsRemoved: string[];
    valuesChanged: { prop: string; added: string[]; removed: string[] }[];
    defaultsChanged: { prop: string; before: string; after: string }[];
  }[] = [];
  for (const k of Object.keys(a).filter((k) => k in b).sort()) {
    const [pa, da] = a[k] as Blocks[string];
    const [pb, db] = b[k] as Blocks[string];
    const propsAdded = Object.keys(pb).filter((p) => !(p in pa));
    const propsRemoved = Object.keys(pa).filter((p) => !(p in pb));
    const valuesChanged = Object.keys(pa)
      .filter((p) => p in pb)
      .map((p) => ({
        prop: p,
        added: (pb[p] ?? []).filter((v) => !(pa[p] ?? []).includes(v)),
        removed: (pa[p] ?? []).filter((v) => !(pb[p] ?? []).includes(v)),
      }))
      .filter((x) => x.added.length || x.removed.length);
    const defaultsChanged = Object.keys(da)
      .filter((p) => p in db && da[p] !== db[p])
      .map((p) => ({ prop: p, before: da[p] as string, after: db[p] as string }));
    if (propsAdded.length || propsRemoved.length || valuesChanged.length || defaultsChanged.length) {
      changed.push({ block: k, propsAdded, propsRemoved, valuesChanged, defaultsChanged });
    }
  }
  return {
    counts: { before: Object.keys(a).length, after: Object.keys(b).length, added: added.length, removed: removed.length, changed: changed.length },
    added,
    removed,
    changed,
  };
}

// ---------- run ----------
const t0 = performance.now();
const regA = readJson(vendor(fromDir, 'mcmeta/registries.json')) as Registries;
const regB = readJson(vendor(toDir, 'mcmeta/registries.json')) as Registries;
const registries = diffRegistries(regA, regB);
const t1 = performance.now();

const symFrom = readJson(vendor(fromDir, 'vanilla-mcdoc/symbols.json'));
const symTo = readJson(arg('symbols', vendor(toDir, 'vanilla-mcdoc/symbols.json')));
const parsedFrom = schemas.parseVanillaMcdocSymbols(symFrom);
const parsedTo = schemas.parseVanillaMcdocSymbols(symTo);
const dispatcherNames = (raw: unknown) => Object.keys((raw as Record<string, Record<string, unknown>>)['mcdoc/dispatcher'] ?? {});
const dispatchers = [...new Set([...dispatcherNames(symFrom), ...dispatcherNames(symTo)])].sort();
const mcdoc: Record<string, unknown> = {};
const timings: Record<string, number> = { registriesMs: t1 - t0 };
const run = (name: string, a: SchemaIndex, b: SchemaIndex) => {
  const s = performance.now();
  mcdoc[name] = mcdocDiff(a, b, dispatchers);
  timings[`mcdoc_${name}_ms`] = performance.now() - s;
};
if (mode === 'gated' || mode === 'both') {
  run('gated', schemas.createSchemaIndex(parsedTo, { mcVersion: fromVersion }), schemas.createSchemaIndex(parsedTo, { mcVersion: toVersion }));
}
if (mode === 'refs' || mode === 'both') {
  run('refs', schemas.createSchemaIndex(parsedFrom, { mcVersion: fromVersion }), schemas.createSchemaIndex(parsedTo, { mcVersion: toVersion }));
}
if (mode === 'drift' || mode === 'both') {
  run('drift', schemas.createSchemaIndex(parsedFrom, { mcVersion: fromVersion }), schemas.createSchemaIndex(parsedTo, { mcVersion: fromVersion }));
}
const t2 = performance.now();
const commands = diffCommands(
  readJson(vendor(fromDir, 'mcmeta/commands.json')) as CmdNode,
  readJson(vendor(toDir, 'mcmeta/commands.json')) as CmdNode,
);
const blocks = diffBlocks(readJson(vendor(fromDir, 'mcmeta/blocks.json')) as Blocks, readJson(vendor(toDir, 'mcmeta/blocks.json')) as Blocks);
const va = readJson(vendor(fromDir, 'mcmeta/version.json')) as Record<string, unknown>;
const vb = readJson(vendor(toDir, 'mcmeta/version.json')) as Record<string, unknown>;
const packs = Object.fromEntries(
  ['data_version', 'data_pack_version', 'data_pack_version_minor', 'resource_pack_version', 'resource_pack_version_minor', 'protocol_version', 'type', 'stable']
    .filter((k) => va[k] !== vb[k])
    .map((k) => [k, { before: va[k], after: vb[k] }]),
);
timings.commandsBlocksMs = performance.now() - t2;
timings.totalMs = performance.now() - t0;
const report = { from: fromDir, to: toDir, fromVersion, toVersion, mode, timings, registries, mcdoc, commands, blocks, packs };
const text = `${JSON.stringify(report, null, 1)}\n`;
if (out) writeFileSync(out, text);
const summary = {
  registries: registries.counts,
  moved: registries.moved,
  mcdoc: Object.fromEntries(Object.entries(mcdoc).map(([k, v]) => [k, (v as { counts: unknown }).counts])),
  commands: commands.counts,
  blocks: blocks.counts,
  packs,
  timings: Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, Math.round(v)])),
  bytes: text.length,
};
console.log(JSON.stringify(summary, null, 1));
