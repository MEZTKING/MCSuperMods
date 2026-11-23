/**
 * The games kinds' element data as Try it reads it (ADR 0117 D4, B558). The kinds lower to
 * plain functions (B551, B552) that the function engine runs; what the engine cannot run (the
 * start of a void world, the outlines, the looks of teams, timers and scores) is drawn from the
 * elements, which the app hands in with {@link GamesProject}. Names and function ids follow the
 * lowering's (`packages/plugins/games/src/lowering/shared-functions.ts`): a team or objective is
 * `<ns>.<path>` with `/` as `.`, a games function `<ns>:msm_games/<kind>/<path>/<action>`, a
 * holder `#<path>` with `/` as `.`.
 *
 * Pure: no Date, no randomness.
 */

import type { Json } from '@msm/plugin-api';
import type { StructureTemplateBlocks } from '../grounds/structure.js';

/** The games kinds (`@msm/plugin-games`). */
export const WORLD_SETUP_KIND = 'msm:world_setup';
export const ONE_BLOCK_KIND = 'msm:one_block';
export const TEAM_KIND = 'msm:team';
export const OBJECTIVE_KIND = 'msm:objective';
export const TIMER_KIND = 'msm:timer';
export const AREA_KIND = 'msm:area';

/** The one dimension the area stands in. */
export const OVERWORLD = 'minecraft:overworld';

/** One games element: its id, kind and data. */
export interface GamesElement {
  readonly id: string;
  readonly kind: string;
  readonly data: Json;
}

/** What Try it knows of a project's games (the app builds it from the project). */
export interface GamesProject {
  /** The games elements (other kinds are ignored). */
  readonly elements: readonly GamesElement[];
  /** The project's structure templates by id, for the grounds and `place template`. */
  readonly templates: ReadonlyMap<string, StructureTemplateBlocks>;
}

/** A project with no games. */
export const NO_GAMES: GamesProject = Object.freeze({
  elements: Object.freeze([]) as readonly GamesElement[],
  templates: new Map<string, StructureTemplateBlocks>(),
});

/** A JSON object. */
export type DataObject = { readonly [key: string]: Json };

/** A block position `[x, y, z]`. */
export type Pos3 = readonly [number, number, number];

export const objectOf = (value: Json | undefined): DataObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};

export const listOf = (value: Json | undefined): readonly Json[] =>
  Array.isArray(value) ? value : [];

export const textOf = (value: Json | undefined): string => (typeof value === 'string' ? value : '');

export const numberOf = (value: Json | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** `value` as a whole block position, or `fallback`. */
export function posOf(value: Json | undefined, fallback: Pos3 = [0, 0, 0]): Pos3 {
  if (!Array.isArray(value) || value.length !== 3) return fallback;
  const out = value.map((axis) => (typeof axis === 'number' ? Math.trunc(axis) : Number.NaN));
  return out.some((axis) => !Number.isFinite(axis)) ? fallback : (out as unknown as Pos3);
}

/** An id's namespace and path (`minecraft` when it has none). */
export function splitId(id: string): { readonly namespace: string; readonly path: string } {
  const at = id.indexOf(':');
  return at < 0
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, at), path: id.slice(at + 1) };
}

/** A team's or objective's name in the game: `<ns>.<path>` with `/` as `.`. */
export function scoreboardName(id: string): string {
  const { namespace, path } = splitId(id);
  return `${namespace}.${path.replaceAll('/', '.')}`;
}

/** A holder of the games' own objectives: `#<path>` with `/` as `.`, then a suffix. */
export function holderName(id: string, suffix = ''): string {
  return `#${splitId(id).path.replaceAll('/', '.')}${suffix}`;
}

/** A games function: `<ns>:msm_games/<kind>/<path>/<action>`. */
export function gamesFunction(id: string, kind: string, action: string): string {
  const { namespace, path } = splitId(id);
  return `${namespace}:msm_games/${kind}/${path}/${action}`;
}

/** The world setup's function `<ns>:msm_games/world_setup/<action>`. */
export function worldSetupFunction(id: string, action: string): string {
  return `${splitId(id).namespace}:msm_games/world_setup/${action}`;
}

/** The games elements of one kind, in the order given. */
export function elementsOf(games: GamesProject, kind: string): GamesElement[] {
  return games.elements.filter((element) => element.kind === kind);
}

/** The project's world setup (at most one, B551's validator), or `undefined`. */
export function worldSetupOf(games: GamesProject): GamesElement | undefined {
  return games.elements.find((element) => element.kind === WORLD_SETUP_KIND);
}

/** Whether a project has any games element. */
export function hasGames(games: GamesProject): boolean {
  return games.elements.some((element) =>
    [WORLD_SETUP_KIND, ONE_BLOCK_KIND, TEAM_KIND, OBJECTIVE_KIND, TIMER_KIND, AREA_KIND].includes(
      element.kind,
    ),
  );
}

/** An element's dimension (`dimension`, the Overworld by default). */
export function dimensionOf(data: Json): string {
  const text = textOf(objectOf(data).dimension);
  return text === '' ? OVERWORLD : text;
}

/** A plain-words name of an id's last path part ("arena/red_base" to "Red base"). */
export function idWords(id: string): string {
  const last = splitId(id).path.split('/').at(-1) ?? id;
  const words = last.replaceAll('_', ' ').trim();
  return words === '' ? id : words.charAt(0).toUpperCase() + words.slice(1);
}

/** The lowering's title of an id's last path part: each word capitalised (B552's `titleOf`). */
export function titleWords(id: string): string {
  const last = splitId(id).path.split('/').pop() ?? id;
  const words = last
    .split(/[_\-.]+/)
    .filter((word) => word.length > 0)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`);
  return words.length === 0 ? last : words.join(' ');
}
