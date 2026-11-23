// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstallTargetOption } from '../../../src/renderer/src/components/install-target';
import { OfferCardHost } from '../../../src/renderer/src/components/instances/OfferCard';
import { plainSentence } from '../../../src/renderer/src/components/instances/words';
import {
  connectInstances,
  type InstanceOfferInput,
  type InstanceOfferOutcome,
  needsOffer,
  useInstancesStore,
} from '../../../src/renderer/src/store/instances-store';
import type { InstanceEnsureResult, InstancesPlatform } from '../../../src/shared/platform';
import { expectPlain } from '../plain-sweep';
import { PURPOSES, type Purpose, planFor, TARGET_IDS } from './plans';

const MADE: InstanceEnsureResult = {
  ok: true,
  id: 'instance:/prism/instances/MCSuperMods Test (26.3)',
  name: 'MCSuperMods Test (26.3)',
  created: true,
  updated: false,
  gameDir: '/prism/instances/MCSuperMods Test (26.3)/minecraft',
  mods: ['ruby_mod.jar'],
};

function fakePlatform(ensure: InstancesPlatform['ensure'] = vi.fn(async () => MADE)) {
  const platform = {
    plan: vi.fn(),
    ensure: vi.fn(ensure),
    list: vi.fn(async () => []),
    remove: vi.fn(),
    showInFolder: vi.fn(),
    launch: vi.fn(),
    playPlain: vi.fn(),
    openMap: vi.fn(),
    curseForgeProfile: vi.fn(),
  } as unknown as InstancesPlatform & { ensure: ReturnType<typeof vi.fn> };
  connectInstances(platform);
  return platform;
}

const OWN: InstallTargetOption[] = [
  {
    id: 'prism:Survival',
    launcher: 'prism',
    displayName: 'Survival',
    mcVersion: '26.3',
    loader: { kind: 'fabric', version: '0.20.1' },
    gameDir: '/prism/instances/Survival/minecraft',
    warnings: [],
    problems: [],
    installable: true,
  },
  {
    id: 'prism:Old',
    launcher: 'prism',
    displayName: 'Old world',
    mcVersion: '1.21.4',
    loader: null,
    gameDir: '/prism/instances/Old/minecraft',
    warnings: [],
    problems: [],
    installable: true,
  },
];

/** Opens a card through the store and renders the host; resolves to the outcome later. */
function openCard(input: InstanceOfferInput): Promise<InstanceOfferOutcome> {
  render(<OfferCardHost />);
  let outcome!: Promise<InstanceOfferOutcome>;
  act(() => {
    outcome = useInstancesStore.getState().offer(input);
  });
  return outcome;
}

beforeEach(() => {
  window.msmMoreOptionsOpen = false;
  globalThis.localStorage.clear();
});

afterEach(() => {
  act(() => useInstancesStore.getState().cancel());
  cleanup();
  connectInstances(null);
  window.msmMoreOptionsOpen = true;
});

describe('the offer card says what will be made (ADR 0133 D3)', () => {
  for (const targetId of TARGET_IDS) {
    for (const purpose of Object.keys(PURPOSES) as Purpose[]) {
      it(`${purpose} on ${targetId}: main's sentences in plain words`, async () => {
        fakePlatform();
        const { plan, request } = planFor(targetId, purpose);
        void openCard({ plan, request, locations: OWN });
        const card = await screen.findByTestId('instance-offer');
        expect(within(card).getByRole('heading').textContent).toBe(plan.title);
        const shown = [...screen.getByTestId('instance-offer-sentences').querySelectorAll('p')].map(
          (p) => p.textContent,
        );
        expect(shown).toEqual(plan.sentences.map(plainSentence));
        // The name of what is made and the Minecraft version are said, and that nothing else is touched.
        const text = shown.join(' ');
        expect(text).toContain(plan.recipe.place.name);
        expect(text).toContain(`Minecraft ${plan.recipe.mcVersion}`);
        expect(text).toMatch(/not touched\./);
        if (plan.recipe.channel === 'snapshot' && plan.recipe.place.kind === 'instance') {
          expect(text).toContain('is a snapshot');
        }
        // Instances offer "Use one of mine"; a server does not.
        expect(screen.queryByTestId('instance-offer-mine') === null).toBe(purpose === 'server');
        expect(screen.getByTestId('instance-offer-make').textContent).toBe(
          purpose === 'server' ? 'Make the server' : 'Make it and play',
        );
        expectPlain(screen.getByTestId('instance-offer-dialog'));
      });
    }
  }

  it('keeps file names, folders and ids under More options', async () => {
    fakePlatform();
    const { plan, request } = planFor('mc-26.3', 'test', {
      existing: { id: 'instance:/prism/instances/MCSuperMods Test (26.3)', name: 'x' },
    });
    void openCard({ plan, request });
    const dialog = await screen.findByTestId('instance-offer-dialog');
    expect(dialog.textContent).not.toContain('.jar');
    expect(dialog.textContent).not.toContain('instance:/');
    await userEvent.setup().click(screen.getByTestId('more-options-instance-offer'));
    const details = screen.getByTestId('instance-offer-details');
    expect(details.textContent).toContain('ruby_mod');
    expect(details.textContent).toMatch(/fabric-api-[^,]+\.jar/);
    expect(details.textContent).toContain('msm-test-ruby_mod');
    expect(details.textContent).toContain('instance:/prism/instances/MCSuperMods Test (26.3)');
    expect(details.textContent).toContain('Java');
  });

  it('says Fabric API and a server address in plainer words', () => {
    expect(plainSentence('with Minecraft 26.3, your mod and Fabric API.')).toBe(
      "with Minecraft 26.3, your mod and Fabric's mod library.",
    );
    expect(plainSentence('It joins the server at localhost:25565.')).toBe(
      'It joins the server at localhost, port 25565.',
    );
  });
});

describe("the offer card's choices", () => {
  it('makes it with the jars and the tick, shows progress, and resolves made', async () => {
    let release!: () => void;
    const platform = fakePlatform(
      () =>
        new Promise((resolve) => {
          release = () => resolve(MADE);
        }),
    );
    const jars = vi.fn(async () => [{ modId: 'ruby_mod', data: new Uint8Array([1]) }]);
    const { plan, request } = planFor('mc-26.3', 'test');
    const outcome = openCard({ plan, request, jars });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('instance-offer-remember'));
    await user.click(screen.getByTestId('instance-offer-make'));
    await waitFor(() => expect(platform.ensure).toHaveBeenCalledTimes(1));
    expect(platform.ensure).toHaveBeenCalledWith({
      ...request,
      jars: [{ modId: 'ruby_mod', data: new Uint8Array([1]) }],
      remember: true,
    });
    expect(screen.getByTestId('instance-offer').getAttribute('data-phase')).toBe('making');
    expect(screen.getByRole('status').textContent).toBe('Making MCSuperMods Test (26.3)…');
    expect((screen.getByTestId('instance-offer-cancel') as HTMLButtonElement).disabled).toBe(true);
    // Escape does not close it while making.
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('instance-offer')).toBeTruthy();
    release();
    expect(await outcome).toEqual({ kind: 'made', made: MADE });
    await waitFor(() => expect(screen.queryByTestId('instance-offer')).toBeNull());
  });

  it("shows a failure in main's words and tries again from the focused button", async () => {
    const platform = fakePlatform(async () => ({
      ok: false,
      code: 'no-launcher',
      message: 'Prism Launcher was not found. Install it and start it once, then try again.',
    }));
    const { plan, request } = planFor('mc-26.4', 'plain');
    void openCard({ plan, request });
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('instance-offer-make'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Prism Launcher was not found');
    const again = screen.getByTestId('instance-offer-make');
    expect(again.textContent).toBe('Try again');
    await waitFor(() => expect(document.activeElement).toBe(again));
    platform.ensure.mockResolvedValueOnce(MADE);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(platform.ensure).toHaveBeenCalledTimes(2));
    expect(platform.ensure.mock.calls[0]?.[0]).toEqual({ ...request, jars: [] });
  });

  it('cancels with the button and with Escape, making nothing', async () => {
    const platform = fakePlatform();
    const { plan, request } = planFor('mc-26.3', 'game');
    const first = openCard({ plan, request });
    await userEvent.setup().click(await screen.findByTestId('instance-offer-cancel'));
    expect(await first).toEqual({ kind: 'cancelled' });
    cleanup();
    const second = openCard({ plan, request });
    await screen.findByTestId('instance-offer');
    await userEvent.setup().keyboard('{Escape}');
    expect(await second).toEqual({ kind: 'cancelled' });
    expect(platform.ensure).not.toHaveBeenCalled();
  });

  it('works with the keyboard alone, through one of mine and back', async () => {
    fakePlatform();
    const { plan, request } = planFor('mc-26.3', 'test');
    const outcome = openCard({ plan, request, locations: OWN });
    const user = userEvent.setup();
    const make = await screen.findByTestId('instance-offer-make');
    // The make button has the focus when the card opens.
    await waitFor(() => expect(document.activeElement).toBe(make));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByTestId('instance-offer-mine'));
    await user.keyboard('{Enter}');
    const picker = await screen.findByTestId('instance-offer-picker');
    // Each of mine says how ready it is; one on another version cannot be chosen.
    expect(screen.getByTestId('instance-offer-own-0-readiness').textContent).toContain('Ready');
    expect(screen.getByTestId('instance-offer-own-1-readiness').textContent).toBe(
      'Made for Minecraft 1.21.4, not 26.3.',
    );
    const radios = within(picker).getAllByRole('radio') as HTMLInputElement[];
    expect(radios[1]?.disabled).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(radios[0]));
    expectPlain(screen.getByTestId('instance-offer-dialog'));
    // Back returns to the card with the focus on the button that opened the list.
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(screen.getByTestId('instance-offer-back'));
    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId('instance-offer-mine')),
    );
    await user.keyboard('{Enter}');
    await screen.findByTestId('instance-offer-picker');
    await user.tab();
    expect(document.activeElement).toBe(screen.getByTestId('instance-offer-use'));
    await user.keyboard('{Enter}');
    expect(await outcome).toEqual({ kind: 'mine', locationId: 'prism:Survival' });
  });

  it('prepare shows no card when the plan does not ask, and makes it straight away', async () => {
    const platform = fakePlatform();
    const { plan, request } = planFor('mc-26.3', 'test', { ask: false });
    expect(needsOffer(plan)).toBe(false);
    render(<OfferCardHost />);
    const outcome = await useInstancesStore.getState().prepare({ plan, request });
    expect(outcome).toEqual({ kind: 'made', made: MADE });
    expect(screen.queryByTestId('instance-offer')).toBeNull();
    expect(platform.ensure).toHaveBeenCalledWith({ ...request, jars: [] });
  });

  it('prepare shows the card when the plan asks', async () => {
    fakePlatform();
    const { plan, request } = planFor('mc-26.3', 'plain');
    expect(needsOffer(plan)).toBe(true);
    render(<OfferCardHost />);
    let outcome!: Promise<InstanceOfferOutcome>;
    act(() => {
      outcome = useInstancesStore.getState().prepare({ plan, request });
    });
    await userEvent.setup().click(await screen.findByTestId('instance-offer-cancel'));
    expect(await outcome).toEqual({ kind: 'cancelled' });
  });

  it('a second card cancels the first', async () => {
    fakePlatform();
    const a = planFor('mc-26.3', 'test');
    const b = planFor('mc-26.3', 'plain');
    const first = openCard(a);
    let second!: Promise<InstanceOfferOutcome>;
    act(() => {
      second = useInstancesStore.getState().offer(b);
    });
    expect(await first).toEqual({ kind: 'cancelled' });
    expect((await screen.findByTestId('instance-offer')).textContent).toContain(b.plan.title);
    act(() => useInstancesStore.getState().cancel());
    expect(await second).toEqual({ kind: 'cancelled' });
  });
});
