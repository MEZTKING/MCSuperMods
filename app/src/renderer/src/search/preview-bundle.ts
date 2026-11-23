/**
 * What the search's live preview builds in memory (ADR 0124 D9; B665): the bundle of a Creator
 * flow, a starter, an example or a template, with the answers the search understood, never
 * applied. A flow's answers are checked by the wizard's own rules (`checkAnswers`, as
 * {@link makeFlow} checks them: a bad one is dropped and the flow's default stands in), then the
 * flow is built and planned with the Creator's `planCreate` against the open mod (or an empty
 * one), so `CreatorPreview` draws it exactly as the Creator would.
 *
 * Also the small readings the preview pane needs: the names a bundle makes and the line
 * "Makes …" as Surprise me words it, the tab a picture opens on (and whether Very easy may show
 * it), a guide section's first paragraph, and a rule of the mod's rule books.
 *
 * Pure apart from the plugins' own `build` and `data`: no DOM, no session writes.
 *
 * @packageDocumentation
 */

import { createEmptyProject, type Json, type Project, type ResourceLocation } from '@msm/core';
import type {
  ContentBundle,
  ElementTemplate,
  ExampleProject,
  ProjectStarter,
  TargetFacts,
} from '@msm/plugin-api';
import type { SearchHit } from '@msm/search';
import { type CreatorPlan, creatorValues, planCreate } from '../changeset/creator-sets';
import { checkAnswers } from '../changeset/make-flow';
import { bundleRecipes, type CreatorTab, firstTab } from '../components/creator/creator-model';
import { headingAnchors } from '../components/GuideDialog';
import { parseMarkdown } from '../components/Markdown';
import { toValues } from '../components/wizard/wizard-model';
import { templateContext, templateElementId } from '../studios/templates';
import type { SearchPreviewDescriptor } from './sources/shared';

type JsonObject = { [key: string]: Json };

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** How long the selection must rest before the preview builds (ADR 0124 D9: 150 ms). */
export const PREVIEW_DEBOUNCE_MS = 150;

/** The namespace a preview builds in when no mod is open. */
export const PREVIEW_NAMESPACE = 'my_mod';

/** The preview descriptor of a hit. */
export function previewOf(hit: SearchHit): SearchPreviewDescriptor {
  return hit.entry.preview as unknown as SearchPreviewDescriptor;
}

/**
 * The key a preview is built for: the entry, its preview and the answers understood. A new key
 * restarts the wait, so the preview follows both a new selection and new words.
 */
export function previewKey(hit: SearchHit): string {
  return JSON.stringify([hit.entry.id, hit.entry.preview, hit.answers ?? null]);
}

/** Whether a descriptor is built into a bundle and drawn by `CreatorPreview`. */
export function isBuilt(
  descriptor: SearchPreviewDescriptor,
): descriptor is Extract<
  SearchPreviewDescriptor,
  { type: 'flow' | 'starter' | 'example' | 'template' }
> {
  return (
    descriptor.type === 'flow' ||
    descriptor.type === 'starter' ||
    descriptor.type === 'example' ||
    descriptor.type === 'template'
  );
}

// Building -----------------------------------------------------------------------------------

/** What building a preview needs of the app. */
export interface PreviewBuildHost {
  readonly target: TargetFacts;
  readonly library: {
    readonly starters: readonly ProjectStarter[];
    readonly templates: readonly ElementTemplate[];
    readonly examples: readonly ExampleProject[];
  };
  /** Whether a kind is registered (the session's registry). */
  readonly isKnownKind: (kind: string) => boolean;
  /** A kind's default data, for a template's context (`session.kindDefault`). */
  readonly kindDefault?: ((kind: string) => Json | undefined) | undefined;
  /** The open mod, or `null` with no mod (an empty one stands in). */
  readonly project: Project | null;
}

/** A preview built in memory. */
export interface BuiltPreview {
  readonly bundle: ContentBundle;
  /** The Creator's plan against the mod (Elements tab), or `null` when it cannot be planned. */
  readonly plan: CreatorPlan | null;
  /** The project the bundle is drawn over (the open mod, or an empty one). */
  readonly project: Project;
  /** The names it makes, in Surprise me's order. */
  readonly makes: readonly string[];
  /** Answers given but dropped by the wizard's check (a flow or starter). */
  readonly dropped: readonly string[];
}

/** The mod's first own namespace, else {@link PREVIEW_NAMESPACE}. */
export function previewNamespace(project: Project | null): string {
  return project?.namespaces.find((entry) => entry.name !== 'minecraft')?.name ?? PREVIEW_NAMESPACE;
}

/** An empty project with the preview's name (no mod is open). */
function emptyProject(): Project {
  return createEmptyProject('My mod');
}

/** The starting values of a flow or starter: its own defaults, the descriptor's, then the hit's. */
function starterValues(
  starter: ProjectStarter,
  given: Readonly<Record<string, Json>>,
): { values: Record<string, Json>; dropped: string[] } {
  const checked = checkAnswers(starter.parameters, given);
  return {
    values: toValues(starter.parameters, checked.raw) as Record<string, Json>,
    dropped: checked.dropped,
  };
}

/** A starter's or flow's id, title and whether the target has it, or an error that says why not. */
function usableStarter(host: PreviewBuildHost, id: string): ProjectStarter {
  const starter = host.library.starters.find((entry) => entry.id === id);
  if (starter === undefined) throw new Error('This is not in the library any more.');
  if (starter.supports !== undefined && !starter.supports(host.target)) {
    throw new Error(`Not available for Minecraft ${host.target.mcVersion}.`);
  }
  const missing = starter.requiresKinds.find((kind) => !host.isKnownKind(kind));
  if (missing !== undefined) throw new Error('A plugin it needs is not loaded.');
  return starter;
}

/**
 * Builds a flow, starter, example or template in memory with the hit's answers (each checked by
 * the wizard; the hit's answers win over the descriptor's starting values).
 *
 * @throws Error If the thing is not in the library, the target lacks it, or its build fails.
 */
export async function buildPreview(
  descriptor: Extract<
    SearchPreviewDescriptor,
    { type: 'flow' | 'starter' | 'example' | 'template' }
  >,
  answers: Readonly<Record<string, Json>> | undefined,
  host: PreviewBuildHost,
): Promise<BuiltPreview> {
  const project = host.project ?? emptyProject();
  const namespace = previewNamespace(host.project);
  const context = { namespace, projectName: project.name, target: host.target };
  let bundle: ContentBundle;
  let dropped: string[] = [];
  let flowId = '';
  let values: Record<string, Json> = {};
  switch (descriptor.type) {
    case 'flow':
    case 'starter': {
      const starter = usableStarter(host, descriptor.starter);
      const made = starterValues(starter, { ...(descriptor.values ?? {}), ...(answers ?? {}) });
      values = made.values;
      dropped = made.dropped;
      flowId = starter.id;
      bundle = await starter.build({ ...context, values });
      break;
    }
    case 'example': {
      const example = host.library.examples.find((entry) => entry.id === descriptor.example);
      if (example === undefined) throw new Error('This is not in the library any more.');
      if (example.supports !== undefined && !example.supports(host.target)) {
        throw new Error(`Not available for Minecraft ${host.target.mcVersion}.`);
      }
      bundle = await example.build({ ...context, values: {} });
      break;
    }
    case 'template': {
      const template = host.library.templates.find((entry) => entry.id === descriptor.template);
      if (template === undefined) throw new Error('This is not in the library any more.');
      const id = templateElementId(template, namespace, template.defaultName ?? 'example');
      const namespaces = project.namespaces.map((entry) => entry.name);
      const data = await template.data(
        templateContext(
          id,
          namespaces.length > 0 ? namespaces : [namespace],
          host.kindDefault?.(template.kind),
          host.target,
        ),
      );
      bundle = {
        elements: [{ id: id as ResourceLocation, kind: template.kind, data }],
        assets: [],
      };
      break;
    }
  }
  let plan: CreatorPlan | null = null;
  try {
    plan = planCreate(
      bundle,
      project,
      { flowId, setId: 'search-preview', values: creatorValues(values) },
      host.isKnownKind,
    );
  } catch {
    plan = null;
  }
  return { bundle, plan, project, makes: bundleNames(bundle), dropped };
}

// Names and words ----------------------------------------------------------------------------

/** The kinds whose names "Makes …" lists, in Surprise me's order (`surprise/surprise.ts`). */
const NAMED_KINDS = ['msm:block', 'msm:item', 'msm:entity', 'msm:effect', 'msm:potion'];

/** The language key prefixes of an id's name. */
const LANG_PREFIXES = ['item', 'block', 'entity', 'effect', 'item.minecraft.potion.effect'];

/** The shown name of a bundle element: its `display_name`, else its English name, else `null`. */
function nameIn(bundle: ContentBundle, id: string): string | null {
  const entry = bundle.elements.find((element) => element.id === id);
  if (entry !== undefined && isObject(entry.data) && typeof entry.data.display_name === 'string') {
    if (entry.data.display_name !== '') return entry.data.display_name;
  }
  const colon = id.indexOf(':');
  const key = `${id.slice(0, colon)}.${id.slice(colon + 1).replaceAll('/', '.')}`;
  for (const lang of bundle.elements) {
    if (lang.kind !== 'minecraft:lang' || !isObject(lang.data)) continue;
    for (const prefix of LANG_PREFIXES) {
      const name = lang.data[`${prefix}.${key}`];
      if (typeof name === 'string' && name !== '') return name;
    }
  }
  return null;
}

/** The shown names a bundle makes (blocks, items, mobs, effects, potions), as Surprise me lists them. */
export function bundleNames(bundle: ContentBundle): string[] {
  const names: string[] = [];
  for (const kind of NAMED_KINDS) {
    for (const entry of bundle.elements) {
      if (entry.kind !== kind) continue;
      const name = nameIn(bundle, entry.id);
      if (name !== null && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

const MAX_MAKES = 5;

/** "A, B and C", "A, B, C, D, E and 4 more" (Surprise me's `makesPhrase`). */
export function makesPhrase(names: readonly string[]): string {
  if (names.length === 0) return '';
  const shown = names.slice(0, MAX_MAKES);
  const rest = names.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`;
  if (shown.length === 1) return shown[0] as string;
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

/** The line "Makes …." under a built preview, or `null` when it names nothing. */
export function makesLine(names: readonly string[]): string | null {
  const phrase = makesPhrase(names);
  return phrase === '' ? null : `Makes ${phrase}.`;
}

/** The tabs Very easy may show: pictures only (Stats, Recipes and Elements show ids). */
export const VERY_EASY_TABS: ReadonlySet<CreatorTab> = new Set<CreatorTab>([
  'live',
  'items',
  'blocks',
  'armour',
  'card',
]);

/**
 * The tab a built preview opens on: the Creator's own first tab, or Recipes for a bundle whose
 * only picture is a recipe. In Very easy, `null` when that tab would show ids (the plain tile
 * then stays, with its "Makes …" line).
 */
export function previewTab(bundle: ContentBundle, veryEasy: boolean): CreatorTab | null {
  let tab = firstTab(bundle);
  if (tab === 'elements' && bundleRecipes(bundle).length > 0) tab = 'recipes';
  if (veryEasy && !VERY_EASY_TABS.has(tab)) return null;
  return tab;
}

// Guide and rules ----------------------------------------------------------------------------

/**
 * The first paragraph (or first list item) under the heading `anchor` of a guide page, before
 * the next heading; `null` when the heading is not there or opens with only a table or code.
 */
export function guideFirstParagraph(markdown: string, anchor: string): string | null {
  const blocks = parseMarkdown(markdown);
  const headings = blocks.flatMap((block) => (block.type === 'heading' ? [block.text] : []));
  const anchors = headingAnchors(headings);
  let headingIndex = -1;
  let inside = false;
  for (const block of blocks) {
    if (block.type === 'heading') {
      if (inside) return null;
      headingIndex += 1;
      const found = anchors[headingIndex];
      inside = found !== undefined && (found.anchor === anchor || found.alias === anchor);
      continue;
    }
    if (!inside) continue;
    if (block.type === 'paragraph' && block.text.trim() !== '') return block.text.trim();
    if (block.type === 'list' && (block.items[0] ?? '').trim() !== '') {
      return (block.items[0] as string).trim();
    }
  }
  return null;
}

/** Markdown inline marks taken out: links to their text, code, bold and italics. */
export function plainMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1$2')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Rule `index` of the rule book `book` in the mod, or `null`. */
export function ruleOf(project: Project | null, book: string, index: number): JsonObject | null {
  if (project === null) return null;
  for (const namespace of project.namespaces) {
    const element = namespace.elements.find((entry) => entry.id === book);
    if (element === undefined) continue;
    const rules = isObject(element.data) ? element.data.rules : undefined;
    if (!Array.isArray(rules)) return null;
    const rule = rules[index];
    return isObject(rule) ? rule : null;
  }
  return null;
}
