/**
 * Library contribution points: element templates, project starters and examples (ADR 0020).
 *
 * The host (the app) owns the pickers and dialogs; plugins own the content. Everything here
 * is plain data plus pure functions, with no Node or DOM types (`Uint8Array` only), so that
 * sandboxed third-party plugins can contribute the same way built-ins do.
 *
 * @packageDocumentation
 */

import type { MaybePromise } from './async';
import type { Json, ResourceLocation } from './json';
import type { OutputLayer } from './output';
import type { TargetFacts } from './target';

/**
 * What an {@link ElementTemplate} knows when it builds its data.
 */
export interface TemplateContext {
  /** The new element's id. */
  id: ResourceLocation;
  /** The namespace part of {@link TemplateContext.id}. */
  namespace: string;
  /** The path part of {@link TemplateContext.id}. */
  path: string;
  /**
   * The project's own namespace for references the template makes to other project content:
   * the first project namespace other than `minecraft`, else {@link TemplateContext.namespace}
   * when it is not `minecraft`, else `my_project`.
   */
  projectNamespace: string;
  /** Every namespace of the open project. */
  namespaces: readonly string[];
  /**
   * The kind's default data for {@link TemplateContext.target} (`defaultDataFor(target)` when
   * the kind has it, else `defaultData`), deep-copied by the host, or `undefined` when it has
   * neither.
   */
  kindDefault: Json | undefined;
  /**
   * The facts of the open project's target, so a template can read them (for example
   * `target.worldgen.featureSteps`) instead of hard-coding a version. Since 1.0.0.
   */
  target: TargetFacts;
}

/**
 * One entry of the host's "New element" picker.
 *
 * @example
 * ```ts
 * const blockModel: ElementTemplate = {
 *   id: 'block_model',
 *   kind: 'minecraft:model',
 *   title: 'Block model',
 *   description: 'A full cube with one texture on every side.',
 *   category: 'Models',
 *   prefix: 'block/',
 *   data: ({ namespace, path }) => ({
 *     parent: 'minecraft:block/cube_all',
 *     textures: { all: `${namespace}:${path}` },
 *   }),
 * };
 * ```
 */
export interface ElementTemplate {
  /** Unique across all plugins; the host uses it in `data-testid="template-<id>"`. */
  id: string;
  /** The {@link ElementKind.id} the template creates; must be registered by the same plugin. */
  kind: string;
  /** Name shown in the picker, in British English. */
  title: string;
  /** One sentence shown under the title. */
  description: string;
  /** Picker group, in British English, for example `Recipes`, `Models` or `Tags`. */
  category: string;
  /** Prepended to the name the user types (`block/`, `item/`, `blocks/`); default empty. */
  prefix?: string;
  /** Name filled in when the template is chosen (`en_us`, `sounds`, `pack`, `tick`). */
  defaultName?: string;
  /** The name cannot be changed (one `sounds` file per namespace). */
  fixedName?: boolean;
  /** Namespace preselected when the template is chosen (`minecraft` for the tick and load tags). */
  defaultNamespace?: string;
  /**
   * Whether the template applies to a target. The host hides a template that returns `false`
   * for the open project's target, and the library tests validate it only for the targets it
   * supports. Omit it for a template that works on every target. Must be pure. Since 1.0.0.
   *
   * @example
   * ```ts
   * supports: (target) => target.worldgen.biomeAttributes !== undefined,
   * ```
   *
   * @param target - The facts of the target to check.
   * @returns `true` when the template can be used with the target.
   */
  supports?(target: TargetFacts): boolean;
  /**
   * Starting data for the new element. Must be pure; the host validates the result like any
   * user edit. May return a Promise (a Promise return since 1.0.0); hosts await the result.
   *
   * @param context - The new element's id, the open project's namespaces and the target.
   * @returns The new element's data, or a Promise of it.
   */
  data(context: TemplateContext): MaybePromise<Json>;
}

/**
 * One element of a {@link ContentBundle}.
 */
export interface ContentBundleElement {
  /** The element id. */
  id: ResourceLocation;
  /** A registered {@link ElementKind.id}. */
  kind: string;
  /** The element data. */
  data: Json;
  /** Becomes `meta.notes`: the commented explanation shown in the Examples gallery. */
  notes?: string;
  /** Becomes `meta.tags`. */
  tags?: string[];
}

/**
 * One generated binary of a {@link ContentBundle}. Never a Mojang asset.
 */
export interface ContentBundleAsset {
  /** The namespace the asset belongs to. */
  namespace: string;
  /** Path relative to `assets/<namespace>/`, for example `textures/block/ruby_ore.png`. */
  path: string;
  /** The file's bytes. */
  bytes: Uint8Array;
}

/**
 * Elements and assets a starter or example adds to a project in one go. Bundles are
 * self-contained: every reference is a vanilla id or an id inside the same bundle.
 */
export interface ContentBundle {
  /** The elements to add. */
  elements: ContentBundleElement[];
  /** Generated binaries to write under `assets/<namespace>/`. */
  assets: ContentBundleAsset[];
}

/**
 * What a {@link ProjectStarter} or {@link ExampleProject} knows when it builds its bundle.
 */
export interface BundleContext {
  /** The project's own namespace (derived from the folder name, or the open project's). */
  namespace: string;
  /** The project's name. */
  projectName: string;
  /**
   * The facts of the project's target, so a bundle can read them (for example
   * `target.geckolib`) instead of hard-coding a version. Since 1.0.0.
   */
  target: TargetFacts;
  /**
   * The value of every parameter the starter declares in {@link ProjectStarter.parameters},
   * keyed by {@link StarterParameter.id}. The host fills in each parameter's default when the
   * user chose no value, so every declared id is present. Empty for a starter without
   * parameters and for examples. Since 1.0.0.
   */
  values: Readonly<Record<string, Json>>;
}

/**
 * Fields every {@link StarterParameter} has. Since 1.0.0 (ADR 0040).
 */
export interface StarterParameterBase {
  /** Parameter id, unique within the starter; the key in {@link BundleContext.values}. */
  id: string;
  /** Label shown in the wizard, in British English. */
  label: string;
  /** Optional longer explanation shown with the field, in British English. */
  description?: string;
  /**
   * The wizard step the parameter is shown in, in British English, for example `Block` or
   * `Appearance`. Parameters with the same group share a step, in declaration order; the
   * host shows ungrouped parameters on a step of their own.
   */
  group?: string;
}

/**
 * A free-text parameter. Since 1.0.0.
 */
export interface StringStarterParameter extends StarterParameterBase {
  /** The parameter's value type. */
  type: 'string';
  /** The value used when the user chose none. */
  default: string;
  /** A JavaScript regular expression (without delimiters) the whole value must match. */
  pattern?: string;
  /** The maximum length in UTF-16 code units. */
  maxLength?: number;
}

/**
 * A number parameter. Since 1.0.0.
 */
export interface NumberStarterParameter extends StarterParameterBase {
  /** The parameter's value type. */
  type: 'number';
  /** The value used when the user chose none. */
  default: number;
  /** The smallest allowed value. */
  min?: number;
  /** The largest allowed value. */
  max?: number;
  /** The step between allowed values, for example `1` for whole numbers. */
  step?: number;
}

/**
 * A yes or no parameter. Since 1.0.0.
 */
export interface BooleanStarterParameter extends StarterParameterBase {
  /** The parameter's value type. */
  type: 'boolean';
  /** The value used when the user chose none. */
  default: boolean;
}

/**
 * A colour parameter; its value is a `#rrggbb` string with lower-case hex digits. Since 1.0.0.
 */
export interface ColourStarterParameter extends StarterParameterBase {
  /** The parameter's value type. */
  type: 'colour';
  /** The value used when the user chose none, as `#rrggbb`. */
  default: string;
}

/**
 * A parameter whose value is one of a fixed list. Since 1.0.0.
 */
export interface ChoiceStarterParameter extends StarterParameterBase {
  /** The parameter's value type. */
  type: 'choice';
  /** The value used when the user chose none; one of the {@link choices}' values. */
  default: string;
  /** The allowed values, in display order, with their labels in British English. */
  choices: { value: string; label: string }[];
}

/**
 * A parameter whose value is a subset of a fixed list, for example which pieces of a gear set
 * to make; the wizard renders it as a list of checkboxes. Its value in
 * {@link BundleContext.values} is a `string[]` of the chosen {@link choices}' values, in the
 * order of {@link choices}. Since 1.1.0 (ADR 0043 D1).
 *
 * @example
 * ```ts
 * const pieces: SetStarterParameter = {
 *   id: 'pieces',
 *   label: 'Pieces',
 *   type: 'set',
 *   choices: [
 *     { value: 'sword', label: 'Sword' },
 *     { value: 'helmet', label: 'Helmet' },
 *   ],
 *   default: ['sword', 'helmet'],
 *   min: 1,
 * };
 * ```
 */
export interface SetStarterParameter extends StarterParameterBase {
  /** The parameter's value type. */
  type: 'set';
  /** The values chosen when the user chose none; each one of the {@link choices}' values. */
  default: string[];
  /** The allowed values, in display order, with their labels in British English. */
  choices: { value: string; label: string }[];
  /** The fewest values the user may choose; absent means none is required (0). */
  min?: number;
}

/**
 * A picture the user picks, for example a painting's image; the host renders a file picker
 * with a thumbnail. Its value in {@link BundleContext.values} is a PNG `data:` URL
 * (`data:image/png;base64,...`) or `null` when the user picked none, so a bundle draws a
 * placeholder. The host checks the PNG signature, {@link maxBytes} and {@link maxSize} before
 * passing a value, so `build` can trust both; like a colour, the image is a value, and a
 * flow never reads project content for it. Since 1.2.0 (ADR 0044 D7).
 *
 * A member of {@link StarterParameter} since 1.2.0 (it was declared outside the union until the
 * host's wizard and the built-in library rendered and read it). A starter must accept `null`
 * and draw a placeholder, since the user may pick no image.
 *
 * @example
 * ```ts
 * const image: ImageStarterParameter = {
 *   id: 'image',
 *   label: 'Image',
 *   type: 'image',
 *   default: null,
 *   maxBytes: 1_048_576,
 *   maxSize: 64,
 * };
 * ```
 */
export interface ImageStarterParameter extends StarterParameterBase {
  /** The parameter's value type. */
  type: 'image';
  /** No image: the bundle uses its placeholder. */
  default: null;
  /** The largest file the host accepts, in bytes; absent means 1 048 576 (1 MB). */
  maxBytes?: number;
  /** The largest width and height the host accepts, in pixels; absent means no limit. */
  maxSize?: number;
}

/**
 * A sound file the user picks, for example a music disc's song; the host renders a file
 * picker that shows the length. Its value in {@link BundleContext.values} is an Ogg Vorbis
 * `data:` URL (`data:audio/ogg;base64,...`) or `null` when the user picked none. The host
 * checks the Ogg signature, the Vorbis identification header and {@link maxBytes} before
 * passing a value. A starter must accept `null`. Since 1.4.0 (ADR 0049).
 *
 * @example
 * ```ts
 * const song: AudioStarterParameter = {
 *   id: 'song_file',
 *   label: 'Song file',
 *   type: 'audio',
 *   default: null,
 *   maxBytes: 16_777_216,
 * };
 * ```
 */
export interface AudioStarterParameter extends StarterParameterBase {
  /** The parameter's value type. */
  type: 'audio';
  /** No sound: the bundle uses a vanilla sound or none. */
  default: null;
  /** The largest file the host accepts, in bytes; absent means 8 388 608 (8 MB). */
  maxBytes?: number;
}

/**
 * One question a parameterised {@link ProjectStarter} asks; the host renders the parameters
 * as a multi-step wizard (ADR 0040) and passes the answers in {@link BundleContext.values}.
 * Since 1.0.0.
 *
 * @example
 * ```ts
 * const parameters: StarterParameter[] = [
 *   { id: 'name', label: 'Ore name', type: 'string', default: 'ruby', pattern: '^[a-z_]+$', group: 'Ore' },
 *   { id: 'veins', label: 'Veins per chunk', type: 'number', default: 8, min: 1, max: 32, step: 1, group: 'World' },
 *   { id: 'colour', label: 'Colour', type: 'colour', default: '#d01a3c', group: 'Ore' },
 * ];
 * ```
 */
export type StarterParameter =
  | StringStarterParameter
  | NumberStarterParameter
  | BooleanStarterParameter
  | ColourStarterParameter
  | ChoiceStarterParameter
  | SetStarterParameter
  | ImageStarterParameter
  | AudioStarterParameter;

/**
 * The Creator group a {@link ProjectStarter} is listed under (ADR 0043 D1): `gear` (tools and
 * armour), `blocks`, `food`, `mobs`, `scripts` or `worlds` (dimensions; since 1.5.0, ADR 0051).
 * Since 1.1.0.
 */
export type CreatorGroup = 'gear' | 'blocks' | 'food' | 'mobs' | 'scripts' | 'worlds';

/**
 * How a {@link ProjectStarter} appears in the host's Creator, the guided flow with a live
 * preview (ADR 0043). Since 1.1.0.
 */
export interface StarterCreatorInfo {
  /** The Creator group the flow is listed under. */
  group: CreatorGroup;
  /** One sentence shown on the flow's card, in British English. */
  blurb: string;
}

/**
 * One entry of the host's "New project" starter list.
 */
export interface ProjectStarter {
  /** Unique across all plugins. */
  id: string;
  /** Name shown in the list, in British English. */
  title: string;
  /** What the starter contains, in one or two sentences. */
  description: string;
  /** `blank` (no content), `pack` (one layer, minimal) or `content` (a themed bundle). */
  category: 'blank' | 'pack' | 'content';
  /** The layers the starter fills; shown as badges. */
  layers: OutputLayer[];
  /** Kinds the bundle uses. The host hides a starter whose kinds are not all registered. */
  requiresKinds: string[];
  /**
   * The questions the host's wizard asks before building; their answers arrive in
   * {@link BundleContext.values}. Omit it (or leave it empty) for a starter without
   * questions. Since 1.0.0.
   */
  parameters?: StarterParameter[];
  /**
   * Lists the starter in the host's Creator as a guided flow (ADR 0043 D1): the host renders
   * its {@link parameters} next to a live preview of {@link build}'s bundle and adds the
   * bundle to the open project. Omit it for a starter that is offered for new projects only.
   * Since 1.1.0.
   *
   * @example
   * ```ts
   * creator: { group: 'gear', blurb: 'Tools and armour of one material, with recipes.' },
   * ```
   */
  creator?: StarterCreatorInfo;
  /**
   * Whether the starter applies to a target. The host hides a starter that returns `false`
   * for the chosen target, and the library tests build it only for the targets it supports.
   * Omit it for a starter that works on every target. Must be pure. Since 1.0.0.
   *
   * @param target - The facts of the target to check.
   * @returns `true` when the starter can be used with the target.
   */
  supports?(target: TargetFacts): boolean;
  /**
   * Builds the starter's content. Must be pure and deterministic in the whole context
   * (namespace, name, target and parameter values). The host adds `<namespace>:pack` when the
   * bundle has no `pack.mcmeta` element. May return a Promise (a Promise return since 1.0.0);
   * hosts await the result.
   *
   * @param context - The new project's namespace, name, target and parameter values.
   * @returns The bundle, or a Promise of it.
   */
  build(context: BundleContext): MaybePromise<ContentBundle>;
}

/**
 * One entry of the host's Examples gallery.
 */
export interface ExampleProject {
  /** Unique across all plugins. */
  id: string;
  /** Name shown in the gallery, in British English. */
  title: string;
  /** What the example shows, in one or two sentences. */
  description: string;
  /** The kind the example teaches; the gallery's main filter. */
  kind: string;
  /** Gallery group, in British English. */
  category: string;
  /** Extra search terms. */
  tags?: string[];
  /** Kinds the bundle uses. The host hides an example whose kinds are not all registered. */
  requiresKinds: string[];
  /**
   * Whether the example applies to a target. The host hides an example that returns `false`
   * for the open project's target, and the library tests build it only for the targets it
   * supports. Omit it for an example that works on every target. Must be pure. Since 1.0.0.
   *
   * @param target - The facts of the target to check.
   * @returns `true` when the example can be used with the target.
   */
  supports?(target: TargetFacts): boolean;
  /**
   * Builds the example's content. Must be pure and deterministic. `context.values` is empty
   * for examples. May return a Promise (a Promise return since 1.0.0); hosts await the result.
   *
   * @param context - The target project's namespace, name and target.
   * @returns The bundle, or a Promise of it.
   */
  build(context: BundleContext): MaybePromise<ContentBundle>;
}
