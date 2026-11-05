/**
 * "New element" templates of `@msm/plugin-scripting` (ADR 0032): Block interaction script,
 * Entity hurt script, Scheduled effect script and Action handler script. Their sources use the
 * script API v1 and only vanilla ids; the action handler's id is the new script's own id.
 */
import type { ElementTemplate, TemplateContext } from '@msm/plugin-api';
import { SCRIPT_KIND } from '../kinds';

const CATEGORY = 'Scripts';

const IMPORT = 'import { msm } from "msm:runtime";';

/** Script data from source lines. */
const script = (lines: readonly string[]) => ({ lines: [...lines] });

export const scriptingTemplates: readonly ElementTemplate[] = Object.freeze([
  {
    id: 'msm_script_block_interaction',
    kind: SCRIPT_KIND,
    category: CATEGORY,
    title: 'Block interaction script',
    description:
      'Handles players using a block: right-clicking a composter with the main hand no longer composts and gives bone meal instead. Change the block and item ids to your own.',
    data: () =>
      script([
        IMPORT,
        '',
        '// Right-clicking a composter gives bone meal instead of its normal use.',
        'const BLOCK = "minecraft:composter";',
        '',
        'msm.events.on("block.interact", (e) => {',
        '  if (e.block.id !== BLOCK || e.hand !== "main") return;',
        '  e.cancel();',
        '  e.player.give("minecraft:bone_meal", 1);',
        '  e.player.sendMessage("The composter hands you some bone meal.");',
        '});',
      ]),
  },
  {
    id: 'msm_script_entity_hurt',
    kind: SCRIPT_KIND,
    category: CATEGORY,
    title: 'Entity hurt script',
    description:
      'Handles entities taking damage: an iron golem heals half of every hit back and shows heart particles. Change the entity type to one of your own.',
    data: () =>
      script([
        IMPORT,
        '',
        '// Iron golems heal half of each hit back and show hearts.',
        'msm.events.on("entity.hurt", (e) => {',
        '  if (e.entity.type !== "minecraft:iron_golem") return;',
        '  e.entity.heal(e.amount / 2);',
        '  e.world.spawnParticle("minecraft:heart", e.entity.pos.offset(0, 2, 0), {',
        '    count: 5,',
        '    spread: 0.5,',
        '  });',
        '});',
      ]),
  },
  {
    id: 'msm_script_scheduled_effect',
    kind: SCRIPT_KIND,
    category: CATEGORY,
    title: 'Scheduled effect script',
    description:
      'Runs an effect over time with msm.schedule: using a clock plays five rising chimes with particles, half a second apart. Each step schedules the next one.',
    data: () =>
      script([
        IMPORT,
        '',
        '// Using a clock plays five chimes, one every 10 ticks (half a second).',
        'msm.events.on("item.use", (e) => {',
        '  if (e.item.id !== "minecraft:clock") return;',
        '  const player = e.player;',
        '  const pulse = (step: number): void => {',
        '    if (step >= 5 || !player.isAlive) return;',
        '    player.world.spawnParticle("minecraft:end_rod", player.pos.offset(0, 1, 0), {',
        '      count: 8,',
        '      spread: 0.4,',
        '    });',
        '    player.world.playSound("minecraft:block.note_block.chime", player.pos, {',
        '      pitch: 0.8 + step * 0.2,',
        '    });',
        '    msm.schedule(10, () => pulse(step + 1));',
        '  };',
        '  pulse(0);',
        '});',
      ]),
  },
  {
    id: 'msm_script_action_handler',
    kind: SCRIPT_KIND,
    category: CATEGORY,
    title: 'Action handler script',
    description:
      'Defines a named handler for the "Run script" action, using this script\'s id as the handler id. To call it, add a "Run script" (run_script) action with that handler to an event of a block, item or entity; the handler then receives the owner, the event, the position and the player.',
    data: (context: TemplateContext) =>
      script([
        IMPORT,
        '',
        `// Called by a "run_script" action whose handler is "${context.id}".`,
        `msm.actions.define("${context.id}", (e) => {`,
        '  e.world.spawnParticle("minecraft:happy_villager", e.pos.offset(0, 1, 0), {',
        '    count: 10,',
        '    spread: 0.5,',
        '  });',
        '  if (e.player !== undefined) {',
        '    e.player.sendMessage(e.owner + " ran " + e.event);',
        '  }',
        '});',
      ]),
  },
] satisfies ElementTemplate[]);
