/**
 * One element's live view over a project or a bundle (ADR 0120 D2): the registry's view for the
 * element's kind, loaded when first shown. The preview panel, the Creator's Live tab and the AI
 * review's See it pane all draw this, each over its own project (the Creator and the AI review
 * over `bundlePreviewProject`). Looking applies nothing. B608 builds the real wiring; this is the
 * stub's: the preferences come from the app's view preferences by project root.
 */

import type { Element, Project } from '@msm/plugin-api';
import { Suspense, useMemo } from 'react';
import type { VanillaAssetReader } from '../preview/model-chain';
import { liveViewComponent } from './registry';
import {
  createVanillaDataReader,
  NOT_SET_UP_VANILLA_DATA,
  type VanillaDataReader,
} from './vanilla-data';
import { prefsOf, useLiveViewPrefs } from './view-prefs';

/** Props of {@link BundleLiveView}. */
export interface BundleLiveViewProps {
  readonly project: Project;
  readonly element: Element;
  /**
   * Vanilla's pictures and models by jar path, or `null` when the Minecraft folder is not set up
   * (the app gives one only while the cache is ready).
   */
  readonly vanillaAssets?: VanillaAssetReader | null;
  /**
   * The project's Minecraft version: with {@link vanillaAssets} given, the view reads vanilla's
   * data files of this version by folder (`vanilla-data.ts`); otherwise every read answers "not
   * set up".
   */
  readonly mcVersion?: string | null;
  /** A reader to use instead of the one made from {@link mcVersion} (tests, a bundle's host). */
  readonly vanilla?: VanillaDataReader;
  /** The project's folder (choices are kept per project), or `null` for a bundle with none. */
  readonly projectRoot?: string | null;
  /** Opens the Minecraft folder settings. */
  onSetup(): void;
}

/** The element's view, or a plain line when its kind has none. */
export default function BundleLiveView(props: BundleLiveViewProps) {
  const { project, element, onSetup } = props;
  const vanillaAssets = props.vanillaAssets ?? null;
  const mcVersion = props.mcVersion ?? null;
  const cacheReady = vanillaAssets !== null;
  const made = useMemo(
    () =>
      cacheReady && mcVersion !== null
        ? createVanillaDataReader({ mcVersion })
        : NOT_SET_UP_VANILLA_DATA,
    [cacheReady, mcVersion],
  );
  const vanilla = props.vanilla ?? made;
  const root = props.projectRoot ?? null;
  const prefs = useLiveViewPrefs((state) => state.prefs);
  const setPrefs = useLiveViewPrefs((state) => state.setPrefs);
  const View = liveViewComponent(element.kind);
  if (View === null) {
    return (
      <p role="status" data-testid="live-view-none" className="text-sm text-muted">
        This kind has no live view yet.
      </p>
    );
  }
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading view…</p>}>
      <View
        project={project}
        element={element}
        vanilla={vanilla}
        vanillaAssets={vanillaAssets}
        preferences={prefsOf(prefs, root)}
        onPreferences={(patch) => {
          if (root !== null) setPrefs(root, patch);
        }}
        onSetup={onSetup}
      />
    </Suspense>
  );
}
