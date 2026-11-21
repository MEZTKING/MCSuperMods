/**
 * "New element" templates of ADR 0098 (category "Villagers and traders"): a wandering merchant
 * (`msm:trader` with vanilla's wandering trader sets), a pack mule (`msm:storage` that needs a
 * chest, ridden by its owner), a shoulder pet (`msm:shoulder_riding` on a small tamed animal) and
 * a village job (`msm:villager_profession`). They use vanilla ids only, plus ids derived from the
 * new element's own id: the mobs' model `<ns>:entity/<path>`, animation set
 * `<ns>:entity/<path>_animations`, texture `<ns>:entity/<path>` and egg texture
 * `<ns>:item/<path>_spawn_egg`; the job's site block `<ns>:<path>_job_site` and picture
 * `<ns>:entity/villager/profession/<path>` (the place the game reads it from). None of those
 * exist until the user adds them, so the validators report them; each description says so.
 */
import type { ElementTemplate, JsonObject, TemplateContext } from '@msm/plugin-api';
import { ENTITY_KIND, PROFESSION_KIND } from '../../kinds';
import { displayName } from '../index';

/** The picker category of these templates. */
export const VILLAGER_TEMPLATE_CATEGORY = 'Villagers and traders';

const MODEL_NOTE =
  'Its model and animations are named after the mob and are reported missing until you add or import them (for example from Blockbench).';

/** The `msm:animated_model` of a mob template, with ids derived from the element's own id. */
function mobModel(context: TemplateContext, states: readonly string[]): JsonObject {
  const own = `${context.namespace}:entity/${context.path}`;
  return {
    model: own,
    animations: `${own}_animations`,
    texture: own,
    renderer: 'auto',
    idle: 'idle',
    walk: 'walk',
    ...Object.fromEntries(states.map((state) => [state, state])),
  };
}

const eggTexture = (context: TemplateContext): string =>
  `${context.namespace}:item/${context.path}_spawn_egg`;

/** The job site block of the village job template: `<ns>:<path>_job_site`. */
export const jobSiteId = (context: Pick<TemplateContext, 'namespace' | 'path'>): string =>
  `${context.namespace}:${context.path}_job_site`;

/** The profession picture the game reads: `<ns>:entity/villager/profession/<path>`. */
export const professionTextureId = (context: Pick<TemplateContext, 'namespace' | 'path'>): string =>
  `${context.namespace}:entity/villager/profession/${context.path}`;

const LOOKING_ABOUT = [{ type: 'wander' }, { type: 'look_at_player' }, { type: 'look_around' }];

export const villagerTemplates: readonly ElementTemplate[] = Object.freeze([
  {
    id: 'msm_entity_wandering_merchant',
    kind: ENTITY_KIND,
    category: VILLAGER_TEMPLATE_CATEGORY,
    title: 'Wandering merchant',
    description: `A mob that trades with you through the villager trading screen: it sells what vanilla's wandering trader sells, and its rarer wares unlock as you trade. Offers refill twice a day. With a spawn egg. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      category: 'creature',
      size: { width: 0.6, height: 1.95 },
      spawn_egg: { texture: eggTexture(context) },
      components: {
        'msm:health': { max: 20 },
        'msm:movement': { speed: 0.3 },
        'msm:ai_goals': { goals: structuredClone(LOOKING_ABOUT) },
        'msm:trader': {
          trade_sets: [
            { trade_set: 'minecraft:wandering_trader/common' },
            { trade_set: 'minecraft:wandering_trader/uncommon' },
          ],
          levels: true,
          restock: 'twice_a_day',
        },
        'msm:animated_model': mobModel(context, []),
      },
    }),
  },
  {
    id: 'msm_entity_pack_mule',
    kind: ENTITY_KIND,
    category: VILLAGER_TEMPLATE_CATEGORY,
    title: 'Pack mule',
    description: `An animal you tame with apples and ride with a saddle. Use a chest on it to give it three rows of storage; open them with the inventory key while riding, or by using it while sneaking. Spawns in plains, with a spawn egg. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      base: 'animal',
      category: 'creature',
      size: { width: 1.4, height: 1.6 },
      spawn: {
        biomes: ['minecraft:plains'],
        weight: 3,
        min_group: 1,
        max_group: 2,
        rule: 'animal',
      },
      spawn_egg: { texture: eggTexture(context) },
      components: {
        'msm:health': { max: 22 },
        'msm:movement': { speed: 0.175 },
        'msm:tameable': {
          items: ['minecraft:apple'],
          chance: 0.25,
          sit: false,
          follows_owner: false,
          defends_owner: false,
        },
        'msm:rideable': { saddle: true, controlled_by: 'owner', speed: 1, jump: 0.5 },
        'msm:storage': { rows: 3, needs_chest: true },
        'msm:ai_goals': {
          goals: [
            { type: 'panic', speed: 1.2 },
            { type: 'tempt', items: ['minecraft:apple'], speed: 1 },
            ...structuredClone(LOOKING_ABOUT),
          ],
        },
        'msm:animated_model': mobModel(context, []),
      },
    }),
  },
  {
    id: 'msm_entity_shoulder_pet',
    kind: ENTITY_KIND,
    category: VILLAGER_TEMPLATE_CATEGORY,
    title: 'Shoulder pet',
    description: `A small animal you tame with sweet berries. Once tamed it follows you, sits when you right-click it, and jumps onto your shoulder when you stand still near it; it jumps down when you are hurt, sneak, ride, swim or fly. Spawns in forests, with a spawn egg. ${MODEL_NOTE}`,
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      base: 'animal',
      category: 'creature',
      size: { width: 0.5, height: 0.5 },
      spawn: {
        biomes: ['#minecraft:is_forest'],
        weight: 4,
        min_group: 1,
        max_group: 2,
        rule: 'animal',
      },
      spawn_egg: { texture: eggTexture(context) },
      components: {
        'msm:health': { max: 6 },
        'msm:movement': { speed: 0.3 },
        'msm:tameable': {
          items: ['minecraft:sweet_berries'],
          chance: 0.33,
          sit: true,
          follows_owner: true,
          defends_owner: false,
        },
        'msm:shoulder_riding': {},
        'msm:ai_goals': {
          goals: [{ type: 'panic', speed: 1.4 }, ...structuredClone(LOOKING_ABOUT)],
        },
        'msm:animated_model': mobModel(context, ['sit']),
      },
    }),
  },
  {
    id: 'msm_villager_profession',
    kind: PROFESSION_KIND,
    category: VILLAGER_TEMPLATE_CATEGORY,
    title: 'Village job',
    description:
      'A new job for vanilla villagers: a villager without a job takes it at its job site block, a block of your own named after the job (make it, or pick another of your blocks). Five trade levels are created for you; add trades to their trade tags. The picture is drawn over the villager at entity/villager/profession/ and is reported missing until you add it.',
    data: (context) => ({
      format: 1,
      display_name: displayName(context.path),
      job_site: jobSiteId(context),
      textures: { villager: professionTextureId(context) },
    }),
  },
] satisfies ElementTemplate[]);
