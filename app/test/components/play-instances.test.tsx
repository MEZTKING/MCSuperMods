// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfferCardHost } from '../../src/renderer/src/components/instances/OfferCard';
import { PrismSetupPanel } from '../../src/renderer/src/components/play/PrismSetupPanel';
import { connectInstances, useInstancesStore } from '../../src/renderer/src/store/instances-store';
import {
  connectPlay,
  otherLaunchers,
  PLAY_CONTROL_LABELS,
  usePlayStore,
} from '../../src/renderer/src/store/play-store';
import type { StatusMessage } from '../../src/renderer/src/store/ui-store';
import type {
  InstanceEnsureRequest,
  InstanceEnsureResult,
  InstancePlan,
  InstancePlanRequest,
  InstancePlanResult,
  InstancesPlatform,
} from '../../src/shared/platform';
import { planFor, TARGET_IDS } from './instances/plans';
import { expectPlain } from './plain-sweep';
import {
  type FakeBridge,
  type FakeSession,
  fakeBridge,
  fakeSession,
  gameProject,
  JAR,
  statusFor,
} from './play-fixtures';

/**
 * Play and Play my game through recipes (ADR 0133 D3, B765): `instances.plan` first, the offer
 * card when the test instance must be made (the first time for that kind by default), never for
 * an existing one; `instances.ensure` makes it before Play sends anything.
 */

const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

let disconnect: (() => void) | null = null;
let messages: StatusMessage[] = [];

interface FakeInstances {
  plan: ReturnType<typeof vi.fn<(request: InstancePlanRequest) => Promise<InstancePlanResult>>>;
  ensure: ReturnType<
    typeof vi.fn<(request: InstanceEnsureRequest) => Promise<InstanceEnsureResult>>
  >;
}

/** `window.msm.instances` answering `plan` from {@link planFor} with `overrides`. */
function fakeInstances(
  overrides: Partial<InstancePlan> = {},
  ensured: Partial<Extract<InstanceEnsureResult, { ok: true }>> | InstanceEnsureResult = {},
): FakeInstances {
  return {
    plan: vi.fn(async (request: InstancePlanRequest) => {
      const purpose = request.action.kind === 'game' ? 'game' : 'test';
      return planFor(request.targetId, purpose, overrides).plan;
    }),
    ensure: vi.fn(async (request: InstanceEnsureRequest) => {
      if ('ok' in ensured && ensured.ok === false) return ensured;
      const name = planFor(request.targetId, 'test').plan.recipe.place.name;
      return {
        ok: true as const,
        id: `instance:/prism/instances/${name}`,
        name,
        created: true,
        updated: false,
        gameDir: `/prism/instances/${name}/minecraft`,
        mods: ['demo.jar'],
        ...ensured,
      };
    }),
  };
}

async function connect(
  instances: FakeInstances | undefined,
  options: { session?: FakeSession; bridge?: FakeBridge } = {},
): Promise<{ session: FakeSession; bridge: FakeBridge }> {
  const session = options.session ?? fakeSession();
  const bridge = options.bridge ?? fakeBridge();
  messages = [];
  if (instances !== undefined) {
    connectInstances(instances as unknown as InstancesPlatform);
    (bridge as { instances?: unknown }).instances = instances;
  }
  disconnect = connectPlay(session, bridge, {
    notify: (message) => messages.push(message),
    showProblems: () => {},
  });
  await flush();
  return { session, bridge };
}

beforeEach(() => {
  messages = [];
  useInstancesStore.setState({ card: null, platform: null });
  window.msmMoreOptionsOpen = false;
  globalThis.localStorage.clear();
});

afterEach(() => {
  cleanup();
  useInstancesStore.getState().cancel();
  disconnect?.();
  disconnect = null;
  connectInstances(null);
  window.msmMoreOptionsOpen = true;
});

describe('Play through recipes', () => {
  for (const targetId of TARGET_IDS) {
    it(`asks before making the test instance on the first Play (${targetId})`, async () => {
      const instances = fakeInstances({ ask: true });
      const { session, bridge } = await connect(instances);
      session.setTarget(targetId);
      await flush();
      const playing = usePlayStore.getState().play();
      await waitFor(() => expect(useInstancesStore.getState().card).not.toBeNull());
      // Nothing is made or sent before the user answers.
      expect(instances.plan).toHaveBeenCalledWith({
        targetId,
        action: { kind: 'test' },
        project: { namespace: 'demo', modId: 'demo', playsWithoutMods: false },
      });
      expect(instances.ensure).not.toHaveBeenCalled();
      expect(bridge.play.play).not.toHaveBeenCalled();
      // Play offers none of the user's own instances: its test world needs the test instance.
      expect(useInstancesStore.getState().card?.input.locations).toBeUndefined();

      useInstancesStore.getState().setRemember(true);
      await act(() => useInstancesStore.getState().make());
      await playing;
      expect(instances.ensure).toHaveBeenCalledWith({
        targetId,
        action: { kind: 'test' },
        project: { namespace: 'demo', modId: 'demo', playsWithoutMods: false },
        jars: [{ modId: 'demo', data: JAR }],
        remember: true,
      });
      expect(bridge.play.play).toHaveBeenCalledTimes(1);
      expect(bridge.play.play.mock.calls[0]?.[0].targetId).toBe(targetId);
      // The instance was made by the card, so the line still says so.
      expect(messages.at(-1)?.text).toContain('Made the test instance');
    });

    it(`makes the test instance without a card when the setting says not to ask (${targetId})`, async () => {
      const instances = fakeInstances({ ask: false });
      const { session, bridge } = await connect(instances);
      session.setTarget(targetId);
      await flush();
      const lines: (string | null)[] = [];
      const off = usePlayStore.subscribe((state) => lines.push(state.progress));
      await usePlayStore.getState().play();
      off();
      expect(useInstancesStore.getState().card).toBeNull();
      expect(instances.ensure).toHaveBeenCalledTimes(1);
      expect(instances.ensure.mock.calls[0]?.[0]).not.toHaveProperty('remember');
      expect(bridge.play.play).toHaveBeenCalledTimes(1);
      const name = planFor(targetId, 'test').plan.recipe.place.name;
      expect(lines).toContain(PLAY_CONTROL_LABELS.makingInstance(name));
      expect(messages.at(-1)?.kind).toBe('info');
    });
  }

  it('never shows the card for an existing test instance: one progress line, no dialog', async () => {
    const instances = fakeInstances({
      ask: false,
      existing: {
        id: 'instance:/prism/instances/MCSuperMods Test (26.3)',
        name: 'MCSuperMods Test (26.3)',
      },
    });
    const { bridge } = await connect(instances, { bridge: fakeBridge(statusFor('not-running')) });
    await usePlayStore.getState().play();
    expect(instances.plan).toHaveBeenCalledTimes(1);
    expect(instances.ensure).not.toHaveBeenCalled();
    expect(useInstancesStore.getState().card).toBeNull();
    expect(bridge.play.play).toHaveBeenCalledTimes(1);
    expect(messages).toEqual([
      { kind: 'info', text: 'Minecraft is starting. It opens the test world by itself.' },
    ]);
  });

  it('plays as before with no instances service (an old host)', async () => {
    const { bridge } = await connect(undefined);
    await usePlayStore.getState().play();
    expect(bridge.play.play).toHaveBeenCalledTimes(1);
    expect(useInstancesStore.getState().card).toBeNull();
  });

  it('stops without a word when the card is cancelled', async () => {
    const instances = fakeInstances({ ask: true });
    const { bridge } = await connect(instances);
    const playing = usePlayStore.getState().play();
    await waitFor(() => expect(useInstancesStore.getState().card).not.toBeNull());
    useInstancesStore.getState().cancel();
    await playing;
    expect(instances.ensure).not.toHaveBeenCalled();
    expect(bridge.play.play).not.toHaveBeenCalled();
    expect(messages).toEqual([]);
    expect(usePlayStore.getState().running).toBeNull();
  });

  it("says main's reason when making the instance fails without a card", async () => {
    const instances = fakeInstances(
      { ask: false },
      { ok: false, code: 'not-managed', message: "A folder of that name is not MCSuperMods's." },
    );
    const { bridge } = await connect(instances);
    await usePlayStore.getState().play();
    expect(bridge.play.play).not.toHaveBeenCalled();
    expect(messages).toEqual([
      { kind: 'error', text: "A folder of that name is not MCSuperMods's." },
    ]);
  });

  it('asks for the game kind for Play my game', async () => {
    const instances = fakeInstances({ ask: false });
    const { bridge } = await connect(instances, {
      session: fakeSession({ project: gameProject() }),
    });
    await usePlayStore.getState().playMyGame();
    expect(instances.plan.mock.calls[0]?.[0].action).toEqual({ kind: 'game' });
    expect(instances.ensure.mock.calls[0]?.[0].action).toEqual({ kind: 'game' });
    expect(bridge.play.play.mock.calls[0]?.[0].game).toBeDefined();
  });

  it('opens the Prism panel when the plan finds no launcher', async () => {
    const instances = fakeInstances({ ask: true, launcher: null });
    const { bridge } = await connect(instances);
    await usePlayStore.getState().play();
    expect(usePlayStore.getState().prismPanel).toBe(true);
    expect(useInstancesStore.getState().card).toBeNull();
    expect(bridge.play.play).not.toHaveBeenCalled();
  });

  it('shows the card through the host App mounts, with the plan in plain words', async () => {
    const instances = fakeInstances({ ask: true });
    await connect(instances);
    render(<OfferCardHost />);
    const playing = usePlayStore.getState().play();
    const dialog = await screen.findByTestId('instance-offer-dialog');
    expectPlain(dialog);
    act(() => useInstancesStore.getState().cancel());
    await playing;
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('The Prism panel names the launchers already there', () => {
  it('lists MultiMC and CurseForge folders added in Settings', () => {
    expect(otherLaunchers(null)).toEqual([]);
    expect(otherLaunchers({ prismDataDirs: [], multimcRoots: [], curseForgeRoots: [] })).toEqual(
      [],
    );
    expect(
      otherLaunchers({
        prismDataDirs: [],
        multimcRoots: ['/m', '/p'],
        curseForgeRoots: ['/c'],
      }).map((launcher) => [launcher.kind, launcher.folders]),
    ).toEqual([
      ['multimc', 2],
      ['curseforge', 1],
    ]);
  });

  it('opens with the MultiMC folder already added, before how to get Prism', async () => {
    const bridge = fakeBridge(statusFor('no-prism'));
    bridge.settings.get.mockResolvedValue({
      minecraftDir: null,
      updates: { channel: 'stable' },
      launchers: { prismDataDirs: [], multimcRoots: ['/home/me/MultiMC'], curseForgeRoots: [] },
    } as never);
    await connect(fakeInstances(), { bridge });
    await usePlayStore.getState().play();
    await flush();
    const state = usePlayStore.getState();
    expect(state.prismPanel).toBe(true);
    expect(state.otherLaunchers.map((launcher) => launcher.kind)).toEqual(['multimc']);
    render(
      <PrismSetupPanel
        message={null}
        launchers={state.otherLaunchers}
        busy={false}
        onFind={() => {}}
        onChooseFolder={() => {}}
        onClose={() => {}}
      />,
    );
    const dialog = screen.getByTestId('play-prism-panel');
    const text = dialog.textContent ?? '';
    expect(screen.getByTestId('play-prism-other-multimc').textContent).toContain('MultiMC');
    expect(text.indexOf('MultiMC')).toBeLessThan(text.indexOf('Download and install Prism'));
    expect(text).not.toContain('/home/me/MultiMC');
    expectPlain(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });
  });

  it('shows only how to get Prism when no other launcher was added', () => {
    render(
      <PrismSetupPanel
        message={null}
        busy={false}
        onFind={() => {}}
        onChooseFolder={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByTestId('play-prism-other-launchers')).toBeNull();
  });
});
