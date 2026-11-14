/**
 * The Rules Studios (ADR 0082 D7 (a)), discovered by `studios/studio-registry.ts`: the Rule book
 * for `msm:rules`, loaded with `React.lazy` inside a `Suspense` fallback so its code is a chunk of
 * its own. A book whose data is not an object with a list of rules stays on the schema form.
 *
 * @packageDocumentation
 */

import { RULES_KIND } from '@msm/plugin-rules';
import { lazy, Suspense } from 'react';
import type { StudioEntry, StudioProps } from '../types';
import { isRuleBookData } from './rules-model';

/** The Rule book Studio's entry id. */
export const RULE_BOOK_STUDIO_ID = 'msm.rules.book';

/** The Rule book Studio, a chunk of its own. */
const RuleBookStudio = lazy(() => import('./RuleBookStudio'));

/** The Rule book Studio behind its loading fallback. */
function LazyRuleBookStudio(props: StudioProps) {
  return (
    <Suspense
      fallback={
        <p className="text-muted text-xs" data-testid="rule-book-loading">
          Loading the Rule book…
        </p>
      }
    >
      <RuleBookStudio {...props} />
    </Suspense>
  );
}

export const studios: StudioEntry[] = [
  {
    id: RULE_BOOK_STUDIO_ID,
    kindId: RULES_KIND,
    matches: (element) => isRuleBookData(element.data),
    component: LazyRuleBookStudio,
    handlesFocus: true,
  },
];
