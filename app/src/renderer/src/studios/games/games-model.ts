/**
 * The pure parts of the games Studios (ADR 0117 D1, B555): the words a beginner sees for the
 * games kinds' values (the plan's "Very easy wording"), the names the lowering gives teams,
 * objectives, timers and areas (B552's `shared-functions.ts`, as B553 rebuilt them for Rules),
 * the one block's odds and a seeded run of breaks, an area's box, a timer's clock, an
 * objective's numbers, and the world setup's live map files (the world preset and sky biome it
 * lowers to, laid over the project in memory, as the Creator's Map tab lays a bundle over it).
 *
 * No React, no DOM: everything here runs in Node tests.
 *
 * @packageDocumentation
 */

import type { ContentBundle, Element, Json, OutputFile, Project } from '@msm/plugin-api';

/** A JSON object. */
export type JsonObject = { [key: string]: Json };

/** The games kinds (`@msm/plugin-games`, ADR 0113). */
export const WORLD_SETUP_KIND = 'msm:world_setup';
export const ONE_BLOCK_KIND = 'msm:one_block';
export const TEAM_KIND = 'msm:team';
export const OBJECTIVE_KIND = 'msm:objective';
export const TIMER_KIND = 'msm:timer';
export const AREA_KIND = 'msm:area';

/** Element kinds the Studios pick from. */
export const STRUCTURE_KIND = 'minecraft:structure_template';
export const LOOT_TABLE_KIND = 'minecraft:loot_table';
export const ADVANCEMENT_KIND = 'minecraft:advancement';
export const DIALOG_KIND = 'minecraft:dialog';
export const FUNCTION_KIND = 'minecraft:function';
export const WORLD_PRESET_KIND = 'minecraft:worldgen/world_preset';
export const BIOME_KIND = 'minecraft:worldgen/biome';
export const DIMENSION_KIND = 'minecraft:dimension';
export const GAME_RULE_KIND = 'msm:game_rule';
export const STAT_KIND = 'msm:stat';

export const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `value` as an object (an empty one for anything else). */
export function objectOf(value: Json | undefined): JsonObject {
  return isObject(value) ? value : {};
}

/** `value` as a list (an empty one for anything else). */
export function listOf(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

/** A text value, or `''`. */
export const textOf = (value: Json | undefined): string => (typeof value === 'string' ? value : '');

/** A block position `[x, y, z]`. */
export type Pos = [number, number, number];

/** `value` as a block position, or `fallback` when it is not three whole numbers. */
export function posOf(value: Json | undefined, fallback: Pos = [0, 0, 0]): Pos {
  if (!Array.isArray(value) || value.length !== 3) return [...fallback];
  const out = value.map((axis) => (typeof axis === 'number' ? Math.trunc(axis) : Number.NaN));
  return out.some((axis) => !Number.isFinite(axis)) ? [...fallback] : (out as Pos);
}

/** Where the start structure's corner goes when `at` is left out (ADR 0114 D2). */
export const DEFAULT_START_AT: Pos = [0, 64, 0];

// --- Words ---------------------------------------------------------------------------------

/** The world types (`WorldType`) in plain words (the plan's "Very easy wording"). */
export const WORLD_TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  void: 'Empty sky',
  sky_islands: 'Floating islands',
  flat: 'Flat',
  vanilla: 'As normal',
  preset: 'My own world type',
});

/** The world types in the order the Studio offers them. */
export const WORLD_TYPES: readonly string[] = Object.freeze([
  'void',
  'sky_islands',
  'flat',
  'vanilla',
  'preset',
]);

/** The Nether or the End of the game's world (`OtherDimension`). */
export const OTHER_DIMENSION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  vanilla: 'As normal',
  void: 'Empty',
});

/** The game modes (`GameMode`). */
export const GAME_MODE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  survival: 'Survival',
  creative: 'Creative',
  adventure: 'Adventure',
  spectator: 'Spectator',
});

/** The difficulties (`Difficulty`). */
export const DIFFICULTY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  peaceful: 'Peaceful',
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
});

/** When the start structure is placed (`StartWhen`). */
export const START_WHEN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  first_join: 'When the first player joins',
  world_generation: 'Place it while the world generates',
});

/** The team colours (`TeamColour`), in the game's order, then no colour. */
export const TEAM_COLOURS: readonly string[] = Object.freeze([
  'black',
  'dark_blue',
  'dark_green',
  'dark_aqua',
  'dark_red',
  'dark_purple',
  'gold',
  'gray',
  'dark_gray',
  'blue',
  'green',
  'aqua',
  'red',
  'light_purple',
  'yellow',
  'white',
  'reset',
]);

/** A team colour in words ("dark_aqua" to "Dark aqua"; `reset` is "No colour"). */
export function colourWords(colour: string): string {
  if (colour === 'reset') return 'No colour';
  const words = colour.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The team colours with their words. */
export const TEAM_COLOUR_LABELS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(TEAM_COLOURS.map((colour) => [colour, colourWords(colour)])),
);

/** Whose name tags a team's players see (`NameTagVisibility`). */
export const NAME_TAG_LABELS: Readonly<Record<string, string>> = Object.freeze({
  always: 'Everyone’s',
  never: 'Nobody’s',
  hideForOtherTeams: 'Only their own team’s',
  hideForOwnTeam: 'Only other teams’',
});

/** Whom a team's players push (`CollisionRule`). */
export const COLLISION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  always: 'Everyone',
  never: 'Nobody',
  pushOtherTeams: 'Only other teams',
  pushOwnTeam: 'Only their own team',
});

/** Where an objective is shown (`ObjectiveDisplay`) in words. */
export function displayWords(display: string): string {
  switch (display) {
    case 'none':
      return 'Nowhere';
    case 'sidebar':
      return 'Show in the sidebar';
    case 'list':
      return 'In the player list';
    case 'below_name':
      return 'Below players’ names';
    default:
      if (display.startsWith('sidebar.team.')) {
        const colour = display.slice('sidebar.team.'.length);
        return `In the sidebar, for the ${colourWords(colour).toLowerCase()} team`;
      }
      return display;
  }
}

/** How an objective's scores are drawn in the player list (`ObjectiveRender`). */
export const RENDER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  integer: 'As numbers',
  hearts: 'As hearts',
});

/** How an objective's numbers are written (`NumberFormatType`, plus none for plain numbers). */
export const NUMBER_FORMAT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  plain: 'Plain numbers',
  blank: 'No numbers',
  fixed: 'A text in place of the number',
  styled: 'Numbers in a colour',
});

/** Which way a timer counts (`TimerCount`). */
export const TIMER_COUNT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  down: 'Counts down',
  up: 'Counts up',
});

/** Where a timer is shown (`TimerShow`). */
export const TIMER_SHOW_LABELS: Readonly<Record<string, string>> = Object.freeze({
  boss_bar: 'Show on the boss bar',
  action_bar: 'Show above the hotbar',
  none: 'Not shown',
});

/** When a timer starts (`TimerStarts`). */
export const TIMER_STARTS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  manual: 'When a rule starts it',
  world_start: 'When the world first starts',
});

/** The vanilla dimensions in words; any other dimension by its id's last part. */
export const DIMENSION_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'minecraft:overworld': 'The Overworld',
  'minecraft:the_nether': 'The Nether',
  'minecraft:the_end': 'The End',
});

/** An id in words: its last path part, `_` as spaces, capitalised. */
export function idWords(id: string): string {
  const path = id.slice(id.indexOf(':') + 1);
  const last =
    path
      .split(/[/.]/)
      .filter((part) => part !== '')
      .pop() ?? path;
  const words = last.replaceAll('_', ' ').trim();
  return words === '' ? id : words.charAt(0).toUpperCase() + words.slice(1);
}

// --- Project lookups -----------------------------------------------------------------------

/** Every element of `kind` in the project. */
export function elementsOf(project: Project, kind: string): Element[] {
  const out: Element[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) if (element.kind === kind) out.push(element);
  }
  return out;
}

/** The element `id` of `kind`, if the project has it. */
export function findOf(project: Project, kind: string, id: string): Element | undefined {
  const wanted = id.includes(':') ? id : `minecraft:${id}`;
  for (const namespace of project.namespaces) {
    const found = namespace.elements.find((entry) => entry.kind === kind && entry.id === wanted);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The size of a project structure template, or `null` when the project has no such template. */
export function structureSize(project: Project, id: string): Pos | null {
  const element = findOf(project, STRUCTURE_KIND, id);
  if (element === undefined) return null;
  const size = objectOf(element.data).size;
  return Array.isArray(size) && size.length === 3 ? posOf(size) : null;
}

// --- Generated names (B552, B553) ----------------------------------------------------------

function splitId(id: string): { namespace: string; path: string } {
  const at = id.indexOf(':');
  return at < 0
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, at), path: id.slice(at + 1) };
}

/** The game's name of a team or objective element: `<ns>.<path>` with `/` as `.`. */
export function scoreboardName(id: string): string {
  const { namespace, path } = splitId(id);
  return `${namespace}.${path.replaceAll('/', '.')}`;
}

/** The function a games element's action runs: `<ns>:msm_games/<kind>/<path>/<action>`. */
export function gamesFunction(id: string, kind: 'timer' | 'area', action: string): string {
  const { namespace, path } = splitId(id);
  return `${namespace}:msm_games/${kind}/${path}/${action}`;
}

// --- Chances (B552: rolled out of 10,000) --------------------------------------------------

/** A chance from 0 to 1 as a percentage, to two decimal places (the game rolls in 10,000ths). */
export function percentOf(chance: Json | undefined): number {
  const value = typeof chance === 'number' && Number.isFinite(chance) ? chance : 0;
  return Math.round(Math.min(1, Math.max(0, value)) * 10_000) / 100;
}

/** A percentage as a chance from 0 to 1, in whole 10,000ths. */
export function chanceOfPercent(percent: number): number {
  const clamped = Math.min(100, Math.max(0, percent));
  return Math.round(clamped * 100) / 10_000;
}

// --- One block -----------------------------------------------------------------------------

/** One weighted entry with its share. */
export interface Odds {
  readonly id: string;
  readonly weight: number;
  /** Its share of the list's total weight, as a percentage to one decimal place. */
  readonly percent: number;
}

/** The entries of a weighted list (`block` or `mob` key), each with its share. */
export function oddsOf(list: Json | undefined, key: 'block' | 'mob'): Odds[] {
  const entries = listOf(list)
    .map((entry) => objectOf(entry))
    .map((entry) => ({
      id: textOf(entry[key]),
      weight: typeof entry.weight === 'number' && entry.weight > 0 ? entry.weight : 0,
    }));
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  return entries.map((entry) => ({
    ...entry,
    percent: total === 0 ? 0 : Math.round((entry.weight / total) * 1000) / 10,
  }));
}

/** One break of a one block, as {@link runOneBlock} plays it. */
export interface OneBlockBreak {
  /** The phase (from 0) the block was filled in. */
  readonly phase: number;
  /** The block it became, or `null` for a chest. */
  readonly block: string | null;
  /** True when it became a chest of the phase's loot. */
  readonly chest: boolean;
  /** The mob summoned above, if any. */
  readonly mob: string | null;
  /** True when this break started a new phase. */
  readonly newPhase: boolean;
}

/** A small seeded random source (mulberry32) over a text seed. */
export function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let at = 0; at < seed.length; at += 1) {
    state ^= seed.charCodeAt(at);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A roll from 1 to 10,000, as the lowering's `random value 1..10000`. */
const roll = (random: () => number): number => 1 + Math.floor(random() * 10_000);

function pick<T extends { weight: number }>(list: readonly T[], random: () => number): T | null {
  const total = list.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return null;
  let left = random() * total;
  for (const entry of list) {
    left -= entry.weight;
    if (left < 0) return entry;
  }
  return list[list.length - 1] ?? null;
}

/**
 * The next `count` breaks of a one block from the start, played as the lowering plays them
 * (B552): each phase lasts its `breaks`, then the next (back to the first with `loop`, else the
 * last stays); a break becomes a chest at `chest_chance` when the phase has chest loot, else a
 * block by weight; then a mob of `mobs` by weight above it at `mob_chance`. The game's random
 * numbers differ, so the run is an example; the odds ({@link oddsOf}) are the data's own.
 */
export function runOneBlock(data: Json | undefined, seed: string, count: number): OneBlockBreak[] {
  const object = objectOf(data);
  const phases = listOf(object.phases).map((phase) => objectOf(phase));
  if (phases.length === 0) return [];
  const loop = object.loop === true;
  const random = seededRandom(seed);
  const out: OneBlockBreak[] = [];
  let phase = 0;
  let broken = 0;
  for (let at = 0; at < count; at += 1) {
    let newPhase = at === 0;
    const current = phases[phase] as JsonObject;
    const lasts =
      typeof current.breaks === 'number' && current.breaks >= 1 ? current.breaks : Infinity;
    if (broken >= lasts) {
      if (phase + 1 < phases.length) {
        phase += 1;
        newPhase = true;
      } else if (loop) {
        phase = 0;
        newPhase = true;
      }
      broken = 0;
    }
    broken += 1;
    const now = phases[phase] as JsonObject;
    const chestChance = typeof now.chest_chance === 'number' ? now.chest_chance : 0;
    const mobChance = typeof now.mob_chance === 'number' ? now.mob_chance : 0;
    const hasLoot = textOf(now.chest_loot) !== '';
    const chest = hasLoot && roll(random) <= Math.round(chestChance * 10_000);
    const block = chest ? null : (pick(oddsOf(now.blocks, 'block'), random)?.id ?? null);
    const mobs = oddsOf(now.mobs, 'mob');
    const mob =
      mobs.length > 0 && roll(random) <= Math.round(mobChance * 10_000)
        ? (pick(mobs, random)?.id ?? null)
        : null;
    out.push({ phase, block, chest, mob, newPhase });
  }
  return out;
}

// --- Areas ---------------------------------------------------------------------------------

/** An area's box: its smallest and largest corners (both inside) and its size in blocks. */
export interface AreaBox {
  readonly min: Pos;
  readonly max: Pos;
  readonly size: Pos;
  readonly blocks: number;
  /** True when `from` is not the smallest corner on every axis (the validator's order check). */
  readonly unordered: boolean;
}

/** The box of an area's `from` and `to` (inclusive corners, B552). */
export function areaBoxOf(data: Json | undefined): AreaBox {
  const object = objectOf(data);
  const from = posOf(object.from);
  const to = posOf(object.to);
  const min = from.map((axis, at) => Math.min(axis, to[at] as number)) as Pos;
  const max = from.map((axis, at) => Math.max(axis, to[at] as number)) as Pos;
  const size = min.map((axis, at) => (max[at] as number) - axis + 1) as Pos;
  return {
    min,
    max,
    size,
    blocks: size[0] * size[1] * size[2],
    unordered: from.some((axis, at) => axis > (to[at] as number)),
  };
}

/** A box drawn in the area's outline: where a reset structure goes, and its size if known. */
export interface PlacedBox {
  readonly label: string;
  readonly min: Pos;
  /** The structure's size, or `null` when the project has no such template. */
  readonly size: Pos | null;
}

/** The reset structures of an area, each at its corner with the template's size if known. */
export function resetBoxes(project: Project, data: Json | undefined): PlacedBox[] {
  const reset = objectOf(objectOf(data).reset);
  return listOf(reset.structures).map((entry) => {
    const object = objectOf(entry);
    const id = textOf(object.structure);
    return {
      label: id === '' ? 'A building' : idWords(id),
      min: posOf(object.at),
      size: id === '' ? null : structureSize(project, id),
    };
  });
}

// --- Timers --------------------------------------------------------------------------------

/** Whole seconds as a clock: `m:ss`, or `h:mm:ss` from an hour. */
export function clockOf(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

/** What a timer shows `elapsed` seconds after it starts, and how full its boss bar is. */
export function timerAt(
  data: Json | undefined,
  elapsed: number,
): { shown: number; fill: number; ended: boolean } {
  const object = objectOf(data);
  const length = typeof object.seconds === 'number' && object.seconds >= 1 ? object.seconds : 1;
  const done = Math.min(length, Math.max(0, Math.floor(elapsed)));
  const up = object.count === 'up';
  const shown = up ? done : length - done;
  return { shown, fill: up ? done / length : (length - done) / length, ended: done >= length };
}

/** The text of a timer's bar: `[name ]<time>` (B552's action bar is `[name ]<score>s`). */
export function timerText(data: Json | undefined, shown: number): string {
  const name = textOf(objectOf(data).name).trim();
  const time = `${shown}s`;
  return name === '' ? time : `${name} ${time}`;
}

// --- Objectives ----------------------------------------------------------------------------

/** How one score is written by an objective's number format. */
export interface ScoreText {
  readonly text: string;
  readonly colour: string | null;
  readonly bold: boolean;
  readonly italic: boolean;
}

/** One score as the objective's number format writes it (red numbers by default, as the game). */
export function scoreText(data: Json | undefined, score: number): ScoreText {
  const format = objectOf(objectOf(data).number_format);
  switch (format.type) {
    case 'blank':
      return { text: '', colour: null, bold: false, italic: false };
    case 'fixed':
      return { text: textOf(format.text), colour: null, bold: false, italic: false };
    case 'styled':
      return {
        text: String(score),
        colour: textOf(format.colour) === '' ? null : textOf(format.colour),
        bold: format.bold === true,
        italic: format.italic === true,
      };
    default:
      return { text: String(score), colour: 'red', bold: false, italic: false };
  }
}

/** The number format's type as the Studio's choice (`plain` for none). */
export function numberFormatChoice(data: Json | undefined): string {
  const type = objectOf(objectOf(data).number_format).type;
  return typeof type === 'string' ? type : 'plain';
}

/** The number format for a choice (`undefined` for plain numbers). */
export function numberFormatFor(choice: string): Json | undefined {
  switch (choice) {
    case 'blank':
      return { type: 'blank' };
    case 'fixed':
      return { type: 'fixed', text: '-' };
    case 'styled':
      return { type: 'styled', colour: 'yellow' };
    default:
      return undefined;
  }
}

/** Criteria a beginner picks from, in words; any other criterion keeps its own text. */
export function criterionWords(criterion: string): string {
  switch (criterion) {
    case 'dummy':
      return 'Changed only by rules';
    case 'trigger':
      return 'Changed by players with /trigger';
    case 'deathCount':
      return 'Times died';
    case 'playerKillCount':
      return 'Players killed';
    case 'totalKillCount':
      return 'Mobs and players killed';
    case 'health':
      return 'Health';
    case 'xp':
      return 'Experience points';
    case 'level':
      return 'Experience level';
    case 'food':
      return 'Hunger';
    case 'air':
      return 'Air';
    case 'armor':
      return 'Armour points';
    default: {
      const stat = /^minecraft\.([a-z_]+):(.+)$/.exec(criterion);
      if (stat !== null) {
        const what = (stat[2] as string).replace(/^[a-z0-9_]+\./, '');
        return `${idWords(stat[1] as string)}: ${idWords(what)}`;
      }
      return criterion;
    }
  }
}

// --- World setup: the live map -------------------------------------------------------------

/** What the World Setup Studio's map draws. */
export type WorldMapPlan =
  /** Draw `preset` of `project` (the lowered world laid over the project in memory). */
  | { readonly draw: true; readonly project: Project; readonly preset: Element }
  /** Nothing to draw; `why` says why in plain words. */
  | { readonly draw: false; readonly why: string };

/**
 * The project with the world setup's own world laid over it in memory, never written: the world
 * preset and the sky biome (and, for the start placed while the world generates, its structure
 * set) that `lowered` holds, each as an element of its worldgen kind, so the live world map draws
 * the world the setup writes. `folders` are the target's worldgen data folders
 * (`worldgen.terrainPreview.dataFolders`), and `bundled` lays a bundle over the project (the
 * Creator's `bundlePreviewProject`).
 */
export function worldMapPlan(input: {
  readonly project: Project;
  readonly element: Element;
  readonly lowered: readonly OutputFile[] | Error;
  readonly folders: readonly string[];
  bundled(project: Project, bundle: ContentBundle): Project;
}): WorldMapPlan {
  const { project, element } = input;
  const world = objectOf(objectOf(element.data).world);
  const type = textOf(world.type);
  if (type === 'vanilla') {
    return {
      draw: false,
      why: 'Your game is played in a normal world, so the world itself is the game’s own.',
    };
  }
  if (type === 'preset') {
    const id = textOf(world.preset);
    const preset = id === '' ? undefined : findOf(project, WORLD_PRESET_KIND, id);
    return preset === undefined
      ? { draw: false, why: 'Pick a world type of your own to see it here.' }
      : { draw: true, project, preset };
  }
  if (input.lowered instanceof Error) {
    return {
      draw: false,
      why: 'This world cannot be drawn yet: Things to fix says what is missing.',
    };
  }
  const bundle: ContentBundle = { elements: [], assets: [] };
  let presetId: string | null = null;
  for (const file of input.lowered) {
    if (file.contents instanceof Uint8Array || typeof file.contents === 'string') continue;
    const match = /^data\/([^/]+)\/(.+)\.json$/.exec(file.path);
    if (match === null) continue;
    const [, namespace, rest] = match as unknown as [string, string, string];
    const folder = input.folders
      .filter((entry) => rest.startsWith(`${entry}/`))
      .sort((a, b) => b.length - a.length)[0];
    if (folder === undefined || folder.startsWith('tags/')) continue;
    const id = `${namespace}:${rest.slice(folder.length + 1)}`;
    const kind = `minecraft:${folder}`;
    bundle.elements.push({ id: id as never, kind, data: file.contents as Json });
    if (kind === WORLD_PRESET_KIND && presetId === null) presetId = id;
  }
  if (presetId === null) return { draw: false, why: 'This world type makes no world to draw.' };
  const overlaid = input.bundled(project, bundle);
  const preset = findOf(overlaid, WORLD_PRESET_KIND, presetId);
  return preset === undefined
    ? { draw: false, why: 'This world type makes no world to draw.' }
    : { draw: true, project: overlaid, preset };
}

/**
 * The name the world setup's world type and game world get (B551, B554): the last part of the
 * element's id in title case (`sky_world` gives "Sky World"), as the lowering's `worldTypeName`.
 */
export function worldSetupName(id: string): string {
  const path = id.slice(id.indexOf(':') + 1);
  const last = path.slice(path.lastIndexOf('/') + 1);
  return last
    .split(/[_.-]+/)
    .filter((word) => word !== '')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

/** The start structure's footprint and the spawn on it, for the start's top-down picture. */
export function startFootprint(
  project: Project,
  data: Json | undefined,
): { size: Pos | null; spawn: Pos; structure: string } | null {
  const start = objectOf(objectOf(data).start);
  const structure = textOf(start.structure);
  if (structure === '' && start.spawn === undefined) return null;
  return {
    size: structure === '' ? null : structureSize(project, structure),
    spawn: posOf(start.spawn),
    structure,
  };
}
