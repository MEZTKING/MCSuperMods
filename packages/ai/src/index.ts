/**
 * `@msm/ai`: the AI helper's logic without Electron (ADR 0041 D2). This entry never loads
 * `@anthropic-ai/sdk` at runtime; SDK types are imported with `import type` only. The real client
 * is in `@msm/ai/sdk`.
 */

export {
  type AiKeyTestResult,
  type ConversationState,
  createConversation,
  KEY_TEST_MODEL,
  type ModelClient,
  testApiKey,
} from './client';
export { describeModelClientError, ModelClientError, ModelOutputError } from './errors';
export {
  buildRequest,
  FALLBACK_BETA,
  limitMessage,
  MAX_TOKENS,
  OUTPUT_ERROR_RETRIES,
  type RunAssistantOptions,
  type RunAssistantResult,
  runAssistant,
  TASK_BUDGET_BETA,
} from './loop';
export {
  AI_MODELS,
  type AiModelInfo,
  type AiModelPricing,
  CACHE_WRITE_MULTIPLIER,
  estimateCost,
  formatCost,
  modelInfo,
} from './models';
export {
  AI_IMAGE_MAX_BASE64,
  AI_IMAGE_MAX_BYTES,
  AI_IMAGE_MEDIA_TYPES,
  AI_IMAGES_MAX,
  AI_MODEL_IDS,
  type AiDoneReason,
  type AiEffort,
  type AiEvent,
  type AiHost,
  type AiImage,
  type AiMode,
  type AiModelId,
  type AiRunLimits,
  type AiSettings,
  type AiStartRequest,
  type AiStopDetails,
  type AiToolRequest,
  type AiToolResult,
  type AiUsage,
  addUsage,
  aiDoneReasonSchema,
  aiEffortSchema,
  aiEventSchema,
  aiImageSchema,
  aiModelIdSchema,
  aiModeSchema,
  aiRunLimitsSchema,
  aiSettingsSchema,
  aiStartRequestSchema,
  aiToolRequestSchema,
  aiToolResultSchema,
  aiUsageSchema,
  DEFAULT_AI_MODEL,
  DEFAULT_AI_SETTINGS,
  DEFAULT_EFFORT,
  DEFAULT_LIMITS,
  emptyUsage,
  TASK_BUDGET_MIN,
} from './protocol';
export {
  type AiModelScript,
  aiModelScriptSchema,
  type ScriptedBlock,
  ScriptedModelClient,
  type ScriptedTurn,
} from './scripted-client';
export type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
  BetaRawMessageStreamEvent,
  BetaTool,
  ModelRequest,
} from './sdk-types';
export { type AiProjectContext, projectContextBlock, systemPrompt } from './system-prompt';
export {
  AI_TOOL_NAMES,
  type AiToolDefinition,
  type AiToolInputs,
  type AiToolName,
  isAiToolName,
  normaliseJsonSchema,
  type ParsedToolInput,
  parseToolInput,
  TOOL_CATALOGUE,
  toolDefinition,
  toolParams,
} from './tools/catalogue';
export type { RunChecksInput } from './tools/check';
export { LIST_PAGE_SIZE, READ_ELEMENT_MAX_BYTES } from './tools/common';
export type {
  CheckpointDecision,
  CheckpointInput,
  PlanDecision,
  ProposePlanInput,
} from './tools/decide';
export type { NoteMissingFeatureInput } from './tools/note';
export {
  type AddStarterInput,
  CREATE_ELEMENTS_MAX,
  type CreateElementsInput,
  type CreateTextureInput,
  type DeleteElementInput,
  PLACEHOLDER_PATTERN_NAMES,
  type RenameElementInput,
  type UpdateElementInput,
} from './tools/propose';
export type {
  KindSchemaInput,
  ListElementsInput,
  ListKindsInput,
  ListProblemsInput,
  ListStartersInput,
  ListTemplatesInput,
  PendingChangesInput,
  ProjectSummaryInput,
  ReadElementInput,
  ScriptApiTypingsInput,
  TargetFactsInput,
  TemplateDataInput,
} from './tools/read';
