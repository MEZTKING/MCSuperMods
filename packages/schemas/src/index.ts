/**
 * `@msm/schemas`: MSM's schema model over vanilla-mcdoc.
 *
 * It reads the Spyglass symbol export (ADR 0005); the export itself is vendored in the
 * target package and injected here. Nothing in this package names a Minecraft version.
 */

export { BUILT_IN_EXTENSIONS } from './form/extensions';
export {
  createSchemaIndex,
  type SchemaIndex,
  type SchemaIndexOptions,
  SchemaNotFoundError,
} from './form/index-builder';
export {
  attributeString,
  isAvailable,
  type NormaliseContext,
  normaliseRange,
  normaliseType,
  type TypeBindings,
} from './form/normalise';
export type {
  DiscriminatorStep,
  NodeBase,
  NumberKind,
  NumericRange,
  SchemaField,
  SchemaNode,
  SchemaNodeKind,
} from './form/schema-node';
export {
  createRegistryIndex,
  type RegistryIndex,
  type RegistryIndexInput,
} from './registry/registry-index';
export {
  parseVanillaMcdocSymbols,
  SymbolsFormatError,
  type VanillaMcdocSymbols,
} from './symbols/parse';
export type * from './symbols/raw-types';
export {
  type CollectedReference,
  type CollectReferencesOptions,
  collectReferences,
  describeSchemaNode,
  type SchemaProblem,
  type SchemaProblemCode,
  type ValidateOptions,
  validateJson,
} from './validate/validate';
export { compareGameVersions, isVersionInRange } from './version/compare';
