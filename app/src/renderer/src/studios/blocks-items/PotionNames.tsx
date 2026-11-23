/**
 * The Potion Studio's preview (ADR 0063 D9), out of the Studio so the Creator and the AI helper
 * show it too (B615): the four item names (potion, splash, lingering, arrow) and the registry ids
 * the potion adds (its own, `long_` and `strong_`).
 *
 * @packageDocumentation
 */

import type { Element } from '@msm/core';
import { InMore } from '../../components/ui/MoreOptions';
import { potionIds, potionItemNames } from './potion-model';

/** The names and, in More options, the ids (`<testId>-names`, `<testId>-ids`). */
export function PotionNames(props: { element: Element; testId?: string }) {
  const testId = props.testId ?? 'potion-preview';
  const names = potionItemNames(props.element);
  const ids = potionIds(props.element);
  return (
    <>
      <ul className="flex flex-col gap-0.5 text-xs" data-testid={`${testId}-names`}>
        {names.map(({ key, text }) => (
          <li key={key}>{text}</li>
        ))}
      </ul>
      <InMore>
        <p className="text-muted text-xs" data-testid={`${testId}-ids`}>
          Potion ids: {ids.join(', ')}
        </p>
      </InMore>
    </>
  );
}
