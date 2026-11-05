/**
 * The Scripted ore starter (ADRs 0031, 0032): the Custom ore starter's ruby ore, rubies and
 * block of ruby (built by {@link customOreBundle}) plus three `msm:script` elements. One
 * handles sneak-using the ore, one defines the `run_script` handler the block of ruby's step
 * event calls, and one greets joining players. Scripts run only in the Fabric mod jar export
 * (with `msm_runtime`); the Java project export leaves them out.
 */
import type {
  BundleContext,
  ContentBundle,
  ContentBundleElement,
  JsonObject,
} from '@msm/plugin-api';
import { element, KINDS, packElement, rl } from '../content/bundle';
import { customOreBundle } from './custom-ore';

const IMPORT = 'import { msm } from "msm:runtime";';

const SCRIPTS_NEED_THE_JAR =
  'Scripts run only in the Fabric mod jar export, with msm_runtime; the vanilla packs and the Java project export leave them out.';

/** The ids the Scripted ore starter adds on top of the Custom ore starter. */
export function scriptedOreIds(namespace: string) {
  return {
    ore: rl(namespace, 'ruby_ore'),
    ruby: rl(namespace, 'ruby'),
    block: rl(namespace, 'ruby_block'),
    oreGlow: rl(namespace, 'ore_glow'),
    guardScript: rl(namespace, 'ruby_block_guard'),
    guard: rl(namespace, 'guard'),
    welcome: rl(namespace, 'welcome'),
    step: rl(namespace, 'ruby_block_step'),
  };
}

/** The Scripted ore starter's scripts, in list order. */
function scripts(namespace: string): ContentBundleElement[] {
  const ids = scriptedOreIds(namespace);
  return [
    element(
      ids.oreGlow,
      KINDS.script,
      {
        lines: [
          IMPORT,
          '',
          '// Sneak and use ruby ore with the main hand: sparks, one ruby, and the use is cancelled.',
          `const ORE = "${ids.ore}";`,
          '',
          'msm.events.on("block.interact", (e) => {',
          '  if (e.block.id !== ORE || e.hand !== "main" || !e.player.isSneaking) return;',
          '  e.cancel();',
          '  e.world.spawnParticle("minecraft:electric_spark", e.block.pos.offset(0, 1, 0), {',
          '    count: 12,',
          '    spread: 0.4,',
          '  });',
          `  e.player.give("${ids.ruby}", 1);`,
          '});',
        ],
      },
      `A script that handles the block.interact event. When a player sneaks and uses ${ids.ore} with the main hand, it spawns spark particles above the ore, gives one ${ids.ruby} and cancels the use, so nothing else happens. Without sneaking the ore behaves as usual. The handler runs for every block, so it returns early unless the block id matches. ${SCRIPTS_NEED_THE_JAR}`,
    ),
    element(
      ids.guardScript,
      KINDS.script,
      {
        lines: [
          IMPORT,
          '',
          `// Called by the "run_script" action of ${ids.block}'s step event.`,
          `msm.actions.define("${ids.guard}", (e) => {`,
          '  e.world.playSound("minecraft:block.amethyst_block.chime", e.pos, { pitch: 1.2 });',
          '  if (e.player !== undefined) {',
          '    e.player.heal(2);',
          '  }',
          '});',
        ],
      },
      `A script that defines the action handler ${ids.guard} with msm.actions.define. The block of ruby's step event (${ids.step}) runs it through a run_script action naming that handler. It plays a chime at the block and heals a player standing on it by one heart (2 half hearts), at most once a second because of the step cooldown. If no script defined the handler, the Problems panel would warn about the run_script action. ${SCRIPTS_NEED_THE_JAR}`,
    ),
    element(
      ids.welcome,
      KINDS.script,
      {
        lines: [
          IMPORT,
          '',
          '// Greets every player who joins and points them at the ruby ore trick.',
          'msm.events.on("player.join", (e) => {',
          '  e.player.sendMessage("Welcome, " + e.player.name + "! Sneak and use ruby ore for a bonus ruby.");',
          '  msm.log.info(e.player.name + " joined");',
          '});',
        ],
      },
      `A script that handles the player.join event: it sends the joining player a chat message and writes a line to the server log ([msm_runtime] ${ids.welcome}: <name> joined). Server log lines from scripts are the quickest way to see that they loaded and ran. ${SCRIPTS_NEED_THE_JAR}`,
    ),
  ];
}

export function scriptedOreBundle(context: BundleContext): ContentBundle {
  const { namespace, projectName } = context;
  const ids = scriptedOreIds(namespace);
  const base = customOreBundle(context);
  const elements = base.elements.map((entry): ContentBundleElement => {
    if (entry.kind === KINDS.pack) {
      return packElement(
        namespace,
        `${projectName}: ruby ore, rubies, a block of ruby and scripts`,
        entry.notes,
      );
    }
    if (entry.kind === KINDS.mod) {
      return element(
        entry.id,
        entry.kind,
        {
          ...(entry.data as JsonObject),
          description: 'Adds ruby ore, rubies and a block of ruby, with scripted behaviour.',
        },
        'The mod metadata, written to fabric.mod.json when you export the Fabric mod jar. New blocks, items and scripts exist only in that jar, which also needs Fabric API and msm_runtime (nested in the jar unless you choose a separate runtime); msm_runtime runs the scripts. The mod id must stay unique among the mods you install.',
      );
    }
    if (entry.id === ids.block) {
      const data = entry.data as JsonObject;
      return element(
        entry.id,
        entry.kind,
        {
          ...data,
          components: {
            ...(data.components as JsonObject),
            'msm:on_step': { event: ids.step, cooldown_ticks: 20 },
          },
          events: {
            [ids.step]: { actions: [{ type: 'run_script', handler: ids.guard }] },
          },
        },
        `A storage block for nine rubies that also guards whoever stands on it. msm:on_step fires the event ${ids.step} when an entity steps on it, at most once every 20 ticks (one second). The event's only action is run_script, which calls the handler ${ids.guard} that the script ${ids.guardScript} defines. "loot": "self" generates a loot table that drops the block itself.`,
      );
    }
    return entry;
  });
  return { elements: [...elements, ...scripts(namespace)], assets: base.assets };
}
