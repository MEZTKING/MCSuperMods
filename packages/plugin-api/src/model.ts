/**
 * Intermediate representation (IR) types: the in-memory shape of an MSM project.
 *
 * Only the types live here so that plugins can read and produce them without depending on
 * `@msm/core`. Serialisation, load/save, the command stack and the registry are behaviour
 * and live in `@msm/core`, which re-exports these types (ADR 0008).
 *
 * @packageDocumentation
 */

import type { Json, ResourceLocation } from './json';

/**
 * Bookkeeping information attached to every {@link Element}. It never affects lowering.
 */
export interface ElementMeta {
  /** Creation time as an ISO 8601 UTC timestamp, for example `2026-11-04T12:00:00.000Z`. */
  createdAt: string;
  /** Free-form notes written by the user. */
  notes?: string;
  /** User-defined tags used for searching and grouping in the editor. */
  tags?: string[];
}

/**
 * One piece of content in a project, such as a recipe, a block or a loot table.
 *
 * Each element is stored as one JSON file under `content/<namespace>/<kind-folder>/` and is
 * turned into output files by its kind's {@link ElementKind.lower} function.
 *
 * @typeParam D - The shape of the element's data, as described by its kind's schema.
 */
export interface Element<D extends Json = Json> {
  /** Version of the element file format, used by `@msm/core` to migrate old files. */
  formatVersion: number;
  /** The element's resource location, unique within the project. */
  id: ResourceLocation;
  /** The id of the {@link ElementKind} that owns this element, for example `minecraft:recipe`. */
  kind: string;
  /** The element's content, shaped by the kind's schema. */
  data: D;
  /** Bookkeeping information; see {@link ElementMeta}. */
  meta: ElementMeta;
}

/**
 * A binary file stored in a project, such as a texture, a sound or a model.
 *
 * The bytes are held by the project storage, not by this record.
 */
export interface Asset {
  /** POSIX path relative to the namespace's asset root, for example `textures/block/ruby.png`. */
  path: string;
  /** IANA media type, for example `image/png`. */
  mediaType: string;
}

/**
 * A namespace groups elements and assets that share the same resource-location namespace.
 */
export interface Namespace {
  /** The namespace name, for example `my_mod`. Lower-case. */
  name: string;
  /** Every element in this namespace. */
  elements: Element[];
  /** Every asset in this namespace. */
  assets: Asset[];
}

/**
 * A whole MSM project as held in memory.
 */
export interface Project {
  /** Version of the project file format, used by `@msm/core` to migrate old projects. */
  formatVersion: number;
  /** Human-readable project name. */
  name: string;
  /** The project's namespaces. */
  namespaces: Namespace[];
  /** Ids of the targets the project exports for, such as `mc-<version>`. */
  targets: string[];
  /** Ids of the plugins the project requires. */
  plugins: string[];
  /** Project-wide settings, keyed by setting id. */
  settings: Record<string, Json>;
}
