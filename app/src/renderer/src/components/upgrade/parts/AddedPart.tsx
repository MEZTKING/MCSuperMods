/**
 * Part 5 of the report (ADR 0136 D4): new in this version, counted; the counts by kind under
 * More options.
 *
 * @packageDocumentation
 */

import type { UpgradeAdditions } from '@msm/core';
import { additionsSentence } from '../sentences';
import { Part, Raw, useReport } from './shared';

/** Part 5. Hidden when the version adds nothing MCSuperMods knows of. */
export function AddedPart({ added }: { added: UpgradeAdditions }) {
  const report = useReport();
  if (added.total === 0) return null;
  const kinds = Object.entries(added.byKind).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return (
    <Part id="added" title="New in this version">
      <p className="text-sm" data-testid="upgrade-added-text">
        {additionsSentence(added, report.mcVersion)}
      </p>
      <Raw testId="upgrade-added-kinds">
        {kinds.map(([kind, total]) => `${kind} ${total}`).join(', ')}
      </Raw>
    </Part>
  );
}
