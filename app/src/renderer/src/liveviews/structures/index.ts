/**
 * Batch 4's views (ADR 0122, Live views 4: assembled structures): one entry per kind, each lazily
 * importing a stub file of this folder that says "not yet" inside the frame until its brief builds
 * it: B640 the assembly (template pool and jigsaw structure), B641 processors. A brief edits its
 * own files only; this index is B635's and is not touched again. A kind is in one index only (a
 * test checks).
 */

import type { LiveViewLoader } from '../registry';

const templatePool: LiveViewLoader = () => import('./TemplatePoolView');
const structure: LiveViewLoader = () => import('./JigsawStructureView');
const processorList: LiveViewLoader = () => import('./ProcessorListView');

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
