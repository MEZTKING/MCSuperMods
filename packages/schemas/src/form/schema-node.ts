/**
 * MSM's own schema model, normalised from mcdoc. Editors consume this; Spyglass types never
 * appear here. Nodes are already filtered for one game version (see `createSchemaIndex`).
 */

/** A numeric bound pair. Absent `min`/`max` means unbounded; exclusivity flags default to false. */
export interface NumericRange {
  min?: number;
  max?: number;
  minExclusive?: boolean;
  maxExclusive?: boolean;
}

/** Properties every node may carry. */
export interface NodeBase {
  desc?: string;
  deprecated?: boolean;
  /**
   * Sorted, de-duplicated names of the mcdoc attributes on this type other than `since`,
   * `until`, `deprecated` and `id`, e.g. `texture_slot`, `translation_key`, `color`.
   * Editors use them as hints; attribute arguments are not modelled.
   */
  tags?: string[];
  /**
   * Set when a type other than a plain string carries `#[id]`, e.g. a field typed
   * `#[id] SomeEnum`: its string values are resource locations, so validators also accept
   * them with a `minecraft:` prefix.
   */
  resourceId?: true;
}

/**
 * One struct field. A map-like mcdoc struct (`[string]: T`) is represented by a field whose
 * `key` is `'*'` and which is always optional.
 */
export interface SchemaField {
  key: string;
  type: SchemaNode;
  /** For a `'*'` field: the normalised key type, e.g. a string tagged `texture_slot`. */
  keyType?: SchemaNode;
  optional: boolean;
  desc?: string;
  deprecated?: boolean;
}

/** Numeric storage kinds, as in NBT and mcdoc. */
export type NumberKind = 'byte' | 'short' | 'int' | 'long' | 'float' | 'double';

/** One step of a dispatcher's dynamic index: a field name, the map key, or the parent. */
export type DiscriminatorStep = string | '%key' | '%parent';

export type SchemaNode =
  | (NodeBase & {
      kind: 'struct';
      fields: SchemaField[];
      /** Spreads that could not be inlined (dispatchers, cycles, unsupported kinds). */
      spreads: SchemaNode[];
    })
  | (NodeBase & {
      kind: 'list';
      item: SchemaNode;
      lengthRange?: NumericRange;
      /** Set when the list came from an mcdoc `byte[]`, `int[]` or `long[]`. */
      primitiveArray?: 'byte' | 'int' | 'long';
    })
  | (NodeBase & { kind: 'tuple'; items: SchemaNode[] })
  | (NodeBase & {
      kind: 'string';
      /** From `#[id=...]` (string form, or the tree form's `registry`). */
      idRegistry?: string;
      lengthRange?: NumericRange;
    })
  | (NodeBase & { kind: 'number'; numberKind: NumberKind; range?: NumericRange })
  | (NodeBase & { kind: 'boolean' })
  | (NodeBase & {
      kind: 'enum';
      values: { identifier: string; value: string | number; desc?: string }[];
    })
  | (NodeBase & { kind: 'literal'; value: string | number | boolean })
  | (NodeBase & { kind: 'union'; members: SchemaNode[] })
  | (NodeBase & {
      kind: 'reference';
      /**
       * The referenced type path. A reference that breaks a cycle of generic instantiations
       * carries the template's path; use `resolve()`, not `SchemaIndex.resolve(path)`, for it.
       */
      path: string;
      /** Lazy, memoised and cycle-safe; throws `SchemaNotFoundError` for an unknown path. */
      resolve(): SchemaNode;
    })
  | (NodeBase & {
      kind: 'dispatcher';
      registry: string;
      /** Accessor for a dynamic index, e.g. `["type"]`; `[]` for a static index. */
      discriminator: DiscriminatorStep[];
      /** Keys available in this version, sorted. */
      keys(): string[];
      /** The member for `key` (ignored for a static index), or `undefined`. */
      dispatch(key: string): SchemaNode | undefined;
    })
  | (NodeBase & { kind: 'any' })
  | (NodeBase & { kind: 'unsupported'; reason: string; rawKind: string });

/** The `kind` values of `SchemaNode`. */
export type SchemaNodeKind = SchemaNode['kind'];
