/**
 * Part 2 of the report (ADR 0136 D4): what MCSuperMods changes for you, by thing. Each thing
 * with a plain sentence per step (a template for the step's kind) and **Show me**; under More
 * options the migration's own description and each step's path with the value before and
 * after.
 *
 * @packageDocumentation
 */

import type { UpgradeDoneItem } from '@msm/core';
import { detailSentence, plainText } from '../sentences';
import { Part, Raw, ShowMe, thingName, useReport } from './shared';

const json = (value: unknown): string => (value === undefined ? '-' : JSON.stringify(value));

/** Part 2. Hidden when the move changes nothing. */
export function DonePart({ items }: { items: readonly UpgradeDoneItem[] }) {
  const report = useReport();
  if (items.length === 0) return null;
  return (
    <Part
      id="done"
      title={report.made ? 'What MCSuperMods changed for you' : 'What MCSuperMods changes for you'}
    >
      <ul className="flex flex-col gap-1.5 pl-1" data-testid="upgrade-target-changes">
        {items.map((item, index) => {
          const testId = `upgrade-done-${index}`;
          const name = thingName(report.project, item.elementId);
          const sentences =
            item.details.length > 0
              ? item.details.map((detail) => detailSentence(detail, report.mcVersion))
              : [
                  item.kind === 'remove'
                    ? `${name} is taken out of your mod for Minecraft ${report.mcVersion}.`
                    : plainText(item.description),
                ];
          return (
            <li
              key={`${item.elementId}-${index}`}
              className="flex flex-col gap-0.5"
              data-testid={testId}
            >
              <span className="flex flex-wrap items-center gap-1 text-sm">
                <span className="font-medium" data-testid={`${testId}-thing`}>
                  {name}
                </span>
                <Raw>{`${item.elementId}:`}</Raw>
                <ShowMe elementId={item.elementId} testId={`${testId}-show`} />
              </span>
              <ul className="list-disc pl-5 text-sm" data-testid={`${testId}-steps`}>
                {[...new Set(sentences)].map((sentence) => (
                  <li key={sentence}>{sentence}</li>
                ))}
              </ul>
              {report.doneExtra?.(item)}
              <Raw testId={`${testId}-description`}>{item.description}</Raw>
              {report.ids &&
                item.details.map((detail, step) => (
                  <Raw key={`${detail.path}-${step}`}>
                    {`${detail.op} ${detail.from === undefined ? '' : `${detail.from} → `}${detail.path}: ${json(detail.before)} → ${json(detail.after)}`}
                  </Raw>
                ))}
            </li>
          );
        })}
      </ul>
    </Part>
  );
}
