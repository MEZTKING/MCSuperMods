/**
 * The built-in plugins the app registers: the resource pack plugin (Phase 1), the data pack
 * plugin (Phase 2), the templates and samples library (ADR 0020), which contributes starters
 * and examples over the kinds of the others, and the structures and worldgen plugins
 * (Phase 3, ADRs 0021 and 0022).
 *
 * @packageDocumentation
 */

import type { Plugin } from '@msm/plugin-api';
import datapackPlugin from '@msm/plugin-datapack';
import libraryPlugin from '@msm/plugin-library';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import structuresPlugin from '@msm/plugin-structures';
import worldgenPlugin from '@msm/plugin-worldgen';

export { datapackPlugin, libraryPlugin, resourcePackPlugin, structuresPlugin, worldgenPlugin };

/** Every built-in plugin, in registration order. */
export const builtInPlugins: readonly Plugin[] = Object.freeze([
  resourcePackPlugin,
  datapackPlugin,
  structuresPlugin,
  worldgenPlugin,
  libraryPlugin,
]);
