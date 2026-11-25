/**
 * Data format changes from vanilla-mcdoc (B810 V3).
 *
 * Two ways, chosen by the caller:
 *
 * - **gated**, for a step between release lines (26.3 to 26.4): the newer target's one symbol
 *   export resolved at both versions through its `since` and `until` gates;
 * - **refs**, for a re-pin within one line (a snapshot to the pre-release): each target's own
 *   export at its own version. vanilla-mcdoc gates only on releases, so the gated diff of two
 *   snapshots of one line is always empty.
 *
 * One change per thing a user writes: dispatcher members (a resource, a feature config, an
 * entity) are compared by their top-level fields, through spreads and aliases, and a field
 * whose type changed is followed down to the place that changed, so a type that was only
 * renamed (`CatSounds` to `OptionalCatSounds`) shows as the fields that became optional. A
 * named type is listed on its own only when no dispatcher member present at both versions
 * reaches it at its top level (through an alias or a spread), and no other named type spreads
 * it in, nor when only members new in the newer version reach it. Registry renames are applied to the older side's ids before comparing, so a moved
 * registry (`rule_test` to `rule_test_type`) does not echo as a retyped field.
 *
 * @packageDocumentation
 */

import type {
  RawMcdocType,
  SchemaField,
  SchemaIndex,
  SchemaNode,
  VanillaMcdocSymbols,
} from '../../packages/schemas/src/index.ts';
import { makeChange, round2, sortedStrings } from './change.ts';
import { nameScore } from './names.ts';
import type { Json, TargetChange, TargetChangeCandidate, TargetChangeWhat } from './types.ts';

/** One side of the mcdoc diff: the parsed export and an index at that side's version. */
export interface McdocSide {
  symbols: VanillaMcdocSymbols;
  index: SchemaIndex;
}

/** The longest shape description kept in a change's `from` and `to`. */
export const MAX_SHAPE_LENGTH = 300;
/** How deep a shape is compared when deciding whether a type really changed. */
const DEEP_DEPTH = 7;

const isAnonymous = (path: string): boolean => path.includes('<anonymous');
const isVanillaType = (path: string): boolean => path.startsWith('::java::');

/** RFC 6901 escaping of one pointer segment (`*` is kept: any list item or map key). */
export function pointerSegment(key: string): string {
  return key.replaceAll('~', '~0').replaceAll('/', '~1');
}

/** Maps a registry name through the renames, keeping a `minecraft:` prefix and `tag/`. */
function renameRegistry(name: string, renames: ReadonlyMap<string, string>): string {
  const prefix = name.startsWith('minecraft:') ? 'minecraft:' : '';
  const bare = name.slice(prefix.length);
  const direct = renames.get(bare);
  if (direct !== undefined) return prefix + direct;
  if (bare.startsWith('tag/')) {
    const inner = renames.get(bare.slice(4));
    if (inner !== undefined) return `${prefix}tag/${inner}`;
  }
  return name;
}

function rangeSig(range: { min?: number; max?: number } | undefined): string {
  return range === undefined ? '' : `(${range.min ?? ''}..${range.max ?? ''})`;
}

/**
 * A canonical description of a node. `deep` follows named references too (to `DEEP_DEPTH`);
 * otherwise a named reference is written by its path and only anonymous ones are inlined.
 */
function describe(
  node: SchemaNode,
  renames: ReadonlyMap<string, string>,
  deep: boolean,
  depth = 0,
  stack: readonly string[] = [],
): string {
  if (depth > (deep ? DEEP_DEPTH : 8)) return '…';
  const next = (n: SchemaNode, s: readonly string[] = stack) =>
    describe(n, renames, deep, depth + 1, s);
  switch (node.kind) {
    case 'reference': {
      if (!deep && !isAnonymous(node.path)) return `@${node.path}`;
      if (stack.includes(node.path)) return '@cycle';
      try {
        return next(node.resolve(), [...stack, node.path]);
      } catch {
        return `@missing(${node.path})`;
      }
    }
    case 'struct': {
      const fields = node.fields
        .map(
          (f) =>
            `${f.keyType ? `[${next(f.keyType)}]` : f.key}${f.optional ? '?' : ''}:${next(f.type)}`,
        )
        .sort();
      const spreads = node.spreads.map((s) => `...${next(s)}`).sort();
      return `{${[...fields, ...spreads].join(',')}}`;
    }
    case 'list':
      return `[${next(node.item)}]${rangeSig(node.lengthRange)}`;
    case 'tuple':
      return `(${node.items.map((i) => next(i)).join(',')})`;
    case 'string':
      return `string${node.idRegistry ? `#id(${renameRegistry(node.idRegistry, renames)})` : ''}${rangeSig(node.lengthRange)}`;
    case 'number':
      return `${node.numberKind}${rangeSig(node.range)}`;
    case 'enum':
      return `enum(${node.values
        .map((v) => String(v.value))
        .sort()
        .join('|')})`;
    case 'literal':
      return `lit(${String(node.value)})`;
    case 'union':
      // A one-member union is that member (two exports differ only in this, B810 V3).
      if (node.members.length === 1)
        return describe(node.members[0] as SchemaNode, renames, deep, depth, stack);
      return `union(${node.members
        .map((m) => next(m))
        .sort()
        .join('|')})`;
    case 'dispatcher':
      return `dispatch(${node.registry}[${node.discriminator.join(',')}])`;
    case 'unsupported':
      return `unsupported(${node.rawKind})`;
    default:
      return node.kind;
  }
}

/** A node with references followed, or `undefined` when one cannot be resolved. */
function unref(node: SchemaNode | undefined): SchemaNode | undefined {
  let current = node;
  for (let i = 0; i < 32 && current?.kind === 'reference'; i++) {
    try {
      current = current.resolve();
    } catch {
      return undefined;
    }
  }
  return current;
}

/**
 * The top-level fields of a struct-like node: references and one-member unions unwrapped,
 * spreads merged. Dispatcher spreads are left out (their members are compared as dispatcher
 * members). `undefined` when the node is not struct-like.
 */
export function topFields(
  node: SchemaNode | undefined,
  depth = 0,
): Map<string, SchemaField> | undefined {
  const n = unref(node);
  if (n === undefined || depth > 8) return undefined;
  if (n.kind === 'union' && n.members.length === 1) return topFields(n.members[0], depth + 1);
  if (n.kind !== 'struct') return undefined;
  const out = new Map<string, SchemaField>();
  for (const f of n.fields) out.set(f.key, f);
  for (const s of n.spreads) {
    const inner = topFields(s, depth + 1);
    if (inner) for (const [k, v] of inner) if (!out.has(k)) out.set(k, v);
  }
  return out;
}

/** A difference inside one subject, before it becomes a change. */
interface Entry {
  pointer: string;
  what: TargetChangeWhat;
  from?: Json;
  to?: Json;
  candidate?: TargetChangeCandidate;
}

const cap = (text: string): string =>
  text.length <= MAX_SHAPE_LENGTH ? text : `${text.slice(0, MAX_SHAPE_LENGTH - 1)}…`;

class FormatDiffer {
  private readonly renames: ReadonlyMap<string, string>;

  constructor(renames: ReadonlyMap<string, string>) {
    this.renames = renames;
  }

  private shallow(node: SchemaNode, side: 'before' | 'after'): string {
    return describe(node, side === 'before' ? this.renames : new Map(), false);
  }

  private deep(node: SchemaNode, side: 'before' | 'after'): string {
    return describe(node, side === 'before' ? this.renames : new Map(), true);
  }

  private fieldSig(f: SchemaField, side: 'before' | 'after', deep: boolean): string {
    const s = (n: SchemaNode) => (deep ? this.deep(n, side) : this.shallow(n, side));
    return `${f.keyType ? `[${s(f.keyType)}]` : ''}${s(f.type)}`;
  }

  /** The differences between two nodes at `pointer`. */
  node(a: SchemaNode | undefined, b: SchemaNode | undefined, pointer: string): Entry[] {
    const fa = topFields(a);
    const fb = topFields(b);
    if (fa && fb) return this.fields(fa, fb, pointer);
    const ra = unref(a);
    const rb = unref(b);
    if (ra === undefined || rb === undefined) return [];
    if (this.deep(ra, 'before') === this.deep(rb, 'after')) return [];
    const leaf: Entry = {
      pointer,
      what: 'field-retyped',
      from: cap(this.shallow(ra, 'before')),
      to: cap(this.shallow(rb, 'after')),
    };
    if (ra.kind === 'list' && rb.kind === 'list') {
      const out: Entry[] = [];
      if (rangeSig(ra.lengthRange) !== rangeSig(rb.lengthRange)) out.push(leaf);
      if (this.deep(ra.item, 'before') !== this.deep(rb.item, 'after')) {
        const inner = this.node(ra.item, rb.item, `${pointer}/*`);
        if (out.length === 0 || inner.some((e) => e.pointer !== `${pointer}/*`)) out.push(...inner);
      }
      return out;
    }
    if (ra.kind === 'union' && rb.kind === 'union') {
      // `id | inline object`: when each side has one struct-like member and the others are
      // alike, the change is inside the object.
      const split = (u: SchemaNode & { kind: 'union' }, side: 'before' | 'after') => {
        const structs = u.members.filter((m) => topFields(m) !== undefined);
        const rest = u.members
          .filter((m) => topFields(m) === undefined)
          .map((m) => this.deep(m, side))
          .sort()
          .join('|');
        return { structs, rest };
      };
      const sa = split(ra, 'before');
      const sb = split(rb, 'after');
      if (sa.structs.length === 1 && sb.structs.length === 1 && sa.rest === sb.rest) {
        return this.node(sa.structs[0], sb.structs[0], pointer);
      }
    }
    return [leaf];
  }

  /** The differences between two field maps at `pointer`. */
  fields(
    fa: ReadonlyMap<string, SchemaField>,
    fb: ReadonlyMap<string, SchemaField>,
    pointer: string,
  ): Entry[] {
    const out: Entry[] = [];
    const at = (key: string) => `${pointer}/${pointerSegment(key)}`;
    const removed = sortedStrings([...fa.keys()].filter((k) => !fb.has(k)));
    const added = sortedStrings([...fb.keys()].filter((k) => !fa.has(k)));
    for (const key of added) {
      const f = fb.get(key) as SchemaField;
      out.push({
        pointer: at(key),
        what: f.optional ? 'field-addedOptional' : 'field-addedRequired',
      });
    }
    const moves = this.fieldMoves(fa, fb, removed, added, pointer);
    for (const key of removed) {
      const move = moves.get(key);
      out.push({
        pointer: at(key),
        what: 'field-removed',
        ...(move === undefined ? {} : { candidate: move.candidate }),
        ...(move?.all === undefined ? {} : { to: move.all }),
      });
    }
    for (const key of sortedStrings([...fa.keys()].filter((k) => fb.has(k)))) {
      const x = fa.get(key) as SchemaField;
      const y = fb.get(key) as SchemaField;
      const optionality: TargetChangeWhat | undefined =
        x.optional === y.optional
          ? undefined
          : y.optional
            ? 'field-madeOptional'
            : 'field-madeRequired';
      const retyped =
        this.fieldSig(x, 'before', false) !== this.fieldSig(y, 'after', false) &&
        this.fieldSig(x, 'before', true) !== this.fieldSig(y, 'after', true);
      if (!retyped) {
        if (optionality) out.push({ pointer: at(key), what: optionality });
        continue;
      }
      const inner =
        x.keyType !== undefined || y.keyType !== undefined
          ? this.mapKeyed(x, y, at(key))
          : this.node(x.type, y.type, at(key));
      if (optionality) {
        const here = inner.find((e) => e.pointer === at(key) && e.what === 'field-retyped');
        if (here) {
          here.from = `${x.optional ? '?' : ''}${String(here.from)}`;
          here.to = `${y.optional ? '?' : ''}${String(here.to)}`;
        } else inner.push({ pointer: at(key), what: optionality });
      }
      out.push(...inner);
    }
    return out;
  }

  /** A map-like field (`[key]: value`): its key type as one leaf, its values below `*`. */
  private mapKeyed(x: SchemaField, y: SchemaField, pointer: string): Entry[] {
    const keyA = x.keyType ? this.deep(x.keyType, 'before') : '';
    const keyB = y.keyType ? this.deep(y.keyType, 'after') : '';
    if (keyA !== keyB) {
      return [
        {
          pointer,
          what: 'field-retyped',
          from: cap(this.fieldSig(x, 'before', false)),
          to: cap(this.fieldSig(y, 'after', false)),
        },
      ];
    }
    return this.node(x.type, y.type, pointer);
  }

  /**
   * Field-move candidates: each removed field paired with an added one of the same type or a
   * like name, one to one, best first; two or three equal best partners make it ambiguous.
   */
  private fieldMoves(
    fa: ReadonlyMap<string, SchemaField>,
    fb: ReadonlyMap<string, SchemaField>,
    removed: readonly string[],
    added: readonly string[],
    pointer: string,
  ): Map<string, { candidate: TargetChangeCandidate; all?: string[] }> {
    const out = new Map<string, { candidate: TargetChangeCandidate; all?: string[] }>();
    if (removed.length === 0 || added.length === 0) return out;
    const scored: { from: string; to: string; name: number; same: boolean; score: number }[] = [];
    for (const g of removed) {
      const sigA = this.fieldSig(fa.get(g) as SchemaField, 'before', true);
      for (const f of added) {
        const same = sigA === this.fieldSig(fb.get(f) as SchemaField, 'after', true);
        const name = round2(nameScore(g, f));
        if (!same && name < 0.3) continue;
        scored.push({ from: g, to: f, name, same, score: name + (same ? 0.5 : 0) });
      }
    }
    scored.sort((x, y) => y.score - x.score || (x.from < y.from ? -1 : x.from > y.from ? 1 : 0));
    const takenTo = new Set<string>();
    for (const c of scored) {
      if (out.has(c.from) || takenTo.has(c.to)) continue;
      const ties = scored.filter(
        (d) => d.from === c.from && d.score === c.score && !takenTo.has(d.to),
      );
      const partners = sortedStrings(ties.map((d) => d.to));
      const candidate: TargetChangeCandidate = {
        kind: 'field-move',
        to: `${pointer}/${pointerSegment(partners[0] as string)}`,
        name: c.name,
        shape: c.same ? 'same' : 'differs',
      };
      if (partners.length > 1) {
        if (partners.length > 3) continue;
        out.set(c.from, {
          candidate: { ...candidate, ambiguous: true },
          all: partners.map((p) => `${pointer}/${pointerSegment(p)}`),
        });
        continue;
      }
      takenTo.add(c.to);
      out.set(c.from, { candidate });
    }
    return out;
  }
}

/** The generated handling of a format change: what may break a project is manual. */
function handlingOf(what: TargetChangeWhat): 'manual' | 'none' {
  return what === 'field-addedOptional' || what === 'field-madeOptional' || what === 'type-added'
    ? 'none'
    : 'manual';
}

function toChanges(
  subject: string,
  registry: string | undefined,
  entries: Entry[],
): TargetChange[] {
  return entries.map((e) => {
    const whole = e.pointer === '';
    const what: TargetChangeWhat = whole && e.what === 'field-retyped' ? 'type-changed' : e.what;
    return makeChange({
      area: 'formats',
      what,
      ...(registry === undefined ? {} : { registry }),
      subject,
      ...(whole ? {} : { field: e.pointer }),
      ...(e.from === undefined ? {} : { from: e.from }),
      ...(e.to === undefined ? {} : { to: e.to }),
      handling: handlingOf(what),
      source: 'mcdoc',
      ...(e.candidate === undefined ? {} : { candidate: e.candidate }),
    });
  });
}

/**
 * Named types a raw type reaches at its top level: through references (aliases), generic
 * instantiations, templates, one-member unions and spreads. Gates are ignored.
 */
function collectTopLevel(
  raw: RawMcdocType | undefined,
  symbols: VanillaMcdocSymbols,
  out: Set<string>,
  depth = 0,
): void {
  if (raw === undefined || depth > 32) return;
  switch (raw.kind) {
    case 'reference':
      if (raw.path !== undefined && !out.has(raw.path)) {
        out.add(raw.path);
        collectTopLevel(symbols.mcdoc[raw.path], symbols, out, depth + 1);
      }
      return;
    case 'concrete':
    case 'template':
      collectTopLevel(raw.child, symbols, out, depth + 1);
      return;
    case 'union':
      if (raw.members.length === 1) collectTopLevel(raw.members[0], symbols, out, depth + 1);
      return;
    case 'struct':
      for (const f of raw.fields) {
        if (f.kind === 'spread') collectTopLevel(f.type, symbols, out, depth + 1);
      }
      return;
    default:
      return;
  }
}

function resolves(index: SchemaIndex, path: string): SchemaNode | undefined {
  try {
    return index.resolve(path);
  } catch {
    return undefined;
  }
}

/** The vanilla dispatcher names of both exports, sorted. */
function dispatcherNames(before: McdocSide, after: McdocSide): string[] {
  return sortedStrings(
    new Set([
      ...Object.keys(before.symbols.dispatchers),
      ...Object.keys(after.symbols.dispatchers),
    ]),
  );
}

/**
 * Diffs the data formats of two sides. `registryRenames` maps an older registry name to its
 * newer one (the moved registries).
 */
export function diffMcdoc(
  before: McdocSide,
  after: McdocSide,
  registryRenames: ReadonlyMap<string, string>,
): TargetChange[] {
  const differ = new FormatDiffer(registryRenames);
  const changes: TargetChange[] = [];
  const covered = new Set<string>();
  // Named types the members only one version has reach: a type reached only by new members
  // (a new entity's own type) is news through `type-added`, not a format change.
  const reachedByNew = new Set<string>();
  const reachedByGone = new Set<string>();
  for (const d of dispatcherNames(before, after)) {
    const keysA = new Set(before.index.dispatcherKeys(d));
    const keysB = new Set(after.index.dispatcherKeys(d));
    for (const k of sortedStrings(keysB)) {
      if (keysA.has(k)) continue;
      collectTopLevel(after.symbols.dispatchers[d]?.[k], after.symbols, reachedByNew);
      changes.push(
        makeChange({
          area: 'formats',
          what: 'type-added',
          registry: d,
          subject: `${d}/${k}`,
          handling: 'none',
          source: 'mcdoc',
        }),
      );
    }
    for (const k of sortedStrings(keysA)) {
      if (!keysB.has(k)) {
        collectTopLevel(before.symbols.dispatchers[d]?.[k], before.symbols, reachedByGone);
        changes.push(
          makeChange({
            area: 'formats',
            what: 'type-removed',
            registry: d,
            subject: `${d}/${k}`,
            handling: 'manual',
            source: 'mcdoc',
          }),
        );
        continue;
      }
      collectTopLevel(before.symbols.dispatchers[d]?.[k], before.symbols, covered);
      collectTopLevel(after.symbols.dispatchers[d]?.[k], after.symbols, covered);
      const entries = differ.node(before.index.dispatch(d, k), after.index.dispatch(d, k), '');
      changes.push(...toChanges(`${d}/${k}`, d, entries));
    }
  }
  const named = sortedStrings(before.index.typePaths()).filter(
    (p) => isVanillaType(p) && !isAnonymous(p) && after.index.has(p),
  );
  // A named type spread into (or aliased by) another named type present at both versions is
  // reported by that one.
  for (const p of named) {
    if (resolves(before.index, p) === undefined || resolves(after.index, p) === undefined) continue;
    const reached = new Set<string>();
    collectTopLevel(before.symbols.mcdoc[p], before.symbols, reached);
    collectTopLevel(after.symbols.mcdoc[p], after.symbols, reached);
    reached.delete(p);
    for (const r of reached) covered.add(r);
  }
  for (const p of named) {
    if (covered.has(p) || (reachedByNew.has(p) && !reachedByGone.has(p))) continue;
    const a = resolves(before.index, p);
    const b = resolves(after.index, p);
    if (a === undefined || b === undefined) continue;
    changes.push(...toChanges(p, undefined, differ.node(a, b, '')));
  }
  return changes;
}
