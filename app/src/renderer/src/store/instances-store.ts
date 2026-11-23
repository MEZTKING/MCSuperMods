/**
 * The offer card's state (ADR 0133 D3, B764): which card is open, what it is doing and how it
 * ends. A caller (Play, Test in Minecraft, a modpack test: B765 onward) asks `instances.plan`,
 * then hands the plan to {@link useInstancesStore}'s `offer` (always the card) or `prepare`
 * (the card only when the plan says to ask). Both resolve once the user has chosen:
 * the instance made, one of the user's own instances, or cancelled. The card itself
 * (`components/instances/OfferCard.tsx`, `OfferCardHost`) reads this store; nothing is written
 * before the user presses the make button, and then only by main (`instances.ensure`).
 *
 * @packageDocumentation
 */

import { create } from 'zustand';
import type {
  InstanceEnsureResult,
  InstanceFailure,
  InstanceJar,
  InstancePlan,
  InstancePlanRequest,
  InstancesPlatform,
} from '../../../shared/platform';
import type { InstallTargetOption } from '../components/install-target';
import { INSTANCE_WORDS } from '../components/instances/words';

/** What `instances.ensure` answered when it made or updated the instance. */
export type InstanceMade = Extract<InstanceEnsureResult, { ok: true }>;

/** What a caller hands the card. */
export interface InstanceOfferInput {
  /** `instances.plan`'s answer for the request. */
  plan: InstancePlan;
  /** The request the plan was made for (`ensure` takes it again with the jars). */
  request: InstancePlanRequest;
  /** Builds the content jars, only once the user chose to make it; none by default. */
  jars?: () => Promise<InstanceJar[]>;
  /** The user's own instances for "Use one of mine instead…"; the choice is hidden without them. */
  locations?: readonly InstallTargetOption[];
  /** The make button's words, when the caller's action is not "play" (a modpack test). */
  makeLabel?: string;
}

/** How a card ended. */
export type InstanceOfferOutcome =
  /** The instance was made or brought up to date. */
  | { kind: 'made'; made: InstanceMade }
  /** The user chose one of their own instances (a {@link InstallTargetOption} id). */
  | { kind: 'mine'; locationId: string }
  /** The user closed the card. */
  | { kind: 'cancelled' }
  /** Making it failed without a card to say so ({@link InstancesState.prepare} only). */
  | { kind: 'failed'; failure: InstanceFailure };

/** What the open card shows. */
export type OfferPhase = 'asking' | 'picking' | 'making' | 'failed';

/** The open card. */
export interface ActiveOffer {
  input: InstanceOfferInput;
  phase: OfferPhase;
  /** "Do this by itself next time" is ticked. */
  remember: boolean;
  /** The progress line while making, or `null`. */
  step: string | null;
  /** Why making failed, in main's words, or `null`. */
  error: string | null;
}

/** The store's shape. */
export interface InstancesState {
  /** The service; `window.msm.instances` unless {@link connectInstances} gave another. */
  platform: InstancesPlatform | null;
  /** The open card, or `null`. */
  card: ActiveOffer | null;
  /**
   * Shows the card for `input` and resolves with the user's choice. A card already open is
   * cancelled first.
   */
  offer(input: InstanceOfferInput): Promise<InstanceOfferOutcome>;
  /**
   * The card when the plan asks for it (`plan.ask`); otherwise makes or updates the instance
   * straight away, with no card.
   */
  prepare(input: InstanceOfferInput): Promise<InstanceOfferOutcome>;
  setRemember(remember: boolean): void;
  /** Makes the instance (the card's make button, or Try again). */
  make(): Promise<void>;
  /** Opens the list of the user's own instances. */
  pick(): void;
  /** Back from the list to the card. */
  back(): void;
  /** Ends the card with one of the user's own instances. */
  useMine(locationId: string): void;
  /** Ends the card without making anything (not while making). */
  cancel(): void;
}

/** The pending card's resolver (kept outside the state, which stays plain data). */
let settle: ((outcome: InstanceOfferOutcome) => void) | null = null;

function finish(outcome: InstanceOfferOutcome): void {
  const done = settle;
  settle = null;
  useInstancesStore.setState({ card: null });
  done?.(outcome);
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const bridgeInstances = (): InstancesPlatform | null =>
  (globalThis as { msm?: { instances?: InstancesPlatform } }).msm?.instances ?? null;

const NO_SERVICE: InstanceFailure = {
  ok: false,
  code: 'failed',
  message: 'MCSuperMods cannot make instances here.',
};

/** Runs `instances.ensure` for `input`, building the jars first; reports each step. */
async function ensureFor(
  input: InstanceOfferInput,
  remember: boolean,
  onStep: (step: string) => void,
): Promise<InstanceEnsureResult> {
  const platform = useInstancesStore.getState().platform ?? bridgeInstances();
  if (platform === null) return NO_SERVICE;
  try {
    let jars: InstanceJar[] = [];
    if (input.jars !== undefined) {
      onStep(INSTANCE_WORDS.building);
      jars = await input.jars();
    }
    const name = input.plan.existing?.name ?? input.plan.recipe.place.name;
    onStep(
      input.plan.existing === null ? INSTANCE_WORDS.making(name) : INSTANCE_WORDS.updating(name),
    );
    return await platform.ensure({ ...input.request, jars, ...(remember ? { remember } : {}) });
  } catch (error) {
    return { ok: false, code: 'failed', message: messageOf(error) };
  }
}

export const useInstancesStore = create<InstancesState>()((set, get) => ({
  platform: null,
  card: null,

  offer(input) {
    if (settle !== null) finish({ kind: 'cancelled' });
    return new Promise<InstanceOfferOutcome>((resolve) => {
      settle = resolve;
      set({ card: { input, phase: 'asking', remember: false, step: null, error: null } });
    });
  },

  async prepare(input) {
    if (input.plan.ask) return get().offer(input);
    const result = await ensureFor(input, false, () => {});
    return result.ok ? { kind: 'made', made: result } : { kind: 'failed', failure: result };
  },

  setRemember(remember) {
    const offer = get().card;
    if (offer === null || offer.phase === 'making') return;
    set({ card: { ...offer, remember } });
  },

  async make() {
    const offer = get().card;
    if (offer === null || offer.phase === 'making') return;
    set({ card: { ...offer, phase: 'making', step: null, error: null } });
    const result = await ensureFor(offer.input, offer.remember, (step) => {
      const now = get().card;
      if (now !== null) set({ card: { ...now, step } });
    });
    const now = get().card;
    if (now === null || now.input !== offer.input) return;
    if (result.ok) {
      finish({ kind: 'made', made: result });
      return;
    }
    set({ card: { ...now, phase: 'failed', step: null, error: result.message } });
  },

  pick() {
    const offer = get().card;
    if (offer === null || offer.phase === 'making') return;
    set({ card: { ...offer, phase: 'picking', error: null } });
  },

  back() {
    const offer = get().card;
    if (offer === null || offer.phase !== 'picking') return;
    set({ card: { ...offer, phase: 'asking' } });
  },

  useMine(locationId) {
    const offer = get().card;
    if (offer === null || offer.phase === 'making') return;
    finish({ kind: 'mine', locationId });
  },

  cancel() {
    const offer = get().card;
    if (offer === null || offer.phase === 'making') return;
    finish({ kind: 'cancelled' });
  },
}));

/** Uses `platform` for the card's `ensure` (tests, or a host without the preload's). */
export function connectInstances(platform: InstancesPlatform | null): void {
  useInstancesStore.setState({ platform });
}

/** Whether `plan` shows the card before anything is made (D3: `ask`, and nothing there yet). */
export function needsOffer(plan: InstancePlan): boolean {
  return plan.ask && plan.existing === null;
}
