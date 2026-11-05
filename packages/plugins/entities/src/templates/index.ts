/**
 * "New element" templates of `@msm/plugin-entities` (ADR 0028 D6): Creature, Monster and
 * Ambient critter. They use vanilla ids only, plus ids derived from the new element's own id:
 * the model `<ns>:entity/<path>`, the animation set `<ns>:entity/<path>_animations`, the
 * texture `<ns>:entity/<path>` and the egg texture `<ns>:item/<path>_spawn_egg`. The model and
 * animation set do not exist until the user adds or imports them, so the validators report
 * them; each description says so.
 */
import type { ElementTemplate, JsonObject, TemplateContext } from '@msm/plugin-api';
import { ENTITY_KIND } from '../kinds';

const CATEGORY = 'Entities';

const MODEL_NOTE =
  'Its model and animations are named after the entity and are reported missing until you add or import them (for example from Blockbench).';

/** `ruby_golem` (or `mobs/ruby_golem`) becomes `Ruby Golem`: the last path segment in title case. */
export function displayName(path: string): string {
  const last = path.split('/').pop() ?? path;
  return last
    .split(/[_\-.]+/)
    .filter((word) => word.length > 0)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

/** The `msm:animated_model` of a template, with ids derived from the element's own id. */
function animatedModel(context: TemplateContext, attack: boolean): JsonObject {
  const own = `${context.namespace}:entity/${context.path}`;
  return {
    model: own,
    animations: `${own}_animations`,
    texture: own,
    idle: 'idle',
    walk: 'walk',
    ...(attack ? { attack: 'attack' } : {}),
  };
}

const eggTexture = (context: TemplateContext): string =>
  `${context.namespace}:item/${context.path}_spawn_egg`;

export const entitiesTemplates: readonly ElementTemplate[] = Object.freeze([
  {
    id: 'msm_entity_creature',
    kind: ENTITY_KIND,
    category: CATEGORY,
    title: 'Creature',
    description: `A passive mob that wanders, looks at players and spawns in forests, with a spawn egg. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      category: 'creature',
      size: { width: 0.9, height: 1.4 },
      spawn: { biomes: ['#minecraft:is_forest'], weight: 8, min_group: 2, max_group: 4 },
      spawn_egg: { texture: eggTexture(context) },
      components: {
        'msm:health': { max: 10 },
        'msm:movement': { speed: 0.25 },
        'msm:ai_goals': {
          goals: [{ type: 'wander' }, { type: 'look_at_player' }, { type: 'look_around' }],
        },
        'msm:animated_model': animatedModel(context, false),
      },
    }),
  },
  {
    id: 'msm_entity_monster',
    kind: ENTITY_KIND,
    category: CATEGORY,
    title: 'Monster',
    description: `A hostile mob that chases and hits players, fights back when hurt and spawns in the dark, with a spawn egg. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      category: 'monster',
      size: { width: 0.6, height: 1.95 },
      spawn: {
        biomes: ['#minecraft:is_overworld'],
        weight: 50,
        min_group: 1,
        max_group: 3,
        rule: 'monster',
      },
      spawn_egg: { texture: eggTexture(context) },
      components: {
        'msm:health': { max: 24 },
        'msm:movement': { speed: 0.23, follow_range: 32 },
        'msm:attack': { damage: 3 },
        'msm:ai_goals': {
          goals: [
            {
              type: 'melee_attack',
              speed: 1,
              targets: ['minecraft:player'],
              retaliate: true,
            },
            { type: 'wander', speed: 0.8 },
            { type: 'look_at_player', distance: 8 },
            { type: 'look_around' },
          ],
        },
        'msm:animated_model': animatedModel(context, true),
      },
    }),
  },
  {
    id: 'msm_entity_ambient',
    kind: ENTITY_KIND,
    category: CATEGORY,
    title: 'Ambient critter',
    description: `A small ambient mob that runs away from players, without a spawn egg. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      category: 'ambient',
      size: { width: 0.4, height: 0.4 },
      spawn_egg: false,
      components: {
        'msm:health': { max: 4 },
        'msm:movement': { speed: 0.3 },
        'msm:ai_goals': {
          goals: [
            { type: 'flee', from: ['minecraft:player'], distance: 6, speed: 1, sprint_speed: 1.4 },
            { type: 'wander' },
            { type: 'look_around' },
          ],
        },
        'msm:animated_model': animatedModel(context, false),
      },
    }),
  },
] satisfies ElementTemplate[]);
