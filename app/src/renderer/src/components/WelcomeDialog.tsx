/**
 * The Welcome dialog: the short version of the "Your first mod" guide page
 * (`docs/guide/first-mod.md`). Shown by itself once on a brand-new install (main's
 * `app.launchNotice()`), and from Help > Your First Mod… and the palette. Presentational: the
 * host opens Settings, starts a project or opens the Creator.
 *
 * @packageDocumentation
 */

import { UI_MODES, type UiMode } from '../store/preferences';
import { Modal } from './NewElementDialog';
import { Button } from './ui/Button';

/** The guide page on the documentation site, opened in the system browser. */
export const FIRST_MOD_GUIDE_URL = 'https://meztking.github.io/MCSuperMods/first-mod';

/** The steps, as on the guide page (labels match the UI). */
export const WELCOME_STEPS: readonly { title: string; text: string }[] = [
  {
    title: 'Tell MCSuperMods where Minecraft is',
    text: 'In Settings, pick your game under Game locations and choose Extract vanilla assets, so the preview can draw the game’s textures.',
  },
  {
    title: 'Make a project',
    text: 'Choose New and create an empty folder, for example ruby_mod. One project is one mod.',
  },
  {
    title: 'Create a gear set',
    text: 'Choose Create…, then Gear set. Type Ruby, pick a colour, watch the preview, and choose Create.',
  },
  {
    title: 'Play with it',
    text: 'Save, then Export > Test in Minecraft…. With Prism Launcher, MCSuperMods sets up a Fabric game and starts it.',
  },
  {
    title: 'Share it',
    text: 'Export > Fabric mod (.jar)… makes the file players put in their mods folder, next to Fabric API.',
  },
];

/** The steps in Very easy mode (ADR 0083): Home, Play and Share my mod, no menus. */
export const WELCOME_STEPS_VERY_EASY: readonly { title: string; text: string }[] = [
  {
    title: 'Start a new mod',
    text: 'On Home, choose Start a new mod and type a name, for example Ruby mod.',
  },
  {
    title: 'Make something',
    text: 'Pick a tile, such as Make a block. Fill in the boxes, watch the picture change, and choose Create.',
  },
  {
    title: 'Make things happen',
    text: 'Make things happen adds rules: when something happens, do something. No code needed.',
  },
  {
    title: 'Play',
    text: 'Press Play. With Prism Launcher, Minecraft opens in a flat test world with your things in chests.',
  },
  {
    title: 'Share it',
    text: 'Share my mod saves one file. Friends put it in their mods folder, next to Fabric API.',
  },
];

export interface WelcomeDialogProps {
  /** Whether a project is open (then "Create something" opens the Creator). */
  hasProject: boolean;
  onSettings(): void;
  onNewProject(): void;
  /** Opens the Creator; offered only with a project open. */
  onCreator?(): void;
  /** Starts a project the AI helper builds from a description (ADR 0047 D3). */
  onBuildWithAi?(): void;
  onClose(): void;
  /** The current mode; with {@link WelcomeDialogProps.onMode} the Welcome offers the three. */
  mode?: UiMode;
  /** Chooses a mode (ADR 0083 D1: the Welcome's first step). */
  onMode?(mode: UiMode): void;
}

export function WelcomeDialog({
  hasProject,
  onSettings,
  onNewProject,
  onCreator,
  onBuildWithAi,
  onClose,
  mode,
  onMode,
}: WelcomeDialogProps) {
  const steps = mode === 'very-easy' ? WELCOME_STEPS_VERY_EASY : WELCOME_STEPS;
  return (
    <Modal
      title="Welcome to MCSuperMods"
      error={null}
      wide
      testId="welcome-dialog"
      submitLabel="Got it"
      onCancel={onClose}
      onSubmit={onClose}
    >
      <p className="text-sm">
        Make your first mod in about fifteen minutes, without code: a new material with tools and
        armour, tested in Minecraft.
      </p>
      {mode !== undefined && onMode !== undefined && (
        <fieldset className="flex flex-col gap-1" data-testid="welcome-modes">
          <legend className="font-semibold text-sm">How do you want to work?</legend>
          <div className="grid grid-cols-3 gap-2">
            {UI_MODES.map((entry) => (
              <button
                key={entry.mode}
                type="button"
                aria-pressed={mode === entry.mode}
                data-testid={`welcome-mode-${entry.mode}`}
                className={`flex cursor-pointer flex-col gap-0.5 rounded border p-2 text-left ${mode === entry.mode ? 'border-accent' : 'border-border'}`}
                onClick={() => onMode(entry.mode)}
              >
                <span className="font-medium text-sm">{entry.label}</span>
                <span className="text-muted text-xs">{entry.sentence}</span>
              </button>
            ))}
          </div>
          <p className="text-muted text-xs">You can change this any time at the top right.</p>
        </fieldset>
      )}
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm" data-testid="welcome-steps">
        {steps.map((step) => (
          <li key={step.title}>
            <span className="font-semibold">{step.title}.</span>{' '}
            <span className="text-muted">{step.text}</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button data-testid="welcome-settings" onClick={onSettings}>
          Open Settings
        </Button>
        {hasProject && onCreator !== undefined ? (
          <Button data-testid="welcome-creator" onClick={onCreator}>
            Create something…
          </Button>
        ) : (
          <Button data-testid="welcome-new-project" onClick={onNewProject}>
            New project…
          </Button>
        )}
        {onBuildWithAi !== undefined && (
          <Button data-testid="welcome-build-with-ai" onClick={onBuildWithAi}>
            Or describe a mod and let the AI helper build it…
          </Button>
        )}
      </div>
      <p className="text-muted text-sm">
        The full walkthrough is in the guide:{' '}
        <a
          href={FIRST_MOD_GUIDE_URL}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline"
          data-testid="welcome-guide-link"
        >
          Your first mod
        </a>
        . Open this again with Help → Your First Mod….
      </p>
    </Modal>
  );
}
