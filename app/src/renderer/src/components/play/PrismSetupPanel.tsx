/**
 * The one-time Prism Launcher panel (ADR 0084 D1): shown when Play finds no Prism Launcher
 * data folder. It first names the launchers the user already added in Settings and what each
 * can do now (B765, ADR 0133 D4), then says how to install Prism Launcher and sign in; "Find
 * Prism" looks again; "Choose Prism's folder…" adds a data folder in a place MSM does not look.
 *
 * @packageDocumentation
 */

import { type OtherLauncher, PLAY_CONTROL_LABELS } from '../../store/play-store';
import { Modal } from '../NewElementDialog';
import { Button } from '../ui/Button';

export interface PrismSetupPanelProps {
  /** The last finding ("still not found"), or `null`. */
  message: string | null;
  /** The launchers other than Prism already added in Settings; none by default. */
  launchers?: readonly OtherLauncher[];
  /** Disables the buttons while looking. */
  busy: boolean;
  onFind(): void;
  onChooseFolder(): void;
  onClose(): void;
}

export function PrismSetupPanel(props: PrismSetupPanelProps) {
  const launchers = props.launchers ?? [];
  return (
    <Modal
      title={PLAY_CONTROL_LABELS.prismTitle}
      error={props.message}
      wide
      testId="play-prism-panel"
      submitLabel={PLAY_CONTROL_LABELS.prismFind}
      busy={props.busy}
      onCancel={props.onClose}
      onSubmit={() => {
        if (!props.busy) props.onFind();
      }}
    >
      <p className="text-sm">
        Play starts your mod in Prism Launcher, a free Minecraft launcher. It was not found on this
        computer.
      </p>
      {launchers.length > 0 && (
        <div className="flex flex-col gap-1" data-testid="play-prism-other-launchers">
          <p className="text-sm">{PLAY_CONTROL_LABELS.otherLaunchersIntro}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {launchers.map((launcher) => (
              <li key={launcher.kind} data-testid={`play-prism-other-${launcher.kind}`}>
                {launcher.label}
              </li>
            ))}
          </ul>
          <p className="text-sm">{PLAY_CONTROL_LABELS.otherLaunchersPlay}</p>
          <p className="text-sm">{PLAY_CONTROL_LABELS.prismSteps}</p>
        </div>
      )}
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
        <li>Download and install Prism Launcher from prismlauncher.org.</li>
        <li>Start it and sign in with your Microsoft account (the one that owns Minecraft).</li>
        <li>Come back here and press {PLAY_CONTROL_LABELS.prismFind}.</li>
      </ol>
      <p className="text-muted text-xs">
        Play makes its own test instance in Prism Launcher. Your other instances and worlds are
        never touched.
      </p>
      <div>
        <Button
          type="button"
          disabled={props.busy}
          data-testid="play-prism-choose"
          onClick={props.onChooseFolder}
        >
          {PLAY_CONTROL_LABELS.prismChoose}
        </Button>
      </div>
    </Modal>
  );
}
