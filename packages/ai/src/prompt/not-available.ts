/**
 * Every "not available" claim of the prompt (ADR 0125 D7, B682). The paragraphs write these
 * sentences only through {@link notAvailable}, so a scan of the rendered prompt finds no "not
 * available" outside this list (`test/system-prompt.test.ts`), and the app's truth test (B683)
 * gives each entry a probe that fails once the thing exists: a claim cannot outlive the feature
 * it denies, as "Boats ... are not available" did beside `msm:boat` (F8 a).
 *
 * `things` names each missing thing on its own, for the probes; `sentence` is the text the
 * prompt carries.
 */

/** One claim that something cannot be made. */
export interface PromptAbsence {
  /** Stable id of the claim. */
  readonly id: string;
  /** The missing things, one per entry, as the sentence names them. */
  readonly things: readonly string[];
  /** The sentence in the prompt. */
  readonly sentence: string;
}

const absence = (id: string, things: readonly string[], sentence: string): PromptAbsence =>
  Object.freeze({ id, things: Object.freeze([...things]), sentence });

/** The claims, in the prompt's order. */
export const PROMPT_NOT_AVAILABLE: readonly PromptAbsence[] = Object.freeze([
  absence(
    'thrown-extras',
    [
      'a trident-like 3D model in flight',
      'a real return flight',
      'custom arrows',
      'instant effects',
    ],
    'A trident-like 3D model in flight, a real return flight, custom arrows and instant effects are not available: propose the closest version and call note_missing_feature.',
  ),
  absence(
    'wolf-sound-variants',
    ['wolf sound variants'],
    'Wolf sound variants are not available yet.',
  ),
  absence(
    'script-damage-amount',
    ['changing a damage amount from a script'],
    'Changing a damage amount from a script is not available (entity.hurt can only cancel the damage): propose the closest version and call note_missing_feature.',
  ),
  absence(
    'shelves',
    ['shelves'],
    'Shelves are not available: propose the closest version and call note_missing_feature.',
  ),
  absence(
    'container-screens',
    ['custom screens', 'custom slot layouts', 'slot filters'],
    'Custom screens, custom slot layouts and slot filters are not available.',
  ),
  absence(
    'machine-extras',
    [
      'brewing stands',
      'crafting grids',
      'custom GUIs',
      'more than three machine slots',
      'fluid tanks',
      'energy',
    ],
    'Brewing stands, crafting grids, custom GUIs, more than three machine slots, fluid tanks and energy are not available: propose the closest version and call note_missing_feature.',
  ),
  absence(
    'mob-extras',
    [
      "vanilla's brain-driven behaviours (a warden's senses, a frog's tongue, a piglin's brain, sculk reactions)",
      'a held bow or crossbow and its pose',
      'baby or variant changes to the model rather than the texture',
      'a "geckolib" renderer on a target without GeckoLib',
      'Molang, easings and sound or particle keyframes in the built-in renderer',
      'two triggered animations in one tick in the built-in renderer',
      'pets that follow their owner while swimming',
    ],
    `Not available, so propose the closest version and call note_missing_feature: vanilla's brain-driven behaviours (a warden's senses, a frog's tongue, a piglin's brain, sculk reactions), a held bow or crossbow and its pose, baby or variant changes to the model rather than the texture, a "geckolib" renderer on a target without GeckoLib (use "auto"), Molang, easings and sound or particle keyframes in the built-in renderer, two triggered animations in one tick there, and pets that follow their owner while swimming.`,
  ),
  absence(
    'fluid-extras',
    [
      'potion-like mixtures in a cauldron',
      'tanks and pipes',
      'waterlogging by a project fluid',
      "a swim speed other than water's",
      'fire spread, lava particles or random ticks from a lava-like fluid',
    ],
    "Not available, so propose the closest version and call note_missing_feature: potion-like mixtures in a cauldron, tanks and pipes, waterlogging by it, a swim speed other than water's, and fire spread, lava particles or random ticks from a lava-like fluid.",
  ),
  absence(
    'sky-pictures',
    ["sky pictures of a dimension's own"],
    'Sky pictures of its own are not available: call note_missing_feature.',
  ),
]);

/** The sentence of a claim, for the paragraphs; an unknown id is a programming error. */
export function notAvailable(id: string): string {
  const entry = PROMPT_NOT_AVAILABLE.find((candidate) => candidate.id === id);
  if (entry === undefined) throw new Error(`No prompt absence "${id}".`);
  return entry.sentence;
}
