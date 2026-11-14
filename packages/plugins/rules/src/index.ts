/**
 * `@msm/plugin-rules`: built-in MSM plugin for Rules, behaviour without code (ADR 0082). The
 * catalogue, the compiler and the sentences are exported for the kind's lowering and expander
 * (B368), the Rule book Studio (B372) and the AI helper (B382).
 */
import { definePlugin } from '@msm/plugin-api';

export * from './catalogue';
export * from './compile';
export {
  conditionSentence,
  formatNumber,
  humanizeId,
  placeSentence,
  type RuleNames,
  ruleSentence,
  type SentenceContext,
  stepSentence,
  stepsSentence,
  textSentence,
  valueSentence,
  whenSentence,
  whoSentence,
} from './sentence';

export default definePlugin({
  id: 'msm.rules',
  apiVersion: '^1.0.0',
  contributes: {},
});
