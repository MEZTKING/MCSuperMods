/**
 * **Walk in it** (ADR 0119 D8, D9; B587): from the world map or a worldgen Studio to Try it's
 * ground My world generation. The seed and place are the project's view (`view-store.ts`), which
 * the ground picker reads; the element is left (as the Try it button does), and Try it opens
 * with its ground picker on My world generation, on the world given (`dimension:<id>` or
 * `preset:<id>:<dimension>`, the keys of `tryit/grounds.ts` `generatedSources`). Leaving the
 * element also closes the preview panel's map, so the map and the ground never ask the shared
 * worker for two worlds at once.
 */

import type { Project } from '@msm/plugin-api';
import { useUiStore } from '../store/ui-store';
import { useTryItStore } from '../tryit/tryit-store';
import { useTerrainView } from './view-store';

/** The view store's key of the project (as the map and Try it key it). */
export function viewKeyOf(root: string | null, project: Pick<Project, 'name'>): string {
  return root ?? `unsaved:${project.name}`;
}

/** Opens Try it on My world generation over `sourceKey` (or the picker's own choice). */
export function walkIn(
  root: string | null,
  project: Pick<Project, 'name'>,
  sourceKey: string | null,
): void {
  useTerrainView.getState().viewFor(viewKeyOf(root, project));
  useUiStore.getState().select(null);
  useTryItStore.getState().walkIn(sourceKey);
}
