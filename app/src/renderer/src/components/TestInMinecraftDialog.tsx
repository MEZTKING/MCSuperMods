/**
 * The "Test in Minecraft" dialog (ADR 0026 D5): shows what a run would do with the selected
 * game location (launch, install only, or blocked and why), offers to create the managed
 * Prism instance and to choose the launcher program, and hands the run to the host. All file
 * and process work happens in main; this component only calls the functions it is given.
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/core';
import { useCallback, useEffect, useState } from 'react';
import type {
  InstancePlanRequest,
  InstancesPlatform,
  LaunchableLauncher,
  TestInMinecraftResult,
  TestInMinecraftStatus,
} from '../../../shared/platform';
import type { InstanceOfferInput, InstanceOfferOutcome } from '../store/instances-store';
import type { InstallTargetOption } from './install-target';
import { Modal } from './NewElementDialog';
import { Button } from './ui/Button';
import { MoreOptions } from './ui/MoreOptions';

/** Labels shared with the user guide (`docs/guide/blocks-and-items.md`). */
export const TEST_IN_MINECRAFT_LABELS = {
  title: 'Test in Minecraft',
  installAndLaunch: 'Install and launch',
  install: 'Install',
  createInstance: 'Create test instance',
  chooseProgram: 'Choose launcher program…',
  openSettings: 'Open Settings',
} as const;

/** The dialog's first line: what it does, in the user's words (ADR 0130 D2). */
export const TEST_IN_MINECRAFT_INTRO =
  'Puts your mod into a Minecraft game on this computer and starts it, so you can try it for real.';

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
    return `MCSuperMods will put your mod and the Fabric mods it needs into "${location.displayName}". ${status.reason ?? ''}`.trim();
  }
  if (status.launcherProgram === null) {
    return `MCSuperMods will put your mod and the Fabric mods it needs into "${location.displayName}". ${LAUNCHER_NAMES[launcher]} was not found, so start it yourself, or choose the launcher program under More options.`;
  }
  return `MCSuperMods will put your mod and the Fabric mods it needs into "${location.displayName}" and start it in ${LAUNCHER_NAMES[launcher]}.`;
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

/** "Game: <name>", the plain line for the chosen game (versions are under More options). */
export function plainLocationText(status: TestInMinecraftStatus): string {
  const location = status.location;
  return location === null
    ? 'No Minecraft game was found yet. Create a test instance, or choose a game in Settings.'
    : `Game: ${location.displayName}`;
}

/** The project's first namespace that is not `minecraft` (the plan's owner), or `undefined`. */
function ownNamespace(project: Project): string | undefined {
  const names = project.namespaces.map((namespace) => namespace.name);
  return names.find((name) => name !== 'minecraft') ?? names[0];
}

/** What {@link offerTestInstance} needs from the app. */
export interface TestInstanceOfferHost {
  /** `window.msm.instances`; without it the old way runs (no card). */
  instances?: Pick<InstancesPlatform, 'plan'> | undefined;
  targetId: string;
  project: Project | null;
  /** Builds the content jar (its mod id, and its bytes when nothing blocked it). */
  build(): Promise<{ modId: string; data?: Uint8Array }>;
  /** The user's own game locations, for "Use one of mine instead…". */
  locations: readonly InstallTargetOption[];
  /** The instances store's `prepare` (the card when the plan asks). */
  prepare(input: InstanceOfferInput): Promise<InstanceOfferOutcome>;
}

/** How {@link offerTestInstance} ended. */
export type TestInstanceOffer =
  /** Go on and let main create (or find) the test instance and select it. */
  | { kind: 'create' }
  /** The user chose one of their own game locations (an {@link InstallTargetOption} id). */
  | { kind: 'mine'; locationId: string }
  /** The user closed the card: nothing changes. */
  | { kind: 'cancelled' }
  /** Making the instance failed; main's words. */
  | { kind: 'failed'; message: string };

/**
 * Test in Minecraft's **Create test instance** through the instance offer card (ADR 0133 D3,
 * B765's note): asks `instances.plan` for the test instance of the project's target; when it is
 * not made yet, the card (or, when the plan does not ask, `instances.ensure` at once) makes it,
 * with the user's own game locations offered instead. An existing instance, a failed plan or
 * a host without the service go straight on to main's `createInstance`, as before.
 */
export async function offerTestInstance(host: TestInstanceOfferHost): Promise<TestInstanceOffer> {
  const { instances, project } = host;
  const namespace = project === null ? undefined : ownNamespace(project);
  if (instances === undefined || namespace === undefined) return { kind: 'create' };
  const built = await host.build();
  const request: InstancePlanRequest = {
    targetId: host.targetId,
    action: { kind: 'test' },
    project: { namespace, modId: built.modId, playsWithoutMods: false },
  };
  let plan: Awaited<ReturnType<typeof instances.plan>>;
  try {
    plan = await instances.plan(request);
  } catch {
    return { kind: 'create' };
  }
  if (!plan.ok || plan.existing !== null || plan.launcher === null) return { kind: 'create' };
  const data = built.data;
  const outcome = await host.prepare({
    plan,
    request,
    jars: async () => (data === undefined ? [] : [{ modId: built.modId, data }]),
    locations: host.locations,
  });
  switch (outcome.kind) {
    case 'made':
      return { kind: 'create' };
    case 'mine':
      return { kind: 'mine', locationId: outcome.locationId };
    case 'cancelled':
      return { kind: 'cancelled' };
    case 'failed':
      return { kind: 'failed', message: outcome.failure.message };
  }
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
      <p className="text-sm" data-testid="test-in-minecraft-intro">
        {TEST_IN_MINECRAFT_INTRO}
      </p>
      {status === null ? (
        <p className="text-muted text-sm">{busy ? 'Looking for your game…' : ''}</p>
      ) : (
        <>
          {(status.location !== null || status.reason === null) && (
            <p className="text-sm" data-testid="test-in-minecraft-game">
              {plainLocationText(status)}
            </p>
          )}
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
            Only this mod and the Fabric mods it needs stay in the game: mods MCSuperMods added for
            your other mods are taken out, and mods you added yourself are never touched.
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {!status.managedInstanceSelected && status.canCreateInstance && (
              <Button
                type="button"
                disabled={busy}
                data-testid="test-in-minecraft-create"
                title={`Makes the Prism Launcher instance "${status.managedInstanceName}" and uses it`}
                onClick={() => void refresh(props.createInstance)}
              >
                {TEST_IN_MINECRAFT_LABELS.createInstance}
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
          <MoreOptions storageKey="dialog-test-in-minecraft">
            <p className="text-sm" data-testid="test-in-minecraft-location">
              {locationText(status)}
            </p>
            <p className="text-muted text-sm" data-testid="test-in-minecraft-needs">
              {`The mod needs Minecraft ${status.mcVersion}, Fabric Loader ${status.loader} or newer and Fabric API ${status.api} (downloaded from the Fabric Maven when missing).`}
            </p>
            {status.mode === 'launch' && launcher !== null && (
              <Button
                type="button"
                className="self-start"
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
          </MoreOptions>
        </>
      )}
    </Modal>
  );
}
