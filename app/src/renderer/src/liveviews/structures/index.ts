/**
 * Batch 4's views (ADR 0122, Live views 4: assembled structures): one entry per kind, each lazily
 * importing its view: B640's assembly (`assembly/AssemblyView.tsx`) for the template pool and the
 * jigsaw structure, and B641's processor view (`processors/ProcessorListView.tsx`). A kind is in one
 * index only (a test checks).
 */

import type { LiveViewLoader } from '../registry';

// B640: one view for both kinds; it picks the pool's or the structure's by the element's kind.
const templatePool: LiveViewLoader = () => import('./assembly/AssemblyView');
const structure: LiveViewLoader = () => import('./assembly/AssemblyView');
// B641: a building before and after the list, with a swipe line (`processors/`).
const processorList: LiveViewLoader = () => import('./processors/ProcessorListView');

/** The kinds of batch 4 whose view is in the preview panel (`previewKind: 'live_view'`). */
export const STRUCTURES_PANEL_KINDS: readonly string[] = Object.freeze([
  'minecraft:worldgen/template_pool',
  'minecraft:worldgen/structure',
  'minecraft:worldgen/processor_list',
]);

/** Batch 4's views by kind id. */
export const STRUCTURES_VIEWS: Readonly<Record<string, LiveViewLoader>> = Object.freeze({
  'minecraft:worldgen/template_pool': templatePool,
  'minecraft:worldgen/structure': structure,
  'minecraft:worldgen/processor_list': processorList,
});
