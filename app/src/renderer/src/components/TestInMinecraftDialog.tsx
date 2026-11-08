/**
 * The "Test in Minecraft" dialog (ADR 0026 D5): shows what a run would do with the selected
 * game location (launch, install only, or blocked and why), offers to create the managed
 * Prism instance and to choose the launcher program, and hands the run to the host. All file
 * and process work happens in main; this component only calls the functions it is given.
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  LaunchableLauncher,
  TestInMinecraftResult,
  TestInMinecraftStatus,
} from '../../../shared/platform';
import { Modal } from './NewElementDialog';
import { Button } from './ui/Button';

/** Labels shared with the user guide (`docs/guide/blocks-and-items.md`). */
export const TEST_IN_MINECRAFT_LABELS = {
  title: 'Test in Minecraft',
  installAndLaunch: 'Install and launch',
  install: 'Install',
  createInstance: 'Create test instance',
  chooseProgram: 'Choose launcher program…',
  openSettings: 'Open Settings',
} as const;

const LAUNCHER_NAMES: Record<LaunchableLauncher, string> = {
  prism: 'Prism Launcher',
  multimc: 'MultiMC',
};

/** The submit button's label for a status. */
export function testSubmitLabel(status: TestInMinecraftStatus | null): string {
  return status?.mode === 'launch' && status.launcherProgram !== null
    ? TEST_IN_MINECRAFT_LABELS.installAndLaunch
    : TEST_IN_MINECRAFT_LABELS.install;
}

/** One sentence on what a run will do, or `null` when it is blocked. */
export function testPlanText(status: TestInMinecraftStatus): string | null {
  const location = status.location;
  if (status.mode === 'blocked' || location === null) return null;
  const launcher = location.ref.launcher === 'multimc' ? 'multimc' : 'prism';
  if (status.mode === 'install-only') {
    return `MCSuperMods will put the mod and Fabric API in the mods folder of "${location.displayName}". ${status.reason ?? ''}`.trim();
  }
  if (status.launcherProgram === null) {
    return `MCSuperMods will put the mod and Fabric API in the mods folder of "${location.displayName}". ${LAUNCHER_NAMES[launcher]} was not found, so start the instance yourself, or choose the launcher program.`;
  }
  return `MCSuperMods will put the mod and Fabric API in the mods folder of "${location.displayName}" and start it in ${LAUNCHER_NAMES[launcher]}.`;
}

const LOADER_NAMES: Record<string, string> = {
  fabric: 'Fabric Loader',
  quilt: 'Quilt Loader',
  forge: 'Forge',
  neoforge: 'NeoForge',
  liteloader: 'LiteLoader',
};

/** "Game location: <name> (Minecraft <v>, Fabric Loader <v>)", or that none was found. */
export function locationText(status: TestInMinecraftStatus): string {
  const location = status.location;
  if (location === null) return 'Game location: none found.';
  const facts: string[] = [];
  if (location.mcVersion !== null) facts.push(`Minecraft ${location.mcVersion}`);
  if (location.loader !== null) {
    const name = LOADER_NAMES[location.loader.kind] ?? 'unknown loader';
    facts.push(location.loader.version === null ? name : `${name} ${location.loader.version}`);
  }
  return `Game location: ${location.displayName}${facts.length === 0 ? '' : ` (${facts.join(', ')})`}`;
}

/** The status bar message after a run. */
export function testInMinecraftMessage(result: TestInMinecraftResult): string {
  const api =
    result.fabricApi === 'installed'
      ? ` Fabric API was added (${result.fabricApiFile}).`
      : result.fabricApi === 'user-copy'
        ? ` Using the Fabric API already in the mods folder (${result.fabricApiFile}).`
        : '';
  const next = result.launched
    ? ' The launcher is starting the game.'
    : result.note === null
      ? ''
      : ` ${result.note}`;
  const removed =
    result.removed.length === 0
      ? ''
      : ` Removed ${result.removed.length} mod(s) from earlier test runs of other projects, so only this one loads (${result.removed.join(', ')}).`;
  return `Installed the mod to ${result.jarPath}.${removed}${api}${next}`;
}

export interface TestInMinecraftDialogProps {
  /** Reads the status from main. */
  load(): Promise<TestInMinecraftStatus>;
  /** Creates the managed instance and returns the new status. */
  createInstance(): Promise<TestInMinecraftStatus>;
  /** Asks for a launcher program; resolves to its path, or `null` when cancelled. */
  pickLauncherProgram(launcher: LaunchableLauncher): Promise<string | null>;
  /** Runs the test (the host closes the dialog and reports the outcome). */
  onRun(): void;
  onOpenSettings(): void;
  onClose(): void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function TestInMinecraftDialog(props: TestInMinecraftDialogProps) {
  const { load } = props;
  const [status, setStatus] = useState<TestInMinecraftStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  const refresh = useCallback(async (action: () => Promise<TestInMinecraftStatus>) => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await action());
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh(load);
  }, [refresh, load]);

  const location = status?.location ?? null;
  const launcher: LaunchableLauncher | null =
    location?.ref.launcher === 'prism' || location?.ref.launcher === 'multimc'
      ? location.ref.launcher
      : null;
  const blocked = status === null || status.mode === 'blocked';
  const plan = status === null ? null : testPlanText(status);

  return (
    <Modal
      title={TEST_IN_MINECRAFT_LABELS.title}
      error={error}
      wide
      testId="test-in-minecraft-dialog"
      submitLabel={testSubmitLabel(status)}
      busy={busy || blocked}
      onCancel={props.onClose}
      onSubmit={() => {
        if (!busy && !blocked) props.onRun();
      }}
    >
      {status === null ? (
        <p className="text-muted text-sm">{busy ? 'Checking the game location…' : ''}</p>
      ) : (
        <>
          <p className="text-sm" data-testid="test-in-minecraft-location">
            {locationText(status)}
          </p>
          <p className="text-muted text-sm">
            {`The mod needs Minecraft ${status.mcVersion}, Fabric Loader ${status.loader} or newer and Fabric API ${status.api} (downloaded from the Fabric Maven when missing).`}
          </p>
          {status.mode === 'blocked' && status.reason !== null && (
            <p className="text-error text-sm" role="alert" data-testid="test-in-minecraft-reason">
              {status.reason}
            </p>
          )}
          {plan !== null && (
            <p className="text-sm" data-testid="test-in-minecraft-plan">
              {plan}
            </p>
          )}
          <p className="text-muted text-xs">
            Only this project's mod and Fabric API stay installed: mods MCSuperMods added for other
            projects are removed, and mods you added yourself are never touched.
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {!status.managedInstanceSelected && status.canCreateInstance && (
              <Button
                type="button"
                disabled={busy}
                data-testid="test-in-minecraft-create"
                title={`Creates the Prism Launcher instance "${status.managedInstanceName}" and selects it`}
                onClick={() => void refresh(props.createInstance)}
              >
                {TEST_IN_MINECRAFT_LABELS.createInstance}
              </Button>
            )}
            {status.mode === 'launch' && launcher !== null && (
              <Button
                type="button"
                disabled={busy}
                data-testid="test-in-minecraft-program"
                onClick={() =>
                  void refresh(async () => {
                    await props.pickLauncherProgram(launcher);
                    return props.load();
                  })
                }
              >
                {TEST_IN_MINECRAFT_LABELS.chooseProgram}
              </Button>
            )}
            <Button
              type="button"
              data-testid="test-in-minecraft-settings"
              onClick={props.onOpenSettings}
            >
              {TEST_IN_MINECRAFT_LABELS.openSettings}
            </Button>
          </div>
          {!status.managedInstanceSelected && !status.canCreateInstance && blocked && (
            <p className="text-muted text-xs">
              {`Install Prism Launcher and start it once to let MCSuperMods create the instance "${status.managedInstanceName}".`}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
