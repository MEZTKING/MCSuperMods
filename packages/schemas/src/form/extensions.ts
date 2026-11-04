import type { SchemaNode } from './schema-node';

/** Deep-freezes a hand-written node so shared extension nodes cannot be mutated. */
function frozen<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) frozen(entry);
    Object.freeze(value);
  }
  return value;
}

/**
 * MSM's built-in schema extensions: schema references that are neither mcdoc type paths nor
 * `resource:`/`tag:` references, resolved by `SchemaIndex.resolveSchemaRef`. Hand-written in
 * TypeScript until compiled MSM mcdoc replaces them behind the same references (Phase 4).
 *
 * - `msm:function`: an mcfunction source stored as one string per line (`{ "lines": [...] }`).
 */
export const BUILT_IN_EXTENSIONS: Readonly<Record<string, SchemaNode>> = frozen({
  'msm:function': {
    kind: 'struct',
    fields: [{ key: 'lines', optional: false, type: { kind: 'list', item: { kind: 'string' } } }],
    spreads: [],
  },
});
