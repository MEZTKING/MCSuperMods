/**
 * Phase 6 examples (ADRs 0031, 0032): the per-kind example of `msm:script` (a block
 * interaction that cancels the use and gives an item), and two script behaviour examples (a
 * scheduled chain of effects, a block whose event calls a script through a `run_script`
 * action, a status effect whose `msm:on_tick` event runs a script, ADR 0055 D5, and a kill
 * counter kept in saved data, ADR 0062). Scripts run only in the Fabric mod jar export, with `msm_runtime`; the vanilla
 * packs and the Java project export leave them out.
 */
import type { ExampleProject } from '@msm/plugin-api';
import { COLOURS, element, KINDS, rl } from '../content/bundle';
import { colourInt, effectIconAsset } from '../content/effects';
import { defineExample } from './define';

const IMPORT = 'import { msm } from "msm:runtime";';
const CATEGORY = 'Scripts';
const JAR_ONLY =
  'Scripts run only in the Fabric mod jar export, with msm_runtime; the Java project export leaves them out.';

/** The per-kind example of the scripting plugin. */
export const scriptKindExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_msm_script',
    title: 'Script: block interaction',
    description:
      'A script that cancels using a lodestone with an empty hand and gives the player a compass instead.',
    kind: KINDS.script,
    category: CATEGORY,
    tags: ['block.interact', 'cancel', 'give', 'script'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'lodestone_compass'),
          KINDS.script,
          {
            lines: [
              IMPORT,
              '',
              '// Using a lodestone with an empty main hand gives a compass instead.',
              'msm.events.on("block.interact", (e) => {',
              '  if (e.block.id !== "minecraft:lodestone" || e.hand !== "main") return;',
              '  if (e.player.heldItem !== undefined) return;',
              '  e.cancel();',
              '  e.player.give("minecraft:compass", 1);',
              '  e.world.playSound("minecraft:item.lodestone_compass.lock", e.block.pos);',
              '});',
            ],
          },
          `A TypeScript script, stored one line per entry. msm.events.on registers a handler for the block.interact event, which runs whenever a player uses a block. The handler returns early unless the block is a lodestone used with an empty main hand; otherwise e.cancel() stops the normal use, e.player.give hands over a compass and a sound plays at the block. The Script Studio checks the code against the msm-runtime typings as you type. ${JAR_ONLY}`,
        ),
      ],
      assets: [],
    }),
  }),
];

/** The script behaviour examples, in gallery order. */
export const scriptBehaviourExamples: readonly ExampleProject[] = [
  defineExample({
    id: 'example_msm_script_schedule',
    title: 'Script: scheduled effects',
    description:
      'A script that turns using an amethyst shard into a rising spiral of particles over two seconds, one msm.schedule step after another.',
    kind: KINDS.script,
    category: CATEGORY,
    tags: ['item.use', 'schedule', 'particles', 'script'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'amethyst_spiral'),
          KINDS.script,
          {
            lines: [
              IMPORT,
              '',
              '// Using an amethyst shard draws a rising spiral: ten steps, 4 ticks apart.',
              'const STEPS = 10;',
              '',
              'msm.events.on("item.use", (e) => {',
              '  if (e.item.id !== "minecraft:amethyst_shard") return;',
              '  const player = e.player;',
              '  const step = (n: number): void => {',
              '    if (n >= STEPS || !player.isAlive) return;',
              '    const angle = (n / STEPS) * Math.PI * 2;',
              '    const at = player.pos.offset(Math.cos(angle), n * 0.25, Math.sin(angle));',
              '    player.world.spawnParticle("minecraft:end_rod", at, { count: 4, spread: 0.1 });',
              '    if (n === STEPS - 1) {',
              '      player.world.playSound("minecraft:block.amethyst_block.resonate", player.pos);',
              '    }',
              '    msm.schedule(4, () => step(n + 1));',
              '  };',
              '  step(0);',
              '});',
            ],
          },
          'A chain of scheduled effects. msm.schedule(ticks, fn) runs fn after that many server ticks (20 a second), so each step draws its particles and schedules the next one 4 ticks later. The chain stops after ten steps, or early when the player is no longer alive, which is worth checking for anything held across ticks. Pending calls are cleared when scripts reload. Scripts run only in the Fabric mod jar export, with msm_runtime.',
        ),
      ],
      assets: [],
    }),
  }),
  defineExample({
    id: 'example_msm_script_action',
    title: 'Script: action handler',
    description:
      'A chime block whose use event runs a script through a run_script action, and the script that defines that handler.',
    kind: KINDS.script,
    category: CATEGORY,
    tags: ['run_script', 'actions', 'events', 'script', 'mod'],
    build: ({ namespace }) => {
      const block = rl(namespace, 'chime_block');
      const use = rl(namespace, 'chime_block_use');
      const handler = rl(namespace, 'chime');
      const script = rl(namespace, 'chime_handler');
      return {
        elements: [
          element(
            block,
            KINDS.block,
            {
              format: 1,
              model: 'minecraft:block/amethyst_block',
              display_name: 'Chime Block',
              sound_type: 'amethyst',
              loot: 'self',
              item: { creative_tab: 'minecraft:functional_blocks' },
              components: {
                'msm:breakable': { hardness: 1.5, resistance: 1.5, tool: 'pickaxe' },
                'msm:on_interact': { event: use },
              },
              events: {
                [use]: { actions: [{ type: 'run_script', handler }] },
              },
            },
            `A block whose behaviour is a script. Using it (msm:on_interact) fires the event ${use}, whose run_script action calls the handler ${handler}. The handler is defined by the script ${script}; if no script defined it, the Problems panel would warn. It reuses the vanilla amethyst block model.`,
          ),
          element(
            script,
            KINDS.script,
            {
              lines: [
                IMPORT,
                '',
                `// Called by the "run_script" action of ${block}.`,
                `msm.actions.define("${handler}", (e) => {`,
                '  const pitch = 0.5 + (e.world.time % 16) / 10;',
                '  e.world.playSound("minecraft:block.note_block.chime", e.pos, { pitch: pitch });',
                '  e.world.spawnParticle("minecraft:note", e.pos.offset(0, 1.2, 0), { count: 1 });',
                '  if (e.player !== undefined) {',
                '    e.player.sendMessage(e.owner + " chimed at pitch " + pitch.toFixed(1));',
                '  }',
                '});',
              ],
            },
            `The script that defines the handler ${handler} with msm.actions.define. The handler receives the owner (the block's id), the event id, the position and the player who used the block, when there is one. It plays a chime whose pitch follows the world time, shows a note particle and tells the player the pitch. ${JAR_ONLY}`,
          ),
        ],
        assets: [],
      };
    },
  }),
  defineExample({
    id: 'example_msm_scripted_effect',
    title: 'Script: scripted effect',
    description:
      'An Antidote status effect whose tick event runs a script: it cures poison and heals more at higher levels.',
    kind: KINDS.effect,
    category: CATEGORY,
    tags: ['status effect', 'on_tick', 'run_script', 'script', 'mod'],
    build: ({ namespace }) => {
      const antidote = rl(namespace, 'antidote');
      const tick = rl(namespace, 'antidote_tick');
      const handler = rl(namespace, 'antidote_cure');
      const script = rl(namespace, 'antidote_handler');
      return {
        elements: [
          element(
            antidote,
            KINDS.effect,
            {
              format: 1,
              display_name: 'Antidote',
              category: 'beneficial',
              color: colourInt(COLOURS.jade),
              components: { 'msm:on_tick': { event: tick, interval_ticks: 20 } },
              events: { [tick]: { actions: [{ type: 'run_script', handler }] } },
            },
            `A status effect whose behaviour is a script. msm:on_tick fires ${tick} once a second, and its run_script action calls the handler ${handler}. In an effect's events, other (and self) is the mob or player that has the effect. Its icon is textures/mob_effect/antidote.png. Give it with /effect give @s ${antidote} 30 1.`,
          ),
          element(
            script,
            KINDS.script,
            {
              lines: [
                IMPORT,
                '',
                `// Called once a second by the "msm:on_tick" event of ${antidote}.`,
                `msm.actions.define("${handler}", (e) => {`,
                '  const holder = e.other;',
                '  if (holder === undefined || !holder.isAlive) return;',
                `  const level = holder.effectLevel("${antidote}");`,
                '  if (holder.hasEffect("minecraft:poison")) {',
                '    holder.removeEffect("minecraft:poison");',
                '    e.world.playSound("minecraft:entity.witch.drink", holder.pos);',
                '  }',
                '  if (holder.health < holder.maxHealth) holder.heal(level);',
                '  e.world.spawnParticle("minecraft:happy_villager", holder.pos.offset(0, 1, 0), {',
                '    count: 2 * level,',
                '    spread: 0.4,',
                '  });',
                '});',
              ],
            },
            `The script that defines the handler ${handler}. e.other is the effect's holder; hasEffect and removeEffect cure its poison, and effectLevel (the amplifier plus 1) scales the healing and the particles. ${JAR_ONLY}`,
          ),
        ],
        assets: [effectIconAsset(namespace, 'antidote', COLOURS.jade)],
      };
    },
  }),
  defineExample({
    id: 'example_msm_kill_counter',
    title: 'Script: kill counter',
    description:
      "A script that counts each player's kills in saved player data and the world's total in msm.storage, and tells players their count when they join.",
    kind: KINDS.script,
    category: CATEGORY,
    tags: ['entity.death', 'player.data', 'msm.storage', 'saved data', 'script'],
    build: ({ namespace }) => ({
      elements: [
        element(
          rl(namespace, 'kill_counter'),
          KINDS.script,
          {
            lines: [
              IMPORT,
              '',
              '// Reads a saved number, or 0 when nothing is stored yet.',
              'function count(value: unknown): number {',
              '  return typeof value === "number" ? value : 0;',
              '}',
              '',
              "// Each kill by a player adds one to that player's count and to the world total.",
              'msm.events.on("entity.death", (e) => {',
              '  const killer = e.attacker?.asPlayer();',
              '  if (killer === undefined) return;',
              '  const kills = count(killer.data.get("kills")) + 1;',
              '  killer.data.set("kills", kills);',
              '  msm.storage.set("total_kills", count(msm.storage.get("total_kills")) + 1);',
              '  if (kills % 10 === 0) killer.sendMessage("That makes " + kills + " kills!");',
              '});',
              '',
              '// The counts are still there after quitting, a restart, /reload and death.',
              'msm.events.on("player.join", (e) => {',
              '  const kills = count(e.player.data.get("kills"));',
              '  const total = count(msm.storage.get("total_kills"));',
              '  e.player.sendMessage("Your kills: " + kills + ". Everyone\'s: " + total + ".");',
              '});',
            ],
          },
          `A script with saved data (ADR 0062). player.data keeps values on the player, so each player has an own kills count, kept through death and dimension changes; msm.storage keeps values with the world. Both survive /reload and restarts and hold JSON values only, copied in and out, so the script reads, adds one and stores again. Keys belong to this project's namespace, so other mods cannot clash with them. ${JAR_ONLY}`,
        ),
      ],
      assets: [],
    }),
  }),
];
