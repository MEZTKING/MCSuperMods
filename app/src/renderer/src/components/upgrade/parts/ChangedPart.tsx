/**
 * Part 1 of the report (ADR 0136 D4): what changed in Minecraft for this mod. One item per
 * change-set entry that touches the mod, named once in plain words (the curated sentence, else
 * the template for its kind), with each thing it touches and **Show me** for it; the change's id
 * and the places' paths under More options.
 *
 * @packageDocumentation
 */

import type { Problem, UpgradeChangedItem } from '@msm/core';
import { changeSentence } from '../sentences';
import { AskHelper, Part, Raw, ShowMe, thingName, useReport } from './shared';

/** Part 1. Hidden when no change touches the mod. */
export function ChangedPart({ items }: { items: readonly UpgradeChangedItem[] }) {
  const report = useReport();
  if (items.length === 0) return null;
  return (
    <Part id="changed" title="What changed in Minecraft for this mod">
      <ul className="flex flex-col gap-1.5 pl-1">
        {items.map((item, index) => {
          const testId = `upgrade-changed-${index}`;
          const sentence = changeSentence(item.change, report.versionOf(item.targetId));
          const first = item.elementIds[0];
          const ask: Problem | null =
            first === undefined
              ? null
              : {
                  severity: 'info',
                  code: 'upgrade.changed-in-minecraft',
                  message: `${sentence} (${item.change.id})`,
                  elementId: first,
                };
          return (
            <li
              key={`${item.targetId}-${item.change.id}`}
              className="flex flex-col gap-0.5"
              data-testid={testId}
            >
              <span className="text-sm" data-testid={`${testId}-text`}>
                {sentence}
              </span>
              <Raw testId={`${testId}-id`}>{item.change.id}</Raw>
              <ul className="flex flex-col gap-0.5 pl-3 text-xs">
                {item.elementIds.map((elementId, place) => {
                  const paths = item.places
                    .filter((entry) => entry.elementId === elementId)
                    .map((entry) => entry.path ?? '');
                  return (
                    <li key={elementId} className="flex flex-wrap items-center gap-1">
                      <span>{thingName(report.project, elementId)}</span>
                      <Raw>{`${elementId} ${paths.filter((path) => path !== '').join(', ')}`}</Raw>
                      <ShowMe
                        elementId={elementId}
                        path={paths.find((path) => path !== '')}
                        testId={`${testId}-show-${place}`}
                      />
                    </li>
                  );
                })}
              </ul>
              {ask !== null && (
                <span className="self-start pl-2">
                  <AskHelper problem={ask} testId={`${testId}-ask`} />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Part>
  );
}
