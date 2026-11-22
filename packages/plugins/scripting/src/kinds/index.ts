/**
 * Element kinds contributed by `@msm/plugin-scripting` (ADR 0032 D3): `msm:script` (kind
 * folder `script`, schema extension `msm:script`, no registry), a TypeScript source stored as
 * `{ "lines": string[] }`, one entry per line, as functions are stored; and `msm:command`
 * (ADR 0096 D1, folder `command`, no registry), a server command lowered to
 * `msm/<ns>/command/<path>.json`; and (ADR 0111 D5, D6) `msm:game_rule` and `msm:stat`, lowered to
 * `msm/<ns>/game_rule/<path>.json` and `msm/<ns>/stat/<path>.json` with their language keys.
 */
import type { ElementKind } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { lowerCommand } from '../lowering/command';
import { lowerScript } from '../lowering/script';
import { gameRuleKind } from './game-rule';
import { statKind } from './stat';

export { GAME_RULE_KIND, GAME_RULE_REGISTRY, gameRuleKind } from './game-rule';
export { STAT_KIND, STAT_REGISTRY, statKind } from './stat';

/** Kind id of runtime scripts. */
export const SCRIPT_KIND = 'msm:script';
/** Schema reference of script data: a built-in extension of `@msm/schemas`, like `msm:function`. */
export const SCRIPT_SCHEMA = 'msm:script';

export const scriptKind: ElementKind = {
  id: SCRIPT_KIND,
  schema: SCRIPT_SCHEMA,
  folder: 'script',
  defaultData: {
    lines: [
      'import { msm } from "msm:runtime";',
      '',
      'msm.events.on("block.interact", (e) => {',
      // biome-ignore lint/suspicious/noTemplateCurlyInString: script source text
      '  msm.log.info(`${e.player.name} used ${e.block.id}`);',
      '});',
    ],
  },
  lower: lowerScript,
};

/** Kind id of server commands (ADR 0096 D1). */
export const COMMAND_KIND = 'msm:command';

/**
 * Server commands (ADR 0096 D1). The default is `/hello`, open to every player, which plays a
 * chime for the player and says "Hello!" back: an event, so it needs no function or script.
 */
export const commandKind: ElementKind = {
  id: COMMAND_KIND,
  schema: MSM_SCHEMA_REFS.command,
  folder: 'command',
  defaultData: {
    format: 1,
    name: 'hello',
    event: 'greet',
    events: {
      greet: {
        actions: [{ type: 'play_sound', sound: 'minecraft:block.note_block.chime' }],
      },
    },
    feedback_text: 'Hello!',
  },
  // `format` is written by lowering, so the form hides it.
  hiddenPaths: ['/format'],
  lower: lowerCommand,
};

/** Every kind this plugin contributes, in order. */
export const scriptingKinds: readonly ElementKind[] = Object.freeze([
  scriptKind,
  commandKind,
  gameRuleKind,
  statKind,
]);
