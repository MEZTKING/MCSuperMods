import { type AiModelId, type AiUsage, estimateCost, formatCost } from '@msm/ai';
import { shortModelLabel } from './ai-controller';

const NUMBER = new Intl.NumberFormat('en-GB');

/**
 * The usage line: "12,431 in / 3,210 out, 4 requests, about $0.11, Opus 5.5". Input counts
 * every input token (uncached, cache reads and cache writes). The cost is approximate (model
 * table prices, ADR 0041 D7).
 */
export function usageText(usage: AiUsage, model: AiModelId): string {
  const input = usage.inputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens;
  const requests = `${usage.requests} request${usage.requests === 1 ? '' : 's'}`;
  return `${NUMBER.format(input)} in / ${NUMBER.format(usage.outputTokens)} out, ${requests}, ${formatCost(estimateCost(model, usage))}, ${shortModelLabel(model)}`;
}

/** The conversation's usage line, with the token breakdown and price date in its tooltip. */
export function AiUsageLine(props: { usage: AiUsage; model: AiModelId; checkedOn: string }) {
  const { usage } = props;
  const title =
    `Input ${NUMBER.format(usage.inputTokens)}, cache read ${NUMBER.format(usage.cacheReadInputTokens)}, ` +
    `cache write ${NUMBER.format(usage.cacheCreationInputTokens)}, output ${NUMBER.format(usage.outputTokens)}. ` +
    `The cost is approximate (prices checked on ${props.checkedOn}).`;
  return (
    <p className="text-xs text-muted" data-testid="ai-usage" title={title}>
      {usageText(usage, props.model)}
    </p>
  );
}
