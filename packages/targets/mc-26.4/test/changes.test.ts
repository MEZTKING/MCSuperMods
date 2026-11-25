/**
 * This target's change set (ADR 0136 D2): `generated.json` is what `tools/diff-targets` writes
 * from both targets' vendored data today (`--check`), `curated.ts` answers real changes with
 * steps of the right type, every confirmed rename's shape is proved against the vendored
 * vanilla-mcdoc, and the target carries the merged set.
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { TargetChangeSet } from '@msm/plugin-api';
import { createSchemaIndex, parseVanillaMcdocSymbols, type SchemaNode } from '@msm/schemas';
import {
  type CuratedChangeSet,
  type CuratedRename,
  compareShapes,
  curatedErrors,
  mergeChangeSet,
} from '@msm/target-migrate';
import { beforeAll, describe, expect, it } from 'vitest';
import { changeSet, curated, generatedChangeSet, vanillaFiles } from '../src/changes/index';
import { target, vendored } from '../src/index';
import { KNOWN_RENAMES } from '../src/removed-ids';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
/** The previous release's version, as the shared vanilla-mcdoc tree gates it. */
const PREVIOUS_VERSION = '26.3';

type Index = ReturnType<typeof createSchemaIndex>;
let previous: Index;
let current: Index;

beforeAll(async () => {
  const raw = JSON.parse(await readFile(vendored.vanillaMcdocSymbols, 'utf8')) as unknown;
  const symbols = parseVanillaMcdocSymbols(raw);
  previous = createSchemaIndex(symbols, { mcVersion: PREVIOUS_VERSION });
  current = createSchemaIndex(symbols, { mcVersion: target.mcVersion });
});

/** A struct's fields as `key` or `key?`. */
function fields(node: SchemaNode | undefined): string[] | undefined {
  return node?.kind === 'struct'
    ? node.fields.map((field) => `${field.key}${field.optional ? '?' : ''}`)
    : undefined;
}

/**
 * What is wrong with each rename's claimed shape: a rename with a shape must have both members in
 * its dispatcher (the old one gated out of this target and the new one absent before it) and
 * their field sets must compare as claimed; a rename with shape `none` must have no shape there.
 */
function renameShapeErrors(set: CuratedChangeSet): string[] {
  const errors: string[] = [];
  for (const entry of set.changes) {
    const rename: CuratedRename | undefined = entry.rename;
    if (rename === undefined) continue;
    const from = generatedChangeSet.changes.find((c) => c.id === entry.id)?.from;
    if (typeof from !== 'string') {
      errors.push(`${entry.id}: no removed member`);
      continue;
    }
    if (rename.shape === 'none') {
      if (rename.dispatcher !== undefined)
        errors.push(`${entry.id}: shape none names a dispatcher`);
      continue;
    }
    const dispatcher = rename.dispatcher as string;
    const before = fields(previous.dispatch(dispatcher, from));
    const after = fields(current.dispatch(dispatcher, rename.to));
    if (before === undefined || after === undefined) {
      errors.push(
        `${entry.id}: ${dispatcher} has no struct for ${from} before or ${rename.to} after`,
      );
      continue;
    }
    if (current.dispatch(dispatcher, from) !== undefined) {
      errors.push(`${entry.id}: ${from} is still in ${dispatcher}`);
    }
    if (previous.dispatch(dispatcher, rename.to) !== undefined) {
      errors.push(`${entry.id}: ${rename.to} was already in ${dispatcher}`);
    }
    const shape = compareShapes(before, after);
    if (shape !== rename.shape) {
      errors.push(`${entry.id}: claims ${rename.shape}, the schemas say ${shape}`);
    }
  }
  return errors;
}

describe('the generated change set', () => {
  it('is what tools/diff-targets writes from the vendored data today (--check)', () => {
    const args = [
      'tools/diff-targets/index.ts',
      '--from',
      'packages/targets/mc-26.3',
      '--to',
      'packages/targets/mc-26.4',
      '--out',
      'packages/targets/mc-26.4/src/changes/generated.json',
      '--check',
    ];
    // Throws (exit 1) when generated.json, its additions list or its vanilla files list
    // differs from a fresh run.
    const out = execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
    expect(out).toContain('Up to date.');
  }, 60_000);

  it('runs from the previous target to this one, with both pins', () => {
    expect(generatedChangeSet.from).toBe(target.previous);
    expect(generatedChangeSet.to).toBe(target.id);
    expect(generatedChangeSet.refs.to).toEqual({
      mcdoc: target.mcdocRef,
      mcmeta: target.mcmetaRef,
    });
    expect(generatedChangeSet.changes.length).toBeGreaterThan(0);
    for (const change of generatedChangeSet.changes) {
      expect(change.source, change.id).not.toBe('curated');
      expect(change.sentence, change.id).toBeUndefined();
    }
  });
});

describe('the curated change set', () => {
  it('answers real changes, with steps of the right type', () => {
    expect(curatedErrors(generatedChangeSet, curated)).toEqual([]);
  });

  it('claims for each rename the shape the vendored vanilla-mcdoc gives', () => {
    expect(renameShapeErrors(curated)).toEqual([]);
  });

  it('fails a rename whose claimed shape is wrong, and a step that answers the wrong change', () => {
    const wrong: CuratedChangeSet = {
      ...curated,
      changes: curated.changes.map((entry) =>
        entry.id === 'ids:worldgen/feature_type/large_dripstone' && entry.rename !== undefined
          ? { ...entry, rename: { ...entry.rename, shape: 'same' } }
          : entry,
      ),
    };
    expect(renameShapeErrors(wrong)).toEqual([
      'ids:worldgen/feature_type/large_dripstone: claims same, the schemas say superset',
    ]);
    const misplaced: CuratedChangeSet = {
      ...curated,
      changes: [
        {
          id: 'formats:::java::data::worldgen::feature::LargeSpeleothemConfig#/base_block',
          handling: 'auto',
          steps: [{ op: 'drop', places: [], field: 'base_block' }],
        },
      ],
    };
    expect(curatedErrors(generatedChangeSet, misplaced)).toEqual([
      'formats:::java::data::worldgen::feature::LargeSpeleothemConfig#/base_block: a drop step cannot answer a field-addedRequired change.',
    ]);
  });

  it('drops default_block by itself and reports the speleothem rename with its hint', () => {
    const find = (id: string) => changeSet.changes.find((c) => c.id === id);
    expect(find('formats:minecraft:resource/worldgen/noise_settings#/default_block')).toMatchObject(
      {
        handling: 'auto',
        what: 'field-removed',
      },
    );
    expect(
      find(
        'formats:::java::data::worldgen::noise_settings::NoiseGeneratorSettingsRef#/default_block',
      ),
    ).toMatchObject({ handling: 'auto' });
    expect(find('ids:worldgen/feature_type/large_dripstone')).toMatchObject({
      what: 'member-renamed',
      to: 'large_speleothem',
      handling: 'manual',
      candidate: { kind: 'rename', to: 'large_speleothem', shape: 'superset' },
    });
    expect(find('ids:worldgen/feature_type/large_dripstone')?.hint).toContain('base_block');
    // No rename is applied: each is reported with its hint.
    expect(KNOWN_RENAMES.length).toBeGreaterThan(0);
    expect(KNOWN_RENAMES.every((rename) => !rename.sameShape && rename.hint !== undefined)).toBe(
      true,
    );
  });

  it('gives every change that a step does a sentence, and no generated entry a sentence twice', () => {
    for (const change of changeSet.changes) {
      if (change.handling === 'auto' && change.area !== 'packs') {
        expect(change.sentence, change.id).toBeTruthy();
      }
    }
  });
});

describe('the target', () => {
  it('carries the merged change set as its changes fact', () => {
    expect(target.changes).toBe(changeSet);
    expect(changeSet).toEqual({
      ...mergeChangeSet(generatedChangeSet, curated),
      vanillaFiles,
    });
    const ids = changeSet.changes.map((c) => c.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
    // Plain data: a host can clone it and send it to a worker.
    expect(structuredClone(changeSet as TargetChangeSet)).toEqual(changeSet);
  });
});

/** The vanilla files list (ADR 0136 D11, B823), as `tools/diff-targets` writes it. */
const VANILLA_FILES_LIST = new URL('../src/changes/generated.vanilla-files.json', import.meta.url);
/** A path of a pack file in the vanilla files list: lowercase folders and names under `data/` or `assets/`. */
const PACK_PATH = /^(assets|data)\/[a-z0-9_.-]+(\/[a-z0-9_.-]+)+$/;

describe('the vanilla files list', () => {
  // Written by the same run as generated.json, so the --check above rebuilds it too; it holds
  // nothing of Mojang's but paths and the kind of change.
  it('is the change set fact, from the previous target to this one', () => {
    expect(changeSet.vanillaFiles).toBe(vanillaFiles);
    expect(vanillaFiles.from).toBe(target.previous);
    expect(vanillaFiles.to).toBe(target.id);
    expect(vanillaFiles.refs.to).toBe(target.mcVersion);
    expect(vanillaFiles.leftOut).toEqual(['data/<namespace>/structure/<path>.nbt']);
  });

  it('holds only paths and the kind of change: no contents, hashes or other text', async () => {
    const raw = JSON.parse(await readFile(VANILLA_FILES_LIST, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(raw).sort()).toEqual(
      ['added', 'changed', 'from', 'leftOut', 'moved', 'refs', 'removed', 'to'].sort(),
    );
    const paths = [
      ...vanillaFiles.added,
      ...vanillaFiles.removed,
      ...vanillaFiles.changed,
      ...Object.keys(vanillaFiles.moved),
      ...Object.values(vanillaFiles.moved),
    ];
    for (const path of paths) expect(path, path).toMatch(PACK_PATH);
    // Every string in the file is a path, a target id, a version or the left-out pattern.
    const strings: string[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === 'string') strings.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
          strings.push(key);
          walk(item);
        }
      }
    };
    walk(raw);
    const known = new Set([
      'added',
      'changed',
      'from',
      'leftOut',
      'moved',
      'refs',
      'removed',
      'to',
      vanillaFiles.from,
      vanillaFiles.to,
      vanillaFiles.refs.from,
      vanillaFiles.refs.to,
      ...vanillaFiles.leftOut,
    ]);
    for (const value of strings) {
      if (!known.has(value)) expect(value, value).toMatch(PACK_PATH);
    }
    // No blob hash survives into the fact.
    expect(JSON.stringify(raw)).not.toMatch(/[0-9a-f]{12}/);
  });

  it('is sorted, without repeats, and leaves structure templates out', () => {
    for (const list of [vanillaFiles.added, vanillaFiles.removed, vanillaFiles.changed]) {
      expect(list).toEqual([...list].sort());
      expect(new Set(list).size).toBe(list.length);
    }
    const all = [...vanillaFiles.added, ...vanillaFiles.removed, ...vanillaFiles.changed];
    expect(all.filter((path) => /^data\/[^/]+\/structure\/.+\.nbt$/.test(path))).toEqual([]);
    // A moved file is in neither added nor removed.
    for (const [from, to] of Object.entries(vanillaFiles.moved)) {
      expect(vanillaFiles.removed).not.toContain(from);
      expect(vanillaFiles.added).not.toContain(to);
    }
  });

  it('finds what B810 V8 found on this step', () => {
    // 1,182 entries in the spike's list, which also held the root pack.mcmeta and version.json
    // of both tags and counted each exact rename twice.
    expect(vanillaFiles.added.length).toBe(823);
    expect(vanillaFiles.removed.length).toBe(26);
    expect(Object.keys(vanillaFiles.moved).length).toBe(5);
    expect(vanillaFiles.changed.length).toBe(319);
    expect(vanillaFiles.changed).toContain('data/minecraft/loot_table/chests/igloo_chest.json');
    expect(
      vanillaFiles.moved['data/minecraft/tags/entity_type/ignores_poison_and_regen.json'],
    ).toBe('data/minecraft/tags/entity_type/immune_to_regeneration.json');
    expect(vanillaFiles.removed).toContain(
      'data/minecraft/tags/entity_type/freeze_immune_entity_types.json',
    );
  });
});
