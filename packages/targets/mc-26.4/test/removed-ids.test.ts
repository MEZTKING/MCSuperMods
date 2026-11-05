/**
 * Ties the removed-id tables to the vendored data (ADR 0037 D3): the diff of the 26.3 and
 * this target's `registries.json` must equal `REMOVED_IDS`, `MOVED_REGISTRIES` and
 * `STILL_REGISTERED_ELSEWHERE`, and every known rename's `sameShape` must match the vendored
 * vanilla-mcdoc. Rerun on every re-pin of either target.
 */
import { readFile } from 'node:fs/promises';
import { createSchemaIndex, parseVanillaMcdocSymbols, type SchemaNode } from '@msm/schemas';
import { describe, expect, it } from 'vitest';
import { target, vendored } from '../src/index';
import {
  KNOWN_RENAMES,
  MOVED_REGISTRIES,
  REMOVED_IDS,
  STILL_REGISTERED_ELSEWHERE,
} from '../src/removed-ids';

/** The previous release target's vendored registries (the migration's source). */
const PREVIOUS_REGISTRIES = new URL('../../mc-26.3/vendor/mcmeta/registries.json', import.meta.url);
/** The previous release's version, as the shared vanilla-mcdoc tree gates it. */
const PREVIOUS_VERSION = '26.3';
/** The vanilla-mcdoc dispatcher that maps a feature type to its config struct. */
const FEATURE_CONFIG_DISPATCHER = 'minecraft:feature_config';

type Registries = Record<string, string[]>;

async function readJson(url: URL): Promise<Registries> {
  return JSON.parse(await readFile(url, 'utf8')) as Registries;
}

const sortedKeys = (record: object): string[] => Object.keys(record).sort();

/** The registry diff: registry → members of `before` missing from `after`, sorted. */
function removedMembers(before: Registries, after: Registries): Registries {
  const out: Registries = {};
  for (const [name, ids] of Object.entries(before)) {
    const kept = new Set(after[name] ?? []);
    const removed = ids.filter((id) => !kept.has(id)).sort();
    if (removed.length > 0) out[name] = removed;
  }
  return out;
}

/** A struct's fields as `key` or `key?`, sorted, for a shape comparison. */
function shape(node: SchemaNode | undefined): string[] {
  if (node?.kind !== 'struct') throw new Error(`expected a struct, got ${node?.kind}`);
  return node.fields.map((field) => `${field.key}${field.optional ? '?' : ''}`).sort();
}

describe('removed-id tables', () => {
  it('equal the diff of the two vendored registries files', async () => {
    const before = await readJson(PREVIOUS_REGISTRIES);
    const after = await readJson(vendored.mcmetaRegistries);
    const diff = removedMembers(before, after);
    expect(sortedKeys(REMOVED_IDS)).toEqual(sortedKeys(diff));
    for (const [name, ids] of Object.entries(diff)) {
      expect(REMOVED_IDS[name], name).toEqual(ids);
    }
  });

  it('name every registry that is gone, and its members live on where they moved', async () => {
    const before = await readJson(PREVIOUS_REGISTRIES);
    const after = await readJson(vendored.mcmetaRegistries);
    const gone = Object.keys(before)
      .filter((name) => !(name in after))
      .sort();
    expect(sortedKeys(MOVED_REGISTRIES)).toEqual(gone);
    for (const [from, to] of Object.entries(MOVED_REGISTRIES)) {
      expect(before[to], `${to} is new`).toBeUndefined();
      expect([...(after[to] ?? [])].sort(), `${from} → ${to}`).toEqual(
        [...(before[from] ?? [])].sort(),
      );
    }
  });

  it('list exactly the removed ids that another registry still has', async () => {
    const before = await readJson(PREVIOUS_REGISTRIES);
    const after = await readJson(vendored.mcmetaRegistries);
    const expected: Record<string, Record<string, string[]>> = {};
    for (const [name, ids] of Object.entries(removedMembers(before, after))) {
      if (name in MOVED_REGISTRIES) continue;
      for (const id of ids) {
        const elsewhere = Object.keys(after)
          .filter((other) => after[other]?.includes(id))
          .sort();
        if (elsewhere.length === 0) continue;
        expected[name] = { ...expected[name], [id]: elsewhere };
      }
    }
    expect(STILL_REGISTERED_ELSEWHERE).toEqual(expected);
  });

  it('record whether each known rename keeps the config shape (vendored vanilla-mcdoc)', async () => {
    const after = await readJson(vendored.mcmetaRegistries);
    const raw = JSON.parse(await readFile(vendored.vanillaMcdocSymbols, 'utf8')) as unknown;
    const symbols = parseVanillaMcdocSymbols(raw);
    const previous = createSchemaIndex(symbols, { mcVersion: PREVIOUS_VERSION });
    const current = createSchemaIndex(symbols, { mcVersion: target.mcVersion });
    for (const rename of KNOWN_RENAMES) {
      const label = `${rename.registry} ${rename.from} → ${rename.to}`;
      expect(REMOVED_IDS[rename.registry], label).toContain(rename.from);
      expect(after[rename.registry], label).toContain(rename.to);
      expect(rename.registry, label).toBe('worldgen/feature_type');
      const before = previous.dispatch(FEATURE_CONFIG_DISPATCHER, rename.from);
      const now = current.dispatch(FEATURE_CONFIG_DISPATCHER, rename.to);
      // The old key is gated out of this target and the new one is absent before it.
      expect(current.dispatch(FEATURE_CONFIG_DISPATCHER, rename.from), label).toBeUndefined();
      expect(previous.dispatch(FEATURE_CONFIG_DISPATCHER, rename.to), label).toBeUndefined();
      const same = JSON.stringify(shape(before)) === JSON.stringify(shape(now));
      expect(rename.sameShape, label).toBe(same);
      if (!same) expect(rename.hint, label).toBeTruthy();
    }
  });

  it('large_speleothem requires base_block, which large_dripstone did not have', async () => {
    const raw = JSON.parse(await readFile(vendored.vanillaMcdocSymbols, 'utf8')) as unknown;
    const symbols = parseVanillaMcdocSymbols(raw);
    const previous = createSchemaIndex(symbols, { mcVersion: PREVIOUS_VERSION });
    const current = createSchemaIndex(symbols, { mcVersion: target.mcVersion });
    const before = shape(previous.dispatch(FEATURE_CONFIG_DISPATCHER, 'large_dripstone'));
    const now = shape(current.dispatch(FEATURE_CONFIG_DISPATCHER, 'large_speleothem'));
    expect(now.filter((key) => !before.includes(key))).toEqual(['base_block']);
    expect(before.filter((key) => !now.includes(key))).toEqual([]);
  });
});
