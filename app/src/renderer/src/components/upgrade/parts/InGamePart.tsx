/**
 * Part 6 of the report (ADR 0136 D4, D12): what to check in the game. The change set's checks
 * for the changes that touch the mod (with the things they concern and **Show me**), then the
 * standing checks, then the one sentence on what the report cannot know. Always shown.
 *
 * @packageDocumentation
 */

import type { UpgradeInGame } from '@msm/core';
import { inGameLimit, plainText, standingCheck } from '../sentences';
import { Part, Raw, ShowMe, thingName, useReport } from './shared';

/** Part 6. */
export function InGamePart({ inGame }: { inGame: UpgradeInGame }) {
  const report = useReport();
  return (
    <Part id="ingame" title="What to check in the game">
      <ol className="flex list-decimal flex-col gap-0.5 pl-5 text-sm" data-testid="upgrade-ingame">
        {inGame.standing.map((check) => (
          <li key={check} data-testid={`upgrade-ingame-${check}`}>
            {standingCheck(check, report.mcVersion)}
          </li>
        ))}
        {inGame.checks.map((check, index) => (
          <li key={check.changeId} data-testid={`upgrade-ingame-check-${index}`}>
            {plainText(check.check)}
            <Raw>{` ${check.changeId}`}</Raw>
            {(check.elementIds ?? []).length > 0 && (
              <span className="flex flex-wrap items-center gap-1 text-xs">
                {(check.elementIds ?? []).map((elementId, place) => (
                  <span key={elementId} className="inline-flex items-center gap-0.5">
                    {thingName(report.project, elementId)}
                    <ShowMe
                      elementId={elementId}
                      testId={`upgrade-ingame-check-${index}-show-${place}`}
                    />
                  </span>
                ))}
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="text-muted text-xs" data-testid="upgrade-ingame-limit">
        {inGameLimit(report.mcVersion)}
      </p>
    </Part>
  );
}
