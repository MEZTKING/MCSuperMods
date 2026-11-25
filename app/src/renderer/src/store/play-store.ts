/**
 * One-click Play and Reload in the renderer (ADR 0084): the game status main pushes, what
 * runs now and the two panels (Restart needed, Prism setup), plus the actions the Play
 * controls call. Play and Reload save the project first (held-back typing included), build
 * the content jar and the lowered files of the expanded project, and hand them to
 * `window.msm.play`; main does every file and process step.
 *
 * The store is connected once to the session and the bridge with {@link connectPlay}, so
 * `PlayControls` needs no props. Play my game (ADR 0116 D1, B554) is the same Play with the
 * project's world setup ({@link playGameSettings}): it opens or makes `msm-game-<ns>`; Start over
 * renames that world as New test world renames the test world. The chip's words and the restart reasons come from main
 * (`PlayStatus.label`, `PlayRestartReason.text`); the words here are the renderer's own.
 *
 * Instances through recipes (ADR 0133 D3, B765): before Play or Play my game sends anything,
 * it asks `instances.plan` for the test instance of the project's target. When it is not made
 * yet, the offer card says what will be made (the first time for that kind, by default) and
 * `instances.ensure` makes it, in the launcher folder's queue; an existing test instance never
 * shows the card, so with everything in place Play is one progress line and no dialog. When
 * Prism Launcher is missing, the setup panel first names the other launchers already added in
 * Settings.
 *
 * @packageDocumentation
 */

import type { Element, Problem, Project } from '@msm/core';
import type { OutputFile } from '@msm/plugin-api';
import { blockItemIdOf } from '@msm/plugin-blocks-items';
import { create } from 'zustand';
import type {
  InstancePlanRequest,
  InstancesPlatform,
  LauncherSettings,
  PlatformAdapter,
  PlayGameSettings,
  PlayInput,
  PlayOutputFile,
  PlayPlatform,
  PlayRestartReason,
  PlayResult,
  PlaySetupItem,
  PlayStatus,
  PlayWorldKind,
  ReloadInput,
  ReloadResult,
  TestWorldResult,
} from '../../../shared/platform';
import { flushPendingEdits } from '../session/pending-edits';
import type { ProjectSession } from '../session/project-session';
import { errorCount, userFacingExportProblems } from '../studios/export-state';
import {
  type InstanceOfferInput,
  type InstanceOfferOutcome,
  useInstancesStore,
} from './instances-store';
import { type StatusMessage, useUiStore } from './ui-store';

/** The renderer's own words for Play (the chip and restart texts come from main). */
export const PLAY_CONTROL_LABELS = {
  play: 'Play',
  playTip: 'Save, build the mod and play it in the test world (F5)',
  reload: 'Reload',
  reloadTip: 'Send your latest changes to the game without closing it (Ctrl+R)',
  reloadOff: 'Reload works while the game is in the test world.',
  menu: 'More Play options',
  newWorld: 'New test world',
  newWorldOff: 'Close Minecraft first.',
  restart: 'Restart',
  restartOff: 'The game is not running.',
  openFolder: "Open the test instance's folder",
  openFolderOff: 'The test instance is made the first time you press Play.',
  checking: 'Checking the game…',
  saving: 'Saving the project…',
  building: 'Building the mod…',
  restartTitle: 'Restart needed',
  restartIntro: 'Some changes can only be read when Minecraft starts:',
  restartButton: 'Restart',
  prismTitle: 'Get Prism Launcher',
  prismFind: 'Find Prism',
  prismChoose: "Choose Prism's folder…",
  prismChooseTitle: "Choose Prism Launcher's data folder",
  prismNotFound:
    'Prism Launcher was still not found. Start it once after installing it, or choose its folder.',
  prismFound: 'Found Prism Launcher. Press Play to start.',
  playGame: 'Play my game',
  playGameTip: 'Play your game the way players will: its own world, game mode and difficulty',
  playGameOff: 'Add a world setup first (Make a game), so Minecraft knows how your world starts.',
  startOver: 'Start over',
  startOverOff: 'Close Minecraft first.',
  seed: 'Seed',
  makingInstance: (name: string): string => `Making ${name}…`,
  otherLaunchersIntro: 'These launchers are already on this computer:',
  otherLaunchersPlay:
    'Play and its test world need Prism Launcher for now. To use one of these, choose one of its Fabric instances in Settings, Game locations, then use Test in Minecraft.',
  prismSteps: 'To use Play, get Prism Launcher:',
} as const;

/** A launcher the user already added in Settings, for the Prism setup panel (B765). */
export interface OtherLauncher {
  kind: 'multimc' | 'curseforge';
  /** Its name and what it can do, in plain words. */
  label: string;
  /** How many of its folders were added. */
  folders: number;
}

/** The launchers other than Prism added in Settings (B765: offered before getting Prism). */
export function otherLaunchers(launchers: LauncherSettings | null | undefined): OtherLauncher[] {
  const out: OtherLauncher[] = [];
  const multimc = launchers?.multimcRoots.length ?? 0;
  if (multimc > 0) {
    out.push({
      kind: 'multimc',
      label:
        'MultiMC or PolyMC: Test in Minecraft can put your mod into its Fabric instances and start them.',
      folders: multimc,
    });
  }
  const curseForge = launchers?.curseForgeRoots.length ?? 0;
  if (curseForge > 0) {
    out.push({
      kind: 'curseforge',
      label:
        'CurseForge: Test in Minecraft can put your mod into its Fabric profiles; you start them from the CurseForge app.',
      folders: curseForge,
    });
  }
  return out;
}

/** What the controls run now (the chip's progress line belongs to it). */
export type PlayOperation =
  | 'play'
  | 'play-game'
  | 'reload'
  | 'restart'
  | 'new-world'
  | 'start-over'
  | 'find-prism';

/** The session calls Play needs; a {@link ProjectSession} has them all. */
export type PlaySession = Pick<
  ProjectSession,
  | 'snapshot'
  | 'target'
  | 'save'
  | 'buildContentJar'
  | 'lowerExpandedProject'
  | 'subscribe'
  | 'recordPlayed'
>;

/** What Play needs from the host. */
export interface PlayHost {
  session: PlaySession;
  /** `window.msm.play`. */
  play: PlayPlatform;
  shell: Pick<PlatformAdapter['shell'], 'showItemInFolder'>;
  settings: PlatformAdapter['settings'];
  dialogs: Pick<PlatformAdapter['dialogs'], 'pickDirectory'>;
  /**
   * `window.msm.instances` (ADR 0133): Play asks it for the test instance's plan first. Without
   * it (an old test double) main makes the instance during Play, as before B765.
   */
  instances?: Pick<InstancesPlatform, 'plan'>;
  /** Shows the offer card when the plan asks; defaults to the instances store's `prepare`. */
  prepareInstance?(input: InstanceOfferInput): Promise<InstanceOfferOutcome>;
  /** Shows a status bar message; defaults to the UI store's. */
  notify?(message: StatusMessage): void;
  /** Shows the problems that blocked a build; defaults to the UI store's Problems panel. */
  showProblems?(problems: readonly Problem[]): void;
}

/** The Play store's shape. */
export interface PlayState {
  /** The connected host, or `null` before {@link connectPlay} (the controls hide). */
  host: PlayHost | null;
  /** The last status for the open project's target, or `null` before the first read. */
  status: PlayStatus | null;
  /** What the controls run now, or `null`. */
  running: PlayOperation | null;
  /** The renderer's progress line (saving, building) before main takes over, or `null`. */
  progress: string | null;
  /** The reasons the Restart needed dialog shows, or `null` when it is closed. */
  restartDialog: PlayRestartReason[] | null;
  /** Whether the Prism setup panel is open. */
  prismPanel: boolean;
  /** The Prism panel's last finding ("still not found"), or `null`. */
  prismMessage: string | null;
  /** The launchers other than Prism added in Settings, shown first in the Prism panel. */
  otherLaunchers: OtherLauncher[];

  setStatus(status: PlayStatus | null): void;
  /** Reads the status for the open project's target again. */
  refresh(): Promise<void>;
  play(): Promise<void>;
  /** Play my game: the project's world setup in `msm-game-<ns>` (ADR 0116 D1). */
  playMyGame(): Promise<void>;
  reload(): Promise<void>;
  /** Restarts the game into the world it was last played in (test world or game). */
  restart(): Promise<void>;
  newTestWorld(): Promise<void>;
  /** Start over: renames Play my game's world; the next Play my game makes a fresh one. */
  startOver(): Promise<void>;
  openInstanceFolder(): Promise<void>;
  /** Opens the Restart needed dialog with the status's reasons. */
  showRestartNeeded(): void;
  closeRestartDialog(): void;
  openPrismPanel(): void;
  closePrismPanel(): void;
  /** Looks for Prism Launcher again; closes the panel when found. */
  findPrism(): Promise<void>;
  /** Asks for Prism's data folder, adds it in Settings and looks again. */
  choosePrismFolder(): Promise<void>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The status chip's state: the game state, or `restart-needed` (as main words the label). */
export type PlayChipState = PlayStatus['state'] | 'restart-needed';

/** The chip's state for `status` (`null` before the first read). */
export function playChipState(status: PlayStatus | null): PlayChipState | null {
  if (status === null) return null;
  if (status.restartNeeded.length > 0 && status.state !== 'not-running') return 'restart-needed';
  return status.state;
}

/** Whether the game runs (or starts), so Restart can ask it to quit. */
export function gameRunning(status: PlayStatus | null): boolean {
  return (
    status !== null &&
    (status.state === 'starting' ||
      status.state === 'test-world' ||
      status.state === 'game-world' ||
      status.state === 'other-world')
  );
}

/** The start of Play my game's world folder (`@msm/interop` `gameWorldFolder`). */
const GAME_WORLD_PREFIX = 'msm-game-';

/** Which world the last Play was for, from the status (`testWorld` is `dev.json`'s world). */
export function lastPlayKind(status: PlayStatus | null): PlayWorldKind {
  return status?.testWorld?.startsWith(GAME_WORLD_PREFIX) === true ? 'game' : 'test';
}

const GAME_MODES: readonly PlayGameSettings['gameMode'][] = [
  'survival',
  'creative',
  'adventure',
  'spectator',
];
const DIFFICULTIES: readonly PlayGameSettings['difficulty'][] = [
  'peaceful',
  'easy',
  'normal',
  'hard',
];

/**
 * Play my game's settings from the project's world setup (`msm:world_setup`, at most one;
 * ADR 0116 D1), or `null` without one. The world preset is the world setup's own id `<ns>:<path>`
 * for a `void`, `flat` or `sky_islands` world (the games plugin writes the preset under that id,
 * B551), the chosen preset for `preset`, and `minecraft:normal` for `vanilla`. Game mode and
 * difficulty default as the schema does (survival, normal).
 */
export function playGameSettings(project: Project): PlayGameSettings | null {
  const setup = namespaceOrder(project).find((element) => element.kind === 'msm:world_setup');
  if (setup === undefined) return null;
  const data = record(setup.data);
  const world = record(data?.world);
  const type = world?.type;
  const preset =
    type === 'vanilla'
      ? 'minecraft:normal'
      : type === 'preset'
        ? typeof world?.preset === 'string'
          ? world.preset
          : 'minecraft:normal'
        : setup.id;
  const gameMode = GAME_MODES.find((mode) => mode === data?.game_mode) ?? 'survival';
  const difficulty = DIFFICULTIES.find((level) => level === data?.difficulty) ?? 'normal';
  return { preset, gameMode, difficulty };
}

/** The project's namespaces for Play: its own (not `minecraft`) first, in project order. */
export function playNamespaces(project: Project): string[] {
  const names = project.namespaces.map((namespace) => namespace.name);
  return [
    ...names.filter((name) => name !== 'minecraft'),
    ...names.filter((name) => name === 'minecraft'),
  ];
}

function namespaceOrder(project: Project): Element[] {
  const order = playNamespaces(project);
  return order.flatMap(
    (name) => project.namespaces.find((namespace) => namespace.name === name)?.elements ?? [],
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * The test world's items (ADR 0084 D2): project items, then block items, then spawn eggs,
 * each in project order (own namespace first); the first nine go in the hotbar.
 */
export function playItems(project: Project): PlaySetupItem[] {
  const elements = namespaceOrder(project);
  const ids: string[] = [];
  for (const element of elements) if (element.kind === 'msm:item') ids.push(element.id);
  for (const element of elements) {
    if (element.kind !== 'msm:block') continue;
    const id = blockItemIdOf(element.id, element.data);
    if (id !== undefined) ids.push(id);
  }
  for (const element of elements) {
    if (element.kind !== 'msm:entity') continue;
    if (record(element.data)?.spawn_egg === false) continue;
    ids.push(`${element.id}_spawn_egg`);
  }
  return [...new Set(ids)].map((id) => ({ id }));
}

/** A readable name from an id's last path segment (`demo:ruby_lamp` is "Ruby lamp"). */
function humanise(id: string): string {
  const last =
    id
      .slice(id.indexOf(':') + 1)
      .split('/')
      .pop() ?? id;
  const words = last.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Display names by element id for restart reasons: `display_name`, else the id made readable. */
export function playNames(project: Project): Record<string, string> {
  const names: Record<string, string> = {};
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const own = record(element.data)?.display_name;
      names[element.id] = typeof own === 'string' && own.trim() !== '' ? own : humanise(element.id);
    }
  }
  return names;
}

/**
 * The lowered files as Play and Reload send them. A file without `elementId` gets the id of
 * the project element its path names (`msm/<ns>/<folder>/<path>.json`, also under `data/`
 * and `assets/`), so restart reasons can name the thing. Pack files the content jar leaves out
 * (a resource or data layer file outside `assets/` or `data/`, such as `pack.mcmeta`) are not
 * sent: they never reach the game, so a change to them must not ask for a restart (B379).
 */
export function playOutputs(files: readonly OutputFile[], project: Project): PlayOutputFile[] {
  const ids = new Set<string>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) ids.add(element.id);
  }
  return files.filter(inContentJar).map((file) => {
    const own = (file as OutputFile & { elementId?: string }).elementId;
    const elementId = own ?? elementOfPath(file.path, ids);
    return {
      path: file.path,
      contents: file.contents,
      ...(elementId === undefined ? {} : { elementId }),
    };
  });
}

/** Whether the content jar holds `file` (the exporter's rule for pack layers). */
function inContentJar(file: OutputFile): boolean {
  if (file.layer === 'resourcepack') return file.path.startsWith('assets/');
  if (file.layer === 'datapack') return file.path.startsWith('data/');
  return true;
}

function elementOfPath(path: string, ids: ReadonlySet<string>): string | undefined {
  const parts = path.split('/');
  if (parts.length < 4 || !['msm', 'data', 'assets'].includes(parts[0] as string)) return undefined;
  const namespace = parts[1] as string;
  const rest = parts.slice(3).join('/');
  const dot = rest.lastIndexOf('.');
  const id = `${namespace}:${dot > 0 ? rest.slice(0, dot) : rest}`;
  return ids.has(id) ? id : undefined;
}

/** The status bar line after a Play or Restart that worked. */
export function playResultMessage(result: Extract<PlayResult, { ok: true }>): string {
  const parts: string[] = [];
  const game = result.world.startsWith(GAME_WORLD_PREFIX);
  if (result.instanceCreated) {
    parts.push(`Made the test instance "${result.instanceName}" in Prism Launcher.`);
  }
  if (result.launched) {
    parts.push(
      result.restarted
        ? 'Minecraft is starting again with your changes.'
        : game
          ? 'Minecraft is starting. It opens your game by itself.'
          : 'Minecraft is starting. It opens the test world by itself.',
    );
  } else if (result.note !== null) {
    parts.push(result.note);
  }
  if (result.itemsLeftOut > 0) {
    parts.push(
      `${result.itemsLeftOut} ${result.itemsLeftOut === 1 ? 'item does' : 'items do'} not fit in the test world's chests.`,
    );
  }
  return parts.join(' ');
}

/** The status bar line after New test world (or, for `game`, Start over). */
export function newWorldMessage(
  result: Extract<TestWorldResult, { ok: true }>,
  kind: PlayWorldKind = 'test',
): string {
  if (kind === 'game') {
    return result.renamedTo === null
      ? 'The next Play my game makes a fresh world.'
      : `The old game world is kept as "${result.renamedTo}". The next Play my game makes a fresh one.`;
  }
  return result.renamedTo === null
    ? 'The next Play makes a fresh test world.'
    : `The old test world is kept as "${result.renamedTo}". The next Play makes a fresh one.`;
}

/** The reasons' texts without repeats, in order. */
export function restartTexts(reasons: readonly PlayRestartReason[]): string[] {
  return [...new Set(reasons.map((reason) => reason.text))];
}

/**
 * Makes sure the test instance of `kind`'s recipe is there before Play (ADR 0133 D3): asks
 * `instances.plan`; when nothing is made yet, the offer card (or, when the plan does not ask,
 * `instances.ensure` at once) makes it. Resolves `go` to play on, with `made` when the instance
 * was made now, or `stop` when the user cancelled or making failed (already said).
 */
async function readyTestInstance(
  host: PlayHost,
  kind: PlayWorldKind,
  built: Extract<BuiltInput, { ok: true }>,
  setProgress: (line: string | null) => void,
  onNoLauncher: () => void,
): Promise<{ go: true; made: boolean } | { go: false }> {
  const instances = host.instances;
  const namespace = playNamespaces(built.project)[0];
  if (instances === undefined || namespace === undefined) return { go: true, made: false };
  const request: InstancePlanRequest = {
    targetId: host.session.target.id,
    action: { kind },
    project: { namespace, modId: built.modId, playsWithoutMods: false },
  };
  let plan: Awaited<ReturnType<typeof instances.plan>>;
  try {
    plan = await instances.plan(request);
  } catch {
    // Main could not plan: Play goes on and main says what is wrong, as before.
    return { go: true, made: false };
  }
  // A failed plan is left to Play's own message; an existing test instance never shows the card.
  if (!plan.ok || plan.existing !== null) return { go: true, made: false };
  if (plan.launcher === null) {
    onNoLauncher();
    return { go: false };
  }
  if (!plan.ask) setProgress(PLAY_CONTROL_LABELS.makingInstance(plan.recipe.place.name));
  const prepare = host.prepareInstance ?? useInstancesStore.getState().prepare;
  const outcome = await prepare({
    plan,
    request,
    jars: async () => [{ modId: built.modId, data: built.jar }],
  });
  setProgress(null);
  switch (outcome.kind) {
    case 'made':
      return { go: true, made: outcome.made.created };
    case 'failed':
      if (outcome.failure.code === 'no-launcher') onNoLauncher();
      notifyOf(host)({ kind: 'error', text: outcome.failure.message });
      return { go: false };
    // Play offers none of the user's own instances (its test world needs the test instance).
    case 'mine':
    case 'cancelled':
      return { go: false };
  }
}

/** Built input, or the problems that blocked the content jar. */
type BuiltInput =
  | {
      ok: true;
      modId: string;
      jar: Uint8Array;
      outputs: PlayOutputFile[];
      project: Project;
    }
  | { ok: false; problems: readonly Problem[] };

/** Saves (held-back typing first), then builds the jar and the lowered files. */
async function saveAndBuild(
  host: PlayHost,
  setProgress: (line: string) => void,
): Promise<BuiltInput | null> {
  const { session } = host;
  setProgress(PLAY_CONTROL_LABELS.saving);
  await flushPendingEdits();
  if (session.snapshot.dirty) await session.save();
  const project = session.snapshot.project;
  if (project === null) return null;
  setProgress(PLAY_CONTROL_LABELS.building);
  const built = await session.buildContentJar();
  if (built.data === undefined) return { ok: false, problems: built.report.problems };
  const lowered = await session.lowerExpandedProject();
  return {
    ok: true,
    modId: built.modId,
    jar: built.data,
    outputs: playOutputs(lowered.files, project),
    project,
  };
}

function notifyOf(host: PlayHost): (message: StatusMessage) => void {
  return host.notify ?? ((message) => useUiStore.getState().setMessage(message));
}

function showBlocked(host: PlayHost, what: string, problems: readonly Problem[]): void {
  const shown = userFacingExportProblems(problems);
  if (host.showProblems !== undefined) {
    host.showProblems(shown);
  } else {
    const ui = useUiStore.getState();
    ui.setExportProblems(shown);
    ui.setRightDock('problems');
  }
  notifyOf(host)({
    kind: 'error',
    text: `${what} blocked by ${errorCount(problems)} error(s); nothing was sent to the game. See Problems.`,
  });
}

/** The Play store. */
export const usePlayStore = create<PlayState>()((set, get) => {
  /** Opens the Prism panel and reads the other launchers added in Settings for it. */
  const openPanel = (host: PlayHost): void => {
    set({ prismPanel: true, prismMessage: null });
    void (async () => {
      try {
        const launchers = otherLaunchers((await host.settings.get()).launchers);
        if (get().host === host) set({ otherLaunchers: launchers });
      } catch {
        // Without the settings the panel only explains how to get Prism.
      }
    })();
  };

  const targetOf = (host: PlayHost): string | null =>
    host.session.snapshot.project === null ? null : host.session.target.id;

  const runPlay = async (op: 'play' | 'restart', kind: PlayWorldKind): Promise<void> => {
    const { host, running, status } = get();
    if (host === null || running !== null || host.session.snapshot.project === null) return;
    if (status?.instance === 'no-prism') {
      openPanel(host);
      return;
    }
    const notify = notifyOf(host);
    if (kind === 'game' && playGameSettings(host.session.snapshot.project) === null) {
      notify({ kind: 'error', text: PLAY_CONTROL_LABELS.playGameOff });
      return;
    }
    set({ running: op === 'play' && kind === 'game' ? 'play-game' : op, restartDialog: null });
    try {
      const built = await saveAndBuild(host, (progress) => set({ progress }));
      if (built === null) return;
      if (!built.ok) {
        showBlocked(host, op === 'play' ? 'Play' : 'Restart', built.problems);
        return;
      }
      set({ progress: null });
      const game = kind === 'game' ? playGameSettings(built.project) : null;
      if (kind === 'game' && game === null) {
        notify({ kind: 'error', text: PLAY_CONTROL_LABELS.playGameOff });
        return;
      }
      const ready = await readyTestInstance(
        host,
        kind,
        built,
        (progress) => set({ progress }),
        () => openPanel(host),
      );
      if (!ready.go) return;
      const input: PlayInput = {
        targetId: host.session.target.id,
        modId: built.modId,
        jar: built.jar,
        outputs: built.outputs,
        namespaces: playNamespaces(built.project),
        items: game === null ? playItems(built.project) : [],
        ...(game === null ? {} : { game }),
      };
      const result = op === 'play' ? await host.play.play(input) : await host.play.restart(input);
      if (!result.ok) {
        if (result.code === 'no-prism') openPanel(host);
        notify({ kind: 'error', text: result.message });
        return;
      }
      // ADR 0102 D4: the jar's ids are in the test world now.
      await host.session.recordPlayed('play');
      notify({
        kind: 'info',
        text: playResultMessage(
          ready.made && !result.instanceCreated ? { ...result, instanceCreated: true } : result,
        ),
      });
    } catch (error) {
      notify({ kind: 'error', text: `Play failed: ${messageOf(error)}` });
    } finally {
      set({ running: null, progress: null });
      await get().refresh();
    }
  };

  /** New test world (`test`) or Start over (`game`). */
  const renameWorld = async (kind: PlayWorldKind): Promise<void> => {
    const { host, running } = get();
    if (host === null || running !== null) return;
    const project = host.session.snapshot.project;
    const namespace = project === null ? undefined : playNamespaces(project)[0];
    if (namespace === undefined) return;
    const notify = notifyOf(host);
    set({ running: kind === 'game' ? 'start-over' : 'new-world' });
    try {
      const result =
        kind === 'game'
          ? await host.play.newWorld(host.session.target.id, namespace, 'game')
          : await host.play.newWorld(host.session.target.id, namespace);
      notify(
        result.ok
          ? { kind: 'info', text: newWorldMessage(result, kind) }
          : { kind: 'error', text: result.message },
      );
    } catch (error) {
      const what = kind === 'game' ? PLAY_CONTROL_LABELS.startOver : PLAY_CONTROL_LABELS.newWorld;
      notify({ kind: 'error', text: `${what} failed: ${messageOf(error)}` });
    } finally {
      set({ running: null });
      await get().refresh();
    }
  };

  return {
    host: null,
    status: null,
    running: null,
    progress: null,
    restartDialog: null,
    prismPanel: false,
    prismMessage: null,
    otherLaunchers: [],

    setStatus: (status) => set({ status }),

    async refresh() {
      const { host } = get();
      if (host === null) return;
      const targetId = targetOf(host);
      if (targetId === null) {
        set({ status: null });
        return;
      }
      try {
        const status = await host.play.status(targetId);
        // The project may have changed target while main answered.
        if (targetOf(host) === status.targetId) set({ status });
      } catch {
        // Main could not read the status; keep the last one.
      }
    },

    play: () => runPlay('play', 'test'),
    playMyGame: () => runPlay('play', 'game'),
    restart: () => runPlay('restart', lastPlayKind(get().status)),

    async reload() {
      const { host, running, status } = get();
      if (host === null || running !== null || status?.canReload !== true) return;
      const notify = notifyOf(host);
      set({ running: 'reload' });
      try {
        const built = await saveAndBuild(host, (progress) => set({ progress }));
        if (built === null) return;
        if (!built.ok) {
          showBlocked(host, 'Reload', built.problems);
          return;
        }
        set({ progress: null });
        const input: ReloadInput = {
          targetId: host.session.target.id,
          modId: built.modId,
          outputs: built.outputs,
          jar: built.jar,
          names: playNames(built.project),
        };
        const result: ReloadResult = await host.play.reload(input);
        if (!result.ok) {
          notify({ kind: 'error', text: result.message });
          return;
        }
        await host.session.recordPlayed('reload');
        notify({ kind: 'info', text: result.message });
        if (result.restart.length > 0) set({ restartDialog: result.restart });
      } catch (error) {
        notify({ kind: 'error', text: `Reload failed: ${messageOf(error)}` });
      } finally {
        set({ running: null, progress: null });
        await get().refresh();
      }
    },

    newTestWorld: () => renameWorld('test'),
    startOver: () => renameWorld('game'),

    async openInstanceFolder() {
      const { host, status } = get();
      const gameDir = status?.gameDir ?? null;
      if (host === null || gameDir === null) return;
      try {
        await host.shell.showItemInFolder(gameDir);
      } catch {
        notifyOf(host)({ kind: 'info', text: `The test instance's folder is ${gameDir}` });
      }
    },

    showRestartNeeded() {
      const reasons = get().status?.restartNeeded ?? [];
      if (reasons.length > 0) set({ restartDialog: reasons });
    },
    closeRestartDialog: () => set({ restartDialog: null }),
    openPrismPanel() {
      const { host } = get();
      if (host === null) set({ prismPanel: true, prismMessage: null });
      else openPanel(host);
    },
    closePrismPanel: () => set({ prismPanel: false, prismMessage: null }),

    async findPrism() {
      const { host, running } = get();
      if (host === null || running !== null) return;
      set({ running: 'find-prism', prismMessage: null });
      try {
        await get().refresh();
        const status = get().status;
        if (status !== null && status.instance !== 'no-prism') {
          set({ prismPanel: false });
          notifyOf(host)({ kind: 'info', text: PLAY_CONTROL_LABELS.prismFound });
        } else {
          set({ prismMessage: PLAY_CONTROL_LABELS.prismNotFound });
        }
      } finally {
        set({ running: null });
      }
    },

    async choosePrismFolder() {
      const { host, running } = get();
      if (host === null || running !== null) return;
      let picked: string | null;
      try {
        picked = await host.dialogs.pickDirectory({ title: PLAY_CONTROL_LABELS.prismChooseTitle });
        if (picked === null) return;
        const current = await host.settings.get();
        const launchers = current.launchers ?? {
          prismDataDirs: [],
          multimcRoots: [],
          curseForgeRoots: [],
        };
        if (!launchers.prismDataDirs.includes(picked)) {
          await host.settings.set({
            launchers: { ...launchers, prismDataDirs: [...launchers.prismDataDirs, picked] },
          });
        }
      } catch (error) {
        set({ prismMessage: messageOf(error) });
        return;
      }
      await get().findPrism();
    },
  };
});

/** The bridge parts {@link connectPlay} reads. */
export interface PlayBridge {
  play?: PlayPlatform | undefined;
  shell: PlayHost['shell'];
  settings: PlayHost['settings'];
  dialogs: PlayHost['dialogs'];
  instances?: PlayHost['instances'] | undefined;
}

/**
 * Connects the Play store to `session` and the bridge: reads the status for the open
 * project's target, follows main's pushes for it and reads again when the project or its
 * target changes. Without `bridge.play` (an old test double) nothing is connected and the
 * controls stay hidden.
 *
 * @returns Disconnects (the controls hide again).
 */
export function connectPlay(
  session: PlaySession,
  bridge: PlayBridge,
  options: Pick<PlayHost, 'notify' | 'showProblems'> = {},
): () => void {
  const play = bridge.play;
  if (play === undefined) return () => {};
  const host: PlayHost = {
    session,
    play,
    shell: bridge.shell,
    settings: bridge.settings,
    dialogs: bridge.dialogs,
    ...(bridge.instances === undefined ? {} : { instances: bridge.instances }),
    ...options,
  };
  usePlayStore.setState({
    host,
    status: null,
    running: null,
    progress: null,
    restartDialog: null,
    prismPanel: false,
    prismMessage: null,
    otherLaunchers: [],
  });
  const targetOf = (): string | null =>
    session.snapshot.project === null ? null : session.target.id;
  let watched = targetOf();
  void usePlayStore.getState().refresh();
  const offSession = session.subscribe(() => {
    const next = targetOf();
    if (next === watched) return;
    watched = next;
    usePlayStore.setState({ status: null, restartDialog: null });
    void usePlayStore.getState().refresh();
  });
  const offStatus = play.onStatus((status) => {
    if (usePlayStore.getState().host === host && status.targetId === watched) {
      usePlayStore.setState({ status });
    }
  });
  return () => {
    offSession();
    offStatus();
    if (usePlayStore.getState().host === host) usePlayStore.setState({ host: null, status: null });
  };
}
