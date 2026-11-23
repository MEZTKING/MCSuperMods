/**
 * The pure model of Home's gallery of everything that can be made (ADR 0129 D1): one card per
 * library starter available on the target, Creator flows under their Creator group (the groups
 * and headings of `CREATOR_GROUPS`, in that order) and the starters that are not flows under
 * **Whole mods and packs**, after the first group, **Featured**, which holds the Showcase's cards
 * (ADR 0118; the host renders it, so its one live clip and its stills stay as they are).
 *
 * Generated from the session's library, so a new flow or starter has a card by itself. Each card
 * names the library example that shows it, when there is one (`flow-examples.ts`), for its
 * picture and **See the example**; else its picture is the flow's own bundle drawn with its
 * default answers. Words only: titles and sentences come from the library in plain British
 * English, never an id (Very easy shows no ids, ADR 0083 D3).
 *
 * @packageDocumentation
 */

import type {
  CreatorGroup,
  ExampleProject,
  Json,
  ProjectStarter,
  TargetFacts,
} from '@msm/plugin-api';
import { forbiddenIn } from '../../ai/ai-words';
import { CREATOR_GROUPS } from '../../creator/creator-model';
import type { MakeTileAction } from '../tiles';

/** The id of the Featured group (the Showcase's cards). */
export const FEATURED_GROUP = 'featured';
/** The id of the group of starters that are not Creator flows. */
export const STARTERS_GROUP = 'starters';

/** A gallery group id: Featured, a Creator group or the starters. */
export type GalleryGroupId = typeof FEATURED_GROUP | CreatorGroup | typeof STARTERS_GROUP;

/** The headings of the groups that are not Creator groups. */
export const FEATURED_TITLE = 'Featured';
export const STARTERS_TITLE = 'Whole mods and packs';

/** One card of the gallery (a flow or a starter). */
export interface GalleryCard {
  /** `flow-<starter id>` or `starter-<starter id>`; the card's test ids use it. */
  readonly id: string;
  /** The library starter it makes. */
  readonly starterId: string;
  /** Whether the starter is a Creator flow. */
  readonly flow: boolean;
  /** The card's words: the starter's title and one sentence. */
  readonly title: string;
  readonly sentence: string;
  readonly group: Exclude<GalleryGroupId, typeof FEATURED_GROUP>;
  /** The library example that shows it, when there is one (**See the example**, the picture). */
  readonly exampleId?: string;
  /** What **Make this** opens, as a Home tile would. */
  readonly action: MakeTileAction;
}

/** One group of cards, in display order. */
export interface GalleryGroup {
  readonly id: Exclude<GalleryGroupId, typeof FEATURED_GROUP>;
  readonly title: string;
  readonly cards: readonly GalleryCard[];
}

/** What the gallery is made from. */
export interface GalleryInput {
  /** The session library's starters (first id wins). */
  readonly starters: readonly ProjectStarter[];
  /** The session library's examples. */
  readonly examples: readonly ExampleProject[];
  readonly target: TargetFacts;
  /** The example that shows a starter, or `undefined` (`flow-examples.ts`'s lookup). */
  readonly exampleFor: (
    starterId: string,
    examples: readonly ExampleProject[],
  ) => string | undefined;
}

/**
 * Plain sentences for the starters that are not Creator flows, whose library descriptions name
 * files and tags (Very easy and Easy show no ids, ADR 0083 D3). A starter not listed here whose
 * first sentence names an id gets {@link PLAIN_STARTER_FALLBACK}.
 */
export const PLAIN_STARTER_SENTENCES: Readonly<Record<string, string>> = {
  blank: 'An empty mod to fill in yourself.',
  resource_pack: 'A small pack that changes how the stick looks and what it is called.',
  data_pack: 'A small pack with a welcome message and a new recipe.',
  combined: 'Both small packs in one: a new-looking stick, a message and a recipe.',
  'custom-sword': 'A new sword with its own name, colour, strength and recipe.',
  recipe_pack: 'Recipes of every sort: crafting, smelting, blasting and the stonecutter.',
  music_disc: 'A music disc of your own that plays in a jukebox.',
  function_starter: 'Commands that run when the world loads and on every tick.',
  custom_biome: 'A new biome, Amber Woods, with its own trees and ore, in a world type of its own.',
  jigsaw_structure: 'A small hamlet of huts and streets that appears in forests.',
  worldgen_pack: 'The Amber Woods biome and the forest hamlets together.',
  scripted_ore: 'A ruby ore with scripts: a bonus ruby, healing and a greeting.',
};

/** The sentence of a starter whose own words name an id. */
export const PLAIN_STARTER_FALLBACK = 'A ready-made start for a mod.';

/** The first sentence of a description (a starter's description may hold two). */
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  const end = trimmed.search(/[.!?](\s|$)/);
  return end === -1 ? trimmed : trimmed.slice(0, end + 1);
}

/** A card's sentence: the flow's blurb, else the starter's plain words. */
function sentenceOf(starter: ProjectStarter): string {
  if (starter.creator !== undefined) return firstSentence(starter.creator.blurb);
  const plain = PLAIN_STARTER_SENTENCES[starter.id];
  if (plain !== undefined) return plain;
  const own = firstSentence(starter.description);
  return forbiddenIn(own).length === 0 ? own : PLAIN_STARTER_FALLBACK;
}

/** Whether a starter can be used on the target. */
function supported(starter: ProjectStarter, target: TargetFacts): boolean {
  return starter.supports === undefined || starter.supports(target);
}

/** The card of one starter. */
export function galleryCard(
  starter: ProjectStarter,
  input: Pick<GalleryInput, 'examples' | 'exampleFor'>,
): GalleryCard {
  const flow = starter.creator !== undefined;
  const exampleId = input.exampleFor(starter.id, input.examples);
  return {
    id: `${flow ? 'flow' : 'starter'}-${starter.id}`,
    starterId: starter.id,
    flow,
    title: starter.title,
    sentence: sentenceOf(starter),
    group: starter.creator?.group ?? STARTERS_GROUP,
    ...(exampleId === undefined ? {} : { exampleId }),
    action: flow
      ? { type: 'flows', flowIds: [starter.id] }
      : { type: 'flows', flowIds: [], starterIds: [starter.id] },
  };
}

/**
 * The gallery's groups below Featured: every starter available on the target, first id wins,
 * in the Creator's group order and the library's order within a group; empty groups left out.
 */
export function galleryGroups(input: GalleryInput): GalleryGroup[] {
  const seen = new Set<string>();
  const cards: GalleryCard[] = [];
  for (const starter of input.starters) {
    if (seen.has(starter.id)) continue;
    seen.add(starter.id);
    if (!supported(starter, input.target)) continue;
    cards.push(galleryCard(starter, input));
  }
  const groups: GalleryGroup[] = [];
  for (const { group, title } of CREATOR_GROUPS) {
    const inGroup = cards.filter((card) => card.group === group);
    if (inGroup.length > 0) groups.push({ id: group, title, cards: inGroup });
  }
  const starters = cards.filter((card) => card.group === STARTERS_GROUP);
  if (starters.length > 0) {
    groups.push({ id: STARTERS_GROUP, title: STARTERS_TITLE, cards: starters });
  }
  return groups;
}

/** The starter's answers when nothing is chosen: each parameter's default. */
export function defaultValues(starter: ProjectStarter): Record<string, Json> {
  const values: Record<string, Json> = {};
  for (const parameter of starter.parameters ?? []) {
    values[parameter.id] = parameter.default as Json;
  }
  return values;
}

/**
 * A flow or starter as an example built with its default answers, for its drawn picture when no
 * library example shows it (the flow's drawn picture).
 */
export function starterAsExample(starter: ProjectStarter): ExampleProject {
  return {
    id: `gallery-starter:${starter.id}`,
    title: starter.title,
    description: starter.description,
    kind: 'msm:starter',
    category: 'starter',
    requiresKinds: starter.requiresKinds,
    build: (context) => starter.build({ ...context, values: defaultValues(starter) }),
  };
}

/** The name **Make this** offers for a new mod made from a card ("Gear Set Mod"). */
export function galleryModName(card: Pick<GalleryCard, 'title'>): string {
  const words = card.title
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 3)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  return words.length === 0 ? 'My Mod' : `${words.join(' ')} Mod`;
}
