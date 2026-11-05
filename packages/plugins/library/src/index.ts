/**
 * `@msm/plugin-library`: the built-in templates and samples library (ADR 0020). It
 * contributes project starters and Examples gallery entries, and the deterministic
 * placeholder textures they use. It registers no element kinds: its bundles use the kinds of
 * the resource pack, data pack, structures, worldgen, blocks and items, entities, models and
 * animations and scripting plugins, named in each entry's `requiresKinds`, and the host hides
 * entries whose kinds are not registered.
 *
 * Content decisions recorded in ADR 0020:
 * - The Custom ore starter adds a real ruby ore block and ruby item (Phase 4; it needs the
 *   Fabric mod jar export).
 * - The Custom mob starter adds an animated Ruby Golem (Phase 5, ADRs 0028 and 0029; it needs
 *   the Fabric mod jar export with GeckoLib).
 * - The Custom ore, Custom sword and Custom mob starters are wizards: their `parameters`
 *   (ADR 0040) name, colour and tune the content; the defaults build the ruby content.
 * - The Scripted ore starter adds three runtime scripts to the Custom ore starter's content
 *   (Phase 6, ADRs 0031 and 0032; scripts need the Fabric mod jar export and are not part of
 *   the Java project export).
 * - The music disc starter refers to the vanilla sound file `minecraft:records/cat`; no
 *   `.ogg` is bundled.
 * - Examples are mirrored on disk under `examples/` as ordinary MSM projects.
 *
 * @packageDocumentation
 */
import { definePlugin, type Plugin } from '@msm/plugin-api';
import { libraryExamples } from './examples/index';
import { libraryStarters } from './starters/index';

export {
  DEFAULT_COLOUR,
  encodePng,
  PLACEHOLDER_PATTERNS,
  PLACEHOLDER_SIZE,
  PLACEHOLDER_SKIN_SIZE,
  type PlaceholderOptions,
  type PlaceholderPattern,
  placeholderPixels,
  placeholderPng,
  placeholderSkinPixels,
  placeholderSkinPng,
  type Rgb,
} from './assets/png';

export { COLOURS, KINDS, modIdFromNamespace } from './content/bundle';
export {
  behaviourExamples,
  categoryTag,
  entityBehaviourExamples,
  kindExamples,
  libraryExamples,
  STARTERS_CATEGORY,
  scriptBehaviourExamples,
  starterExamples,
} from './examples/index';
export {
  CUSTOM_MOB_PARAMETERS,
  CUSTOM_ORE_PARAMETERS,
  CUSTOM_SWORD_PARAMETERS,
  libraryStarters,
  scriptedOreIds,
} from './starters/index';

const plugin: Readonly<Plugin> = definePlugin({
  id: 'msm.library',
  apiVersion: '^1.0.0',
  contributes: {
    projectStarters: [...libraryStarters],
    examples: [...libraryExamples],
  },
});

export default plugin;
