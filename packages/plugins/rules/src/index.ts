/**
 * `@msm/plugin-rules`: built-in MSM plugin for Rules, behaviour without code (ADR 0082): the
 * `msm:rules` kind (rule books) and its lowering to the generated script, the project expander
 * that compiles the books into events on their subjects (plugin API 1.15.0), the `rules.*`
 * validators and the "Rules" templates. The catalogue, the compiler and the sentences are
 * exported for the Rule book Studio (B372) and the AI helper (B382).
 */
import { definePlugin } from '@msm/plugin-api';
import { rulesExpander } from './expander';
import { rulesKinds } from './kinds';
import { rulesTemplates } from './templates';
import { rulesValidators } from './validators';

export * from './catalogue';
export * from './compile';
export {
  type CopiedSubject,
  copyRuleBookAsScript,
  type RuleBookCopy,
  type RuleBookCopyResult,
} from './copy';
export { expandRules, RULES_EXPANDER_ID, RULES_EXPANDER_KINDS, rulesExpander } from './expander';
export * from './kinds';
export * from './lowering';
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
export { rulesTemplates } from './templates';
export {
  RULES_PROBLEM_CODES,
  RULES_VALIDATOR_CODES,
  rulesBookValidator,
  rulesValidators,
} from './validators';

export default definePlugin({
  id: 'msm.rules',
  apiVersion: '^1.0.0',
  contributes: {
    searchData: () => import('./search').then((m) => m.SEARCH),
    elementKinds: [...rulesKinds],
    elementTemplates: [...rulesTemplates],
    validators: [...rulesValidators],
    projectExpanders: [rulesExpander],
  },
});
