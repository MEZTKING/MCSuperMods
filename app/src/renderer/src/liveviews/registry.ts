/**
 * The registry of live views (ADR 0120 D2): an element kind to a lazily loaded view. The preview
 * panel, a Studio section, the Creator and the AI review all reach a view through it, so a view
 * is a function of its props and reads nothing from the session store (a test checks).
 *
 * Only the kind ids and the loaders are here; a view's code loads when the view is first shown, so
 * nothing of the views is in the first-paint bundle. Third-party kinds are not served (ADR 0120 D2).
 * Batch 3 and 4 add their own `data/`-like index and one spread below; no brief edits a view's
 * entry but its own.
 */

import type { Element, Project } from '@msm/plugin-api';
import { type ComponentType, type LazyExoticComponent, lazy } from 'react';
import type { VanillaSoundReader } from '../audio/vanilla-sounds';
import type { VanillaAssetReader } from '../preview/model-chain';
import { DATA_VIEWS } from './data';
import { EXISTING_VIEWS } from './existing';
import { LOOKS_VIEWS } from './looks';
import { STRUCTURES_VIEWS } from './structures';
import type { VanillaDataReader } from './vanilla-data';
import type { LiveViewPrefs } from './view-prefs';

/** What a view is given. Views read nothing else (no session store, no globals). */
export interface LiveViewProps {
  /** The project, or a bundle laid over it (`bundlePreviewProject`). */
  readonly project: Project;
  /** The element to show. */
  readonly element: Element;
  /**
   * Reads vanilla's data files by registry folder and id (`vanilla-data.ts`). Always given: without
   * the Minecraft folder set up every call answers `not_set_up`, and the view shows the set-up
   * banner only when it names a vanilla file.
   */
  readonly vanilla: VanillaDataReader;
  /**
   * Reads vanilla's pictures and models by jar path (item pictures in slots), or `null` when the
   * Minecraft folder is not set up.
   */
  readonly vanillaAssets: VanillaAssetReader | null;
  /**
   * Reads Minecraft's own sounds from the user's folder (ADR 0121), or `null` when it is not set
   * up. Absent where nothing plays; the Play buttons then stay off.
   */
  readonly sounds?: VanillaSoundReader | null;
  /**
   * Reads one of the project's files by its path in the project (`assets/<ns>/textures/...`),
   * or a bundle's first (`bundleAssetReader`), so the project's own pictures draw; `null` when it
   * is not there. Absent where nothing can be read (the views then draw no project pictures).
   */
  readonly readProject?: (path: string) => Promise<Uint8Array | null>;
  /** The view choices (seed, situation, sample item, sample text). */
  readonly preferences: LiveViewPrefs;
  /** Changes part of the view choices. */
  onPreferences(patch: Partial<LiveViewPrefs>): void;
  /** Opens the Minecraft folder settings. */
  onSetup(): void;
}

/** One entry: loads the module whose default export is the view. */
export type LiveViewLoader = () => Promise<{ default: ComponentType<LiveViewProps> }>;

/** Every live view by element kind id. */
export const LIVE_VIEWS: Readonly<Record<string, LiveViewLoader>> = Object.freeze({
  ...DATA_VIEWS,
  // B615: today's previews (mobs, vehicles, particles, liquids, effects, potions, merchants,
  // blocks and items, mob skins) wrapped as views, for the Creator and the AI helper.
  ...EXISTING_VIEWS,
  // B620: batch 3's looks and sounds (ADR 0121). A kind is in one index only (a test checks).
  ...LOOKS_VIEWS,
  // B635: batch 4's assembled structures (ADR 0122).
  ...STRUCTURES_VIEWS,
});

/** Whether a kind has a live view. */
export function hasLiveView(kind: string): boolean {
  return Object.hasOwn(LIVE_VIEWS, kind);
}

/** The kind ids that have a live view, in a stable order. */
export function liveViewKinds(): readonly string[] {
  return Object.keys(LIVE_VIEWS).sort();
}

const lazyViews = new Map<string, LazyExoticComponent<ComponentType<LiveViewProps>>>();

/** The lazy view of a kind (the same component each call, so React keeps its state), or `null`. */
export function liveViewComponent(
  kind: string,
): LazyExoticComponent<ComponentType<LiveViewProps>> | null {
  const loader = Object.hasOwn(LIVE_VIEWS, kind) ? LIVE_VIEWS[kind] : undefined;
  if (loader === undefined) return null;
  let view = lazyViews.get(kind);
  if (view === undefined) {
    view = lazy(loader);
    lazyViews.set(kind, view);
  }
  return view;
}
