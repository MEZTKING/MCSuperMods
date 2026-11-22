import { readdirSync, readFileSync } from 'node:fs';
import type { Json } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import {
  createSchemaIndex,
  MSM_SCHEMA_REFS,
  MSM_TYPE_PATHS,
  msmMcdocSymbols,
  type SchemaNode,
  validateJson,
} from '../src/index';

/**
 * The MSM conformance corpus (ADR 0025 D7, ADR 0028 D7), shared with the runtime's JUnit tests:
 * `conformance/definition/` holds runtime definitions, `conformance/element/` element data,
 * `conformance/geometry/` and `conformance/animation/` the GeckoLib JSON of the
 * `msm:geo_model` and `msm:animation` elements. Effect files (`effect-`) are ADR 0055's
 * `msm:effect`; `biome-addition-` and `loot-addition-` files ADR 0060's additions,
 * `block-item-components-` files are blocks whose item carries components (ADR 0060 D4), and
 * `trigger-block-`, `trigger-item-` and `trigger-entity-` files are blocks, items and entities
 * using ADR 0061's trigger components. `container-` and `machine-` files are blocks with ADR
 * 0074's `msm:container` and ADR 0075's `msm:machine`; `conformance/machine-recipe/` holds ADR
 * 0075's machine recipe files. `portal-` files are ADR 0077's portal blocks and blocks with the
 * `light_portal` action; `portal-item-`, `portal-entity-` and `portal-effect-` files are items,
 * entities and effects with that action. `particle-` files are ADR 0080's `msm:particle`;
 * `action-particle-` files are blocks with `spawn_particle` options objects, `motion` and `force`
 * (ADR 0080 D5), and `ambient-particles-` files blocks with `msm:ambient_particles` (ADR 0080 D6).
 * `key-bind-`, `hud-` and `vehicle-` files are ADR 0088's `msm:key_bind`, ADR 0089's `msm:hud`
 * and ADR 0090's `msm:vehicle`; `action-explode-` and `action-hud-` files are blocks with the
 * `explode` (ADR 0090 D6) and HUD actions (ADR 0089 D6), and `action-explode-item-`,
 * `action-hud-entity-` and the like items, entities and effects with them. `block-type-2-` files
 * are ADR 0094's twenty block types (blocks), `waterlog-` and `weathering-` files blocks with
 * ADR 0094's `msm:waterloggable`, `msm:weathering` and `msm:waxable`, `item-inventory-` and
 * `bundle-` files items with ADR 0095's `msm:item_inventory` and `msm:bundle`, and `command-`
 * and `creative-tab-` files ADR 0096's `msm:command` and `msm:creative_tab`. `trader-`,
 * `storage-` and `shoulder-` files are entities with ADR 0098's `msm:trader`, `msm:storage` and
 * `msm:shoulder_riding`; `profession-` and `fluid-` files ADR 0098's `msm:villager_profession`
 * and ADR 0099's `msm:fluid`. `block-type-3-` files are ADR 0103's five plant and pot types,
 * the own set types of doors, trapdoors, buttons and plates and the `block_sounds` of ADR 0105
 * D1, D2 (blocks); `block-tools-` files blocks with ADR 0105 D3's `msm:flattenable` and
 * `msm:tillable`; `container-double`, `container-per-player` and `container-2-` files ADR 0104
 * D3 to D6's containers (and `machine-2-` its waterlogged machines); `weathering-2-` files ADR
 * 0104 D1's six weathering types; `vanilla-block-rules-` files ADR 0105 D4's
 * `msm:vanilla_block_rules`.
 * The longest matching file name prefix selects the schema;
 * `expected-errors.json` maps each invalid file to one error (pointer and code) that
 * `validateJson` must report.
 */
const CORPUS = new URL('../mcdoc/msm/conformance/', import.meta.url);

type Group = 'definition' | 'element' | 'geometry' | 'animation' | 'machine-recipe';

/** The machine recipe file of ADR 0075 D2, checked by its type path (no schema reference yet). */
const MACHINE_RECIPE = '::msm::recipe::MachineRecipe';

/**
 * File name prefixes of block, item and entity files besides `block-`, `item-` and `entity-`
 * (ADRs 0061, 0074, 0075, 0077, 0080, 0094, 0095, 0098).
 */
const BLOCK_PREFIXES: Readonly<Record<string, readonly string[]>> = {
  item: ['bundle'],
  entity: ['trader', 'storage', 'shoulder'],
  block: [
    'trigger-block',
    'container',
    'machine',
    'portal',
    'action-particle',
    'ambient-particles',
    'action-explode',
    'action-hud',
    'waterlog',
    'weathering',
  ],
};

/** Prefixes of files whose `<prefix>-<kind>-` form is a file of another kind (`trigger-item-`). */
const KIND_PREFIXES: readonly string[] = ['trigger', 'portal', 'action-explode', 'action-hud'];

/** The `action-explode-` and `action-hud-` prefixes per kind (ADR 0089 D6, ADR 0090 D6). */
const NEW_ACTION_PREFIXES: Record<string, string> = Object.fromEntries(
  ['action-explode', 'action-hud'].flatMap((base) => [
    [base, MSM_SCHEMA_REFS.blockDefinition],
    [`${base}-item`, MSM_SCHEMA_REFS.itemDefinition],
    [`${base}-entity`, MSM_SCHEMA_REFS.entityDefinition],
    [`${base}-effect`, MSM_SCHEMA_REFS.effectDefinition],
  ]),
);

/** Schema references of ADR 0060's additions. */
const ADDITIONS = {
  biomeAdditionDefinition: MSM_SCHEMA_REFS.biomeAdditionDefinition,
  lootAdditionDefinition: MSM_SCHEMA_REFS.lootAdditionDefinition,
  biomeAddition: MSM_SCHEMA_REFS.biomeAddition,
  lootAddition: MSM_SCHEMA_REFS.lootAddition,
} as const;

/** References whose root is a union of two structs (at least one of `features` and `spawns`). */
const UNION_REFS: ReadonlySet<string> = new Set([
  MSM_SCHEMA_REFS.biomeAddition,
  MSM_SCHEMA_REFS.biomeAdditionDefinition,
  MSM_TYPE_PATHS.biomeAddition,
  MSM_TYPE_PATHS.biomeAdditionDefinition,
]);

/** A struct, or (for {@link UNION_REFS}) a union of exactly two structs. */
const expectRootKind = (ref: string): void => {
  let node = index.resolveSchemaRef(ref);
  // An element alias (`type BiomeAddition = DefinitionBiomeAddition`) is a reference.
  while (node.kind === 'reference') node = node.resolve();
  if (!UNION_REFS.has(ref)) {
    expect(node.kind, ref).toBe('struct');
    return;
  }
  expect(node.kind, ref).toBe('union');
  if (node.kind === 'union') {
    expect(node.members.map((m) => (m.kind === 'reference' ? m.resolve() : m).kind)).toEqual([
      'struct',
      'struct',
    ]);
  }
};

const SCHEMAS: Record<Group, Record<string, string>> = {
  definition: {
    block: MSM_SCHEMA_REFS.blockDefinition,
    item: MSM_SCHEMA_REFS.itemDefinition,
    entity: MSM_SCHEMA_REFS.entityDefinition,
    effect: MSM_SCHEMA_REFS.effectDefinition,
    potion: MSM_SCHEMA_REFS.potionDefinition,
    'biome-addition': ADDITIONS.biomeAdditionDefinition,
    'loot-addition': ADDITIONS.lootAdditionDefinition,
    'trigger-block': MSM_SCHEMA_REFS.blockDefinition,
    'trigger-item': MSM_SCHEMA_REFS.itemDefinition,
    'trigger-entity': MSM_SCHEMA_REFS.entityDefinition,
    container: MSM_SCHEMA_REFS.blockDefinition,
    machine: MSM_SCHEMA_REFS.blockDefinition,
    portal: MSM_SCHEMA_REFS.blockDefinition,
    'portal-item': MSM_SCHEMA_REFS.itemDefinition,
    'portal-entity': MSM_SCHEMA_REFS.entityDefinition,
    'portal-effect': MSM_SCHEMA_REFS.effectDefinition,
    particle: MSM_SCHEMA_REFS.particleDefinition,
    'action-particle': MSM_SCHEMA_REFS.blockDefinition,
    'ambient-particles': MSM_SCHEMA_REFS.blockDefinition,
    'key-bind': MSM_SCHEMA_REFS.keyBindDefinition,
    hud: MSM_SCHEMA_REFS.hudDefinition,
    vehicle: MSM_SCHEMA_REFS.vehicleDefinition,
    ...NEW_ACTION_PREFIXES,
    waterlog: MSM_SCHEMA_REFS.blockDefinition,
    weathering: MSM_SCHEMA_REFS.blockDefinition,
    bundle: MSM_SCHEMA_REFS.itemDefinition,
    command: MSM_SCHEMA_REFS.commandDefinition,
    'creative-tab': MSM_SCHEMA_REFS.creativeTabDefinition,
    trader: MSM_SCHEMA_REFS.entityDefinition,
    storage: MSM_SCHEMA_REFS.entityDefinition,
    shoulder: MSM_SCHEMA_REFS.entityDefinition,
    profession: MSM_SCHEMA_REFS.villagerProfessionDefinition,
    fluid: MSM_SCHEMA_REFS.fluidDefinition,
    'vanilla-block-rules': MSM_SCHEMA_REFS.vanillaBlockRulesDefinition,
  },
  element: {
    block: MSM_SCHEMA_REFS.block,
    item: MSM_SCHEMA_REFS.item,
    mod: MSM_SCHEMA_REFS.mod,
    entity: MSM_SCHEMA_REFS.entity,
    effect: MSM_SCHEMA_REFS.effect,
    potion: MSM_SCHEMA_REFS.potion,
    'biome-addition': ADDITIONS.biomeAddition,
    'loot-addition': ADDITIONS.lootAddition,
    'trigger-block': MSM_SCHEMA_REFS.block,
    'trigger-item': MSM_SCHEMA_REFS.item,
    'trigger-entity': MSM_SCHEMA_REFS.entity,
    container: MSM_SCHEMA_REFS.block,
    machine: MSM_SCHEMA_REFS.block,
    portal: MSM_SCHEMA_REFS.block,
    particle: MSM_SCHEMA_REFS.particle,
    'ambient-particles': MSM_SCHEMA_REFS.block,
    waterlog: MSM_SCHEMA_REFS.block,
    weathering: MSM_SCHEMA_REFS.block,
    bundle: MSM_SCHEMA_REFS.item,
    command: MSM_SCHEMA_REFS.command,
    'creative-tab': MSM_SCHEMA_REFS.creativeTab,
    trader: MSM_SCHEMA_REFS.entity,
    storage: MSM_SCHEMA_REFS.entity,
    shoulder: MSM_SCHEMA_REFS.entity,
    profession: MSM_SCHEMA_REFS.villagerProfession,
    fluid: MSM_SCHEMA_REFS.fluid,
    'vanilla-block-rules': MSM_SCHEMA_REFS.vanillaBlockRules,
  },
  geometry: { geometry: MSM_SCHEMA_REFS.geoModel },
  animation: { animation: MSM_SCHEMA_REFS.animation },
  'machine-recipe': { 'machine-recipe': MACHINE_RECIPE },
};

interface Expected {
  path: string;
  code: string;
}

const index = createSchemaIndex({ ref: 'empty', mcdoc: {}, dispatchers: {} }, { mcVersion: '1.0' });

const files = (group: Group, kind: 'valid' | 'invalid'): string[] =>
  readdirSync(new URL(`${group}/${kind}/`, CORPUS))
    .filter((name) => name.endsWith('.json'))
    .sort();

const read = (group: Group, kind: 'valid' | 'invalid', name: string): Json =>
  JSON.parse(readFileSync(new URL(`${group}/${kind}/${name}`, CORPUS), 'utf8')) as Json;

const expectations = (group: Group): Record<string, Expected> =>
  JSON.parse(readFileSync(new URL(`${group}/expected-errors.json`, CORPUS), 'utf8')) as Record<
    string,
    Expected
  >;

/** The longest prefix of `SCHEMAS[group]` that `name` starts with (followed by `-`). */
const prefixOf = (group: Group, name: string): string | undefined =>
  Object.keys(SCHEMAS[group])
    .filter((prefix) => name.startsWith(`${prefix}-`))
    .sort((a, b) => b.length - a.length)[0];

const schemaFor = (group: Group, name: string): SchemaNode => {
  const prefix = prefixOf(group, name);
  const ref = prefix === undefined ? undefined : SCHEMAS[group][prefix];
  if (ref === undefined) throw new Error(`${group}/${name}: unknown file name prefix`);
  return index.resolveSchemaRef(ref);
};

const GROUPS: Group[] = ['definition', 'element', 'geometry', 'animation', 'machine-recipe'];

describe('MSM mcdoc symbols', () => {
  it('load and resolve through every schema reference and type path', () => {
    const symbols = msmMcdocSymbols();
    expect(symbols.ref).toMatch(/^msm-mcdoc:sha256:[0-9a-f]{64}$/);
    // Every reference and type path resolves to a struct, except the biome additions: at least
    // one of `features` and `spawns` (ADR 0060 D2) makes them a union of two structs.
    for (const ref of Object.values(MSM_SCHEMA_REFS)) expectRootKind(ref);
    for (const path of Object.values(MSM_TYPE_PATHS)) {
      expect(index.has(path)).toBe(true);
      expectRootKind(path);
    }
    expect(index.resolveSchemaRef(MSM_SCHEMA_REFS.block)).toBe(index.resolve(MSM_TYPE_PATHS.block));
    expect(index.dispatcherKeys('msm:action')).toEqual([
      'apply_effect',
      'damage',
      'explode',
      'give_item',
      'heal',
      'hide_hud',
      'launch',
      'light_portal',
      'play_animation',
      'play_sound',
      'run_function',
      'run_script',
      'set_block_state',
      'set_hud',
      'show_hud',
      'spawn_particle',
      'trigger_event',
    ]);
  });

  it('keep the vanilla ref and paths of the target symbols', () => {
    const vanilla = createSchemaIndex(
      { ref: 'vanilla-ref', mcdoc: { '::t::X': { kind: 'boolean' } }, dispatchers: {} },
      { mcVersion: '1.0' },
    );
    expect(vanilla.ref).toBe('vanilla-ref');
    expect(vanilla.has('::t::X')).toBe(true);
    expect(vanilla.has(MSM_TYPE_PATHS.itemDefinition)).toBe(true);
  });
});

describe.each(GROUPS)('MSM conformance corpus: %s', (group) => {
  const valid = files(group, 'valid');
  const invalid = files(group, 'invalid');
  const expected = expectations(group);

  it('has valid and invalid cases, each invalid one with an expected error', () => {
    expect(valid.length).toBeGreaterThan(0);
    expect(invalid.length).toBeGreaterThan(0);
    expect(Object.keys(expected).sort()).toEqual(invalid);
  });

  it.each(valid)('valid/%s has no problems', (name) => {
    expect(validateJson(read(group, 'valid', name), schemaFor(group, name))).toEqual([]);
  });

  it.each(invalid)('invalid/%s reports its expected error', (name) => {
    const problems = validateJson(read(group, 'invalid', name), schemaFor(group, name));
    expect(problems.some((p) => p.severity === 'error')).toBe(true);
    const want = expected[name];
    expect(problems.map((p) => `${p.path} ${p.code}`)).toContain(`${want?.path} ${want?.code}`);
  });
});

describe('MSM conformance corpus coverage', () => {
  /**
   * Field paths of a struct schema (map fields as `*`), depth-first; a union at the root (the
   * biome addition) contributes the fields of every member.
   */
  const fieldPaths = (node: SchemaNode, path: string, out: Set<string>, depth = 0): void => {
    if (depth > 6) return;
    const target = node.kind === 'reference' ? node.resolve() : node;
    if (target.kind === 'union' && depth === 0) {
      for (const member of target.members) fieldPaths(member, path, out, depth + 1);
      return;
    }
    if (target.kind === 'list') {
      fieldPaths(target.item, path, out, depth + 1);
      return;
    }
    if (target.kind !== 'struct') return;
    for (const field of target.fields) {
      const next = `${path}/${field.key}`;
      out.add(next);
      fieldPaths(field.type, next, out, depth + 1);
    }
  };

  /**
   * Every key path (`/a/b`, list indices dropped; keys of the map-like objects at `maps` as
   * `*`) and every action `type` in a value.
   */
  const collect = (
    value: Json,
    path: string,
    maps: ReadonlySet<string>,
    keys: Set<string>,
    actions: Set<string>,
  ): void => {
    if (Array.isArray(value)) {
      for (const entry of value) collect(entry, path, maps, keys, actions);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    for (const [key, entry] of Object.entries(value)) {
      const next = maps.has(path) ? `${path}/*` : `${path}/${key}`;
      keys.add(next);
      if (key === 'actions' && Array.isArray(entry)) {
        for (const action of entry) {
          if (typeof action === 'object' && action !== null && !Array.isArray(action)) {
            if (typeof action.type === 'string') actions.add(action.type);
          }
        }
      }
      collect(entry, next, maps, keys, actions);
    }
  };

  /** Paths of the map-like structs (`[string]: T`) of a schema, and always `/events`. */
  const mapPaths = (ref: string | undefined): Set<string> => {
    const maps = new Set(['/events']);
    if (ref === undefined) return maps;
    const declared = new Set<string>();
    fieldPaths(index.resolveSchemaRef(ref), '', declared);
    for (const path of declared) if (path.endsWith('/*')) maps.add(path.slice(0, -2));
    return maps;
  };

  /**
   * Keys and action types of the valid files of a schema: those whose longest prefix is
   * `prefix`, plus the `trigger-<prefix>-`, `portal-<prefix>-`, `action-explode-<prefix>-` and
   * `action-hud-<prefix>-` files of the same schema (and, for blocks, the `container-`,
   * `machine-`, `portal-` and `action-` files).
   */
  const covered = (group: Group, prefix: string) => {
    const keys = new Set<string>();
    const actions = new Set<string>();
    const maps = mapPaths(SCHEMAS[group][prefix]);
    const owned = (name: string): boolean => {
      const own = prefixOf(group, name);
      if (own === undefined) return false;
      return (
        own === prefix ||
        KIND_PREFIXES.some((kind) => own === `${kind}-${prefix}`) ||
        (BLOCK_PREFIXES[prefix] ?? []).includes(own)
      );
    };
    for (const name of files(group, 'valid').filter(owned)) {
      collect(read(group, 'valid', name), '', maps, keys, actions);
    }
    return { keys, actions };
  };

  it('uses every action type in a valid entity definition, and every other one in a valid block, item and effect definition', () => {
    const all = index.dispatcherKeys('msm:action');
    const definitionActions = (prefix: string): string[] =>
      [...covered('definition', prefix).actions].sort();
    expect(definitionActions('entity')).toEqual(all);
    // `play_animation` is dropped with a warning outside entity definitions (ADR 0028 D4).
    const blockAndItem = all.filter((type) => type !== 'play_animation');
    expect(definitionActions('block')).toEqual(blockAndItem);
    expect(definitionActions('item')).toEqual(blockAndItem);
    expect(definitionActions('effect')).toEqual(blockAndItem);
  });

  it.each([
    ['definition', 'effect-', 8, 10],
    ['definition', 'potion-', 6, 8],
    ['element', 'potion-', 4, 4],
    ['definition', 'item-throwable-', 6, 8],
    ['definition', 'block-shape-', 6, 8],
    ['definition', 'biome-addition-', 4, 4],
    ['definition', 'loot-addition-', 4, 4],
    ['definition', 'block-item-components-', 4, 4],
    ['definition', 'trigger-', 4, 4],
    ['definition', 'trigger-item-', 2, 2],
    ['definition', 'trigger-block-', 2, 2],
    ['definition', 'trigger-entity-', 2, 2],
    ['definition', 'entity-mx-', 6, 40],
    ['element', 'entity-mx-', 6, 10],
    ['definition', 'container-', 6, 12],
    ['definition', 'machine-', 4, 12],
    ['element', 'container-', 2, 1],
    ['element', 'machine-', 1, 8],
    ['machine-recipe', 'machine-recipe-', 3, 10],
    ['definition', 'portal-', 8, 30],
    ['element', 'portal-', 2, 4],
    ['definition', 'particle-', 4, 20],
    ['definition', 'action-particle-', 4, 6],
    ['definition', 'ambient-particles-', 3, 10],
    ['element', 'particle-', 2, 1],
    ['element', 'ambient-particles-', 1, 1],
    ['definition', 'key-bind-', 5, 12],
    ['definition', 'hud-', 12, 20],
    ['definition', 'vehicle-', 8, 35],
    ['definition', 'action-explode-', 4, 5],
    ['definition', 'action-hud-', 5, 6],
    ['definition', 'block-type-2-', 30, 28],
    ['element', 'block-type-2-', 40, 20],
    ['definition', 'waterlog-', 4, 2],
    ['definition', 'weathering-', 5, 6],
    ['definition', 'item-inventory-', 5, 7],
    ['definition', 'bundle-', 2, 2],
    ['definition', 'command-', 5, 10],
    ['definition', 'creative-tab-', 3, 4],
    ['element', 'waterlog-', 1, 1],
    ['element', 'weathering-', 1, 1],
    ['element', 'item-inventory-', 1, 1],
    ['element', 'bundle-', 1, 1],
    ['element', 'command-', 2, 2],
    ['element', 'creative-tab-', 2, 1],
    ['definition', 'trader-', 4, 10],
    ['definition', 'storage-', 3, 5],
    ['definition', 'shoulder-', 2, 3],
    ['definition', 'profession-', 4, 9],
    ['definition', 'fluid-', 6, 18],
    ['element', 'trader-', 1, 1],
    ['element', 'storage-', 1, 1],
    ['element', 'shoulder-', 1, 1],
    ['element', 'profession-', 2, 3],
    ['element', 'fluid-', 2, 4],
    ['definition', 'block-type-3-', 18, 30],
    ['element', 'block-type-3-', 11, 6],
    ['definition', 'block-tools-', 2, 3],
    ['definition', 'container-2-', 2, 0],
    ['definition', 'weathering-2-', 6, 0],
    ['definition', 'vanilla-block-rules-', 3, 10],
    ['element', 'vanilla-block-rules-', 1, 1],
  ] as const)(
    'has enough %s %s cases (ADRs 0055, 0056, 0059, 0060, 0061, 0070-0072, 0074, 0075, 0077, 0080, 0088-0090, 0094-0096, 0098, 0099, 0103-0105)',
    (group, prefix, minValid, minInvalid) => {
      const count = (kind: 'valid' | 'invalid') =>
        files(group, kind).filter((name) => name.startsWith(prefix)).length;
      expect(count('valid')).toBeGreaterThanOrEqual(minValid);
      expect(count('invalid')).toBeGreaterThanOrEqual(minInvalid);
    },
  );

  it.each(['damage', 'heal', 'light_portal', 'explode', 'show_hud', 'hide_hud', 'set_hud'])(
    'has valid and invalid %s action cases',
    (type) => {
      const uses = (kind: 'valid' | 'invalid') =>
        files('definition', kind).filter((name) =>
          JSON.stringify(read('definition', kind, name)).includes(`"type":"${type}"`),
        ).length;
      expect(uses('valid')).toBeGreaterThanOrEqual(2);
      expect(uses('invalid')).toBeGreaterThanOrEqual(2);
    },
  );

  it('uses every goal type in a valid entity definition and element', () => {
    const goals = (group: Group): string[] => {
      const types = new Set<string>();
      for (const name of files(group, 'valid').filter((n) => n.startsWith('entity-'))) {
        const value = read(group, 'valid', name);
        if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
        const list = (value.components as { 'msm:ai_goals'?: { goals?: { type?: unknown }[] } })?.[
          'msm:ai_goals'
        ]?.goals;
        for (const goal of list ?? []) if (typeof goal.type === 'string') types.add(goal.type);
      }
      return [...types].sort();
    };
    expect(goals('definition')).toEqual(index.dispatcherKeys('msm:ai_goal'));
    expect(goals('element')).toEqual(index.dispatcherKeys('msm:ai_goal'));
  });

  it.each([
    ['definition', 'block', MSM_SCHEMA_REFS.blockDefinition],
    ['definition', 'item', MSM_SCHEMA_REFS.itemDefinition],
    ['element', 'block', MSM_SCHEMA_REFS.block],
    ['element', 'item', MSM_SCHEMA_REFS.item],
    ['element', 'mod', MSM_SCHEMA_REFS.mod],
    ['definition', 'entity', MSM_SCHEMA_REFS.entityDefinition],
    ['element', 'entity', MSM_SCHEMA_REFS.entity],
    ['definition', 'effect', MSM_SCHEMA_REFS.effectDefinition],
    ['element', 'effect', MSM_SCHEMA_REFS.effect],
    ['definition', 'potion', MSM_SCHEMA_REFS.potionDefinition],
    ['element', 'potion', MSM_SCHEMA_REFS.potion],
    ['definition', 'biome-addition', ADDITIONS.biomeAdditionDefinition],
    ['definition', 'loot-addition', ADDITIONS.lootAdditionDefinition],
    ['element', 'biome-addition', ADDITIONS.biomeAddition],
    ['element', 'loot-addition', ADDITIONS.lootAddition],
    ['geometry', 'geometry', MSM_SCHEMA_REFS.geoModel],
    ['animation', 'animation', MSM_SCHEMA_REFS.animation],
    ['machine-recipe', 'machine-recipe', MACHINE_RECIPE],
    ['definition', 'particle', MSM_SCHEMA_REFS.particleDefinition],
    ['element', 'particle', MSM_SCHEMA_REFS.particle],
    ['definition', 'key-bind', MSM_SCHEMA_REFS.keyBindDefinition],
    ['definition', 'hud', MSM_SCHEMA_REFS.hudDefinition],
    ['definition', 'vehicle', MSM_SCHEMA_REFS.vehicleDefinition],
    ['definition', 'command', MSM_SCHEMA_REFS.commandDefinition],
    ['element', 'command', MSM_SCHEMA_REFS.command],
    ['definition', 'creative-tab', MSM_SCHEMA_REFS.creativeTabDefinition],
    ['element', 'creative-tab', MSM_SCHEMA_REFS.creativeTab],
    ['definition', 'profession', MSM_SCHEMA_REFS.villagerProfessionDefinition],
    ['element', 'profession', MSM_SCHEMA_REFS.villagerProfession],
    ['definition', 'fluid', MSM_SCHEMA_REFS.fluidDefinition],
    ['element', 'fluid', MSM_SCHEMA_REFS.fluid],
    ['definition', 'vanilla-block-rules', MSM_SCHEMA_REFS.vanillaBlockRulesDefinition],
    ['element', 'vanilla-block-rules', MSM_SCHEMA_REFS.vanillaBlockRules],
  ] as const)('sets every %s %s field in some valid file', (group, prefix, ref) => {
    const declared = new Set<string>();
    fieldPaths(index.resolveSchemaRef(ref), '', declared);
    // Action fields are reached through the `msm:action` dispatcher, checked above.
    const missing = [...declared]
      .filter((path) => !path.includes('/actions/'))
      .filter((path) => !covered(group, prefix).keys.has(path));
    expect(missing).toEqual([]);
  });

  describe('ADR 0067, ADR 0068, ADR 0077, ADR 0094 and ADR 0103 block types', () => {
    /**
     * The 17 block types of ADR 0067 D1 and ADR 0068 D1, ADR 0077's `portal`, the twenty of
     * ADR 0094 D1 and the five of ADR 0103 D1, D2, in name order.
     */
    const TYPES = [
      'bed',
      'berry_bush',
      'block',
      'button',
      'cake',
      'candle',
      'carpet',
      'chain',
      'cocoa',
      'column_plant',
      'crop',
      'directional',
      'door',
      'dripleaf',
      'fence',
      'fence_gate',
      'flower_pot',
      'growing_plant',
      'hanging_sign',
      'horizontal',
      'ladder',
      'lantern',
      'layers',
      'leaves',
      'multiface',
      'pane',
      'pillar',
      'portal',
      'potted_plant',
      'pressure_plate',
      'rod',
      'sapling',
      'scaffolding',
      'sea_pickle',
      'sign',
      'slab',
      'stairs',
      'stem',
      'tall_plant',
      'torch',
      'trapdoor',
      'vine',
      'wall',
    ];

    /** `block-type-` and `portal-` files of a group whose `type` is `type`. */
    const ofType = (group: Group, kind: 'valid' | 'invalid', type: string): Json[] =>
      files(group, kind)
        .filter((name) => name.startsWith('block-type-') || prefixOf(group, name) === 'portal')
        .map((name) => read(group, kind, name))
        .filter(
          (value) =>
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value) &&
            value.type === type,
        );

    it.each([
      ['msm:block_type', 'definition'],
      ['msm:block_type_element', 'element'],
    ] as const)('%s dispatches every type and no type at all', (registry, _group) => {
      expect(index.dispatcherKeys(registry)).toEqual(['%none', ...TYPES]);
      expect(index.dispatch(registry, '%none')).toBeDefined();
    });

    it.each(TYPES.flatMap((type) => [['definition', type] as const, ['element', type] as const]))(
      'has valid and invalid %s cases of type %s',
      (group, type) => {
        expect(ofType(group, 'valid', type).length).toBeGreaterThan(0);
        expect(ofType(group, 'invalid', type).length).toBeGreaterThan(0);
      },
    );

    it.each([
      ['msm:block_type', 'definition'],
      ['msm:block_type_element', 'element'],
    ] as const)(
      'sets every field of every %s member in a valid file of that type',
      (registry, group) => {
        const missing: string[] = [];
        for (const type of TYPES) {
          let member = index.dispatch(registry, type);
          while (member?.kind === 'reference') member = member.resolve();
          if (member?.kind !== 'struct') throw new Error(`${registry}[${type}] is not a struct`);
          const keys = new Set<string>();
          for (const value of ofType(group, 'valid', type))
            collect(value, '', new Set(), keys, new Set());
          const declared = new Set<string>();
          fieldPaths(member, '', declared);
          for (const path of declared) {
            // Map-like structs (`models`) are covered by any key.
            const covered = path.endsWith('/*')
              ? [...keys].some((key) => key.startsWith(path.slice(0, -1)))
              : keys.has(path);
            if (!covered) missing.push(`${type}${path}`);
          }
        }
        expect(missing).toEqual([]);
      },
    );

    it('keeps editor fields out of the definition', () => {
      for (const key of ['textures', 'models', 'crop_drops', 'leaves_drops', 'wooden']) {
        for (const type of TYPES) {
          let member = index.dispatch('msm:block_type', type);
          while (member?.kind === 'reference') member = member.resolve();
          expect(member?.kind === 'struct' && member.fields.some((f) => f.key === key)).toBe(false);
        }
      }
    });
  });
});

describe('ADR 0060 and ADR 0061 format additions', () => {
  const field = (ref: string, path: string): SchemaNode | undefined => {
    let node: SchemaNode | undefined = index.resolveSchemaRef(ref);
    for (const key of path.split('/')) {
      while (node?.kind === 'reference') node = node.resolve();
      if (node?.kind === 'union') {
        node = node.members
          .map((m) => (m.kind === 'reference' ? m.resolve() : m))
          .find((m) => m.kind === 'struct');
      }
      if (node?.kind !== 'struct') return undefined;
      node = node.fields.find((f) => f.key === key)?.type;
    }
    while (node?.kind === 'reference') node = node.resolve();
    return node;
  };

  it('keeps fuel and compost out of the definitions and in the element data', () => {
    expect(field(MSM_SCHEMA_REFS.itemDefinition, 'fuel')).toBeUndefined();
    expect(field(MSM_SCHEMA_REFS.itemDefinition, 'compost')).toBeUndefined();
    expect(field(MSM_SCHEMA_REFS.blockDefinition, 'item/fuel')).toBeUndefined();
    expect(field(MSM_SCHEMA_REFS.item, 'fuel')?.kind).toBe('struct');
    expect(field(MSM_SCHEMA_REFS.item, 'compost')?.kind).toBe('enum');
    expect(field(MSM_SCHEMA_REFS.block, 'item/fuel')?.kind).toBe('struct');
    expect(field(MSM_SCHEMA_REFS.block, 'item/compost')?.kind).toBe('enum');
    expect(field(MSM_SCHEMA_REFS.blockDefinition, 'item/components')?.kind).toBe('struct');
    expect(field(MSM_SCHEMA_REFS.block, 'item/components')?.kind).toBe('struct');
  });

  it.each([
    [
      MSM_SCHEMA_REFS.itemDefinition,
      ['msm:on_hit', 'msm:on_use_on_block', 'msm:while_held', 'msm:while_worn'],
    ],
    [
      MSM_SCHEMA_REFS.blockDefinition,
      ['msm:on_break', 'msm:on_place', 'msm:on_random_tick', 'msm:on_entity_inside'],
    ],
    [MSM_SCHEMA_REFS.entityDefinition, ['msm:on_tick', 'msm:on_spawn']],
    [
      MSM_SCHEMA_REFS.item,
      ['msm:on_hit', 'msm:on_use_on_block', 'msm:while_held', 'msm:while_worn'],
    ],
    [
      MSM_SCHEMA_REFS.block,
      ['msm:on_break', 'msm:on_place', 'msm:on_random_tick', 'msm:on_entity_inside'],
    ],
    [MSM_SCHEMA_REFS.entity, ['msm:on_tick', 'msm:on_spawn']],
  ])('%s has the ADR 0061 trigger components', (ref, keys) => {
    for (const key of keys) expect(field(ref, `components/${key}/event`)?.kind).toBe('string');
  });
});
