/**
 * Coverage of each target's processor types (ADR 0122 D6; B638 exit criteria): every processor
 * type, rule test, position rule test and block entity modifier a target's vendored registries or
 * vendored mcdoc list for that version is applied or named as only in the game with plain words;
 * every pool element field of the version is read by the assembler or named. A new type in a target
 * fails this test until it is one or the other. The files are read by path, as `@msm/terrain` may
 * not depend on the targets.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProcessInput } from '../../src/structures/api';
import {
  BLOCK_ENTITY_MODIFIERS,
  BLOCK_ENTITY_MODIFIERS_ONLY_IN_THE_GAME,
  ELEMENT_FIELDS_ONLY_IN_THE_GAME,
  POSITION_RULE_TESTS,
  PROCESSOR_TYPES,
  processTemplate,
  RULE_TESTS,
} from '../../src/structures/processors';
import { fillWorld, REPO_ROOT, sampleTemplate, TAGS } from './processor-fixtures';

type Json = Record<string, unknown>;

const TARGETS = join(REPO_ROOT, 'packages/targets');
const targetFolders = readdirSync(TARGETS).filter((name) => name.startsWith('mc-'));

const readJson = (...parts: string[]): unknown =>
  JSON.parse(readFileSync(join(TARGETS, ...parts), 'utf8'));

/** The leading numbers of a version id (a snapshot counts as its release, as the mcdoc does). */
function versionNumbers(id: string): number[] {
  return (id.match(/^[\d.]+/)?.[0] ?? '').split('.').filter(Boolean).map(Number);
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function attribute(node: unknown, name: string): string | undefined {
  const attrs = (node as Json | undefined)?.attributes;
  if (!Array.isArray(attrs)) return undefined;
  for (const a of attrs as Json[]) {
    if (a.name !== name) continue;
    const value = (a.value as Json | undefined)?.value as Json | undefined;
    if (typeof value?.value === 'string') return value.value;
  }
  return undefined;
}

/** Whether a mcdoc node with `since` and `until` attributes exists on this version. */
function onVersion(node: unknown, version: number[]): boolean {
  const since = attribute(node, 'since');
  const until = attribute(node, 'until');
  if (since && compare(version, versionNumbers(since)) < 0) return false;
  if (until && compare(version, versionNumbers(until)) >= 0) return false;
  return true;
}

const ns = (id: string) => (id.includes(':') ? id : `minecraft:${id}`);

describe.each(targetFolders)('the processor types of %s', (folder) => {
  const registries = readJson(folder, 'vendor/mcmeta/registries.json') as Record<string, string[]>;
  const symbols = readJson(folder, 'vendor/vanilla-mcdoc/symbols.json') as Json;
  const version = versionNumbers(
    (readJson(folder, 'vendor/mcmeta/version.json') as { id: string }).id,
  );
  const dispatcher = symbols['mcdoc/dispatcher'] as Record<string, Record<string, unknown>>;
  const mcdoc = symbols.mcdoc as Record<string, Json>;

  /** The types a registry and the mcdoc dispatcher list for this version, namespaced. */
  const typesOf = (registryKeys: readonly string[], dispatcherKey: string): string[] => {
    const out = new Set<string>();
    for (const key of registryKeys) for (const t of registries[key] ?? []) out.add(ns(t));
    for (const [t, node] of Object.entries(dispatcher[dispatcherKey] ?? {})) {
      if (!t.startsWith('%') && onVersion(node, version)) out.add(ns(t));
    }
    return [...out].sort();
  };

  /** The registry of rule tests has one of two names (a target fact); exactly one is present. */
  const ruleTestRegistry = ['rule_test', 'rule_test_type'].filter((k) => k in registries);

  it('names its rule test registry once, and the mcdoc agrees for this version', () => {
    expect(ruleTestRegistry).toHaveLength(1);
    const field = (
      (mcdoc['::java::data::worldgen::processor_list::RuleTest']?.fields ?? []) as Json[]
    )[0];
    const type = field?.type as Json;
    const members = type.kind === 'union' ? (type.members as Json[]) : [type];
    const ids = members.filter((m) => onVersion(m, version)).map((m) => attribute(m, 'id'));
    expect(ids).toEqual(ruleTestRegistry);
  });

  it('has every processor type applied', () => {
    const types = typesOf(['worldgen/structure_processor'], 'minecraft:template_processor');
    expect(types.length).toBeGreaterThanOrEqual(11);
    expect(types.filter((t) => !Object.hasOwn(PROCESSOR_TYPES, t))).toEqual([]);
  });

  it('has every rule test applied', () => {
    const types = typesOf(ruleTestRegistry, 'minecraft:rule_test');
    expect(types.length).toBeGreaterThanOrEqual(10);
    expect(types.filter((t) => !Object.hasOwn(RULE_TESTS, t))).toEqual([]);
  });

  it('has every position rule test applied', () => {
    const types = typesOf(['pos_rule_test'], 'minecraft:pos_rule_test');
    expect(types.length).toBeGreaterThanOrEqual(3);
    expect(types.filter((t) => !Object.hasOwn(POSITION_RULE_TESTS, t))).toEqual([]);
  });

  it('has every block entity modifier applied or named', () => {
    const types = typesOf(['rule_block_entity_modifier'], 'minecraft:rule_block_entity_modifier');
    expect(types.length).toBeGreaterThanOrEqual(4);
    expect(
      types.filter(
        (t) =>
          !Object.hasOwn(BLOCK_ENTITY_MODIFIERS, t) &&
          !Object.hasOwn(BLOCK_ENTITY_MODIFIERS_ONLY_IN_THE_GAME, t),
      ),
    ).toEqual([]);
  });

  it('has every pool element field read by the assembler or named', () => {
    const read = new Set(['projection']);
    const fields = (
      (mcdoc['::java::data::worldgen::template_pool::ElementBase']?.fields ?? []) as Json[]
    )
      .filter((f) => f.kind === 'pair' && onVersion(f, version))
      .map((f) => f.key as string);
    expect(fields).toContain('projection');
    expect(
      fields.filter((f) => !read.has(f) && !Object.hasOwn(ELEMENT_FIELDS_ONLY_IN_THE_GAME, f)),
    ).toEqual([]);
  });

  it('runs every processor type it lists without calling it only in the game', () => {
    const types = typesOf(['worldgen/structure_processor'], 'minecraft:template_processor');
    for (const type of types) {
      const input: ProcessInput = {
        template: sampleTemplate(),
        list: [{ processor_type: type, ...MINIMAL[type] }],
        rotation: 'none',
        origin: [0, -59, 0],
        seed: 1n,
        world: fillWorld('minecraft:glass'),
      };
      const row = processTemplate(input, {
        jigsawPlacement: false,
        blockTag: (id) => TAGS[id],
      }).rules.at(-1);
      expect(row?.type, type).toBe(type);
      expect(row?.fidelity, type).toBe(PROCESSOR_TYPES[type]);
    }
  });
});

const STONE_RULE = {
  input_predicate: { predicate_type: 'minecraft:block_match', block: 'minecraft:stone' },
  location_predicate: { predicate_type: 'minecraft:always_true' },
  output_state: 'minecraft:tnt',
};

/** The least JSON of each type that it reads. */
const MINIMAL: Readonly<Record<string, Json>> = {
  'minecraft:block_ignore': { blocks: ['minecraft:air'] },
  'minecraft:block_rot': { integrity: 0.5 },
  'minecraft:rule': { rules: [STONE_RULE] },
  'minecraft:capped': {
    limit: 3,
    delegate: { processor_type: 'minecraft:rule', rules: [STONE_RULE] },
  },
  'minecraft:gravity': { heightmap: 'WORLD_SURFACE_WG', offset: 0 },
  'minecraft:protected_blocks': { value: '#minecraft:features_cannot_replace' },
  'minecraft:block_age': { mossiness: 0.5 },
};

describe('plain words', () => {
  it('say each named type in a full sentence', () => {
    for (const words of [
      ...Object.values(BLOCK_ENTITY_MODIFIERS_ONLY_IN_THE_GAME),
      ...Object.values(ELEMENT_FIELDS_ONLY_IN_THE_GAME),
    ]) {
      expect(words).toMatch(/^[A-Z].*\.$/);
    }
  });
});
