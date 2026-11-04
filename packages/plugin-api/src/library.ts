/**
 * Library contribution points: element templates, project starters and examples (ADR 0020).
 *
 * The host (the app) owns the pickers and dialogs; plugins own the content. Everything here
 * is plain data plus pure functions, with no Node or DOM types (`Uint8Array` only), so that
 * sandboxed third-party plugins can contribute the same way built-ins do.
 *
 * @packageDocumentation
 */

import type { Json, ResourceLocation } from './json';
import type { OutputLayer } from './output';

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
  /** The kind's `defaultData`, deep-copied by the host, or `undefined` when it has none. */
  kindDefault: Json | undefined;
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
   * Starting data for the new element. Must be pure; the host validates the result like any
   * user edit.
   *
   * @param context - The new element's id and the open project's namespaces.
   */
  data(context: TemplateContext): Json;
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
   * Builds the starter's content. Must be pure and deterministic. The host adds
   * `<namespace>:pack` when the bundle has no `pack.mcmeta` element.
   *
   * @param context - The new project's namespace and name.
   */
  build(context: BundleContext): ContentBundle;
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
   * Builds the example's content. Must be pure and deterministic.
   *
   * @param context - The target project's namespace and name.
   */
  build(context: BundleContext): ContentBundle;
}
