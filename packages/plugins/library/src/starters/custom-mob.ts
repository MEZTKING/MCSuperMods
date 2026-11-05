/**
 * The Custom mob starter (ADR 0028, ADR 0029): a Ruby Golem that wanders forests, fights back
 * when hit, drops emeralds and bursts into sparks when it dies. It brings its GeckoLib geo
 * model, animation set, placeholder skin and spawn egg texture, a loot table, a function and
 * the `msm:mod` metadata. New entities need the Fabric mod jar export (with `msm_runtime` and
 * GeckoLib); the vanilla pack exports carry only the models, textures, language keys, loot
 * table and function.
 */
import type { BundleContext, ContentBundle } from '@msm/plugin-api';
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

export function customMobBundle({ namespace, projectName }: BundleContext): ContentBundle {
  const golem = rl(namespace, 'ruby_golem');
  const model = rl(namespace, 'entity/ruby_golem');
  const animations = rl(namespace, 'entity/ruby_golem_animations');
  const skin = rl(namespace, 'entity/ruby_golem');
  const egg = rl(namespace, 'item/ruby_golem_spawn_egg');
  const loot = rl(namespace, 'entities/ruby_golem');
  const deathFunction = rl(namespace, 'golem/death');
  const onAttack = rl(namespace, 'ruby_golem_attack');
  const onDeath = rl(namespace, 'ruby_golem_death');
  return {
    elements: [
      packElement(
        namespace,
        `${projectName}: the Ruby Golem, an animated mob`,
        'The pack description shown in the resource pack and data pack lists. The Fabric mod jar leaves pack.mcmeta out and puts the same assets and data inside the jar.',
      ),
      element(
        rl(namespace, 'mod'),
        KINDS.mod,
        {
          mod_id: modIdFromNamespace(namespace),
          version: '1.0.0',
          name: projectName,
          description: 'Adds the Ruby Golem, an animated mob that roams forests.',
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
          display_name: 'Ruby Golem',
          category: 'creature',
          size: { width: 0.9, height: 1.6 },
          loot_table: loot,
          spawn: { biomes: ['#minecraft:is_forest'], weight: 6, min_group: 1, max_group: 2 },
          spawn_egg: { texture: egg },
          components: {
            'msm:health': { max: 30 },
            'msm:movement': { speed: 0.28 },
            'msm:attack': { damage: 4, on_attack: onAttack },
            'msm:ai_goals': {
              goals: [
                { type: 'melee_attack', retaliate: true },
                { type: 'wander' },
                { type: 'look_at_player' },
                { type: 'look_around' },
              ],
            },
            'msm:animated_model': {
              model,
              animations,
              texture: skin,
              scale: 0.8,
              idle: 'idle',
              walk: 'walk',
              attack: 'attack',
            },
            'msm:on_death': { event: onDeath },
          },
          events: {
            [onAttack]: {
              actions: [{ type: 'play_sound', sound: 'minecraft:entity.iron_golem.attack' }],
            },
            [onDeath]: {
              actions: [
                { type: 'spawn_particle', particle: 'minecraft:crit', count: 12, spread: 0.5 },
                { type: 'run_function', function: deathFunction },
              ],
            },
          },
        },
        `A new mob. It is a creature with a 0.9 by 1.6 block hitbox, 30 health (15 hearts) and a walking speed of 0.28. Its goals run in list order: melee_attack with retaliate and no targets means it only fights back when hurt, hitting for 4 damage (msm:attack) and firing ${onAttack}; otherwise it wanders and looks about. It spawns naturally in every forest (#minecraft:is_forest) in groups of one or two, has a spawn egg with its own texture, drops the loot table ${loot}, and its death event spawns sparks and runs a function. msm:animated_model names the GeckoLib model, animation set and texture; scale 0.8 shrinks the two-block biped model to the hitbox. Export the Fabric mod jar to try it in game.`,
      ),
      element(
        model,
        KINDS.geoModel,
        bipedGeometry('ruby_golem'),
        'The GeckoLib geo model: a biped with body, head, arm and leg bones over a 64x64 texture. Replace it with your own by importing a Blockbench model; keep the bone names, or update the animations to match.',
      ),
      element(
        animations,
        KINDS.animation,
        bipedAnimations(true),
        'The animation set the entity plays: idle while standing, walk while moving and attack when it hits. Each animation moves bones of the geo model by name with keyframes in seconds.',
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
        'What the Ruby Golem drops: up to two emeralds. The entity names this table in its loot_table field; without it the mob would drop nothing.',
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
        'The function the death event runs, at the golem as it dies: a deeper death sound and a puff of smoke.',
      ),
    ],
    assets: [
      skinTexture(namespace, 'entity/ruby_golem', COLOURS.ruby),
      texture(namespace, 'item/ruby_golem_spawn_egg', 'egg', COLOURS.ruby),
    ],
  };
}
