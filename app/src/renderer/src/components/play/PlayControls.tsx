/**
 * The Play controls (ADR 0084 D1, D6, D7): Play, Reload, the game status chip with its
 * progress line, and a small menu with "New test world", "Restart" and "Open the test
 * instance's folder". It takes no props: it reads the session and the bridge through the
 * Play store ({@link connectPlay}) and renders nothing until the store is connected and a
 * project is open. The Restart needed dialog and the Prism setup panel open from here.
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
  usePlayStore,
} from '../../store/play-store';
import { Button, buttonClass } from '../ui/Button';
import { Tip } from '../ui/Tip';
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
  'other-world': 'border-warning text-warning',
  'restart-needed': 'border-warning text-warning',
};

const menuItemClass =
  'flex cursor-pointer flex-col rounded px-2 py-1 text-sm outline-none select-none ' +
  'data-[highlighted]:bg-bg data-[highlighted]:text-accent ' +
  'data-[disabled]:cursor-default data-[disabled]:text-muted';

const menuContentClass =
  'z-50 flex min-w-56 flex-col gap-0.5 rounded-md border border-border bg-panel p-1 text-text shadow-lg';

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

  if (host === null || snapshot === null || snapshot.project === null) return null;
  const store = usePlayStore.getState();

  const mainBusy = status?.busy ?? null;
  const busy = running !== null || mainBusy !== null;
  const progress = mainBusy !== null ? (status?.progress ?? null) : localProgress;
  const chip = playChipState(status);
  const running_ = gameRunning(status);
  const canReload = status?.canReload === true;

  const chipContent = (
    <>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {status?.label ?? PLAY_CONTROL_LABELS.checking}
    </>
  );
  const chipClass = `inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${chip === null ? 'border-border text-muted' : CHIP_CLASS[chip]}`;

  return (
    <div className="inline-flex items-center gap-1.5" data-testid="play-controls">
      <Tip label={PLAY_CONTROL_LABELS.playTip}>
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
      <Tip label={canReload ? PLAY_CONTROL_LABELS.reloadTip : PLAY_CONTROL_LABELS.reloadOff}>
        {/* A disabled button gets no pointer events; the span keeps the tip. */}
        <span className="inline-flex">
          <Button
            data-testid="play-reload"
            disabled={busy || !canReload}
            aria-busy={running === 'reload' || mainBusy === 'reload'}
            onClick={() => void store.reload()}
          >
            <RotateCw size={16} aria-hidden />
            {PLAY_CONTROL_LABELS.reload}
          </Button>
        </span>
      </Tip>
      <DropdownMenu.Root modal={false}>
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
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="start" sideOffset={4} className={menuContentClass}>
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
      {chip === 'restart-needed' ? (
        <button
          type="button"
          className={`${chipClass} cursor-pointer`}
          data-testid="play-chip"
          data-state={chip}
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
          onClick={() => store.openPrismPanel()}
        >
          {chipContent}
        </button>
      ) : (
        <span className={chipClass} data-testid="play-chip" data-state={chip ?? 'checking'}>
          {chipContent}
        </span>
      )}
      <span
        role="status"
        aria-live="polite"
        className="text-xs text-muted"
        data-testid="play-progress"
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
