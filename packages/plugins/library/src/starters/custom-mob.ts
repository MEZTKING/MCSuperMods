/**
 * The Custom mob starter (ADR 0028, ADR 0029; wizard parameters ADR 0040 D2): an animated mob
 * (by default the Ruby Golem) that wanders the chosen biomes, fights back when hit (or never
 * fights, or hunts players), drops emeralds and bursts into sparks when it dies. It brings its
 * GeckoLib geo model, animation set, placeholder skin and spawn egg texture, a loot table, a
 * function and the `msm:mod` metadata. The defaults build the Ruby Golem of earlier versions
 * byte for byte. New entities need the Fabric mod jar export (with `msm_runtime` and
 * GeckoLib); the vanilla pack exports carry only the models, textures, language keys, loot
 * table and function.
 */
import type { BundleContext, ContentBundle, JsonObject, StarterParameter } from '@msm/plugin-api';
import type { Rgb } from '../assets/png';
import {
  COLOURS,
  element,
  KINDS,
  modIdFromNamespace,
  packElement,
  rl,
  skinTexture,
  texture,
} from '../content/bundle';
import { bipedAnimations, bipedGeometry } from '../content/entities';
import {
  hexFromRgb,
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  nameForms,
  numberValue,
  readValues,
  rgbFromHex,
  stringValue,
} from '../content/parameters';

/** The spawn egg's default spot colour: the ruby red at 71 per cent, as earlier versions drew it. */
const EGG_SPOTS: Rgb = [139, 20, 37];

/** The biome tags the wizard offers, with the words the notes use. */
const BIOMES: readonly { tag: string; label: string; every: string; plural: string }[] = [
  { tag: '#minecraft:is_forest', label: 'Forests', every: 'every forest', plural: 'forests' },
  { tag: '#minecraft:is_taiga', label: 'Taigas', every: 'every taiga', plural: 'taigas' },
  { tag: '#minecraft:is_jungle', label: 'Jungles', every: 'every jungle', plural: 'jungles' },
  { tag: '#minecraft:is_savanna', label: 'Savannas', every: 'every savanna', plural: 'savannas' },
  {
    tag: '#minecraft:is_mountain',
    label: 'Mountains',
    every: 'every mountain biome',
    plural: 'mountains',
  },
  { tag: '#minecraft:is_badlands', label: 'Badlands', every: 'all badlands', plural: 'badlands' },
  { tag: '#minecraft:is_beach', label: 'Beaches', every: 'every beach', plural: 'beaches' },
];

/** The Custom mob wizard's questions (ADR 0040 D2), steps "Mob", "Behaviour" and "Spawning". */
export const CUSTOM_MOB_PARAMETERS: readonly StarterParameter[] = Object.freeze([
  {
    id: 'mob_name',
    label: 'Mob name',
    description: 'The English name. Ids derive from it: Ruby Golem gives ruby_golem.',
    group: 'Mob',
    type: 'string',
    default: 'Ruby Golem',
    pattern: NAME_PATTERN,
    maxLength: NAME_MAX_LENGTH,
  },
  {
    id: 'colour',
    label: 'Skin colour',
    description: 'The colour of the placeholder skin.',
    group: 'Mob',
    type: 'colour',
    default: hexFromRgb(COLOURS.ruby),
  },
  {
    id: 'egg_colour',
    label: 'Spawn egg colour',
    group: 'Mob',
    type: 'colour',
    default: hexFromRgb(COLOURS.ruby),
  },
  {
    id: 'egg_spot_colour',
    label: 'Spawn egg spot colour',
    group: 'Mob',
    type: 'colour',
    default: hexFromRgb(EGG_SPOTS),
  },
  {
    id: 'health',
    label: 'Health',
    description: 'Maximum health in half hearts.',
    group: 'Behaviour',
    type: 'number',
    default: 30,
    min: 1,
    max: 1000,
    step: 1,
  },
  {
    id: 'speed',
    label: 'Walking speed',
    description: 'The movement speed attribute; most land mobs use 0.2 to 0.3.',
    group: 'Behaviour',
    type: 'number',
    default: 0.28,
    min: 0.05,
    max: 1,
    step: 0.01,
  },
  {
    id: 'behaviour',
    label: 'Behaviour',
    group: 'Behaviour',
    type: 'choice',
    default: 'neutral',
    choices: [
      { value: 'peaceful', label: 'Peaceful: never fights' },
      { value: 'neutral', label: 'Neutral: fights back when hit' },
      { value: 'hostile', label: 'Hostile: hunts players in the dark' },
    ],
  },
  {
    id: 'spawn_biomes',
    label: 'Spawns in',
    group: 'Spawning',
    type: 'choice',
    default: '#minecraft:is_forest',
    choices: BIOMES.map((biome) => ({ value: biome.tag, label: biome.label })),
  },
]);

export function customMobBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const values = readValues(CUSTOM_MOB_PARAMETERS, context);
  const mob = nameForms(stringValue(values, 'mob_name'));
  const skinColour = rgbFromHex(stringValue(values, 'colour'), COLOURS.ruby);
  const eggColour = rgbFromHex(stringValue(values, 'egg_colour'), COLOURS.ruby);
  const eggSpots = rgbFromHex(stringValue(values, 'egg_spot_colour'), EGG_SPOTS);
  const health = numberValue(values, 'health');
  const speed = numberValue(values, 'speed');
  const behaviour = stringValue(values, 'behaviour');
  const biome =
    BIOMES.find((entry) => entry.tag === stringValue(values, 'spawn_biomes')) ??
    (BIOMES[0] as (typeof BIOMES)[number]);
  const fights = behaviour !== 'peaceful';
  const hostile = behaviour === 'hostile';
  const lastWord = mob.lower.split(' ').at(-1) as string;
  const idOf = (word: string): string => nameForms(word).id;

  const golem = rl(namespace, mob.id);
  const model = rl(namespace, `entity/${mob.id}`);
  const animations = rl(namespace, `entity/${mob.id}_animations`);
  const skin = rl(namespace, `entity/${mob.id}`);
  const egg = rl(namespace, `item/${mob.id}_spawn_egg`);
  const loot = rl(namespace, `entities/${mob.id}`);
  const deathFunction = rl(namespace, `${idOf(lastWord)}/death`);
  const onAttack = rl(namespace, `${mob.id}_attack`);
  const onDeath = rl(namespace, `${mob.id}_death`);
  const goals: JsonObject[] = [
    ...(hostile
      ? [{ type: 'melee_attack', targets: ['minecraft:player'], retaliate: true }]
      : fights
        ? [{ type: 'melee_attack', retaliate: true }]
        : []),
    { type: 'wander' },
    { type: 'look_at_player' },
    { type: 'look_around' },
  ];
  const goalsText = hostile
    ? `Its goals run in list order: melee_attack with minecraft:player as its target means it hunts players, and with retaliate it also fights back when hurt, hitting for 4 damage (msm:attack) and firing ${onAttack}; otherwise it wanders and looks about.`
    : fights
      ? `Its goals run in list order: melee_attack with retaliate and no targets means it only fights back when hurt, hitting for 4 damage (msm:attack) and firing ${onAttack}; otherwise it wanders and looks about.`
      : 'Its goals run in list order: it wanders and looks about, and with no melee_attack goal or msm:attack it never fights.';
  const spawnText = `It spawns naturally in ${biome.every} (${biome.tag})${hostile ? ' where it is dark enough for monsters (rule monster)' : ''} in groups of one or two`;
  const category = hostile ? 'monster' : 'creature';
  return {
    elements: [
      packElement(
        namespace,
        `${projectName}: the ${mob.display}, an animated mob`,
        'The pack description shown in the resource pack and data pack lists. The Fabric mod jar leaves pack.mcmeta out and puts the same assets and data inside the jar.',
      ),
      element(
        rl(namespace, 'mod'),
        KINDS.mod,
        {
          mod_id: modIdFromNamespace(namespace),
          version: '1.0.0',
          name: projectName,
          description: `Adds the ${mob.display}, an animated mob that roams ${biome.plural}.`,
          authors: [],
          licence: 'All-Rights-Reserved',
        },
        'The mod metadata, written to fabric.mod.json when you export the Fabric mod jar. New mobs exist only in that jar, which also needs Fabric API, msm_runtime and GeckoLib (both nested in the jar unless you choose to keep them separate). The mod id must stay unique among the mods you install.',
      ),
      element(
        golem,
        KINDS.entity,
        {
          format: 1,
          display_name: mob.display,
          category,
          size: { width: 0.9, height: 1.6 },
          loot_table: loot,
          spawn: {
            biomes: [biome.tag],
            weight: 6,
            min_group: 1,
            max_group: 2,
            ...(hostile ? { rule: 'monster' } : {}),
          },
          spawn_egg: { texture: egg },
          components: {
            'msm:health': { max: health },
            'msm:movement': { speed },
            ...(fights ? { 'msm:attack': { damage: 4, on_attack: onAttack } } : {}),
            'msm:ai_goals': { goals },
            'msm:animated_model': {
              model,
              animations,
              texture: skin,
              scale: 0.8,
              idle: 'idle',
              walk: 'walk',
              ...(fights ? { attack: 'attack' } : {}),
            },
            'msm:on_death': { event: onDeath },
          },
          events: {
            ...(fights
              ? {
                  [onAttack]: {
                    actions: [{ type: 'play_sound', sound: 'minecraft:entity.iron_golem.attack' }],
                  },
                }
              : {}),
            [onDeath]: {
              actions: [
                { type: 'spawn_particle', particle: 'minecraft:crit', count: 12, spread: 0.5 },
                { type: 'run_function', function: deathFunction },
              ],
            },
          },
        },
        `A new mob. It is a ${category} with a 0.9 by 1.6 block hitbox, ${health} health (${health / 2} hearts) and a walking speed of ${speed}. ${goalsText} ${spawnText}, has a spawn egg with its own texture, drops the loot table ${loot}, and its death event spawns sparks and runs a function. msm:animated_model names the GeckoLib model, animation set and texture; scale 0.8 shrinks the two-block biped model to the hitbox. Export the Fabric mod jar to try it in game.`,
      ),
      element(
        model,
        KINDS.geoModel,
        bipedGeometry(mob.id),
        'The GeckoLib geo model: a biped with body, head, arm and leg bones over a 64x64 texture. Replace it with your own by importing a Blockbench model; keep the bone names, or update the animations to match.',
      ),
      element(
        animations,
        KINDS.animation,
        bipedAnimations(fights),
        `The animation set the entity plays: idle while standing, walk while moving${fights ? ' and attack when it hits' : ''}. Each animation moves bones of the geo model by name with keyframes in seconds.`,
      ),
      element(
        loot,
        KINDS.lootTable,
        {
          type: 'minecraft:entity',
          pools: [
            {
              rolls: 1,
              entries: [
                {
                  type: 'minecraft:item',
                  name: 'minecraft:emerald',
                  modifier: [
                    {
                      type: 'minecraft:set_count',
                      count: { type: 'minecraft:uniform', min: 0, max: 2 },
                    },
                  ],
                },
              ],
            },
          ],
          random_sequence: loot,
        },
        `What the ${mob.display} drops: up to two emeralds. The entity names this table in its loot_table field; without it the mob would drop nothing.`,
      ),
      element(
        deathFunction,
        KINDS.function,
        {
          lines: [
            'playsound minecraft:entity.iron_golem.death neutral @a ~ ~ ~ 1 1.2',
            'particle minecraft:poof ~ ~1 ~ 0.4 0.6 0.4 0.02 16',
          ],
        },
        `The function the death event runs, at the ${lastWord} as it dies: a deeper death sound and a puff of smoke.`,
      ),
    ],
    assets: [
      skinTexture(namespace, `entity/${mob.id}`, skinColour),
      texture(namespace, `item/${mob.id}_spawn_egg`, 'egg', eggColour, eggSpots),
    ],
  };
}
