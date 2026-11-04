/**
 * The built-in plugins the app registers: the resource pack plugin (Phase 1) and the data pack
 * plugin (Phase 2).
 *
 * @packageDocumentation
 */

import type { Plugin } from '@msm/plugin-api';
import datapackPlugin from '@msm/plugin-datapack';
import resourcePackPlugin from '@msm/plugin-resourcepack';

export { datapackPlugin, resourcePackPlugin };

/** Every built-in plugin, in registration order. */
export const builtInPlugins: readonly Plugin[] = Object.freeze([
  resourcePackPlugin,
  datapackPlugin,
]);
