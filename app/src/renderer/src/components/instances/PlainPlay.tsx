/**
 * Play without mods and Open this map (ADR 0133 D6, B766) in the renderer.
 *
 * **Play without mods** (the Play menu) is for a game that plays without mods: it builds what a
 * map carries ({@link PlainPlaySession.buildMapContent}), refuses a project that needs its mod in
 * words, checks that the game world exists (otherwise the card says to press Play my game once
 * first), asks `instances.plan` for the Plain instance and shows the offer card when it must be
 * made (`useInstancesStore.prepare`), then asks main to copy the game world into it and start it
 * (`instances.playPlain`). **Open this map** ({@link usePlainPlayStore}'s `openMap`, for the map
 * dialog's button) does the same with the world a map was exported from.
 *
 * {@link PlainPlayDialog} shows the card when the user has something to read (no game world yet,
 * the game needs its mod, a failure); a launch that worked is a status bar line.
 *
 * @packageDocumentation
 */

import { create } from 'zustand';
import type {
  InstanceLaunchResult,
  InstancePlan,
  InstancePlanRequest,
  InstanceProjectFacts,
  InstancesPlatform,
  MapsPlatform,
} from '../../../../shared/platform';
import { flushPendingEdits } from '../../session/pending-edits';
import type { MapContent, ProjectSession } from '../../session/project-session';
import {
  type InstanceOfferInput,
  type InstanceOfferOutcome,
  useInstancesStore,
} from '../../store/instances-store';
import { playNamespaces } from '../../store/play-store';
import type { StatusMessage } from '../../store/ui-store';
import { useUiStore } from '../../store/ui-store';
import { Modal } from '../NewElementDialog';

/** The words of Play without mods and Open this map. */
export const PLAIN_PLAY_WORDS = {
  menu: 'Play without mods',
  busy: 'Wait until Play has finished.',
  title: 'Play without mods',
  saving: 'Saving…',
  building: 'Building your packs…',
  copying: 'Copying your game world…',
  needsGame:
    'Your game has no world yet. Press Play my game once: Minecraft makes the world, then Play without mods opens a copy of it.',
  needsGameButton: 'Play my game',
  needsMod:
    'This game needs its mod, so it cannot be played without mods. Use Play my game instead.',
  mapNeedsMod:
    'This map needs its mod, so it cannot be opened without mods. Open it in its own instance instead.',
  blocked: 'Your packs could not be built. Fix what Things to fix lists, then try again.',
  noLauncher: 'Prism Launcher was not found. Install it and start it once, then try again.',
  close: 'Close',
  copySentence:
    'It opens a copy of your game world with your data pack in it, without what only the test instance uses. The copy is made again each time.',
  mapCopySentence:
    "It opens a copy of the map's world with your data pack in it. The copy is made again each time.",
  started: 'Minecraft is starting without mods. It opens a copy of your game by itself.',
  mapStarted: 'Minecraft is starting without mods. It opens a copy of the map by itself.',
} as const;

/** What Play without mods needs from the session. */
export type PlainPlaySession = Pick<
  ProjectSession,
  'snapshot' | 'target' | 'save' | 'buildMapContent'
>;

/** What Play without mods needs from the host. */
export interface PlainPlayHost {
  session: PlainPlaySession;
  instances: Pick<InstancesPlatform, 'plan' | 'playPlain' | 'openMap'>;
  maps: Pick<MapsPlatform, 'listWorlds'>;
  /** The offer card; defaults to the instances store's `prepare`. */
  prepare?(input: InstanceOfferInput): Promise<InstanceOfferOutcome>;
  /** A status bar line; defaults to the UI store's. */
  notify?(message: StatusMessage): void;
}

/** A world a map was exported from, for Open this map. */
export interface PlainMapWorld {
  mapName: string;
  sourceId: string;
  worldDir: string;
  keepPlayerData: boolean;
}

/** What the card says, or `null` when it is closed. */
export type PlainPlayCard =
  | { kind: 'needs-game' }
  | { kind: 'needs-mod'; map: boolean }
  | { kind: 'failed'; text: string };

/** The store's shape. */
export interface PlainPlayState {
  card: PlainPlayCard | null;
  /** The progress line while it runs, or `null`. */
  progress: string | null;
  /** Play without mods: the project's game world in the Plain instance. */
  play(host: PlainPlayHost): Promise<void>;
  /** Open this map: the world a map was exported from in the Plain instance. */
  openMap(host: PlainPlayHost, world: PlainMapWorld): Promise<void>;
  close(): void;
}

/** The game world Play my game makes (`msm-game-<ns>`, as `gameWorldFolder` in interop). */
export function plainGameWorld(namespace: string): string {
  return `msm-game-${namespace}`;
}

/** The card's plan with the sentence that says which world it opens, before the last sentence. */
export function withCopySentence(plan: InstancePlan, sentence: string): InstancePlan {
  const sentences = [...plan.sentences];
  sentences.splice(Math.max(0, sentences.length - 1), 0, sentence);
  return { ...plan, sentences };
}

/** The packs a map carries, as the instances requests take them. */
function packsOf(content: MapContent): {
  dataPack?: { fileName: string; data: Uint8Array };
  resourcePack?: Uint8Array;
} {
  return {
    ...(content.dataPack === undefined ? {} : { dataPack: content.dataPack }),
    ...(content.resourcePack === undefined ? {} : { resourcePack: content.resourcePack }),
  };
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const usePlainPlayStore = create<PlainPlayState>()((set, get) => {
  const notifyOf =
    (host: PlainPlayHost) =>
    (message: StatusMessage): void =>
      (host.notify ?? ((m: StatusMessage) => useUiStore.getState().setMessage(m)))(message);

  /**
   * The shared steps: save, build the packs, refuse a project that needs its mod, offer the Plain
   * instance, then `launch` (playPlain or openMap). `check` runs after the build (the game
   * world's presence); it answers `false` when it opened the card itself.
   */
  const run = async (
    host: PlainPlayHost,
    map: boolean,
    check: (namespace: string) => Promise<boolean>,
    launch: (project: InstanceProjectFacts, content: MapContent) => Promise<InstanceLaunchResult>,
  ): Promise<void> => {
    if (get().progress !== null) return;
    const notify = notifyOf(host);
    const { session } = host;
    set({ card: null, progress: PLAIN_PLAY_WORDS.saving });
    try {
      await flushPendingEdits();
      if (session.snapshot.dirty) await session.save();
      const project = session.snapshot.project;
      const namespace = project === null ? undefined : playNamespaces(project)[0];
      if (namespace === undefined) return;
      set({ progress: PLAIN_PLAY_WORDS.building });
      const content = await session.buildMapContent();
      if (content.needsJar) {
        set({ card: { kind: 'needs-mod', map } });
        return;
      }
      if (!content.report.ok || content.dataPack === undefined) {
        set({ card: { kind: 'failed', text: PLAIN_PLAY_WORDS.blocked } });
        return;
      }
      if (!(await check(namespace))) return;
      const facts: InstanceProjectFacts = { namespace, modId: null, playsWithoutMods: true };
      const request: InstancePlanRequest = {
        targetId: session.target.id,
        action: { kind: 'plain' },
        project: facts,
      };
      const plan = await host.instances.plan(request);
      if (!plan.ok) {
        set({ card: { kind: 'failed', text: plan.message } });
        return;
      }
      if (plan.launcher === null) {
        set({ card: { kind: 'failed', text: PLAIN_PLAY_WORDS.noLauncher } });
        return;
      }
      if (plan.existing === null) {
        set({ progress: null });
        const prepare = host.prepare ?? useInstancesStore.getState().prepare;
        const outcome = await prepare({
          plan: withCopySentence(
            plan,
            map ? PLAIN_PLAY_WORDS.mapCopySentence : PLAIN_PLAY_WORDS.copySentence,
          ),
          request,
        });
        if (outcome.kind === 'failed') {
          set({ card: { kind: 'failed', text: outcome.failure.message } });
          return;
        }
        if (outcome.kind !== 'made') return;
      }
      set({ progress: PLAIN_PLAY_WORDS.copying });
      const result = await launch(facts, content);
      if (!result.ok) {
        set({
          card:
            result.code === 'needs-mod'
              ? { kind: 'needs-mod', map }
              : result.code === 'not-found' && !map
                ? { kind: 'needs-game' }
                : { kind: 'failed', text: result.message },
        });
        return;
      }
      notify({
        kind: 'info',
        text: result.launched
          ? map
            ? PLAIN_PLAY_WORDS.mapStarted
            : PLAIN_PLAY_WORDS.started
          : (result.note ?? ''),
      });
    } catch (error) {
      set({ card: { kind: 'failed', text: messageOf(error) } });
    } finally {
      set({ progress: null });
    }
  };

  return {
    card: null,
    progress: null,

    play: (host) =>
      run(
        host,
        false,
        async (namespace) => {
          const sources = await host.maps.listWorlds(host.session.target.id);
          const managed = sources.find((source) => source.managed);
          const world = plainGameWorld(namespace);
          if (managed?.worlds.some((entry) => entry.dir === world) === true) return true;
          set({ card: { kind: 'needs-game' } });
          return false;
        },
        (project, content) =>
          host.instances.playPlain({
            targetId: host.session.target.id,
            project,
            ...packsOf(content),
          }),
      ),

    openMap: (host, world) =>
      run(
        host,
        true,
        async () => true,
        (project, content) =>
          host.instances.openMap({
            targetId: host.session.target.id,
            project,
            mapName: world.mapName,
            sourceId: world.sourceId,
            worldDir: world.worldDir,
            jars: [],
            keepPlayerData: world.keepPlayerData,
            ...packsOf(content),
          }),
      ),

    close() {
      set({ card: null });
    },
  };
});

/** Props of {@link PlainPlayDialog}. */
export interface PlainPlayDialogProps {
  /** Play my game, for the card that says the game has no world yet. */
  onPlayMyGame(): void;
}

/** The card of Play without mods, shown while the store has one. */
export function PlainPlayDialog(props: PlainPlayDialogProps) {
  const card = usePlainPlayStore((state) => state.card);
  if (card === null) return null;
  const close = (): void => usePlainPlayStore.getState().close();
  const text =
    card.kind === 'needs-game'
      ? PLAIN_PLAY_WORDS.needsGame
      : card.kind === 'needs-mod'
        ? card.map
          ? PLAIN_PLAY_WORDS.mapNeedsMod
          : PLAIN_PLAY_WORDS.needsMod
        : card.text;
  return (
    <Modal
      title={PLAIN_PLAY_WORDS.title}
      error={null}
      testId="plain-play-dialog"
      submitLabel={
        card.kind === 'needs-game' ? PLAIN_PLAY_WORDS.needsGameButton : PLAIN_PLAY_WORDS.close
      }
      onCancel={close}
      onSubmit={() => {
        close();
        if (card.kind === 'needs-game') props.onPlayMyGame();
      }}
    >
      <p className="text-sm" data-testid="plain-play-text" data-kind={card.kind}>
        {text}
      </p>
    </Modal>
  );
}

/**
 * The host for Play without mods from the Play controls' session and the preload's services, or
 * `null` when one is missing (an old test double, a browser preview).
 */
export function plainPlayHostOf(
  session: unknown,
  notify?: (message: StatusMessage) => void,
): PlainPlayHost | null {
  const msm = (globalThis as { msm?: { instances?: InstancesPlatform; maps?: MapsPlatform } }).msm;
  if (
    msm?.instances === undefined ||
    msm.maps === undefined ||
    typeof session !== 'object' ||
    session === null ||
    typeof (session as Partial<PlainPlaySession>).buildMapContent !== 'function'
  ) {
    return null;
  }
  return {
    session: session as PlainPlaySession,
    instances: msm.instances,
    maps: msm.maps,
    ...(notify === undefined ? {} : { notify }),
  };
}
