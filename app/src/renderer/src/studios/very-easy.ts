/**
 * The Studios in Very easy mode (ADR 0083 D3). A Studio entry declares the sections a beginner
 * needs (`StudioEntry.veryEasy`, the sections' test ids); `ElementForm` provides that list
 * through {@link VeryEasySectionsContext} while the mode is Very easy, and the shared `Section`
 * component hides every section not on it. A Studio without a list keeps Easy's layout. The
 * events editor (`msm-events`) and the triggers (`msm-triggers`) are never on a list: in Very
 * easy the Rules section takes their place (the subject's hand-made events still run).
 *
 * @packageDocumentation
 */

import { createContext, useContext } from 'react';
import { usePreferences } from '../store/preferences';

/** The section test ids a Studio shows in Very easy, or `null` outside it (every section). */
export const VeryEasySectionsContext = createContext<ReadonlySet<string> | null>(null);

/** Whether a section with this test id is shown (always, outside a Very easy list). */
export function sectionShown(sections: ReadonlySet<string> | null, testId?: string): boolean {
  return sections === null || testId === undefined || sections.has(testId);
}

/** Whether the section with `testId` is shown in the current Studio. */
export function useSectionShown(testId?: string): boolean {
  return sectionShown(useContext(VeryEasySectionsContext), testId);
}

/** Whether a Very easy section list is in force (the Studio then hides its Advanced toggle). */
export function useVeryEasyLayout(): boolean {
  return useContext(VeryEasySectionsContext) !== null;
}

/** Whether the view mode is Very easy (ADR 0083 D1). */
export function useVeryEasy(): boolean {
  return usePreferences((state) => state.mode === 'very-easy');
}

/** The Rules section's test id (`studios/rules/RulesSection.tsx`), on every list of a subject. */
export const RULES_SECTION_ID = 'rules-section';

/** The Block Studio's sections in Very easy: the look, how it breaks, light, drops, plants. */
export const BLOCK_VERY_EASY_SECTIONS: readonly string[] = [
  RULES_SECTION_ID,
  'block-type',
  'block-type-preview',
  'block-appearance',
  'block-textures',
  'block-mining',
  'block-light-sound',
  'block-drops',
  'block-crop',
  'block-sapling',
  'block-leaves',
  'block-portal',
  'block-inventory',
];

/** The Item Studio's sections in Very easy. */
export const ITEM_VERY_EASY_SECTIONS: readonly string[] = [
  RULES_SECTION_ID,
  'item-general',
  'item-food',
  'item-tool',
  'item-throwable',
];

/** The Effect Studio's sections in Very easy. */
export const EFFECT_VERY_EASY_SECTIONS: readonly string[] = [
  RULES_SECTION_ID,
  'effect-general',
  'effect-icon',
  'effect-preview',
  'effect-potion',
];

/** The Potion Studio's sections in Very easy. */
export const POTION_VERY_EASY_SECTIONS: readonly string[] = [
  'potion-preview',
  'potion-general',
  'potion-effects',
  'potion-brewing',
];

/** The Mob Studio's sections in Very easy. */
export const MOB_VERY_EASY_SECTIONS: readonly string[] = [
  RULES_SECTION_ID,
  'entity-identity',
  'entity-mob-kind',
  'entity-appearance',
  'entity-stats',
  'entity-movement',
  'entity-attack',
  'entity-taming',
  'entity-breeding',
  'entity-riding',
  'entity-boss-bar',
  'entity-spawning',
  'entity-spawn-egg',
];
