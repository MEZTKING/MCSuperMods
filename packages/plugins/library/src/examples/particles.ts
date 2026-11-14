/**
 * The particle examples (ADR 0081 D5): the per-kind examples of `msm:particle` ("Drifting
 * ember", a particle of the project's own drawn from four frames) and `minecraft:particle`
 * ("Blue flame", a resource pack retexture of vanilla's flame), and the behaviour example
 * "Firefly jar": the particle `firefly_glow`, a glass jar block that shows it by itself
 * (`msm:ambient_particles`) and a "Spark wand" whose use sends a burst of it with `motion` and a
 * cloud of coloured dust through a vanilla options object.
 *
 * Project particles, the jar and the wand need the Fabric mod jar export; nothing names them in
 * a biome, dimension type, timeline, enchantment or function, so the vanilla data pack only
 * leaves out the jar's loot table (ADR 0066 D3). The blue flame works in a plain resource pack.
 */
import type { ExampleProject, JsonObject } from '@msm/plugin-api';
import { COLOURS, element, KINDS, rl, texture } from '../content/bundle';
import { nameForms } from '../content/parameters';
import {
  DEFAULT_PARTICLE_ANSWERS,
  DEFAULT_PARTICLE_COLOUR,
  PARTICLE_KINDS,
  particleContent,
} from '../content/particle';
import { hasFabric } from '../content/supports';
import { defineExample } from './define';

/** The gallery category of the particle kinds' examples. */
const PARTICLES = 'Particles';

/** The gallery category of the firefly jar (the block examples' own). */
const BLOCKS = 'Blocks';

/** The per-kind examples of `minecraft:particle` and `msm:particle`, in kind order. */
export const particleKindExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_particle',
    title: 'Blue flame',
    description:
      "Gives vanilla's flame particle a blue picture of the project's own, in a plain resource pack.",
    kind: PARTICLE_KINDS.description,
    category: PARTICLES,
    tags: ['particle', 'retexture', 'resource pack'],
    build: ({ namespace }) => {
      const sprite = rl(namespace, 'blue_flame');
      return {
        elements: [
          element(
            'minecraft:flame',
            PARTICLE_KINDS.description,
            { textures: [sprite] },
            `A particle description lists the pictures the client draws a particle type with, from the particle atlas: ${sprite} is the picture textures/particle/blue_flame.png of this project. Named minecraft:flame, it replaces the pictures of vanilla's flame particle, so torches, furnaces and spawners show blue flames. A description in a resource pack needs no mod: it only changes the look, never how the particle moves or how long it lives. List several pictures to animate it; a description for a type that does not exist is ignored.`,
          ),
        ],
        assets: [texture(namespace, 'particle/blue_flame', 'particle_orb', COLOURS.sapphire)],
      };
    },
  }),
  defineExample({
    id: 'example_msm_particle',
    title: 'Drifting ember',
    description:
      'A particle type of its own: a small amber spark that twinkles, glows in the dark, floats up and fades out. Try it with /particle.',
    kind: PARTICLE_KINDS.particle,
    category: PARTICLES,
    tags: ['particle', 'animation', 'emissive', 'mod'],
    supports: hasFabric,
    build: ({ namespace }) =>
      particleContent(namespace, nameForms('Drifting Ember'), {
        ...DEFAULT_PARTICLE_ANSWERS,
        colour: COLOURS.amber,
        size: 'small',
        lifetime: 'long',
        show: 'none',
      }),
  }),
];

/** The firefly jar (ADR 0081 D5), a blocks and items behaviour example. */
export const particleExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_msm_firefly_jar',
    title: 'Firefly jar',
    description:
      'A glowing firefly particle of its own, a glass jar that shows it by itself (ambient particles) and a spark wand that sends a burst of fireflies upwards (motion) with a cloud of coloured dust (an options object).',
    kind: KINDS.block,
    category: BLOCKS,
    tags: ['particle', 'ambient_particles', 'spawn_particle', 'on_use', 'mod'],
    supports: hasFabric,
    build: ({ namespace }) => {
      const glow = rl(namespace, 'firefly_glow');
      const jar = rl(namespace, 'firefly_jar');
      const wand = rl(namespace, 'spark_wand');
      const used = rl(namespace, 'spark_wand_used');
      const content = particleContent(namespace, nameForms('Firefly Glow'), {
        ...DEFAULT_PARTICLE_ANSWERS,
        look: 'orb',
        colour: DEFAULT_PARTICLE_COLOUR,
        size: 'small',
        show: 'none',
      });
      const elements = content.elements.map((entry) => {
        if (entry.id !== glow) return entry;
        const data: JsonObject = {
          ...(entry.data as JsonObject),
          lifetime: { min: 40, max: 80 },
          gravity: -0.02,
          friction: 0.9,
          fade: 'in_out',
        };
        return {
          ...entry,
          data,
          notes: `A firefly of its own (msm:particle): a round glow drawn from textures/particle/firefly_glow_0.png to _3.png that pulses (animation loop, a frame every 4 ticks) and glows in the dark (emissive). Each lives 40 to 80 ticks (lifetime min and max), fades in and out (fade in_out) and rises very slowly (gravity -0.02) while friction 0.9 slows any push. Lowering lists the pictures in the description assets/${namespace}/particles/firefly_glow.json. It needs the Fabric mod jar export, on the server and on every client.`,
        };
      });
      elements.push(
        element(
          jar,
          KINDS.block,
          {
            format: 1,
            model: 'minecraft:block/glass',
            display_name: 'Firefly Jar',
            sound_type: 'glass',
            loot: 'self',
            item: { creative_tab: 'minecraft:functional_blocks' },
            components: {
              'msm:breakable': { hardness: 0.3, resistance: 0.3 },
              'msm:shape': { preset: 'full', see_through: true },
              'msm:light_emitter': { level: 6 },
              'msm:ambient_particles': {
                particle: glow,
                chance: 0.3,
                spread: [0.3, 0.3, 0.3],
              },
            },
          },
          `A glass jar with fireflies inside: msm:ambient_particles gives a 30 per cent chance each tick of one ${glow} near its centre (the default offset), within 0.3 blocks (spread). The client draws them near the player only, so they cost the server nothing. msm:shape see_through draws it as glass, so the fireflies show through, and it gives light of level 6. It drops itself and reuses the vanilla glass model.`,
        ),
        element(
          wand,
          KINDS.item,
          {
            format: 1,
            model: 'minecraft:item/blaze_rod',
            display_name: 'Spark Wand',
            max_stack_size: 1,
            rarity: 'uncommon',
            creative_tab: 'minecraft:tools_and_utilities',
            components: { 'msm:on_use': { event: used, cooldown_ticks: 20 } },
            events: {
              [used]: {
                actions: [
                  {
                    type: 'spawn_particle',
                    particle: glow,
                    count: 12,
                    spread: 0.4,
                    motion: [0, 0.15, 0],
                  },
                  {
                    type: 'spawn_particle',
                    particle: { type: 'minecraft:dust', color: [1, 0.82, 0.38], scale: 1.5 },
                    count: 24,
                    spread: 0.8,
                  },
                  {
                    type: 'play_sound',
                    sound: 'minecraft:block.amethyst_block.chime',
                    pitch: 1.5,
                  },
                ],
              },
            },
          },
          `A wand that sends fireflies flying: msm:on_use fires ${used} at most once a second. Its first spawn_particle sends 12 ${glow} within 0.4 blocks, each starting straight up at 0.15 blocks a tick (motion, one packet per particle). The second sends 24 particles of vanilla dust through an options object: type names the particle and color (red, green and blue from 0 to 1) and scale are its options. It reuses the vanilla blaze rod model.`,
        ),
      );
      return { elements, assets: content.assets };
    },
  }),
];
