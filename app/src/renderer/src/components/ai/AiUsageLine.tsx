import { type AiModelId, type AiUsage, estimateCost, formatCost } from '@msm/ai';
import { shortModelLabel } from './ai-controller';
import { costSentence } from './ai-words';

const NUMBER = new Intl.NumberFormat('en-GB');

/**
 * The usage in figures: "12,431 in / 3,210 out, 4 requests, about $0.11, Opus 5.5". Input
 * counts every input token (uncached, cache reads and cache writes). The cost is approximate
 * (model table prices, ADR 0041 D7). The panel shows {@link costSentence} instead (ADR 0125 D8).
 */
export function usageText(usage: AiUsage, model: AiModelId): string {
  const input = usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
  const requests = `${usage.requests} request${usage.requests === 1 ? '' : 's'}`;
  return `${NUMBER.format(input)} in / ${NUMBER.format(usage.outputTokens)} out, ${requests}, ${formatCost(estimateCost(model, usage))}, ${shortModelLabel(model)}`;
}

/** The token breakdown and the date the prices were read (the panel's More options). */
export function usageDetail(usage: AiUsage, checkedOn: string): string {
  return (
    `Input ${NUMBER.format(usage.inputTokens)}, cache read ${NUMBER.format(usage.cacheReadInputTokens)}, ` +
    `cache write ${NUMBER.format(usage.cacheCreationInputTokens)}, output ${NUMBER.format(usage.outputTokens)}. ` +
    `The cost is approximate (prices checked on ${checkedOn}).`
  );
}

/**
 * The conversation's cost as one sentence (ADR 0125 D8): "This chat has cost about $0.11 so
 * far." The breakdown is in the panel's More options. Nothing is shown before the first
 * request.
 */
export function AiUsageLine(props: { usage: AiUsage; model: AiModelId; checkedOn: string }) {
  const sentence = costSentence(props.usage, props.model);
  if (sentence === null) return null;
  return (
    <p className="text-xs text-muted" data-testid="ai-usage">
      {sentence}
    </p>
  );
}
