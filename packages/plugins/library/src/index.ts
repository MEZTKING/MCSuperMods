/**
 * `@msm/plugin-library`: the built-in templates and samples library (ADR 0020). It
 * contributes project starters and Examples gallery entries, and the deterministic
 * placeholder textures they use. It registers no element kinds: its bundles use the kinds of
 * the resource pack and data pack plugins, named in each entry's `requiresKinds`, and the
 * host hides entries whose kinds are not registered.
 *
 * Content decisions recorded in ADR 0020 (implemented by later briefs):
 * - The Custom ore starter reskins emerald ore as ruby ore until Phase 4 adds real blocks.
 * - The music disc starter refers to the vanilla sound file `minecraft:records/cat`; no
 *   `.ogg` is bundled.
 * - Examples are mirrored on disk under `examples/` as ordinary MSM projects.
 *
 * @packageDocumentation
 */
import {
  definePlugin,
  type ExampleProject,
  type Plugin,
  type ProjectStarter,
} from '@msm/plugin-api';

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

/** The project starters, in list order. Empty until the content lands. */
export const libraryStarters: readonly ProjectStarter[] = Object.freeze([]);

/** The Examples gallery entries, in gallery order. Empty until the content lands. */
export const libraryExamples: readonly ExampleProject[] = Object.freeze([]);

const plugin: Readonly<Plugin> = definePlugin({
  id: 'msm.library',
  apiVersion: '^0.4.0',
  contributes: {
    projectStarters: [...libraryStarters],
    examples: [...libraryExamples],
  },
});

export default plugin;
