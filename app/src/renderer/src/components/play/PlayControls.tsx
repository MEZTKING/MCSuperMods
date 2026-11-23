/**
 * The Play controls (ADR 0084 D1, D6, D7; ADR 0131 D3): Play and its menu, Reload only while it
 * can be used, the game status chip only when it needs the user or a game is running (no Prism,
 * Restart needed, starting or in a world), and the progress line only while busy. The quiet
 * states (checking, not running) are the first line of the Play menu (`play-status`) and part of
 * Play's tip; the open world's seed in Play my game is a line of the menu (`play-seed`). The
 * menu has "Play my game" and "Start over" (ADR 0116 D1), "New test world", "Restart" and "Open
 * the test instance's folder". It takes no props: it reads the session and the bridge through
 * the Play store ({@link connectPlay}) and renders nothing until the store is connected and a
 * mod is open. The Restart needed dialog and the Prism setup panel open from here. The
 * container carries the state as `data-state` (`checking` before the first status).
 *
 * @packageDocumentation
 */

import { ChevronDown, Play, RotateCw } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useCallback, useSyncExternalStore } from 'react';
import type { SessionSnapshot } from '../../session/project-session';
import {
  gameRunning,
  PLAY_CONTROL_LABELS,
  type PlayChipState,
  type PlaySession,
  playChipState,
  playGameSettings,
  usePlayStore,
} from '../../store/play-store';
import { Button, buttonClass } from '../ui/Button';
import { Tip } from '../ui/Tip';
import { useMenuOpen } from './menu-open';
import { PrismSetupPanel } from './PrismSetupPanel';
import { RestartNeededDialog } from './RestartNeededDialog';

const NO_SESSION_SNAPSHOT = null;

function noSubscription(): () => void {
  return () => {};
}

/** The open project's snapshot, following the session (`null` without a session). */
function useSessionSnapshot(session: PlaySession | null): SessionSnapshot | null {
  const subscribe = useCallback(
    (listener: () => void) =>
      session === null ? noSubscription() : session.subscribe(() => listener()),
    [session],
  );
  return useSyncExternalStore(subscribe, () =>
    session === null ? NO_SESSION_SNAPSHOT : session.snapshot,
  );
}

const CHIP_CLASS: Record<PlayChipState, string> = {
  'no-prism': 'border-warning text-warning',
  'not-running': 'border-border text-muted',
  starting: 'border-border text-text',
  'test-world': 'border-accent text-accent',
  'game-world': 'border-accent text-accent',
  'other-world': 'border-warning text-warning',
  'restart-needed': 'border-warning text-warning',
};

const menuItemClass =
  'flex cursor-pointer flex-col rounded px-2 py-1 text-sm outline-none select-none ' +
  'data-[highlighted]:bg-bg data-[highlighted]:text-accent ' +
  'data-[disabled]:cursor-default data-[disabled]:text-muted';

const menuContentClass =
  'z-50 flex min-w-56 flex-col gap-0.5 rounded-md border border-border bg-panel p-1 text-text shadow-lg';

/** A sentence from the status words: a full stop unless they end in one already. */
export function statusSentence(words: string): string {
  return /[.…!?]$/.test(words) ? words : `${words}.`;
}

/** Whether the chip shows in the row (ADR 0131 D3): it needs the user, or a game runs. */
export function chipInRow(chip: PlayChipState | null, running: boolean): boolean {
  return chip === 'no-prism' || chip === 'restart-needed' || running;
}

/** One entry of the Play menu; `reason` says why it is disabled. */
function MenuItem(props: {
  label: string;
  testId: string;
  reason: string | null;
  onSelect(): void;
}) {
  return (
    <DropdownMenu.Item
      data-testid={props.testId}
      disabled={props.reason !== null}
      className={menuItemClass}
      onSelect={props.onSelect}
    >
      <span>{props.label}</span>
      {props.reason !== null && (
        <span className="text-xs text-muted" data-testid={`${props.testId}-reason`}>
          {props.reason}
        </span>
      )}
    </DropdownMenu.Item>
  );
}

export function PlayControls() {
  const host = usePlayStore((state) => state.host);
  const status = usePlayStore((state) => state.status);
  const running = usePlayStore((state) => state.running);
  const localProgress = usePlayStore((state) => state.progress);
  const restartDialog = usePlayStore((state) => state.restartDialog);
  const prismPanel = usePlayStore((state) => state.prismPanel);
  const prismMessage = usePlayStore((state) => state.prismMessage);
  const snapshot = useSessionSnapshot(host?.session ?? null);
  const menu = useMenuOpen();

  if (host === null || snapshot === null || snapshot.project === null) return null;
  const store = usePlayStore.getState();

  const mainBusy = status?.busy ?? null;
  const busy = running !== null || mainBusy !== null;
  const progress = mainBusy !== null ? (status?.progress ?? null) : localProgress;
  const chip = playChipState(status);
  const running_ = gameRunning(status);
  const canReload = status?.canReload === true;
  const hasGame = playGameSettings(snapshot.project) !== null;
  const seed = status?.state === 'game-world' ? (status.seed ?? null) : null;

  const words = status?.label ?? PLAY_CONTROL_LABELS.checking;
  const showChip = chipInRow(chip, running_);
  const playTip = showChip
    ? PLAY_CONTROL_LABELS.playTip
    : `${statusSentence(words)} ${PLAY_CONTROL_LABELS.playTip}`;
  const chipContent = (
    <>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      <span className="truncate">{words}</span>
    </>
  );
  const chipClass = `inline-flex max-w-48 items-center gap-1.5 self-center rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${chip === null ? 'border-border text-muted' : CHIP_CLASS[chip]}`;

  return (
    <div
      className="inline-flex shrink-0 items-center gap-1.5"
      data-testid="play-controls"
      data-state={chip ?? 'checking'}
    >
      <Tip label={playTip}>
        <Button
          data-testid="play-button"
          disabled={busy}
          aria-busy={running === 'play' || mainBusy === 'play'}
          onClick={() => void store.play()}
        >
          <Play size={16} aria-hidden />
          {PLAY_CONTROL_LABELS.play}
        </Button>
      </Tip>
      <DropdownMenu.Root modal={false} {...menu.root}>
        <Tip label={PLAY_CONTROL_LABELS.menu}>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className={buttonClass}
              data-testid="play-menu"
              aria-label={PLAY_CONTROL_LABELS.menu}
            >
              <ChevronDown size={16} aria-hidden />
            </button>
          </DropdownMenu.Trigger>
        </Tip>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={4}
            className={menuContentClass}
            {...menu.content}
          >
            {!showChip && (
              <DropdownMenu.Label
                data-testid="play-status"
                className="px-2 py-1 text-sm text-muted"
              >
                {words}
              </DropdownMenu.Label>
            )}
            {seed !== null && (
              <DropdownMenu.Label data-testid="play-seed" className="px-2 py-1 text-xs text-muted">
                {PLAY_CONTROL_LABELS.seed} {seed}
              </DropdownMenu.Label>
            )}
            {(!showChip || seed !== null) && (
              <DropdownMenu.Separator className="my-0.5 h-px bg-border" />
            )}
            <MenuItem
              label={PLAY_CONTROL_LABELS.playGame}
              testId="play-menu-play-game"
              reason={hasGame ? null : PLAY_CONTROL_LABELS.playGameOff}
              onSelect={() => void store.playMyGame()}
            />
            <MenuItem
              label={PLAY_CONTROL_LABELS.startOver}
              testId="play-menu-start-over"
              reason={
                !hasGame
                  ? PLAY_CONTROL_LABELS.playGameOff
                  : running_
                    ? PLAY_CONTROL_LABELS.startOverOff
                    : null
              }
              onSelect={() => void store.startOver()}
            />
            <MenuItem
              label={PLAY_CONTROL_LABELS.newWorld}
              testId="play-menu-new-world"
              reason={running_ ? PLAY_CONTROL_LABELS.newWorldOff : null}
              onSelect={() => void store.newTestWorld()}
            />
            <MenuItem
              label={PLAY_CONTROL_LABELS.restart}
              testId="play-menu-restart"
              reason={running_ ? null : PLAY_CONTROL_LABELS.restartOff}
              onSelect={() => void store.restart()}
            />
            <MenuItem
              label={PLAY_CONTROL_LABELS.openFolder}
              testId="play-menu-open-folder"
              reason={(status?.gameDir ?? null) === null ? PLAY_CONTROL_LABELS.openFolderOff : null}
              onSelect={() => void store.openInstanceFolder()}
            />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {canReload && (
        <Tip label={PLAY_CONTROL_LABELS.reloadTip}>
          {/* A disabled button gets no pointer events; the span keeps the tip. */}
          <span className="inline-flex">
            <Button
              data-testid="play-reload"
              disabled={busy}
              aria-busy={running === 'reload' || mainBusy === 'reload'}
              onClick={() => void store.reload()}
            >
              <RotateCw size={16} aria-hidden />
              {PLAY_CONTROL_LABELS.reload}
            </Button>
          </span>
        </Tip>
      )}
      {showChip &&
        (chip === 'restart-needed' ? (
          <button
            type="button"
            className={`${chipClass} cursor-pointer`}
            data-testid="play-chip"
            data-state={chip}
            title={words}
            onClick={() => store.showRestartNeeded()}
          >
            {chipContent}
          </button>
        ) : chip === 'no-prism' ? (
          <button
            type="button"
            className={`${chipClass} cursor-pointer`}
            data-testid="play-chip"
            data-state={chip}
            title={words}
            onClick={() => store.openPrismPanel()}
          >
            {chipContent}
          </button>
        ) : (
          <span
            className={chipClass}
            data-testid="play-chip"
            data-state={chip ?? 'checking'}
            title={words}
          >
            {chipContent}
          </span>
        ))}
      {/* Always in the page so screen readers hear it; it takes no room while idle. */}
      <span
        role="status"
        aria-live="polite"
        className={busy ? 'max-w-48 truncate text-xs whitespace-nowrap text-muted' : 'sr-only'}
        data-testid="play-progress"
        title={busy ? (progress ?? '') : undefined}
      >
        {busy ? (progress ?? '') : ''}
      </span>
      {restartDialog !== null && (
        <RestartNeededDialog
          reasons={restartDialog}
          busy={busy}
          onRestart={() => void store.restart()}
          onClose={() => store.closeRestartDialog()}
        />
      )}
      {prismPanel && (
        <PrismSetupPanel
          message={prismMessage}
          busy={running !== null}
          onFind={() => void store.findPrism()}
          onChooseFolder={() => void store.choosePrismFolder()}
          onClose={() => store.closePrismPanel()}
        />
      )}
    </div>
  );
}
