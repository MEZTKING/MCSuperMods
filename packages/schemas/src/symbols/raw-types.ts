/**
 * Raw mcdoc type shapes as written by `@spyglassmc/mcdoc-cli export symbols.json`.
 *
 * These mirror the `McdocType` union of `@spyglassmc/mcdoc` (`lib/type/index.d.ts`) without
 * depending on it, so Spyglass types never leak out of this package (ADR 0005). Only the
 * properties MSM reads are typed precisely; everything is treated as untrusted input and
 * checked by `parseVanillaMcdocSymbols` before use.
 */

/** A value inside an attribute's tree form, e.g. `#[id(registry="item")]`. */
export interface RawAttributeTree {
  kind: 'tree';
  values: Record<string, unknown>;
}

/** One mcdoc attribute such as `#[since="1.0"]` or `#[id="item"]`. */
export interface RawAttribute {
  name: string;
  value?: RawMcdocType | RawAttributeTree;
}

/**
 * Spyglass numeric range. `kind` is the `RangeKind` bit set from `@spyglassmc/mcdoc`
 * (`lib/node/index.js`): bit `0b10` means the minimum is exclusive, bit `0b01` means the
 * maximum is exclusive.
 */
export interface RawNumericRange {
  kind: number;
  min?: number;
  max?: number;
}

/** Properties every raw type may carry. */
export interface RawBase {
  attributes?: RawAttribute[];
}

/** A `key: type` struct entry. `key` is a type when the struct is map-like. */
export interface RawPairField extends RawBase {
  kind: 'pair';
  key: string | RawMcdocType;
  type: RawMcdocType;
  optional?: boolean;
  deprecated?: boolean;
  desc?: string;
}

/** A `...type` struct entry. */
export interface RawSpreadField extends RawBase {
  kind: 'spread';
  type: RawMcdocType;
}

export type RawStructField = RawPairField | RawSpreadField;

export interface RawStructType extends RawBase {
  kind: 'struct';
  fields: RawStructField[];
}

export interface RawListType extends RawBase {
  kind: 'list';
  item: RawMcdocType;
  lengthRange?: RawNumericRange;
}

export interface RawStringType extends RawBase {
  kind: 'string';
  lengthRange?: RawNumericRange;
}

export interface RawKeywordType extends RawBase {
  kind: 'boolean' | 'any' | 'unsafe';
}

export type RawNumericKind = 'byte' | 'short' | 'int' | 'long' | 'float' | 'double';

export interface RawNumericType extends RawBase {
  kind: RawNumericKind;
  valueRange?: RawNumericRange;
}

export interface RawEnumValue extends RawBase {
  identifier: string;
  value: string | number;
  desc?: string;
}

export interface RawEnumType extends RawBase {
  kind: 'enum';
  enumKind?: 'byte' | 'short' | 'int' | 'long' | 'float' | 'double' | 'string';
  values: RawEnumValue[];
}

export interface RawLiteralValue {
  kind: string;
  value: string | number | boolean;
}

export interface RawLiteralType extends RawBase {
  kind: 'literal';
  value: RawLiteralValue;
}

export interface RawUnionType extends RawBase {
  kind: 'union';
  members: RawMcdocType[];
}

export interface RawReferenceType extends RawBase {
  kind: 'reference';
  path?: string;
}

export interface RawStaticIndex {
  kind: 'static';
  value: string;
}

export interface RawDynamicIndex {
  kind: 'dynamic';
  accessor: (string | { keyword: 'key' | 'parent' })[];
}

export type RawIndex = RawStaticIndex | RawDynamicIndex;

export interface RawDispatcherType extends RawBase {
  kind: 'dispatcher';
  registry: string;
  parallelIndices: RawIndex[];
}

/** A generic type declaration, e.g. `type InclusiveRange<T> = ...`. */
export interface RawTemplateType extends RawBase {
  kind: 'template';
  child: RawMcdocType;
  /** Each parameter is named by a type path (e.g. `::java::util::T`) that `child` references. */
  typeParams: { path: string }[];
}

/** A generic instantiation, e.g. `InclusiveRange<int>`. */
export interface RawConcreteType extends RawBase {
  kind: 'concrete';
  child: RawMcdocType;
  typeArgs: RawMcdocType[];
}

/** A fixed-length heterogeneous list, e.g. `[int, int]` written as a tuple. */
export interface RawTupleType extends RawBase {
  kind: 'tuple';
  items: RawMcdocType[];
}

/** `byte[]`, `int[]` or `long[]`, with optional length and element value ranges. */
export interface RawPrimitiveArrayType extends RawBase {
  kind: 'byte_array' | 'int_array' | 'long_array';
  lengthRange?: RawNumericRange;
  valueRange?: RawNumericRange;
}

/** Kinds MSM does not model; they normalise to `unsupported`. */
export type RawUnsupportedKind = 'indexed' | 'mapped';

export interface RawUnsupportedType extends RawBase {
  kind: RawUnsupportedKind;
  [property: string]: unknown;
}

/** Discriminated union (on `kind`) of every raw mcdoc type MSM recognises. */
export type RawMcdocType =
  | RawStructType
  | RawListType
  | RawStringType
  | RawKeywordType
  | RawNumericType
  | RawEnumType
  | RawLiteralType
  | RawUnionType
  | RawReferenceType
  | RawDispatcherType
  | RawTemplateType
  | RawConcreteType
  | RawTupleType
  | RawPrimitiveArrayType
  | RawUnsupportedType;
