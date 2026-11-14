/**
 * "Restart needed" (ADR 0084 D6): what a Reload could not send to the running game, in the
 * plain sentences main wrote, with a Restart button that quits the game, installs and starts
 * it again (D5).
 *
 * @packageDocumentation
 */

import type { PlayRestartReason } from '../../../../shared/platform';
import { PLAY_CONTROL_LABELS, restartTexts } from '../../store/play-store';
import { Modal } from '../NewElementDialog';

export interface RestartNeededDialogProps {
  /** The reasons from the Reload (or the status), each with its `text`. */
  reasons: readonly PlayRestartReason[];
  /** Disables Restart while something runs. */
  busy: boolean;
  onRestart(): void;
  onClose(): void;
}

export function RestartNeededDialog(props: RestartNeededDialogProps) {
  const texts = restartTexts(props.reasons);
  return (
    <Modal
      title={PLAY_CONTROL_LABELS.restartTitle}
      error={null}
      wide
      testId="play-restart-dialog"
      submitLabel={PLAY_CONTROL_LABELS.restartButton}
      busy={props.busy}
      onCancel={props.onClose}
      onSubmit={() => {
        if (!props.busy) props.onRestart();
      }}
    >
      <p className="text-sm">{PLAY_CONTROL_LABELS.restartIntro}</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm" data-testid="play-restart-reasons">
        {texts.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      <p className="text-muted text-xs">
        Restart saves the world, closes Minecraft, installs your mod and opens the test world again.
      </p>
    </Modal>
  );
}
