/**
 * `@msm/schemas/mcfunction`: the offline Spyglass mcfunction service (ADR 0014).
 *
 * This subpath is never re-exported from the root `@msm/schemas` entry, so the renderer bundle
 * never sees Spyglass. Only MSM types are exported.
 */

export {
  createMcfunctionService,
  DEFAULT_COMPLETION_LIMIT,
  defaultFunctionUri,
  MAX_SOURCE_LENGTH,
} from './service';
export type {
  McfunctionCheckOptions,
  McfunctionCompleteOptions,
  McfunctionCompletion,
  McfunctionData,
  McfunctionProblem,
  McfunctionService,
  McfunctionServiceOptions,
} from './types';
