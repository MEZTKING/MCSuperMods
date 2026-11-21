/**
 * Fakes for the Play store and controls (B376): a session with the calls Play makes, a
 * `window.msm.play` that records its inputs, and statuses for every chip state. The chip
 * words and restart texts are copies of main's (`app/src/main/platform/play.ts`, which the
 * renderer project cannot import); `test/main/play-labels.test.ts` pins them to main.
 */

import type { Element, Json, Problem, Project, ResourceLocation } from '@msm/core';
import type { OutputFile } from '@msm/plugin-api';
import { type Mock, vi } from 'vitest';
import type { SessionSnapshot } from '../../src/renderer/src/session/project-session';
import type { PlayBridge, PlaySession } from '../../src/renderer/src/store/play-store';
import type {
  PlayGameState,
  PlayPlatform,
  PlayRestartReason,
  PlayResult,
  PlayStatus,
  ReloadResult,
  TestWorldResult,
} from '../../src/shared/platform';

export function element(id: ResourceLocation, kind: string, data: Json = {}): Element {
  return { formatVersion: 1, id, kind, data, meta: { createdAt: '2000-01-01T00:00:00.000Z' } };
}

/** A project with an item, two blocks (one without an item), two mobs (one without an egg). */
export function playProject(): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    targets: ['mc-26.3'],
    plugins: [],
    settings: {},
    namespaces: [
      { name: 'minecraft', elements: [], assets: [] },
      {
        name: 'demo',
        elements: [
          element('demo:ruby_lamp', 'msm:block', { display_name: 'Ruby Lamp' }),
          element('demo:ruby', 'msm:item', {}),
          element('demo:hidden_block', 'msm:block', { item: false }),
          element('demo:goblin', 'msm:entity', { spawn_egg: { texture: 'demo:item/egg' } }),
          element('demo:ghost', 'msm:entity', { spawn_egg: false }),
          element('demo:ruby_recipe', 'minecraft:recipe', {}),
        ],
        assets: [],
      },
    ],
  };
}

export interface FakeSession extends PlaySession {
  /** Replaces the snapshot and notifies subscribers. */
  publish(next: Partial<SessionSnapshot>): void;
  setTarget(id: string): void;
  save: Mock<PlaySession['save']>;
  buildContentJar: Mock<PlaySession['buildContentJar']>;
  lowerExpandedProject: Mock<PlaySession['lowerExpandedProject']>;
  recordPlayed: Mock<PlaySession['recordPlayed']>;
}

export const JAR = new Uint8Array([80, 75, 3, 4]);

type Built = Awaited<ReturnType<PlaySession['buildContentJar']>>;

function report(ok: boolean, problems: readonly Problem[]): Built['report'] {
  return { ok, problems: [...problems], files: [] } as unknown as Built['report'];
}

/** What `buildContentJar` gives when nothing blocks. */
export function builtJar(): Built {
  return { report: report(true, []), modId: 'demo', data: JAR };
}

export const LOWERED: OutputFile[] = [
  {
    path: 'msm/demo/block/ruby_lamp.json',
    layer: 'msm',
    contents: { type: 'simple' },
  },
  { path: 'data/demo/recipe/ruby_recipe.json', layer: 'datapack', contents: { type: 'x' } },
  { path: 'assets/demo/lang/en_us.json', layer: 'resourcepack', contents: {} },
];

export function fakeSession(
  options: { project?: Project | null; dirty?: boolean; blocked?: readonly Problem[] } = {},
): FakeSession {
  let snapshot = {
    root: '/projects/demo',
    project: options.project === undefined ? playProject() : options.project,
    dirty: options.dirty ?? false,
    canUndo: false,
    canRedo: false,
    undoLabel: undefined,
    redoLabel: undefined,
    problems: [],
  } as unknown as SessionSnapshot;
  let target = 'mc-26.3';
  const listeners = new Set<(snapshot: SessionSnapshot) => void>();
  const session = {
    get snapshot() {
      return snapshot;
    },
    get target() {
      return { id: target } as PlaySession['target'];
    },
    save: vi.fn(async () => {
      snapshot = { ...snapshot, dirty: false };
    }),
    buildContentJar: vi.fn(async () =>
      options.blocked === undefined
        ? builtJar()
        : { report: report(false, options.blocked), modId: 'demo' },
    ),
    lowerExpandedProject: vi.fn(async () => ({ files: LOWERED, problems: [] })),
    recordPlayed: vi.fn(async () => {}),
    subscribe(listener: (snapshot: SessionSnapshot) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(next: Partial<SessionSnapshot>) {
      snapshot = { ...snapshot, ...next };
      for (const listener of [...listeners]) listener(snapshot);
    },
    setTarget(id: string) {
      target = id;
      for (const listener of [...listeners]) listener(snapshot);
    },
  };
  return session as unknown as FakeSession;
}

/** Main's chip words (`PLAY_STATE_LABELS`). */
export const CHIP_LABELS: Readonly<Record<PlayGameState, string>> = {
  'no-prism': 'Prism Launcher not found',
  'not-running': 'Game not running',
  starting: 'Starting…',
  'test-world': 'In the test world',
  'other-world': 'In another world',
};

/** Main's `RESTART_NEEDED_LABEL`. */
export const RESTART_NEEDED = 'Restart needed';

/** A status for `state`; `restart` adds restart reasons. */
export function statusFor(
  state: PlayGameState,
  overrides: Partial<PlayStatus> & { restart?: boolean } = {},
): PlayStatus {
  const { restart, ...rest } = overrides;
  const reasons: PlayRestartReason[] = restart === true ? [NEW_BLOCK_REASON] : [];
  const label = reasons.length > 0 && state !== 'not-running' ? RESTART_NEEDED : CHIP_LABELS[state];
  return {
    targetId: 'mc-26.3',
    mcVersion: '26.3',
    instanceName: 'MCSuperMods Test (26.3)',
    instance: state === 'no-prism' ? 'no-prism' : 'ready',
    gameDir: state === 'no-prism' ? null : '/prism/instances/MCSuperMods Test (26.3)/minecraft',
    state,
    testWorld: 'msm-test-demo',
    world: state === 'test-world' ? 'msm-test-demo' : state === 'other-world' ? 'other' : null,
    handled: null,
    canReload: state === 'test-world',
    restartNeeded: reasons,
    label,
    busy: null,
    progress: null,
    ...rest,
  };
}

/** The nine restart reason codes with main's texts for them (`restartReasonText`). */
export const RESTART_REASONS: PlayRestartReason[] = [
  {
    reason: 'new-definition',
    path: 'msm/demo/block/ruby_lamp.json',
    kind: 'block',
    elementId: 'demo:ruby_lamp',
    text: 'You added a new block: Ruby Lamp. New blocks are only read when Minecraft starts.',
  },
  {
    reason: 'definition-changed',
    path: 'msm/demo/item/ruby.json',
    kind: 'item',
    elementId: 'demo:ruby',
    text: 'You changed more than what Ruby does when something happens. Changes like that are only read when Minecraft starts.',
  },
  {
    reason: 'definition-renamed',
    path: 'msm/demo/entity/goblin.json',
    from: 'msm/demo/entity/gob.json',
    kind: 'entity',
    elementId: 'demo:goblin',
    text: 'You renamed the mob Goblin. New names are only read when Minecraft starts.',
  },
  {
    reason: 'file-removed',
    path: 'msm/demo/effect/glow.json',
    kind: 'effect',
    elementId: 'demo:glow',
    text: 'You removed the effect Glow. Minecraft keeps it until it starts again.',
  },
  {
    reason: 'sound-events',
    path: 'assets/demo/sounds.json',
    text: 'You added or removed a sound. Sounds are only read when Minecraft starts.',
  },
  {
    reason: 'mod-file',
    path: 'fabric.mod.json',
    text: "Your mod's details changed. They are only read when Minecraft starts.",
  },
  {
    reason: 'mod-id',
    path: 'fabric.mod.json',
    text: "Your mod's id changed. It is only read when Minecraft starts.",
  },
  {
    reason: 'runtime-version',
    path: 'META-INF/jars/msm_runtime.jar',
    text: 'MCSuperMods has a new version of its runtime. It is only loaded when Minecraft starts.',
  },
  {
    reason: 'fabric-api-version',
    path: 'mods/fabric-api.jar',
    text: 'The Fabric API version changed. It is only loaded when Minecraft starts.',
  },
];

/** The names the restart texts use, by element id. */
export const RESTART_NAMES: Readonly<Record<string, string>> = {
  'demo:ruby_lamp': 'Ruby Lamp',
  'demo:ruby': 'Ruby',
  'demo:goblin': 'Goblin',
  'demo:glow': 'Glow',
};

export const NEW_BLOCK_REASON = RESTART_REASONS[0] as PlayRestartReason;

export const PLAY_OK: PlayResult = {
  ok: true,
  instanceName: 'MCSuperMods Test (26.3)',
  instanceCreated: false,
  gameDir: '/prism/instances/MCSuperMods Test (26.3)/minecraft',
  world: 'msm-test-demo',
  restarted: false,
  launched: true,
  note: null,
  fabricApi: 'present',
  itemsLeftOut: 0,
  seq: 1,
};

export function reloadOk(restart: PlayRestartReason[] = []): ReloadResult {
  return {
    ok: true,
    action: 'reload',
    seq: 2,
    changes: 1,
    assets: false,
    counts: { data: 1, scripts: 0, events: 0, assets: 0, worldData: 0, removed: 0 },
    restart,
    message: 'Reloading 1 change in Minecraft.',
  };
}

export interface FakeBridge extends PlayBridge {
  play: {
    status: Mock<PlayPlatform['status']>;
    play: Mock<PlayPlatform['play']>;
    reload: Mock<PlayPlatform['reload']>;
    restart: Mock<PlayPlatform['restart']>;
    newWorld: Mock<PlayPlatform['newWorld']>;
    onStatus: PlayPlatform['onStatus'];
  };
  /** Pushes a status as main would. */
  push(status: PlayStatus): void;
  /** Sets what `status()` answers next, without pushing. */
  setCurrent(status: PlayStatus): void;
  shell: { showItemInFolder: Mock<PlayBridge['shell']['showItemInFolder']> };
  settings: {
    get: Mock<PlayBridge['settings']['get']>;
    set: Mock<PlayBridge['settings']['set']>;
  };
  dialogs: { pickDirectory: Mock<PlayBridge['dialogs']['pickDirectory']> };
}

export function fakeBridge(initial: PlayStatus = statusFor('not-running')): FakeBridge {
  let current = initial;
  const listeners = new Set<(status: PlayStatus) => void>();
  const newWorld: TestWorldResult = { ok: true, renamedTo: 'msm-test-demo-old-1' };
  const bridge = {
    play: {
      status: vi.fn(async (targetId: string) => ({ ...current, targetId })),
      play: vi.fn(async () => PLAY_OK),
      reload: vi.fn(async () => reloadOk()),
      restart: vi.fn(async () => ({ ...PLAY_OK, restarted: true })),
      newWorld: vi.fn(async () => newWorld),
      onStatus(listener: (status: PlayStatus) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    push(status: PlayStatus) {
      current = status;
      for (const listener of [...listeners]) listener(status);
    },
    setCurrent(status: PlayStatus) {
      current = status;
    },
    shell: { showItemInFolder: vi.fn(async () => {}) },
    settings: {
      get: vi.fn(async () => ({
        minecraftDir: null,
        updates: { channel: 'stable' },
        launchers: { prismDataDirs: [], multimcRoots: [], curseForgeRoots: [] },
      })),
      set: vi.fn(async () => {}),
    },
    dialogs: { pickDirectory: vi.fn(async () => '/home/me/prism') },
  };
  return bridge as unknown as FakeBridge;
}
