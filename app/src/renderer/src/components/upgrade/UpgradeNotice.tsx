/**
 * The note at the top of Things to fix when a newer Minecraft is ready for the open mod (ADR 0136
 * D5, B817): one line, never an error, "Minecraft X is ready for this mod: 3 things change by
 * themselves, 1 needs you.", with **See what changes** (the report, B818's dialog) and **Not
 * now** (remembered for this mod and this version). A dry run that could not finish is one quiet
 * line under More options. A lazy chunk: App loads it only when there is something to show.
 *
 * Test ids: `upgrade-notice`, `upgrade-notice-text`, `upgrade-notice-see`,
 * `upgrade-notice-not-now`, `upgrade-notice-failed` (the line under More options).
 *
 * @packageDocumentation
 */

import { CircleArrowUp } from 'lucide-react';
import { MoreOptions } from '../ui/MoreOptions';
import type { UpgradeNoticeState } from './use-upgrade-notice';

/** The label of the button that opens the report. */
export const SEE_WHAT_CHANGES = 'See what changes';
/** The label of the button that puts the notice off for this mod and version. */
export const NOT_NOW = 'Not now';

const linkClass =
  'cursor-pointer rounded px-1.5 py-0.5 text-xs text-accent underline-offset-2 hover:underline';

/** The note's sentence; `mcVersion` comes from the newer target's facts. */
export function noticeSentence(mcVersion: string, done: number, todo: number): string {
  const lead = `Minecraft ${mcVersion} is ready for this mod`;
  if (done === 0 && todo === 0) return `${lead}: nothing in it needs changing.`;
  const doneText = done === 1 ? '1 thing changes by itself' : `${done} things change by themselves`;
  if (todo === 0) return `${lead}: ${doneText}.`;
  if (done === 0) {
    return `${lead}: ${todo === 1 ? '1 thing needs you' : `${todo} things need you`}.`;
  }
  return `${lead}: ${doneText}, ${todo === 1 ? '1 needs you' : `${todo} need you`}.`;
}

/** The quiet line of a dry run that could not finish (shown under More options). */
export function failedSentence(mcVersion: string, message: string): string {
  return `MCSuperMods could not check what moving to Minecraft ${mcVersion} would change: ${message}`;
}

/** Props of {@link UpgradeNotice}. */
export interface UpgradeNoticeProps {
  readonly notice: UpgradeNoticeState;
  /** **See what changes**: opens the report for the newer version. */
  readonly onSee: (targetId: string) => void;
  /** **Not now**. */
  readonly onNotNow: () => void;
}

/** The note; nothing while checking, with no newer version, or once put off. */
export function UpgradeNotice({ notice, onSee, onNotNow }: UpgradeNoticeProps) {
  if (notice.status === 'none' || notice.status === 'checking' || notice.dismissed) return null;
  if (notice.status === 'failed') {
    return (
      <MoreOptions storageKey="upgrade-notice">
        <p className="text-muted text-xs" data-testid="upgrade-notice-failed">
          {failedSentence(notice.newer.mcVersion, notice.message)}
        </p>
      </MoreOptions>
    );
  }
  return (
    <div
      role="note"
      className="flex flex-wrap items-center gap-1 rounded border border-border px-2 py-1"
      data-testid="upgrade-notice"
    >
      <CircleArrowUp size={14} aria-hidden className="text-accent" />
      <span className="text-sm" data-testid="upgrade-notice-text">
        {noticeSentence(notice.newer.mcVersion, notice.done, notice.todo)}
      </span>
      <button
        type="button"
        className={linkClass}
        data-testid="upgrade-notice-see"
        onClick={() => onSee(notice.newer.id)}
      >
        {SEE_WHAT_CHANGES}
      </button>
      <button
        type="button"
        className={linkClass}
        data-testid="upgrade-notice-not-now"
        onClick={onNotNow}
      >
        {NOT_NOW}
      </button>
    </div>
  );
}

export default UpgradeNotice;
