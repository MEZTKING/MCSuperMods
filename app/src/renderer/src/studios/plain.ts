/**
 * The Studios in one mode (ADR 0130 D2, D3; before it ADR 0083 D3's Very easy). A Studio entry
 * names the sections most people need (`StudioEntry.common`, the sections' test ids);
 * `ElementForm` provides that list through {@link CommonSectionsContext}, and the shared
 * `Section` shows a section on it in the main area with its More options at the bottom, and a
 * section not on it as its title, its one-line why and a More options holding all of it. A
 * Studio without a list shows every section in the main area (`docs/ONE-MODE-AUDIT.md` lists
 * them). The events editor (`msm-events`) and the triggers (`msm-triggers`) are never on a list:
 * the Rules section stands first in their place (the subject's hand-made events still run).
 *
 * The view is plain everywhere ({@link usePlain}) but inside an open More options.
 *
 * @packageDocumentation
 */

import { createContext, useContext } from 'react';

export { PlainContext, usePlain } from '../components/ui/MoreOptions';

/** The section test ids of the Studio's main area, or `null` (every section there). */
export const CommonSectionsContext = createContext<ReadonlySet<string> | null>(null);

/** Whether a section with this test id is in the main area (always, without a list). */
export function commonSection(sections: ReadonlySet<string> | null, testId?: string): boolean {
  return sections === null || testId === undefined || sections.has(testId);
}

/** Whether the section with `testId` is in the main area of the current Studio. */
export function useCommonSection(testId?: string): boolean {
  return commonSection(useContext(CommonSectionsContext), testId);
}

/** Whether the current Studio splits its sections into the main area and More options. */
export function useCommonLayout(): boolean {
  return useContext(CommonSectionsContext) !== null;
}

/** The Rules section's test id (`studios/rules/RulesSection.tsx`), on every list of a subject. */
export const RULES_SECTION_ID = 'rules-section';

/** The Block Studio's sections in main area: the look, how it breaks, light, drops, plants. */
export const BLOCK_COMMON_SECTIONS: readonly string[] = [
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
  // B452 (ADR 0101 D1, D4): the new types' own sections and "Ages like copper".
  'block-cake',
  'block-berry-bush',
  'block-tall-plant',
  'block-potted-plant',
  'block-vine',
  'block-stem',
  'block-cocoa',
  'block-weathering',
  // B516 (ADR 0112 D1): the growing plants, the flower pot and How it sounds.
  'block-growing-plant',
  'block-column-plant',
  'block-multiface',
  'block-dripleaf',
  'block-flower-pot',
  'block-sounds',
];

/** The Item Studio's sections in the main area. */
export const ITEM_COMMON_SECTIONS: readonly string[] = [
  RULES_SECTION_ID,
  'item-general',
  'item-food',
  'item-tool',
  'item-throwable',
  'item-inventory',
  // B538 (ADR 0112 D1): boats.
  'item-boat',
  // ADR 0117 Y16: Can break and Can place on, for adventure maps.
  'item-adventure',
];

/** The Effect Studio's sections in the main area. */
export const EFFECT_COMMON_SECTIONS: readonly string[] = [
  RULES_SECTION_ID,
  'effect-general',
  'effect-icon',
  'effect-preview',
  'effect-potion',
];

/** The Potion Studio's sections in the main area. */
export const POTION_COMMON_SECTIONS: readonly string[] = [
  'potion-preview',
  'potion-general',
  'potion-effects',
  'potion-brewing',
];

/** The Mob Studio's sections in the main area. */
export const MOB_COMMON_SECTIONS: readonly string[] = [
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
  // B485 (ADR 0101 D4): batch 2's sections, in plain words (trade sets by name, not id).
  'entity-storage',
  'entity-shoulder',
  'entity-trader',
  // B538 (ADR 0112 D1): fish buckets and the habits.
  'entity-bucket',
  'entity-habits',
  'entity-boss-bar',
  'entity-spawning',
  'entity-spawn-egg',
];

/** The Profession Studio's sections in the main area (ADR 0112 D1): the job, its pictures and trades. */
export const PROFESSION_COMMON_SECTIONS: readonly string[] = [
  'profession-job',
  'profession-pictures',
  'profession-trades',
];

/** The Villager look Studio's sections in the main area (ADR 0107 D5, ADR 0112 D1). */
export const VILLAGER_TYPE_COMMON_SECTIONS: readonly string[] = [
  'villager-type-biomes',
  'villager-type-pictures',
];

/** The Fluid Studio's sections in the main area (ADR 0112 D1). */
export const FLUID_COMMON_SECTIONS: readonly string[] = [
  'fluid-preview',
  'fluid-liquid',
  'fluid-flow',
  'fluid-pictures',
  'fluid-mixing',
  'fluid-cauldron-bottle',
];

/**
 * The Command Studio's sections in the main area: everything but the events editor, whose place the
 * Rules section takes (its ids stay in More options).
 */
export const COMMAND_COMMON_SECTIONS: readonly string[] = [
  RULES_SECTION_ID,
  'command-preview',
  'command-name-section',
  'command-arguments',
  'command-permission-section',
  'command-runs-section',
  'command-feedback-section',
];

/** The Game rule Studio's sections in the main area (ADR 0111 D5, ADR 0112 D1). */
export const GAME_RULE_COMMON_SECTIONS: readonly string[] = ['game-rule-general'];

/** The Statistic Studio's sections in the main area (ADR 0111 D6, ADR 0112 D1). */
export const STAT_COMMON_SECTIONS: readonly string[] = ['stat-general'];

/**
 * The games Studios' sections in the main area (ADR 0117 D1, D3; B555): every section of each, in
 * plain words; the pickers show names, never ids, and the chat commands and "Place it while the
 * world generates" stay out.
 */
export const WORLD_SETUP_COMMON_SECTIONS: readonly string[] = [
  'world-setup-map',
  'world-setup-world',
  'world-setup-start',
  'world-setup-players',
  'world-setup-rules',
  'world-setup-new-player',
];

/** The One Block Studio's sections in the main area (ADR 0117 D1). */
export const ONE_BLOCK_COMMON_SECTIONS: readonly string[] = [
  'one-block-live',
  'one-block-place',
  'one-block-phases',
];

/** The Team Studio's sections in the main area (ADR 0117 D1). */
export const TEAM_COMMON_SECTIONS: readonly string[] = [
  'team-live',
  'team-general',
  'team-options',
];

/** The Objective Studio's sections in the main area (ADR 0117 D1). */
export const OBJECTIVE_COMMON_SECTIONS: readonly string[] = [
  'objective-live',
  'objective-general',
  'objective-numbers',
];

/** The Timer Studio's sections in the main area (ADR 0117 D1). */
export const TIMER_COMMON_SECTIONS: readonly string[] = [
  'timer-live',
  'timer-general',
  'timer-when',
];

/** The Area Studio's sections in the main area (ADR 0117 D1). */
export const AREA_COMMON_SECTIONS: readonly string[] = ['area-live', 'area-general', 'area-reset'];

/**
 * The picks of "Make a block", "Make an item" (ADR 0101 D4) and "Make a world" (ADR 0119 D11). They live with the
 * Home tiles they feed (`components/home/tiles.ts`, which must stay free of React for the Node
 * build) and are re-exported here.
 */
export {
  MAKE_BLOCK_PICKS,
  MAKE_ITEM_PICKS,
  MAKE_WORLD_PICKS,
  pickFlowIds,
  type VeryEasyPick,
  veryEasyPickOf,
} from '../components/home/tiles';
