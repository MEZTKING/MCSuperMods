/**
 * One element's live view over a project or a bundle (ADR 0120 D2): the registry's view for the
 * element's kind, loaded when first shown. The preview panel, the Creator's Live tab and the AI
 * review's See it pane all draw this, each over its own project (the Creator and the AI review
 * over `bundlePreviewProject`). Looking applies nothing. B608 builds the real wiring; this is the
 * stub's: the preferences come from the app's view preferences by project root.
 */

import type { Element, Project } from '@msm/plugin-api';
import { Suspense } from 'react';
import type { VanillaAssetReader } from '../preview/model-chain';
import { liveViewComponent } from './registry';
import { prefsOf, useLiveViewPrefs } from './view-prefs';

/** Props of {@link BundleLiveView}. */
export interface BundleLiveViewProps {
  readonly project: Project;
  readonly element: Element;
  readonly vanilla: VanillaAssetReader | null;
  /** The project's folder (choices are kept per project), or `null` for a bundle with none. */
  readonly projectRoot?: string | null;
  /** Opens the Minecraft folder settings. */
  onSetup(): void;
}

/** The element's view, or a plain line when its kind has none. */
export default function BundleLiveView(props: BundleLiveViewProps) {
  const { project, element, vanilla, onSetup } = props;
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
        preferences={prefsOf(prefs, root)}
        onPreferences={(patch) => {
          if (root !== null) setPrefs(root, patch);
        }}
        onSetup={onSetup}
      />
    </Suspense>
  );
}
