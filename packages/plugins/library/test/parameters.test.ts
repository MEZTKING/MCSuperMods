/**
 * The wizard starters (ADR 0040): parameter declarations, defaults that reproduce the
 * parameterless bundles, alternative values, and the name helpers. Validation and export of
 * the alternative bundles with the real plugins live in `packages/exporters/test/library.test.ts`.
 */
import type {
  ContentBundle,
  Json,
  JsonObject,
  ProjectStarter,
  StarterParameter,
} from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { idFromName, nameForms, pluralOf, readValues, rgbFromHex } from '../src/content/parameters';
import { libraryStarters } from '../src/index';

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

const starter = (id: string): ProjectStarter => {
  const entry = libraryStarters.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`no starter ${id}`);
  return entry;
};

const build = (entry: ProjectStarter, values: Record<string, Json>): ContentBundle => {
  const bundle = entry.build({ namespace: 'demo', projectName: 'Demo', target, values });
  if (bundle instanceof Promise) throw new Error(`${entry.id} builds asynchronously.`);
  return bundle;
};

const defaults = (entry: ProjectStarter): Record<string, Json> =>
  Object.fromEntries(
    (entry.parameters ?? []).map((parameter) => [parameter.id, parameter.default]),
  );

const data = (bundle: ContentBundle, id: string): JsonObject =>
  JSON.parse(JSON.stringify(bundle.elements.find((entry) => entry.id === id)?.data ?? null));

const WIZARDS = ['custom_ore', 'custom-sword', 'custom_mob'];

describe('wizard starters', () => {
  it('are exactly the Custom ore, Custom sword and Custom mob starters', () => {
    expect(
      libraryStarters
        .filter((entry) => (entry.parameters ?? []).length > 0)
        .map((entry) => entry.id),
    ).toEqual(WIZARDS);
  });

  it('declare the groups of ADR 0040 in step order', () => {
    const groups = (id: string) => [
      ...new Set((starter(id).parameters ?? []).map((parameter) => parameter.group)),
    ];
    expect(groups('custom_ore')).toEqual(['Ore', 'Drops']);
    expect(groups('custom-sword')).toEqual(['Sword', 'Stats', 'Recipe']);
    expect(groups('custom_mob')).toEqual(['Mob', 'Behaviour', 'Spawning']);
  });

  it.each(WIZARDS)('%s declares well-formed parameters with valid defaults', (id) => {
    const parameters = starter(id).parameters as StarterParameter[];
    expect(new Set(parameters.map((parameter) => parameter.id)).size).toBe(parameters.length);
    for (const parameter of parameters) {
      expect(parameter.label, parameter.id).not.toBe('');
      expect(parameter.id, parameter.id).toMatch(/^[a-z][a-z0-9_]*$/);
      switch (parameter.type) {
        case 'string':
          if (parameter.pattern !== undefined) {
            expect(new RegExp(parameter.pattern).test(parameter.default), parameter.id).toBe(true);
          }
          if (parameter.maxLength !== undefined) {
            expect(parameter.default.length).toBeLessThanOrEqual(parameter.maxLength);
          }
          break;
        case 'number':
          expect(parameter.default).toBeGreaterThanOrEqual(parameter.min ?? -Infinity);
          expect(parameter.default).toBeLessThanOrEqual(parameter.max ?? Infinity);
          break;
        case 'colour':
          expect(parameter.default, parameter.id).toMatch(/^#[0-9a-f]{6}$/);
          break;
        case 'choice':
          expect(parameter.choices.map((choice) => choice.value)).toContain(parameter.default);
          break;
        case 'boolean':
          break;
      }
    }
  });

  it.each(WIZARDS)('%s builds the same bundle from its defaults as from no values', (id) => {
    const entry = starter(id);
    expect(build(entry, defaults(entry))).toEqual(build(entry, {}));
  });

  it.each(WIZARDS)('%s ignores values of the wrong type and unknown ids', (id) => {
    const entry = starter(id);
    const wrong = Object.fromEntries(
      (entry.parameters ?? []).map((parameter) => [
        parameter.id,
        parameter.type === 'number' ? 'nine' : 42,
      ]),
    );
    expect(build(entry, { ...wrong, unknown: true })).toEqual(build(entry, {}));
  });

  it('Custom ore: names, tier, drops and the optional storage block follow the values', () => {
    const bundle = build(starter('custom_ore'), {
      ore_name: 'Blue Topaz',
      colour: '#2050e0',
      tool_tier: 'diamond',
      drop_min: 3,
      drop_max: 9,
      make_block: false,
    });
    expect(bundle.elements.map((entry) => entry.id)).toEqual([
      'demo:pack',
      'demo:mod',
      'demo:blue_topaz_ore',
      'demo:blocks/blue_topaz_ore',
      'demo:blue_topaz',
      'demo:block/blue_topaz_ore',
      'demo:item/blue_topaz',
      'demo:blue_topaz_from_smelting',
      'demo:gems',
      'demo:root',
      'demo:get_blue_topaz',
    ]);
    expect(data(bundle, 'demo:blue_topaz_ore')).toMatchObject({
      display_name: 'Blue Topaz Ore',
      components: { 'msm:breakable': { min_tier: 'diamond' } },
    });
    expect(JSON.stringify(data(bundle, 'demo:blocks/blue_topaz_ore'))).toContain(
      '"count":{"type":"minecraft:uniform","min":3,"max":9}',
    );
    expect(data(bundle, 'demo:pack')).toEqual({
      pack: { description: 'Demo: blue topaz ore and blue topazes' },
    });
    expect(bundle.assets.map((asset) => asset.path)).toEqual([
      'textures/block/blue_topaz_ore.png',
      'textures/item/blue_topaz.png',
    ]);
    expect(JSON.stringify(bundle)).not.toMatch(/ruby/i);
  });

  it('Custom ore: a smaller most than fewest is treated as equal', () => {
    const bundle = build(starter('custom_ore'), { drop_min: 5, drop_max: 2 });
    expect(JSON.stringify(data(bundle, 'demo:blocks/ruby_ore'))).toContain('"min":2,"max":5');
  });

  it('Custom sword: name, tier, durability and ingredient follow the values', () => {
    const bundle = build(starter('custom-sword'), {
      sword_name: 'Frost Blade',
      tool_tier: 'iron',
      durability: 250,
      ingredient: 'minecraft:diamond',
    });
    expect(bundle.elements.map((entry) => entry.id)).toEqual([
      'demo:pack',
      'demo:mod',
      'demo:frost_blade',
      'demo:item/frost_blade',
      'demo:en_us',
      'demo:frost_blade_from_diamond',
    ]);
    expect(data(bundle, 'demo:frost_blade')).toMatchObject({
      components: { 'msm:tool': { type: 'sword', tier: 'iron' }, 'msm:durability': { max: 250 } },
    });
    expect(data(bundle, 'demo:en_us')).toEqual({ 'item.demo.frost_blade': 'Frost Blade' });
    expect(data(bundle, 'demo:frost_blade_from_diamond')).toMatchObject({
      key: { I: 'minecraft:diamond', S: 'minecraft:stick' },
    });
  });

  it('Custom mob: a hostile mob hunts players in the chosen biomes; a peaceful one never fights', () => {
    const hostile = build(starter('custom_mob'), {
      mob_name: 'Cave Troll',
      behaviour: 'hostile',
      spawn_biomes: '#minecraft:is_taiga',
      health: 40,
      speed: 0.3,
    });
    const troll = data(hostile, 'demo:cave_troll');
    expect(troll).toMatchObject({
      display_name: 'Cave Troll',
      category: 'monster',
      spawn: { biomes: ['#minecraft:is_taiga'], rule: 'monster' },
      components: { 'msm:health': { max: 40 }, 'msm:movement': { speed: 0.3 } },
    });
    expect((troll.components as JsonObject)['msm:ai_goals']).toEqual({
      goals: [
        { type: 'melee_attack', targets: ['minecraft:player'], retaliate: true },
        { type: 'wander' },
        { type: 'look_at_player' },
        { type: 'look_around' },
      ],
    });
    expect(hostile.elements.map((entry) => entry.id)).toContain('demo:troll/death');

    const peaceful = build(starter('custom_mob'), { behaviour: 'peaceful' });
    const golem = data(peaceful, 'demo:ruby_golem');
    const components = golem.components as JsonObject;
    expect(components['msm:attack']).toBeUndefined();
    expect(JSON.stringify(components['msm:ai_goals'])).not.toContain('melee_attack');
    expect(Object.keys(golem.events as JsonObject)).toEqual(['demo:ruby_golem_death']);
    expect((components['msm:animated_model'] as JsonObject).attack).toBeUndefined();
  });

  it('Custom mob: the egg colours tint the spawn egg texture', () => {
    const plain = build(starter('custom_mob'), {});
    const tinted = build(starter('custom_mob'), { egg_spot_colour: '#00ff00' });
    const egg = (bundle: ContentBundle) =>
      bundle.assets.find((asset) => asset.path.endsWith('_spawn_egg.png'))?.bytes;
    expect(egg(tinted)).not.toEqual(egg(plain));
    expect(tinted.assets[0]?.bytes).toEqual(plain.assets[0]?.bytes);
  });
});

describe('parameter helpers', () => {
  it('derives ids from names (ADR 0040 D2)', () => {
    expect(idFromName('Ruby')).toBe('ruby');
    expect(idFromName('Ruby Golem')).toBe('ruby_golem');
    expect(idFromName('  Blue   Topaz ')).toBe('blue_topaz');
    expect(idFromName("Dragon's Tooth 2")).toBe('dragons_tooth_2');
    expect(idFromName('9 Lives')).toBe('x_9_lives');
  });

  it('forms plurals for prose and ids', () => {
    expect(pluralOf('ruby')).toBe('rubies');
    expect(pluralOf('topaz')).toBe('topazes');
    expect(pluralOf('jade')).toBe('jades');
    expect(pluralOf('key')).toBe('keys');
    expect(nameForms('Blue Topaz')).toEqual({
      display: 'Blue Topaz',
      lower: 'blue topaz',
      plural: 'blue topazes',
      id: 'blue_topaz',
      idPlural: 'blue_topazes',
    });
  });

  it('reads values with defaults and parses colours', () => {
    const parameters: StarterParameter[] = [
      { id: 'n', label: 'N', type: 'number', default: 3 },
      { id: 'b', label: 'B', type: 'boolean', default: true },
      { id: 's', label: 'S', type: 'string', default: 'x' },
    ];
    expect(readValues(parameters, { values: { n: 5, b: 'no', extra: 1 } })).toEqual({
      n: 5,
      b: true,
      s: 'x',
    });
    expect(rgbFromHex('#C41C34', [0, 0, 0])).toEqual([196, 28, 52]);
    expect(rgbFromHex('red', [1, 2, 3])).toEqual([1, 2, 3]);
  });
});
