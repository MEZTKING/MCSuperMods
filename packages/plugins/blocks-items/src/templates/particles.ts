/**
 * Particle templates (ADR 0081 D4), category "Particles": three `msm:particle` types drawn with
 * vanilla sprites (named, never bundled) and a block that shows ambient particles. Sprite names
 * checked against the vendored texture registry of both targets (`particle/glow`,
 * `particle/cherry_0` to `_11`, `particle/generic_0` to `_7`).
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { BLOCK_KIND, PARTICLE_KIND } from '../kinds';
import { displayName } from './shared';

const CATEGORY = 'Particles';

export const particleTemplates: readonly ElementTemplate[] = [
  {
    id: 'msm_particle_glowing_spark',
    kind: PARTICLE_KIND,
    category: CATEGORY,
    title: 'Glowing spark',
    description:
      "A small warm spark that glows in the dark, drifts slowly upwards and fades out. Use it in a spawn_particle action or as a block's ambient particle.",
    data: () => ({
      format: 1,
      textures: ['minecraft:glow'],
      lifetime: { min: 20, max: 40 },
      size: 0.12,
      size_end: 0.04,
      gravity: -0.05,
      friction: 0.96,
      color: 0xffd060,
      fade: 'out',
      emissive: true,
    }),
  },
  {
    id: 'msm_particle_falling_petal',
    kind: PARTICLE_KIND,
    category: CATEGORY,
    title: 'Falling petal',
    description:
      'A pink petal that picks one of three cherry petal pictures, falls gently and spins as it goes.',
    data: () => ({
      format: 1,
      textures: ['minecraft:cherry_0', 'minecraft:cherry_1', 'minecraft:cherry_2'],
      animation: 'random',
      lifetime: { min: 60, max: 100 },
      size: 0.15,
      gravity: 0.08,
      friction: 0.95,
      spin: 4,
    }),
  },
  {
    id: 'msm_particle_smoke_puff',
    kind: PARTICLE_KIND,
    category: CATEGORY,
    title: 'Smoke puff',
    description:
      "A grey puff that rises, grows and fades out, running through vanilla's smoke pictures from large to small.",
    data: () => ({
      format: 1,
      textures: [
        'minecraft:generic_7',
        'minecraft:generic_6',
        'minecraft:generic_5',
        'minecraft:generic_4',
        'minecraft:generic_3',
        'minecraft:generic_2',
        'minecraft:generic_1',
        'minecraft:generic_0',
      ],
      animation: 'age',
      lifetime: 30,
      size: 0.25,
      size_end: 0.5,
      gravity: -0.1,
      friction: 0.9,
      color: 0xaaaaaa,
      alpha: 0.8,
      fade: 'out',
    }),
  },
  {
    id: 'msm_block_ambient_particles',
    kind: BLOCK_KIND,
    category: CATEGORY,
    title: 'Block with ambient particles',
    description:
      'A glowing block that gives off end rod sparkles by itself, as a torch shows its flame. Swap the particle for one of your own.',
    data: (context) => ({
      format: 1,
      model: 'minecraft:block/purpur_block',
      display_name: displayName(context.path),
      sound_type: 'stone',
      loot: 'self',
      item: { creative_tab: 'minecraft:building_blocks' },
      components: {
        'msm:breakable': { hardness: 1.5, resistance: 6, tool: 'pickaxe' },
        'msm:light_emitter': { level: 10 },
        'msm:ambient_particles': {
          particle: 'minecraft:end_rod',
          chance: 0.3,
          count: 1,
          spread: [0.6, 0.6, 0.6],
          velocity: [0, 0.02, 0],
        },
      },
    }),
  },
];
