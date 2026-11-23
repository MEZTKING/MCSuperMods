import { type AiModelId, type AiUsage, estimateCost, formatCost } from '@msm/ai';
import { usePreferences } from '../../store/preferences';
import { shortModelLabel } from './ai-controller';
import { costSentence, type UiMode } from './ai-words';

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

/** Advanced's tooltip: the token breakdown and the date the prices were read. */
export function usageDetail(usage: AiUsage, checkedOn: string): string {
  return (
    `Input ${NUMBER.format(usage.inputTokens)}, cache read ${NUMBER.format(usage.cacheReadInputTokens)}, ` +
    `cache write ${NUMBER.format(usage.cacheCreationInputTokens)}, output ${NUMBER.format(usage.outputTokens)}. ` +
    `The cost is approximate (prices checked on ${checkedOn}).`
  );
}

/**
 * The conversation's cost as one sentence (ADR 0125 D8): "This chat has cost about $0.11 so
 * far." Advanced adds the tokens, requests and model, and the breakdown in its tooltip. Nothing
 * is shown before the first request. `mode` defaults to the preference.
 */
export function AiUsageLine(props: {
  usage: AiUsage;
  model: AiModelId;
  checkedOn: string;
  mode?: UiMode;
}) {
  const preferred = usePreferences((state) => state.mode);
  const mode = props.mode ?? preferred;
  const sentence = costSentence(props.usage, props.model, mode);
  if (sentence === null) return null;
  return (
    <p
      className="text-xs text-muted"
      data-testid="ai-usage"
      title={mode === 'advanced' ? usageDetail(props.usage, props.checkedOn) : undefined}
    >
      {sentence}
    </p>
  );
}
