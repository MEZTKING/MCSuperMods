/**
 * The built-in plugins the app registers: the resource pack plugin (Phase 1), the data pack
 * plugin (Phase 2) and the templates and samples library (ADR 0020), which contributes
 * starters and examples over the kinds of the first two.
 *
 * @packageDocumentation
 */

import type { Plugin } from '@msm/plugin-api';
import datapackPlugin from '@msm/plugin-datapack';
import libraryPlugin from '@msm/plugin-library';
import resourcePackPlugin from '@msm/plugin-resourcepack';

export { datapackPlugin, libraryPlugin, resourcePackPlugin };

/** Every built-in plugin, in registration order. */
export const builtInPlugins: readonly Plugin[] = Object.freeze([
  resourcePackPlugin,
  datapackPlugin,
  libraryPlugin,
]);
