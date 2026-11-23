/**
 * The data live views topic (Live views 2, B617; ADR 0120): which data kinds show live in the
 * editor's Preview tab, the Creator's Live tab and the review's See it pane, by the app's own
 * labels, and the limits 2L1 to 2L12 in plain words. Only kinds, labels and limits: the helper
 * cannot see a view, so it never says what a roll or an answer came out as.
 *
 * The app's truth test (`app/test/ai-prompt-truth.live-views.test.ts`) pins the kinds both ways
 * against the live view registry (`liveviews/data/index.ts`) and every quoted label against the
 * components' source.
 */

/**
 * The data kinds that have a live view (the keys of `DATA_VIEWS` but the tags), with the words the
 * paragraph names each by: the truth test finds every kind of the registry here and each one's
 * words in the paragraph.
 */
export const LIVE_VIEW_PROMPT_KINDS = Object.freeze({
  'minecraft:loot_table': 'loot tables',
  'msm:loot_addition': 'extra drops',
  'minecraft:enchantment_provider': 'enchantment providers',
  'minecraft:trial_spawner': 'trial spawners',
  'minecraft:predicate': 'predicates',
  'minecraft:item_modifier': 'item modifiers',
  'minecraft:enchantment': 'enchantments',
  'minecraft:advancement': 'advancements',
  'minecraft:dialog': 'dialogs',
  'minecraft:damage_type': 'damage types',
  'minecraft:chat_type': 'chat types',
  'minecraft:function': 'functions',
  'minecraft:block_transformer': 'block transformers',
  'msm:vanilla_block_rules': 'vanilla block rules',
} as const);

/** The tag registries whose tags show "Everything in it" (`TAG_VIEW_REGISTRIES`). */
export const LIVE_VIEW_PROMPT_TAG_REGISTRIES = Object.freeze([
  'block',
  'item',
  'entity_type',
  'fluid',
  'game_event',
  'function',
  'damage_type',
  'enchantment',
  'painting_variant',
  'banner_pattern',
  'dialog',
  'instrument',
  'point_of_interest_type',
  'potion',
  'timeline',
  'worldgen/biome',
  'worldgen/feature',
  'worldgen/flat_level_generator_preset',
  'worldgen/structure',
  'worldgen/world_preset',
]);

/** Every label the two paragraphs quote, as the app shows it. */
export const LIVE_VIEW_PROMPT_LABELS = Object.freeze({
  preview: 'Preview',
  checked: 'As in the game, checked',
  aboutRight: 'About right',
  onlyInGame: 'Only in the game',
  rollIt: 'Roll it',
  seed: 'Seed',
  odds: 'The odds',
  situation: 'What happens to it?',
  without: 'Without your additions',
  with: 'With your additions',
  tryItOn: 'Try it on',
  yes: 'Yes',
  no: 'No',
  gameKnows: 'Only the game knows',
  before: 'Before',
  after: 'After',
  levels: 'Levels',
  does: 'What it does',
  tab: 'Advancement tab',
  everything: 'Everything in it',
  changed: 'What changed',
  runs: 'Runs in Try it',
  runInTryIt: 'Run in Try it',
  tryItHere: 'Try it here',
  live: 'Live',
  seeIt: 'See it',
  differs: 'Your roll in the game will differ; the odds are the same.',
});

const L = LIVE_VIEW_PROMPT_LABELS;
const K = LIVE_VIEW_PROMPT_KINDS;

export const LIVE_VIEWS = `- Live views of data: these show live in the "${L.preview}" tab, worked out by MSM from the project's files (and Minecraft's own, from the user's game) and redrawn after each edit, every part marked "${L.checked}", "${L.aboutRight}" or "${L.onlyInGame}": ${K['minecraft:loot_table']} "${L.rollIt}" at a "${L.seed}" and "${L.odds}", for a situation under "${L.situation}"; ${K['msm:loot_addition']} "${L.without}" and "${L.with}"; ${K['minecraft:enchantment_provider']} and ${K['minecraft:trial_spawner']} their rolls; ${K['minecraft:predicate']} and ${K['minecraft:item_modifier']} "${L.tryItOn}", answering "${L.yes}", "${L.no}" or "${L.gameKnows}" part by part, or the item "${L.before}" and "${L.after}"; ${K['minecraft:enchantment']} the tooltip, "${L.levels}" and "${L.does}"; ${K['minecraft:advancement']} the "${L.tab}" as a tree; ${K['minecraft:dialog']} the screen, whose buttons run nothing; ${K['minecraft:damage_type']} and ${K['minecraft:chat_type']} sample lines; every tag kind but the villager trade tag "${L.everything}" (also in the Tag Studio) with "${L.changed}" against vanilla; ${K['minecraft:function']} each line "${L.runs}" or "${L.onlyInGame}", and the Function editor's "${L.runInTryIt}" runs it in Try it; ${K['minecraft:block_transformer']} and ${K['msm:vanilla_block_rules']} the block before and after ("${L.tryItHere}"). The Creator's "${L.live}" tab and the review's "${L.seeIt}" pane show the same views for what a flow or your proposal makes, adding nothing. To check data, tell the user to look at its "${L.preview}" (your proposal: "${L.seeIt}"); you cannot see the views, so never say what they show.
- Limits of the data views: Play is the real check; one roll is MSM's own, the odds are checked ("${L.differs}"); loot parts MSM cannot work out are named, never left out; vanilla tables, tags and parents need the Minecraft folder set up; a situation is a sample, so parts about structures, light, nearby mobs or scores answer "${L.gameKnows}"; the advancement layout is about right and criteria never tick; functions run as far as Try it understands them, and its selectors see one player and its mobs; enchantment effects are described, not played; vanilla blocks in Try it are props; other people's plugin kinds have no live view.`;
