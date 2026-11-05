/**
 * The built-in plugins the app registers: the resource pack plugin (Phase 1), the data pack
 * plugin (Phase 2), the templates and samples library (ADR 0020), which contributes starters
 * and examples over the kinds of the others, and the structures and worldgen plugins
 * (Phase 3, ADRs 0021 and 0022), the blocks and items plugin (Phase 4, ADR 0025), and the
 * models and animations and entities plugins (Phase 5, ADRs 0028 and 0029), and the scripting
 * plugin (Phase 6, ADRs 0031 and 0032).
 *
 * @packageDocumentation
 */

import type { Plugin } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import datapackPlugin from '@msm/plugin-datapack';
import entitiesPlugin from '@msm/plugin-entities';
import libraryPlugin from '@msm/plugin-library';
import modelsAnimPlugin from '@msm/plugin-models-anim';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import scriptingPlugin from '@msm/plugin-scripting';
import structuresPlugin from '@msm/plugin-structures';
import worldgenPlugin from '@msm/plugin-worldgen';

export {
  blocksItemsPlugin,
  datapackPlugin,
  entitiesPlugin,
  libraryPlugin,
  modelsAnimPlugin,
  resourcePackPlugin,
  scriptingPlugin,
  structuresPlugin,
  worldgenPlugin,
};

/** Every built-in plugin, in registration order. */
export const builtInPlugins: readonly Plugin[] = Object.freeze([
  resourcePackPlugin,
  datapackPlugin,
  structuresPlugin,
  worldgenPlugin,
  blocksItemsPlugin,
  modelsAnimPlugin,
  entitiesPlugin,
  scriptingPlugin,
  libraryPlugin,
]);
