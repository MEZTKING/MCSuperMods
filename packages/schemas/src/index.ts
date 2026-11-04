/**
 * `@msm/schemas`: MSM's schema model over vanilla-mcdoc.
 *
 * Phase 0 reads the Spyglass symbol export (ADR 0005); the export itself is vendored in the
 * target package and injected here. Nothing in this package names a Minecraft version.
 */

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
  parseVanillaMcdocSymbols,
  SymbolsFormatError,
  type VanillaMcdocSymbols,
} from './symbols/parse';
export type * from './symbols/raw-types';
export { compareGameVersions, isVersionInRange } from './version/compare';
