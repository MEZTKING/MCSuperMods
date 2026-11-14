/**
 * Golden tests of lowering: every sample is lowered for every built-in target, each output is
 * validated against the schema it declares, and the outputs are compared with
 * `fixtures/<target id>/expected/entity/<sample>.json`. Set `UPDATE_GOLDENS=1` to rewrite the
 * expected files instead of comparing.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Json, OutputFile, ResourceLocation } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { entityKind } from '../src/index';
import { blockingProblems, element, indexesFor, sortedJson } from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

interface Sample {
  name: string;
  id: ResourceLocation;
  data: Json;
}

/** The kind's default data, plus samples covering every editor field and component. */
const SAMPLES: Sample[] = [
  { name: 'default', id: 'demo:sample', data: entityKind.defaultData as Json },
  {
    name: 'ruby_golem',
    id: 'example:ruby_golem',
    data: {
      format: 1,
      display_name: 'Ruby Golem',
      category: 'creature',
      size: { width: 0.9, height: 1.6 },
      eye_height: 1.4,
      loot_table: 'example:entities/ruby_golem_rare',
      sounds: {
        ambient: 'minecraft:entity.iron_golem.repair',
        hurt: 'minecraft:entity.iron_golem.hurt',
        death: 'minecraft:entity.iron_golem.death',
        step: 'minecraft:entity.iron_golem.step',
        ambient_interval_ticks: 100,
      },
      spawn_egg: {
        creative_tab: 'minecraft:spawn_eggs',
        texture: 'example:item/ruby_golem_spawn_egg',
        display_name: 'Golem Egg',
      },
      spawn: {
        biomes: ['#minecraft:is_forest', 'minecraft:plains'],
        weight: 6,
        min_group: 1,
        max_group: 2,
        placement: 'on_ground',
        heightmap: 'motion_blocking_no_leaves',
        rule: 'mob',
      },
      components: {
        'msm:health': { max: 30 },
        'msm:movement': {
          speed: 0.28,
          follow_range: 24,
          knockback_resistance: 0.2,
          swims: true,
          fire_immune: false,
        },
        'msm:attack': { damage: 4, knockback: 0.5, on_attack: 'example:thump' },
        'msm:ai_goals': {
          goals: [
            { type: 'wander', speed: 1, avoid_water: true },
            { type: 'look_at_player', distance: 8 },
            { type: 'look_around' },
            {
              type: 'melee_attack',
              speed: 1.2,
              targets: ['minecraft:zombie'],
              must_see: true,
              retaliate: true,
              priority: 1,
            },
            {
              type: 'flee',
              from: ['minecraft:creeper'],
              distance: 6,
              speed: 1,
              sprint_speed: 1.2,
            },
            {
              type: 'follow',
              entities: ['minecraft:player'],
              speed: 1,
              stop_distance: 2,
              range: 16,
            },
          ],
        },
        'msm:animated_model': {
          model: 'example:entity/ruby_golem',
          animations: 'example:entity/ruby_golem_animations',
          texture: 'example:entity/ruby_golem',
          scale: 1,
          idle: 'idle',
          walk: 'walk',
          attack: 'attack',
          transition_ticks: 2,
        },
        'msm:on_hurt': { event: 'example:ouch' },
        'msm:on_death': { event: 'example:shatter' },
        'msm:on_interact': { event: 'example:pat' },
      },
      events: {
        'example:thump': {
          actions: [
            { type: 'play_sound', sound: 'minecraft:entity.iron_golem.attack' },
            { type: 'play_animation', animation: 'attack' },
          ],
        },
        'example:ouch': {
          actions: [{ type: 'play_animation', animation: 'idle', controller: 'msm_triggered' }],
        },
        'example:shatter': {
          actions: [
            { type: 'spawn_particle', particle: 'minecraft:crit', count: 12, spread: 0.5 },
            { type: 'run_function', function: 'example:golem/death' },
          ],
        },
        'example:pat': { actions: [{ type: 'trigger_event', event: 'example:ouch' }] },
      },
    },
  },
  {
    name: 'shade_egg_without_texture',
    id: 'example:shade',
    data: {
      format: 1,
      display_name: 'Shade',
      category: 'monster',
      size: { width: 0.6, height: 1.9 },
      spawn_egg: {},
      components: {
        'msm:animated_model': { model: 'example:entity/shade', texture: 'example:entity/shade' },
      },
    },
  },
  {
    name: 'moth_no_egg',
    id: 'example:mobs/moth',
    data: {
      format: 1,
      display_name: 'Moth',
      category: 'ambient',
      size: { width: 0.3, height: 0.3 },
      spawn_egg: false,
      components: {
        'msm:animated_model': { model: 'example:entity/moth', texture: 'example:entity/moth' },
      },
    },
  },
  {
    // A saddled, tameable, breeding mount with every field of ADRs 0070-0072: the definition
    // carries them all and lowering adds the saddle tag entry (ADR 0071 D7).
    name: 'mx-saddled_mount',
    id: 'example:shade',
    data: {
      format: 1,
      base: 'animal',
      display_name: 'Shade Steed',
      category: 'creature',
      size: { width: 1.2, height: 1.4 },
      spawn_egg: false,
      spawn: {
        biomes: ['minecraft:plains'],
        weight: 4,
        min_group: 1,
        max_group: 3,
        rule: 'animal',
      },
      components: {
        'msm:movement': {
          speed: 0.3,
          mode: 'fly',
          flying_speed: 0.5,
          hovers: false,
          step_height: 1,
        },
        'msm:ranged_attack': {
          projectile: 'minecraft:snowball',
          speed: 1.2,
          inaccuracy: 4,
          interval_ticks: 30,
          charge_ticks: 10,
          range: 12,
          sound: 'minecraft:entity.snowball.throw',
          on_shoot: 'example:shot',
        },
        'msm:ai_goals': {
          goals: [
            { type: 'ranged_attack', speed: 1, strafe: true, targets: ['minecraft:zombie'] },
            { type: 'tempt', items: ['minecraft:wheat'], speed: 1.1, scared: true },
            { type: 'panic', speed: 1.4 },
            { type: 'leap_at_target', height: 0.5 },
            { type: 'wander' },
          ],
        },
        'msm:tameable': {
          items: ['minecraft:bone'],
          chance: 0.5,
          sit: true,
          follows_owner: true,
          follow: { speed: 1.2, start_distance: 8, stop_distance: 3 },
          defends_owner: false,
          tamed_health: 40,
          on_tame: 'example:tamed',
        },
        'msm:breedable': {
          items: ['minecraft:wheat'],
          baby_scale: 0.4,
          grow_up_ticks: 12000,
          tempted: false,
          follow_parents: true,
          on_breed: 'example:born',
        },
        'msm:rideable': {
          controlled_by: 'owner',
          speed: 1.5,
          jump: 0.7,
          passengers: 2,
          rider_offset: [0, 1.2, -0.2],
          saddle_bone: 'saddle',
          on_mount: 'example:mounted',
        },
        'msm:variants': {
          choose: 'biome',
          variants: [
            { id: 'plain', texture: 'example:entity/ruby_golem' },
            {
              id: 'forest',
              texture: 'example:entity/ruby_golem',
              weight: 3,
              biomes: ['#minecraft:is_forest'],
            },
          ],
        },
        'msm:boss_bar': {
          colour: 'red',
          overlay: 'notched_10',
          darken_sky: true,
          fog: false,
          music: true,
          range: 48,
        },
        'msm:animated_model': {
          model: 'example:entity/shade',
          animations: 'example:entity/shade_animations',
          texture: 'example:entity/shade',
          renderer: 'vanilla',
          idle: 'idle',
          walk: 'walk',
          sit: 'sit',
          fly: 'fly',
          swim: 'swim',
          shoot: 'shoot',
        },
      },
      events: {
        'example:shot': { actions: [{ type: 'play_animation', animation: 'shoot' }] },
        'example:tamed': {
          actions: [{ type: 'spawn_particle', particle: 'minecraft:heart', count: 5 }],
        },
        'example:born': {
          actions: [{ type: 'play_sound', sound: 'minecraft:entity.horse.ambient' }],
        },
        'example:mounted': {
          actions: [{ type: 'play_sound', sound: 'minecraft:entity.horse.saddle' }],
        },
      },
    },
  },
  {
    // A rideable swimmer without a saddle: no saddle tag entry; monster base in a water category.
    name: 'mx-unsaddled_swimmer',
    id: 'example:mobs/moth',
    data: {
      format: 1,
      base: 'monster',
      category: 'water_creature',
      size: { width: 0.8, height: 0.6 },
      spawn_egg: false,
      spawn: {
        biomes: ['minecraft:ocean'],
        weight: 2,
        min_group: 1,
        max_group: 1,
        placement: 'in_water',
        rule: 'water_animal',
      },
      components: {
        'msm:movement': { mode: 'swim', breathes_air: false, dry_out_ticks: 200 },
        'msm:rideable': { saddle: false },
        'msm:animated_model': {
          model: 'example:entity/moth',
          texture: 'example:entity/moth',
          renderer: 'auto',
        },
      },
    },
  },
];

const fixturesRoot = new URL('./fixtures/', import.meta.url);

const fixtureUrl = (targetId: string, sample: Sample): URL =>
  new URL(`${targetId}/expected/${entityKind.folder}/${sample.name}.json`, fixturesRoot);

const recorded = (file: OutputFile): Record<string, unknown> => ({
  contents: file.contents,
  layer: file.layer,
  merge: file.merge,
  path: file.path,
  schema: file.schema,
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'golden lowering for %s',
  (targetId, bundle) => {
    it.each(SAMPLES.map((sample) => [sample.name, sample] as const))(
      '%s',
      async (_label, sample) => {
        const files = await entityKind.lower(
          element(entityKind.id, sample.id, sample.data),
          bundle.target,
        );
        const indexes = await indexesFor(bundle);
        const problems = (schema: string, value: Json) => blockingProblems(indexes, schema, value);
        expect(problems(entityKind.schema, sample.data)).toEqual([]);
        for (const file of files) {
          if (file.schema === undefined) continue;
          expect(problems(file.schema, file.contents as Json), file.path).toEqual([]);
        }
        expect(
          await entityKind.lower(element(entityKind.id, sample.id, sample.data), bundle.target),
        ).toEqual(files);

        const actual = sortedJson(files.map(recorded));
        const url = fixtureUrl(targetId, sample);
        if (UPDATE) {
          await mkdir(dirname(fileURLToPath(url)), { recursive: true });
          await writeFile(url, actual);
        }
        expect(actual).toBe(await readFile(url, 'utf8'));
      },
    );
  },
);
