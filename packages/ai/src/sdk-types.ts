/**
 * Type-only aliases of the Claude SDK's beta Messages types. Erased at build time: nothing here
 * loads `@anthropic-ai/sdk` at runtime (only `src/sdk/` does, ADR 0041 D2).
 */
import type Anthropic from '@anthropic-ai/sdk';

export type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
export type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
export type BetaContentBlock = Anthropic.Beta.Messages.BetaContentBlock;
export type BetaContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;
export type BetaRawMessageStreamEvent = Anthropic.Beta.Messages.BetaRawMessageStreamEvent;
export type BetaTool = Anthropic.Beta.Messages.BetaTool;
export type BetaToolUseBlock = Anthropic.Beta.Messages.BetaToolUseBlock;
export type BetaToolResultBlockParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;
export type BetaTextBlockParam = Anthropic.Beta.Messages.BetaTextBlockParam;
export type BetaUsage = Anthropic.Beta.Messages.BetaUsage;
export type BetaStopReason = Anthropic.Beta.Messages.BetaStopReason;

/** The params of one streamed request, without `stream` (the client sets it). */
export type ModelRequest = Omit<Anthropic.Beta.Messages.MessageCreateParamsStreaming, 'stream'>;
