/**
 * Element kinds contributed by `@msm/plugin-scripting` (ADR 0032 D3): `msm:script` (kind
 * folder `script`, schema extension `msm:script`, no registry), a TypeScript source stored as
 * `{ "lines": string[] }`, one entry per line, as functions are stored.
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerScript } from '../lowering/script';

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

/** Every kind this plugin contributes, in order. */
export const scriptingKinds: readonly ElementKind[] = Object.freeze([scriptKind]);
