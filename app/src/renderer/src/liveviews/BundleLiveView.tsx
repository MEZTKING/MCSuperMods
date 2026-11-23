/**
 * One element's live view over a project or a bundle (ADR 0120 D2): the registry's view for the
 * element's kind, loaded when first shown. The preview panel, the Creator's Live tab and the AI
 * review's See it pane all draw this, each over its own project (the Creator and the AI review
 * over a project with the bundle or the proposal laid over it). Looking applies nothing.
 *
 * The view choices (seed, situation, sample item) are kept with the app's view preferences by
 * project root. Without a project root (a bundle with no open project) they are kept in memory
 * under one fixed key ({@link BUNDLE_PREFS_KEY}) for this run and never written (B608's note,
 * B615): looking writes nothing without a project folder.
 */

import type { Element, Project } from '@msm/plugin-api';
import { Suspense, useMemo, useState } from 'react';
import { createVanillaSoundReader, type VanillaSoundReader } from '../audio/vanilla-sounds';
import type { VanillaAssetReader } from '../preview/model-chain';
import { liveViewComponent } from './registry';
import {
  createVanillaDataReader,
  NOT_SET_UP_VANILLA_DATA,
  type VanillaDataReader,
} from './vanilla-data';
import { DEFAULT_PREFS, type LiveViewPrefs, prefsOf, useLiveViewPrefs } from './view-prefs';

/** The key the choices of a view without a project root are kept under, in memory only. */
export const BUNDLE_PREFS_KEY = '(bundle without a project folder)';

/** Choices made without a project root, for this run (never stored). */
let bundlePrefs: LiveViewPrefs = DEFAULT_PREFS;

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
  /**
   * Reads Minecraft's own sounds (ADR 0121 D2, D3); by default one made from {@link mcVersion}
   * over the preload bridge's `minecraft.readAssetObject` (`null` without a version).
   */
  readonly sounds?: VanillaSoundReader | null;
  /** The project's folder (choices are kept per project), or `null` for a bundle with none. */
  readonly projectRoot?: string | null;
  /**
   * Reads a project file by its path (`assets/<ns>/...`), the bundle's own first where there is
   * one, so the project's pictures draw.
   */
  readonly readProject?: (path: string) => Promise<Uint8Array | null>;
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
  const madeSounds = useMemo(() => {
    if (mcVersion === null) return null;
    // `window.msm` is read here, not through the session (B601's rule for `liveviews/`).
    const read = (window as Partial<Window>).msm?.minecraft.readAssetObject;
    return createVanillaSoundReader({ mcVersion, readAssetObject: read });
  }, [mcVersion]);
  const sounds = props.sounds === undefined ? madeSounds : props.sounds;
  const root = props.projectRoot ?? null;
  const prefs = useLiveViewPrefs((state) => state.prefs);
  const setPrefs = useLiveViewPrefs((state) => state.setPrefs);
  const [memory, setMemory] = useState<LiveViewPrefs>(bundlePrefs);
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
        sounds={sounds}
        {...(props.readProject === undefined ? {} : { readProject: props.readProject })}
        preferences={root === null ? memory : prefsOf(prefs, root)}
        onPreferences={(patch) => {
          if (root !== null) {
            setPrefs(root, patch);
            return;
          }
          bundlePrefs = { ...bundlePrefs, ...patch };
          setMemory(bundlePrefs);
        }}
        onSetup={onSetup}
      />
    </Suspense>
  );
}
