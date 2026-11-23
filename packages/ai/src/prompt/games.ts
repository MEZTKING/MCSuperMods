/**
 * The games topic (game modes plan, B561; ADRs 0113 to 0117): the games kinds, the eight game
 * flows, Play my game, the map export, builds from the game, Try it's games grounds and the
 * plan's limits M1 to M16 in plain words. The Rules 3 catalogue ids are in the Rules topic
 * (`rules.ts`), the flows' parameters in `PROMPT_FLOWS` (`facts.ts`) and the kinds in
 * `PROMPT_KINDS`, so the main truth test checks them like any other.
 *
 * The app's truth test (`app/test/ai-prompt-truth.games.test.ts`) pins the kinds and flows both
 * ways against the games plugin and the library, the numbers against the plugin's limits, and
 * every quoted label against the components' source.
 */
import { TRY_IT_PROMPT_AREA } from './try-it';

/** The games plugin's kinds, in the plugin's order (`GAMES_KIND_IDS`). */
export const GAMES_PROMPT_KINDS = Object.freeze([
  'msm:world_setup',
  'msm:one_block',
  'msm:team',
  'msm:objective',
  'msm:timer',
  'msm:area',
]);

/** The game flows, in Home's order (`GAME_FLOW_IDS`, the Creator group `games`). */
export const GAMES_PROMPT_FLOWS = Object.freeze([
  'skyblock',
  'one-block',
  'sky-islands',
  'lucky-block',
  'adventure-map',
  'arena-game',
  'race',
  'goals',
]);

/** The one game flow that needs the Fabric mod jar (its starter has `supports`). */
export const GAMES_PROMPT_JAR_FLOWS = Object.freeze(['lucky-block']);

/** The numbers the paragraphs state, with the plugin's names for them. */
export const GAMES_PROMPT_NUMBERS = Object.freeze({
  /** `MAX_ONE_BLOCKS` (limit M6). */
  oneBlocks: 4,
  /** `MAX_TIMER_SECONDS`. */
  timerSeconds: 86_400,
  /** `START_AREA` of the start's lowering (limit M4). */
  startSide: 48,
});

/** Every label the paragraphs quote, as the app shows it. */
export const GAMES_PROMPT_LABELS = Object.freeze({
  games: 'Games',
  makeGame: 'Make a game',
  whileGenerating: 'Place it while the world generates',
  playGame: 'Play my game',
  startOver: 'Start over',
  seed: 'Seed',
  exportMap: 'Export as a Map…',
  keepPlayerData: 'Keep my player data',
  importStructure: 'Import Structure…',
  fromTestWorlds: 'From my test worlds',
  bringBuilds: 'Bring builds',
  containers: 'Chests and containers',
  emptySky: 'Empty sky',
  buildings: 'One of my buildings',
  rebuildNow: 'Rebuild now',
});

const L = GAMES_PROMPT_LABELS;
const N = GAMES_PROMPT_NUMBERS;
const A = TRY_IT_PROMPT_AREA;

export const GAMES = `- Games: the games kinds lower to plain data pack files and work in vanilla packs (fields: kind_schema). "msm:world_setup" (one per project) is how the world starts: world { type "vanilla", "void" (empty sky), "flat" (layers), "sky_islands" or "preset" (a project world preset), biome, nether and end "vanilla" or "void" } becomes a World Type in "#minecraft:normal"; start { structure (a project template, at most ${N.startSide} blocks a side), at, spawn (from at), when "first_join" (default: a function places it at the first join) or "world_generation" ("${L.whileGenerating}") }; game_mode, difficulty, game_rules (set once at the world's start), new_player { items or loot_table, message, dialog, effects } (once per player), goals (an advancement). "msm:one_block" (at most ${N.oneBlocks} a world): at, phases [{ name, breaks, blocks and mobs with weights, mob_chance, chest_chance, chest_loot }], loop, announce. "msm:team", "msm:objective" (criterion, display such as "sidebar", render), "msm:timer" (seconds 1 to ${N.timerSeconds}, count "down" or "up", show "boss_bar", "action_bar" or "none", on_end function, repeat, starts) and "msm:area" (a box from and to; reset structures rebuild it) are made when the world loads. Rules reach them by the catalogue's games ids (rule books still need the jar).
- Prefer the flows (group "${L.games}", Home's "${L.makeGame}"): "Skyblock" (skyblock: game_name, island "classic", "round", "tiny" or "own", chest, nether "vanilla" or "void", trades, recipes, goals, generator, generator_name and generator_makes: lava and water always make cobblestone, so its own generator is a project liquid, which needs the jar), "One block" (one-block: phases, breaks, world "void" or "vanilla"), "Sky islands" (sky-islands: islands "floating" or "end", biome, start_island), "Lucky block" (lucky-block: block_name, mob_kind, effect_kind; the only one that needs the Fabric mod jar), "Adventure map" (adventure-map: start_as, welcome "message", "dialog" or "none", game_rules, checkpoints), "Arena game" (arena-game: teams, size, minutes, win_score, kit), "Race" (race: checkpoints, count "up" or "down", limit, best) and "Goals" (goals: goals, icon).
- Playing games: the Play menu's "${L.playGame}" opens the game in a world of its own (its World Type, game mode and difficulty, commands on, its seed beside the chip as "${L.seed}"), and "${L.startOver}" keeps that world under a new name for a fresh one; File > "${L.exportMap}" saves a world as a map (without "${L.keepPlayerData}" every player starts fresh; the world's cheats and seed stay; a project that needs the jar becomes a .mrpack). Builds come from the game (no block editor): save with a structure block, then "${L.importStructure}" > "${L.fromTestWorlds}" ("${L.bringBuilds}"); the Structure Studio's "${L.containers}" sets a chest's loot table and items. Try it's grounds "${L.emptySky}" (the start island and kit) and "${L.buildings}" run the games' functions; "${L.rebuildNow}" rebuilds an area.
- Limits of games, to tell the user plainly: a vanilla pack's World Type shows only when the pack is added on the Create World screen (Play my game and maps do that); the start island appears just after the first join; areas are boxes, timers count whole seconds; teams and objectives stay in old worlds after a rename; the sidebar shows scores, not Rules counters; a map opened by hand asks about experimental settings; Try it is single player, ${A.x} by ${A.z}, and commands it cannot run are only in the game.`;
