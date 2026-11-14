/**
 * The mob Creator flows of ADR 0073 D2 (Pet, Farm animal, Mount, Flying mob, Water mob, Boss),
 * the Custom mob's archer and variants, and the mob examples of ADR 0073 D4: bases, components,
 * renderer `auto`, preset models, variants with their own skins, spawns and the `hasFabric`
 * gate of ADR 0072 D6. Validation and export with the real plugins on both targets live in
 * `packages/exporters/test/library.test.ts`.
 */
import type {
  ContentBundle,
  ContentBundleElement,
  Json,
  JsonObject,
  ProjectStarter,
} from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { entityBehaviourExamples, libraryStarters } from '../src/index';

const MOB_FLOWS = ['pet', 'farm-animal', 'mount', 'flying-mob', 'water-mob', 'boss'] as const;

const target = (builtInTargets[0] as (typeof builtInTargets)[number]).target;

const starter = (id: string): ProjectStarter => {
  const found = libraryStarters.find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`No starter ${id}`);
  return found;
};

const build = (id: string, values: Record<string, Json> = {}): ContentBundle => {
  const bundle = starter(id).build({ namespace: 'demo', projectName: 'Demo', target, values });
  if (bundle instanceof Promise) throw new Error(`${id} builds asynchronously.`);
  return bundle;
};

const entityOf = (bundle: ContentBundle): ContentBundleElement => {
  const found = bundle.elements.find((entry) => entry.kind === 'msm:entity');
  if (found === undefined) throw new Error('no entity');
  return found;
};
const data = (bundle: ContentBundle): JsonObject => entityOf(bundle).data as JsonObject;
const components = (bundle: ContentBundle): JsonObject => data(bundle).components as JsonObject;

/** A grey PNG `data:` URL of the given size. */
async function png(width: number, height: number): Promise<string> {
  const { encodePng } = await import('../src/index');
  const bytes = encodePng(new Uint8Array(width * height * 4).fill(160), width, height);
  return `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
}

/** Every combination the flow's `probeValues` and defaults build. */
function probes(id: string): Record<string, Json>[] {
  const extra: Record<string, Record<string, Json>[]> = {
    pet: [
      { preset: 'flyer', defends: false, babies: false, variant_count: 3 },
      { preset: 'bird', spawn_biomes: 'nowhere' },
      { preset: 'biped' },
    ],
    'farm-animal': [{ preset: 'bird', rideable: true, drop: 'minecraft:feather' }],
    mount: [{ preset: 'flyer', owner_only: true, needs_saddle: false }, { flying: true }],
    'flying-mob': [{ behaviour: 'shooter' }, { behaviour: 'hostile', preset: 'bird' }],
    'water-mob': [
      { kind: 'dolphin', behaviour: 'neutral' },
      { kind: 'amphibian', preset: 'quadruped', behaviour: 'hostile' },
    ],
    boss: [{ attacks: 'both', preset: 'quadruped' }, { attacks: 'ranged' }],
  };
  return [{}, ...(extra[id] ?? [])];
}

describe('mob Creator flows (ADR 0073 D2)', () => {
  it('are Creator flows in the mobs group, gated on Fabric, not on GeckoLib (ADR 0072 D6)', () => {
    for (const id of [...MOB_FLOWS, 'custom_mob']) {
      const flow = starter(id);
      expect(flow.creator?.group, id).toBe('mobs');
      // Mobs without drops, a saddle tag or a function write nothing to the data pack.
      expect(flow.layers, id).toEqual(
        ['pet', 'flying-mob', 'water-mob'].includes(id)
          ? ['resourcepack', 'msm']
          : ['resourcepack', 'datapack', 'msm'],
      );
      for (const bundle of builtInTargets) {
        expect(flow.supports?.(bundle.target), `${id} ${bundle.target.id}`).toBe(
          bundle.target.fabric !== undefined,
        );
      }
    }
  });

  it.each(MOB_FLOWS)('%s writes a complete mob on a preset with renderer auto', (id) => {
    for (const values of probes(id)) {
      const bundle = build(id, values);
      const entity = data(bundle);
      const model = (entity.components as JsonObject)['msm:animated_model'] as JsonObject;
      expect(model.renderer, id).toBe('auto');
      const geo = bundle.elements.find((entry) => entry.kind === 'msm:geo_model');
      const animations = bundle.elements.find((entry) => entry.kind === 'msm:animation');
      expect(geo?.id).toBe(model.model);
      expect(animations?.id).toBe(model.animations);
      // Every animation field names an animation of the set.
      const names = Object.keys(((animations?.data ?? {}) as JsonObject).animations as JsonObject);
      for (const field of ['idle', 'walk', 'sit', 'fly', 'swim', 'attack', 'shoot']) {
        if (typeof model[field] === 'string')
          expect(names, `${id} ${field}`).toContain(model[field]);
      }
      // The skin, the egg and every variant texture have a PNG in the bundle.
      const textures = new Set(
        bundle.assets.map((asset) => `demo:${asset.path.replace(/^textures\/|\.png$/g, '')}`),
      );
      expect(textures).toContain(model.texture);
      expect(textures).toContain(`${String(model.model)}`);
      const egg = (entity.spawn_egg as JsonObject).texture;
      expect(textures).toContain(egg);
      const variants = (entity.components as JsonObject)['msm:variants'] as JsonObject | undefined;
      for (const variant of (variants?.variants as JsonObject[] | undefined) ?? []) {
        expect(textures, `${id} ${String(variant.id)}`).toContain(variant.texture);
      }
    }
  });

  it('adds the chosen extra variants with their own skins, picked by biome when any has one', () => {
    const bundle = build('pet', {
      variant_count: 2,
      variant_1_biome: 'cold',
      variant_2_colour: '#2454c4',
    });
    expect(components(bundle)['msm:variants']).toEqual({
      choose: 'biome',
      variants: [
        { id: 'default', texture: 'demo:entity/ember_fox' },
        {
          id: 'variant_1',
          texture: 'demo:entity/ember_fox_variant_1',
          biomes: ['#minecraft:spawns_cold_variant_farm_animals'],
        },
        { id: 'variant_2', texture: 'demo:entity/ember_fox_variant_2' },
      ],
    });
    expect(bundle.assets.map((asset) => asset.path)).toEqual([
      'textures/entity/ember_fox.png',
      'textures/entity/ember_fox_variant_1.png',
      'textures/entity/ember_fox_variant_2.png',
      'textures/item/ember_fox_spawn_egg.png',
    ]);
    const [main, first, second] = bundle.assets;
    expect(Buffer.from(first?.bytes ?? []).equals(Buffer.from(main?.bytes ?? []))).toBe(false);
    expect(Buffer.from(second?.bytes ?? []).equals(Buffer.from(first?.bytes ?? []))).toBe(false);
    // Anywhere only: a random pick.
    const random = build('mount', { variant_count: 1 });
    expect((components(random)['msm:variants'] as JsonObject).choose).toBe('random');
    // None by default.
    expect(components(build('pet'))['msm:variants']).toBeUndefined();
  });

  it('uses a picked skin picture only when it has the preset texture size', async () => {
    const square = await png(64, 64);
    const fishSized = await png(64, 32);
    const pet = build('pet', { picture: square });
    expect(Buffer.from(pet.assets[0]?.bytes ?? []).toString('base64')).toBe(
      square.slice('data:image/png;base64,'.length),
    );
    const wrong = build('water-mob', { picture: square });
    expect(Buffer.from(wrong.assets[0]?.bytes ?? []).toString('base64')).not.toBe(
      square.slice('data:image/png;base64,'.length),
    );
    const fish = build('water-mob', { picture: fishSized });
    expect(Buffer.from(fish.assets[0]?.bytes ?? []).toString('base64')).toBe(
      fishSized.slice('data:image/png;base64,'.length),
    );
  });

  it('Pet: base animal, tameable with a food that never breeds it, babies and defending', () => {
    const bundle = build('pet');
    expect(data(bundle)).toMatchObject({
      display_name: 'Ember Fox',
      base: 'animal',
      category: 'creature',
      spawn: { biomes: ['#minecraft:is_forest'], rule: 'animal' },
    });
    const parts = components(bundle);
    expect(parts['msm:tameable']).toEqual({
      items: ['minecraft:sweet_berries', 'minecraft:glow_berries'],
      chance: 0.33,
      sit: true,
      follows_owner: true,
      defends_owner: true,
      tamed_health: 20,
    });
    expect(parts['msm:breedable']).toEqual({
      items: ['minecraft:cooked_beef', 'minecraft:cooked_porkchop', 'minecraft:cooked_chicken'],
      baby_scale: 0.5,
    });
    expect((parts['msm:ai_goals'] as JsonObject).goals).toEqual([
      { type: 'leap_at_target', height: 0.4 },
      { type: 'melee_attack', speed: 1, retaliate: true },
      { type: 'wander', speed: 1 },
      { type: 'look_at_player', distance: 8 },
      { type: 'look_around' },
    ]);
    // The flyer flies; no defending drops the attack; no babies drops breeding; nowhere drops spawn.
    const flyer = build('pet', { preset: 'flyer', defends: false, babies: false });
    expect(components(flyer)['msm:movement']).toMatchObject({ mode: 'fly' });
    expect(components(flyer)['msm:attack']).toBeUndefined();
    expect(components(flyer)['msm:breedable']).toBeUndefined();
    expect(data(build('pet', { spawn_biomes: 'nowhere' })).spawn).toBeUndefined();
  });

  it('Farm animal: breeds, panics, drops meat cooked when burning, rideable with the saddle bone', () => {
    const bundle = build('farm-animal');
    expect(data(bundle)).toMatchObject({
      base: 'animal',
      loot_table: 'demo:entities/moss_boar',
      spawn: { rule: 'animal' },
    });
    expect(components(bundle)['msm:breedable']).toMatchObject({
      items: ['minecraft:wheat'],
      baby_scale: 0.5,
      tempted: true,
    });
    expect(components(bundle)['msm:rideable']).toBeUndefined();
    const loot = bundle.elements.find((entry) => entry.kind === 'minecraft:loot_table');
    expect(JSON.stringify(loot?.data)).toContain('"minecraft:furnace_smelt"');
    const ridden = build('farm-animal', { rideable: true });
    expect(components(ridden)['msm:rideable']).toMatchObject({
      saddle: true,
      saddle_bone: 'saddle',
    });
    // A bird has no saddle bone; leather is never smelted.
    const bird = build('farm-animal', {
      preset: 'bird',
      rideable: true,
      drop: 'minecraft:leather',
    });
    expect((components(bird)['msm:rideable'] as JsonObject).saddle_bone).toBeUndefined();
    const birdLoot = bird.elements.find((entry) => entry.kind === 'minecraft:loot_table');
    expect(JSON.stringify(birdLoot?.data)).not.toContain('furnace_smelt');
  });

  it('Mount: rideable with the saddle bone, owner-only adds taming, the flyer flies', () => {
    const bundle = build('mount');
    expect(components(bundle)['msm:rideable']).toEqual({
      saddle: true,
      controlled_by: 'anyone',
      speed: 1,
      jump: 0.7,
      passengers: 1,
      saddle_bone: 'saddle',
    });
    expect(components(bundle)['msm:movement']).toEqual({ speed: 0.25, step_height: 1 });
    expect(components(bundle)['msm:tameable']).toBeUndefined();
    const owned = build('mount', { owner_only: true, preset: 'flyer' });
    expect(components(owned)['msm:rideable']).toMatchObject({ controlled_by: 'owner' });
    expect(components(owned)['msm:tameable']).toMatchObject({ sit: false });
    expect(components(owned)['msm:movement']).toMatchObject({ mode: 'fly' });
    expect(components(build('mount', { flying: true }))['msm:movement']).toMatchObject({
      mode: 'fly',
    });
  });

  it('Flying mob: flies; hostile ones are monsters; the shooter shoots the chosen projectile', () => {
    expect(components(build('flying-mob'))['msm:movement']).toMatchObject({
      mode: 'fly',
      flying_speed: 0.6,
      hovers: true,
    });
    expect(data(build('flying-mob')).base).toBeUndefined();
    const shooter = build('flying-mob', {
      behaviour: 'shooter',
      projectile: 'minecraft:fire_charge',
    });
    expect(data(shooter)).toMatchObject({ base: 'monster', category: 'monster' });
    expect(components(shooter)['msm:ranged_attack']).toMatchObject({
      projectile: 'minecraft:fire_charge',
      sound: 'minecraft:entity.blaze.shoot',
    });
    expect((components(shooter)['msm:ranged_attack'] as JsonObject).damage).toBeUndefined();
    expect(
      ((components(shooter)['msm:ai_goals'] as JsonObject).goals as JsonObject[])[0],
    ).toMatchObject({ type: 'ranged_attack', targets: ['minecraft:player'] });
  });

  it('Water mob: fish, dolphin-like and amphibian kinds with swimmers near speed 1 (B290)', () => {
    expect(data(build('water-mob'))).toMatchObject({
      category: 'water_ambient',
      spawn: { placement: 'in_water', rule: 'water_animal', min_group: 3, max_group: 6 },
      components: { 'msm:movement': { speed: 1, mode: 'swim', breathes_air: false } },
    });
    expect(data(build('water-mob', { kind: 'dolphin' }))).toMatchObject({
      category: 'water_creature',
      components: { 'msm:movement': { speed: 1.2, mode: 'swim', breathes_air: true } },
    });
    expect(data(build('water-mob', { kind: 'amphibian' }))).toMatchObject({
      category: 'axolotls',
      components: { 'msm:movement': { mode: 'amphibious' } },
    });
    expect(data(build('water-mob', { spawn_biomes: 'swamps' })).spawn).toMatchObject({
      biomes: ['minecraft:swamp', 'minecraft:mangrove_swamp'],
    });
  });

  it('Boss: a monster with a boss bar, scaled up, spawning only from its egg, no variants', () => {
    const bundle = build('boss');
    const entity = data(bundle);
    expect(entity).toMatchObject({ base: 'monster', category: 'monster' });
    expect(entity.spawn).toBeUndefined();
    expect(components(bundle)['msm:boss_bar']).toEqual({
      colour: 'purple',
      overlay: 'notched_10',
      darken_sky: true,
      fog: false,
      music: false,
    });
    expect(components(bundle)['msm:animated_model']).toMatchObject({ scale: 1.5 });
    expect(entity.size).toEqual({ width: 0.9, height: 2.95 });
    expect((starter('boss').parameters ?? []).some((p) => p.id.startsWith('variant'))).toBe(false);
    const both = build('boss', { attacks: 'both' });
    expect(Object.keys(components(both))).toEqual(
      expect.arrayContaining(['msm:attack', 'msm:ranged_attack']),
    );
    expect(components(build('boss', { attacks: 'ranged' }))['msm:attack']).toBeUndefined();
  });
});

describe('Custom mob additions (ADR 0073 D2)', () => {
  it('keeps the Ruby Golem as a plain mob drawn with renderer auto', () => {
    const bundle = build('custom_mob');
    expect(data(bundle).base).toBeUndefined();
    expect(components(bundle)['msm:animated_model']).toMatchObject({ renderer: 'auto' });
    expect(components(bundle)['msm:ranged_attack']).toBeUndefined();
  });

  it('adds the hostile archer: a monster shooting arrows with the shoot animation', () => {
    const bundle = build('custom_mob', { behaviour: 'archer' });
    expect(data(bundle)).toMatchObject({ base: 'monster', category: 'monster' });
    expect(components(bundle)['msm:ranged_attack']).toMatchObject({
      projectile: 'minecraft:arrow',
    });
    expect(components(bundle)['msm:attack']).toBeUndefined();
    expect(components(bundle)['msm:animated_model']).toMatchObject({ shoot: 'shoot' });
    const animations = bundle.elements.find((entry) => entry.kind === 'msm:animation');
    expect(
      Object.keys(((animations?.data ?? {}) as JsonObject).animations as JsonObject),
    ).toContain('shoot');
    expect(data(build('custom_mob', { behaviour: 'hostile' })).base).toBe('monster');
  });

  it('adds variants with their own skins', () => {
    const bundle = build('custom_mob', { variant_count: 1, variant_1_biome: 'taigas' });
    expect(components(bundle)['msm:variants']).toEqual({
      choose: 'biome',
      variants: [
        { id: 'default', texture: 'demo:entity/ruby_golem' },
        {
          id: 'variant_1',
          texture: 'demo:entity/ruby_golem_variant_1',
          biomes: ['#minecraft:is_taiga'],
        },
      ],
    });
    expect(bundle.assets.map((asset) => asset.path)).toContain(
      'textures/entity/ruby_golem_variant_1.png',
    );
  });
});

describe('mob examples (ADR 0073 D4)', () => {
  const ids = [
    'example_msm_tameable_pet',
    'example_msm_flying_mount',
    'example_msm_throwing_archer',
    'example_msm_fish_school',
    'example_msm_boss_bar',
    'example_msm_vanilla_renderer',
  ];
  const example = (id: string) => {
    const found = entityBehaviourExamples.find((entry) => entry.id === id);
    if (found === undefined) throw new Error(`No example ${id}`);
    const bundle = found.build({ namespace: 'demo', projectName: 'Demo', target, values: {} });
    if (bundle instanceof Promise) throw new Error('async');
    return { entry: found, bundle };
  };

  it('are gated on Fabric and give every texture a PNG', () => {
    for (const id of ids) {
      const { entry, bundle } = example(id);
      for (const facts of builtInTargets) {
        expect(entry.supports?.(facts.target), id).toBe(facts.target.fabric !== undefined);
      }
      const entity = data(bundle);
      const textures = new Set(
        bundle.assets.map((asset) => `demo:${asset.path.replace(/^textures\/|\.png$/g, '')}`),
      );
      const variants = (entity.components as JsonObject)['msm:variants'] as JsonObject | undefined;
      for (const variant of (variants?.variants as JsonObject[] | undefined) ?? []) {
        expect(textures, `${id} ${String(variant.id)}`).toContain(variant.texture);
      }
    }
  });

  it('cover taming, riding, a thrown project item, biome variants, a boss bar and the vanilla renderer', () => {
    expect(components(example('example_msm_tameable_pet').bundle)['msm:tameable']).toBeDefined();
    expect(components(example('example_msm_flying_mount').bundle)['msm:rideable']).toMatchObject({
      saddle_bone: 'saddle',
    });
    const archer = example('example_msm_throwing_archer').bundle;
    const projectile = (components(archer)['msm:ranged_attack'] as JsonObject).projectile;
    const item = archer.elements.find((entry) => entry.id === projectile);
    expect(item?.kind).toBe('msm:item');
    expect(((item?.data ?? {}) as JsonObject).components).toHaveProperty('msm:throwable');
    expect(components(example('example_msm_fish_school').bundle)['msm:variants']).toMatchObject({
      choose: 'biome',
    });
    expect(components(example('example_msm_boss_bar').bundle)['msm:boss_bar']).toBeDefined();
    expect(
      components(example('example_msm_vanilla_renderer').bundle)['msm:animated_model'],
    ).toMatchObject({ renderer: 'vanilla' });
  });
});
