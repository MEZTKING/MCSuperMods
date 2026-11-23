/**
 * One live clip on all of Home (ADR 0118 D6's rule, ADR 0129 D5): Home's gallery holds three
 * places that can play a clip, Featured (the Showcase), the gallery's own cards and the **More
 * ideas** row, each choosing its own card by the Showcase's policy (`chooseLiveClip`). Each
 * reports what it wants to play here, and only the owner plays:
 *
 * - a card the user asked for (under the pointer, with keyboard focus, or its play button
 *   pressed) wins over a card that plays by itself (Featured's first card in view);
 * - between two such asks, the newer one wins (a card hovered after another was focused).
 *
 * The gallery makes one {@link HomeLive} and hands it down through {@link HomeLiveContext};
 * outside it (New project, the Examples gallery) a place always plays its own choice.
 *
 * @packageDocumentation
 */

import { createContext, useContext, useEffect, useId, useSyncExternalStore } from 'react';

/** What a place wants to play: a card id, and whether the user asked for it. */
export interface HomeLiveClaim {
  readonly id: string;
  /** `user`: hovered, focused or its play button pressed; `self`: by itself in view. */
  readonly by: 'user' | 'self';
}

/** A claim with when it was made (a counter, newer is larger). */
export interface DatedClaim extends HomeLiveClaim {
  readonly at: number;
}

/** The place that may play, from every place's claim: pure. */
export function homeLiveOwner(claims: ReadonlyMap<string, DatedClaim>): string | null {
  let best: [string, DatedClaim] | null = null;
  for (const entry of claims) {
    const [, claim] = entry;
    if (best === null) {
      best = entry;
      continue;
    }
    const [, held] = best;
    const rank = (one: DatedClaim): number => (one.by === 'user' ? 1 : 0);
    if (rank(claim) > rank(held) || (rank(claim) === rank(held) && claim.at > held.at)) {
      best = entry;
    }
  }
  return best === null ? null : best[0];
}

/** The shared choice of Home's places. */
export interface HomeLive {
  /** Says what `place` wants to play now (`null`: nothing). */
  report(place: string, claim: HomeLiveClaim | null): void;
  /** The place that may play, or `null`. */
  owner(): string | null;
  subscribe(listener: () => void): () => void;
}

/** A new shared choice. */
export function createHomeLive(): HomeLive {
  const claims = new Map<string, DatedClaim>();
  const listeners = new Set<() => void>();
  let counter = 0;
  let owner: string | null = null;
  return {
    report(place, claim) {
      const held = claims.get(place);
      if (claim === null) {
        if (held === undefined) return;
        claims.delete(place);
      } else {
        if (held !== undefined && held.id === claim.id && held.by === claim.by) return;
        counter += 1;
        claims.set(place, { ...claim, at: counter });
      }
      const next = homeLiveOwner(claims);
      if (next === owner) return;
      owner = next;
      for (const listener of [...listeners]) listener();
    },
    owner: () => owner,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Home's shared choice, for the places inside the gallery. */
export const HomeLiveContext = createContext<HomeLive | null>(null);

const noSubscribe = (): (() => void) => () => {};
const noOwner = (): null => null;

/**
 * Reports `claim` for this place (to `live`, else the nearest {@link HomeLiveContext}) and says
 * whether it may play it: always where there is no shared choice.
 */
export function useHomeLive(claim: HomeLiveClaim | null, live?: HomeLive | null): boolean {
  const place = useId();
  const fromContext = useContext(HomeLiveContext);
  const shared = live ?? fromContext;
  const owner = useSyncExternalStore(
    shared?.subscribe ?? noSubscribe,
    shared?.owner ?? noOwner,
    shared?.owner ?? noOwner,
  );
  const id = claim?.id ?? null;
  const by = claim?.by ?? null;
  useEffect(() => {
    if (shared === null) return;
    shared.report(place, id === null || by === null ? null : { id, by });
  }, [shared, place, id, by]);
  useEffect(() => {
    if (shared === null) return;
    return () => shared.report(place, null);
  }, [shared, place]);
  if (shared === null || claim === null) return true;
  // Until the report lands (one render), a place plays only when no one else owns the clip.
  return owner === null || owner === place;
}
