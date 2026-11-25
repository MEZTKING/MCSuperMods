/**
 * `@msm/target-migrate`: the shared migration engine of the targets (ADR 0136 D3). General: it
 * holds no version fact and imports no target; each target's `migrateFrom` is this engine over
 * the target's own change set. `tools/check-deps` proves both.
 *
 * @packageDocumentation
 */

export { createMigration, MigrationProblemCodes } from './engine';
export { canonicalJson, dataHash } from './hash';
export { inversePlan, inverseStep } from './inverse';
export {
  compareShapes,
  curatedErrors,
  curatedSteps,
  mergeChangeSet,
  planFromChangeSet,
} from './plan';
export { applyBlockStateStep } from './steps/block-states';
export { applyFieldStep, type FieldOutcome } from './steps/fields';
export {
  idLookup,
  idSteps,
  idTablesFromChangeSet,
  type KnownRename,
  type RemovedIdTables,
  removedIdChangeId,
} from './steps/ids';
export {
  type BlockStateStep,
  type CuratedChange,
  type CuratedChangeSet,
  type CuratedRename,
  type CuratedStep,
  DEFAULT_PLAIN_TEXT_KINDS,
  type DropStep,
  type FieldStep,
  type IdStep,
  type MigrationPlan,
  type MigrationStep,
  type MoveStep,
  type Place,
  type SetStep,
} from './types';
export {
  expandPattern,
  findIds,
  type IdMatch,
  parsePointer,
  pointer,
  valueAt,
} from './walk';
