/**
 * `msm:effect` templates (ADR 0055 D11) and `msm:potion` templates (ADR 0063 D10). They use vanilla attributes, sounds and particles
 * only, and event ids derived from the element's own id. The icon is not part of the data:
 * the effect shows the missing icon until `assets/<ns>/textures/mob_effect/<path>.png` exists.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { EFFECT_KIND, POTION_KIND } from '../kinds';
import { displayName, ownEvent } from './shared';

const CATEGORY = 'Effects';

export const effectTemplates: readonly ElementTemplate[] = [
  {
    id: 'msm_effect_status',
    kind: EFFECT_KIND,
    category: CATEGORY,
    title: 'Status effect',
    description:
      'A good effect with its own colour that plays a chime and sparkles once when it starts. Give it with a drink, a throwable or the /effect command.',
    data: (context) => {
      const start = ownEvent(context, 'start');
      return {
        format: 1,
        display_name: displayName(context.path),
        category: 'beneficial',
        color: 0x5ad1e8,
        components: { 'msm:on_start': { event: start } },
        events: {
          [start]: {
            actions: [
              { type: 'play_sound', sound: 'minecraft:block.amethyst_block.chime' },
              { type: 'spawn_particle', particle: 'minecraft:end_rod', count: 8, spread: 0.4 },
            ],
          },
        },
      };
    },
  },
  {
    id: 'msm_effect_damage_over_time',
    kind: EFFECT_KIND,
    category: CATEGORY,
    title: 'Damage over time effect',
    description:
      'A harmful effect like poison: it hurts its holder by half a heart every second, faster at higher levels.',
    data: (context) => {
      const tick = ownEvent(context, 'tick');
      return {
        format: 1,
        display_name: displayName(context.path),
        category: 'harmful',
        color: 0x4e9331,
        components: {
          'msm:on_tick': { event: tick, interval_ticks: 20, faster_per_level: true },
        },
        events: { [tick]: { actions: [{ type: 'damage', amount: 1 }] } },
      };
    },
  },
  {
    id: 'msm_effect_stat_boost',
    kind: EFFECT_KIND,
    category: CATEGORY,
    title: 'Stat boost effect',
    description:
      'A good effect that makes its holder 20% faster and hit 1 harder per level, removed again when the effect ends.',
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      category: 'beneficial',
      color: 0xffc700,
      attribute_modifiers: [
        {
          attribute: 'minecraft:movement_speed',
          amount: 0.2,
          operation: 'add_multiplied_total',
        },
        { attribute: 'minecraft:attack_damage', amount: 1, operation: 'add_value' },
      ],
    }),
  },
  {
    id: 'msm_potion_custom_effect',
    kind: POTION_KIND,
    category: CATEGORY,
    title: 'Potion of a custom effect',
    description:
      'A potion of the status effect "<this id>_effect", brewed from an awkward potion and glow berries, with splash and lingering versions and tipped arrows. Make that status effect (or pick your own), and export the project as a Fabric mod.',
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      effects: [{ id: `${context.id}_effect`, duration_ticks: 3600 }],
      brewing: { reagent: 'minecraft:glow_berries' },
    }),
  },
  {
    id: 'msm_potion_long_strong',
    kind: POTION_KIND,
    category: CATEGORY,
    title: 'Potion with longer and stronger versions',
    description:
      'A Haste potion brewed from an awkward potion and a honeycomb. Redstone makes it last 8 minutes, glowstone dust makes it Haste II for 1:30, like vanilla potions. Splash and lingering versions and tipped arrows included. Needs the Fabric mod export.',
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      effects: [{ id: 'minecraft:haste', duration_ticks: 3600 }],
      brewing: { reagent: 'minecraft:honeycomb' },
      long: { duration_ticks: 9600 },
      strong: { amplifier: 1, duration_ticks: 1800 },
    }),
  },
];
