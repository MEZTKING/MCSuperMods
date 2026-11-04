/**
 * `@msm/plugin-library`: the built-in templates and samples library (ADR 0020). It
 * contributes project starters and Examples gallery entries, and the deterministic
 * placeholder textures they use. It registers no element kinds: its bundles use the kinds of
 * the resource pack, data pack, structures and worldgen plugins, named in each entry's
 * `requiresKinds`, and the host hides entries whose kinds are not registered.
 *
 * Content decisions recorded in ADR 0020:
 * - The Custom ore starter reskins emerald ore as ruby ore until Phase 4 adds real blocks.
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
  type PlaceholderOptions,
  type PlaceholderPattern,
  placeholderPixels,
  placeholderPng,
  type Rgb,
} from './assets/png';

export { COLOURS, KINDS } from './content/bundle';
export {
  categoryTag,
  kindExamples,
  libraryExamples,
  STARTERS_CATEGORY,
  starterExamples,
} from './examples/index';
export { libraryStarters } from './starters/index';

const plugin: Readonly<Plugin> = definePlugin({
  id: 'msm.library',
  apiVersion: '^0.5.0',
  contributes: {
    projectStarters: [...libraryStarters],
    examples: [...libraryExamples],
  },
});

export default plugin;
