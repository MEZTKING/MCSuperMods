/**
 * Moving a project across Minecraft versions (ADR 0136 D3, D4, D6, D7): chains, the inverse
 * for moving back, problem identity and the upgrade report model. Pure; targets arrive as
 * arguments.
 *
 * @packageDocumentation
 */

export type {
  ChainHop,
  ChainRun,
  ChainStep,
  InvertResult,
  MigrationChain,
  NotRestored,
  NotRestoredReason,
  Restored,
} from './chain';
export {
  applyMigration,
  elementDataHash,
  invert,
  migrationChain,
  runChain,
  UpgradeProblemCodes,
} from './chain';
export type { ChangeTouch, NewProblemsOptions } from './compare';
export { mapProblemThroughMigration, matchChanges, newProblems, problemKey } from './compare';
export type {
  UpgradeAdditions,
  UpgradeChangedItem,
  UpgradeDoneItem,
  UpgradeInGame,
  UpgradeItemCheck,
  UpgradePlace,
  UpgradePlayerFact,
  UpgradePlayerRow,
  UpgradePlayers,
  UpgradeReport,
  UpgradeReportInput,
  UpgradeStandingCheck,
  UpgradeTodoItem,
  UpgradeUntouched,
} from './report';
export { buildUpgradeReport, openItems } from './report';
