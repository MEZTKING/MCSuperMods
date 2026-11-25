/**
 * Rename candidates for removed registry members (B810 V7), attached to their
 * `member-removed` changes. Never applied: a person confirms one in the target's curated file.
 *
 * Inside each matched registry pair, every removed member is scored against every added one:
 * the name likeness (`names.ts`) plus, where the registry selects a dispatcher in the mcdoc
 * tree (a struct whose `type` field is an id of the registry and which spreads a dispatcher on
 * it), a shape score from the two members' field sets (same 0.5, superset 0.4, subset or
 * similar 0.3). Pairs are taken one to one, best first. A pair is proposed at a score of
 * {@link PROPOSE_AT} or more. A removed member whose best score two or three free partners
 * share is marked ambiguous (when the score reaches {@link PROPOSE_AT} or the shapes could be
 * compared), with every partner in the change's `to`.
 *
 * Field moves are found with the format diff (`mcdoc.ts`).
 *
 * @packageDocumentation
 */

import type { SchemaIndex, SchemaNode } from '../../packages/schemas/src/index.ts';
import { compareCodePoints } from '../shared/download.ts';
import { changeId, round2, sortedStrings } from './change.ts';
import type { McdocSide } from './mcdoc.ts';
import { nameScore } from './names.ts';
import type { RegistryDiff } from './registries.ts';
import { jaccard } from './registries.ts';
import type { CandidateShape, TargetChange } from './types.ts';

/** The score from which a single best partner is proposed. */
export const PROPOSE_AT = 0.4;
/** The most equal partners an ambiguous candidate may have. */
const MAX_TIES = 3;
const SHAPE_SCORE: Record<CandidateShape, number> = {
  same: 0.5,
  superset: 0.4,
  subset: 0.3,
  similar: 0.3,
  differs: 0,
  none: 0,
};

/**
 * Registry (no namespace) to the dispatcher its ids select: a struct with a field `f` typed
 * `string#id(R)` that spreads a dispatcher keyed by `f`.
 */
export function dispatcherMap(index: SchemaIndex): Map<string, string> {
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
      let t = node.fields.find((f) => f.key === key)?.type;
      if (t?.kind === 'union') t = t.members.find((m) => m.kind === 'string');
      if (t?.kind === 'string' && t.idRegistry) {
        const registry = t.idRegistry.replace(/^minecraft:/, '');
        if (!map.has(registry)) map.set(registry, sp.registry);
      }
    }
  };
  for (const p of index.typePaths()) {
    try {
      visit(index.resolve(p), 0);
    } catch {
      // A template or a broken reference: no evidence here.
    }
  }
  return map;
}

/** The field names and kinds a dispatcher member takes, all union members merged. */
function fieldSet(index: SchemaIndex, dispatcher: string | undefined, key: string) {
  if (dispatcher === undefined) return undefined;
  const node = index.dispatch(dispatcher, key);
  if (node === undefined) return undefined;
  const out = new Map<string, string>();
  const walk = (n: SchemaNode, depth: number) => {
    if (depth > 6) return;
    if (n.kind === 'reference') {
      try {
        walk(n.resolve(), depth + 1);
      } catch {
        // Unresolvable: nothing to add.
      }
      return;
    }
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

function shapeOf(
  a: Map<string, string> | undefined,
  b: Map<string, string> | undefined,
): CandidateShape {
  if (a === undefined || b === undefined) return 'none';
  if (a.size === 0 && b.size === 0) return 'same';
  const ka = new Set(a.keys());
  const kb = new Set(b.keys());
  const overlap = jaccard(ka, kb);
  if (overlap === 1 && [...a].every(([k, v]) => b.get(k) === v)) return 'same';
  if ([...ka].every((k) => kb.has(k))) return 'superset';
  if ([...kb].every((k) => ka.has(k))) return 'subset';
  if (overlap >= 0.6) return 'similar';
  return 'differs';
}

interface Scored {
  registry: string;
  from: string;
  to: string;
  name: number;
  shape: CandidateShape;
  score: number;
}

/** Attaches rename candidates to the `member-removed` changes, in place. */
export function attachRenameCandidates(
  changes: TargetChange[],
  registries: RegistryDiff,
  before: McdocSide,
  after: McdocSide,
): void {
  const mapA = dispatcherMap(before.index);
  const mapB = dispatcherMap(after.index);
  const scored: Scored[] = [];
  for (const { pair, removed, added } of registries.members.values()) {
    if (removed.length === 0 || added.length === 0) continue;
    const isTag = pair.from.startsWith('tag/');
    const dA = isTag ? undefined : mapA.get(pair.from);
    const dB = isTag ? undefined : mapB.get(pair.to);
    const fieldsB = new Map(added.map((a) => [a, fieldSet(after.index, dB, a)]));
    for (const r of removed) {
      const fa = fieldSet(before.index, dA, r);
      for (const a of added) {
        const name = round2(nameScore(r, a));
        const shape = shapeOf(fa, fieldsB.get(a));
        scored.push({
          registry: pair.from,
          from: r,
          to: a,
          name,
          shape,
          score: round2(name + SHAPE_SCORE[shape]),
        });
      }
    }
  }
  scored.sort(
    (x, y) =>
      y.score - x.score ||
      compareCodePoints(x.registry, y.registry) ||
      compareCodePoints(x.from, y.from) ||
      compareCodePoints(x.to, y.to),
  );
  const byId = new Map(changes.map((c) => [c.id, c]));
  const takenFrom = new Set<string>();
  const takenTo = new Set<string>();
  for (const c of scored) {
    const keyFrom = `${c.registry}\u0000${c.from}`;
    const keyTo = `${c.registry}\u0000${c.to}`;
    if (takenFrom.has(keyFrom) || takenTo.has(keyTo)) continue;
    takenFrom.add(keyFrom);
    const ties = scored.filter(
      (d) =>
        d.registry === c.registry &&
        d.from === c.from &&
        d.score === c.score &&
        !takenTo.has(`${d.registry}\u0000${d.to}`),
    );
    const change = byId.get(changeId('ids', `${c.registry}/${c.from}`));
    if (change === undefined) continue;
    if (ties.length > 1) {
      if (ties.length > MAX_TIES || (c.score < PROPOSE_AT && c.shape === 'none')) continue;
      const partners = sortedStrings(ties.map((d) => d.to));
      change.candidate = {
        kind: 'rename',
        to: partners[0] as string,
        name: c.name,
        shape: c.shape,
        ambiguous: true,
      };
      change.to = partners;
      continue;
    }
    takenTo.add(keyTo);
    if (c.score < PROPOSE_AT) continue;
    change.candidate = { kind: 'rename', to: c.to, name: c.name, shape: c.shape };
  }
}
