/**
 * Part 4 of the report (ADR 0136 D4, D10): what your players need, from both versions' facts:
 * one row per fact with its value before and after, the exports a version cannot make, and a
 * line when the version moved to is a test version. The pack changes of the change set and the
 * rows' raw names under More options.
 *
 * @packageDocumentation
 */

import type { UpgradePlayers } from '@msm/core';
import {
  changeSentence,
  PLAYER_FACT_LABELS,
  PLAYER_FACT_NAMES,
  playerValue,
  todoItemText,
} from '../sentences';
import { Part, Raw, useReport } from './shared';

/** Part 4. */
export function PlayersPart(props: {
  players: UpgradePlayers;
  /** Whether the version moved to is a test version (a snapshot or pre-release). */
  testVersion: boolean;
}) {
  const report = useReport();
  const { rows, exports, changes } = props.players;
  if (rows.length === 0 && exports.length === 0) return null;
  return (
    <Part id="players" title="What your players need">
      <table className="w-full text-sm" data-testid="upgrade-players">
        <thead className="sr-only">
          <tr>
            <th scope="col">What</th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.fact}
              data-testid={`upgrade-players-${row.fact}`}
              data-changed={row.changed ? 'true' : undefined}
            >
              <th scope="row" className="py-0.5 pr-2 text-left font-normal">
                {PLAYER_FACT_LABELS[row.fact]}
                {PLAYER_FACT_NAMES[row.fact] !== undefined && (
                  <Raw>{` (${PLAYER_FACT_NAMES[row.fact]})`}</Raw>
                )}
              </th>
              <td className="py-0.5 pr-2 text-muted">{playerValue(row.fact, row.before)}</td>
              <td className={`py-0.5 ${row.changed ? 'font-medium' : 'text-muted'}`}>
                {row.changed ? playerValue(row.fact, row.after) : 'the same'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {exports.length > 0 && (
        <ul className="list-disc pl-5 text-sm" data-testid="upgrade-players-exports">
          {exports.map((problem, index) => (
            <li key={`${problem.code}-${problem.elementId ?? ''}-${index}`}>
              {todoItemText(
                { id: problem.code, source: 'export', problem, check: 'problem' },
                report.project,
                report.mcVersion,
              )}
              <Raw>{` ${problem.code}: ${problem.message}`}</Raw>
            </li>
          ))}
        </ul>
      )}
      {props.testVersion && (
        <p className="text-sm" data-testid="upgrade-players-test-version">
          {`Minecraft ${report.mcVersion} is a test version: it can change every week, and a mod moved to it may need moving again when MCSuperMods follows the next one.`}
        </p>
      )}
      {report.ids && changes.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs" data-testid="upgrade-players-changes">
          {changes.map(({ targetId, change }) => (
            <li key={`${targetId}-${change.id}`}>
              <Raw>{`${change.id}: ${changeSentence(change, report.versionOf(targetId))}`}</Raw>
            </li>
          ))}
        </ul>
      )}
    </Part>
  );
}
