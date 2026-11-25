/**
 * What a round script reads of a game (B728): the `msm:game` element and the pieces it names,
 * with the names its lowering gives them. The games plugin's names (`lowering/game/names.ts`,
 * `shared-functions.ts`) are repeated here because the renderer does not import the plugin; the
 * round scripts' test plays them on the real lowered files, so a name that drifts fails there.
 */

import type { Json } from '@msm/plugin-api';

/** A games element as Try it and the hub hold it. */
export interface RoundElement {
  readonly id: string;
  readonly kind: string;
  readonly data: Json;
}

/** A world position. */
export type WorldPos = readonly [number, number, number];

/** A box of world positions, corners included. */
export interface WorldBox {
  readonly from: WorldPos;
  readonly to: WorldPos;
}

/** One mechanic's data, as the game holds it. */
export type MechanicData = { readonly type: string } & { readonly [key: string]: Json };

/** A game as a round script reads it. */
export interface RoundFacts {
  readonly id: string;
  readonly namespace: string;
  /** The game's id path (`lifesteal`, `games/spleef`). */
  readonly path: string;
  readonly name: string;
  /** The game type (`lifesteal`, `bed_wars`, ...). */
  readonly type: string;
  readonly round: {
    readonly kind: 'rounds' | 'endless';
    readonly start: 'command' | 'enough_players' | 'world_start';
    readonly countdown: number;
  };
  readonly mechanics: readonly MechanicData[];
  /** The lobby's spawn, when the game has a lobby. */
  readonly lobbySpawn: WorldPos | undefined;
  /** The project's areas by id. */
  readonly areas: ReadonlyMap<string, WorldBox>;
  /** The teams' scoreboard names by element id. */
  readonly teams: ReadonlyMap<string, string>;
  /** The game's role ids, in order. */
  readonly roles: readonly string[];
}

const isRecord = (value: Json | undefined): value is { readonly [key: string]: Json } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: Json | undefined, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const num = (value: Json | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** A world position from `[x, y, z]`, or `undefined`. */
export function posOf(value: Json | undefined): WorldPos | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const out = value.map((axis) => (typeof axis === 'number' ? axis : Number.NaN));
  return out.every(Number.isFinite) ? (out as unknown as WorldPos) : undefined;
}

/** `<ns>` and `<path>` of an id. */
export function splitId(id: string): { readonly namespace: string; readonly path: string } {
  const at = id.indexOf(':');
  return at < 0
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, at), path: id.slice(at + 1) };
}

const dotted = (path: string): string => path.replaceAll('/', '.');

/** A team's (or objective's) scoreboard name: `<ns>.<path>` with `/` as `.`. */
export const teamName = (id: string): string => {
  const { namespace, path } = splitId(id);
  return `${namespace}.${dotted(path)}`;
};

/** A function of the game: `<ns>:msm_games/game/<path>/<name>`. */
export const gameFunction = (facts: RoundFacts, name: string): string =>
  `${facts.namespace}:msm_games/game/${facts.path}/${name}`;

/** An entity tag of the game: `<ns>.game.<path>.<name>`. */
export const gameTag = (facts: RoundFacts, name: string): string =>
  `${facts.namespace}.game.${dotted(facts.path)}.${name}`;

/** The game's state objective (`<ns>.msm_game`) and a holder on it (`#<path>.<name>`). */
export const gameObjective = (facts: RoundFacts): string => `${facts.namespace}.msm_game`;
export const gameHolder = (facts: RoundFacts, name: string): string =>
  `#${dotted(facts.path)}.${name}`;

/** The round's states as `#<path>.state` holds them. */
export const ROUND_STATES = Object.freeze({ waiting: 0, countdown: 1, playing: 2, ending: 3 });

/** A mechanic of the game by type, or `undefined`. */
export function mechanicOf(facts: RoundFacts, type: string): MechanicData | undefined {
  return facts.mechanics.find((one) => one.type === type);
}

/**
 * The facts of a game among the project's elements: the one named, else the first `msm:game`;
 * `undefined` when there is none.
 */
export function roundFactsOf(
  elements: readonly RoundElement[],
  gameId?: string,
): RoundFacts | undefined {
  const game = elements.find(
    (one) => one.kind === 'msm:game' && (gameId === undefined || one.id === gameId),
  );
  if (game === undefined || !isRecord(game.data)) return undefined;
  const data = game.data;
  const round = isRecord(data.round) ? data.round : {};
  const lobby = isRecord(data.lobby) ? data.lobby : undefined;
  const areas = new Map<string, WorldBox>();
  const teams = new Map<string, string>();
  for (const one of elements) {
    if (!isRecord(one.data)) continue;
    if (one.kind === 'msm:area') {
      const from = posOf(one.data.from);
      const to = posOf(one.data.to);
      if (from !== undefined && to !== undefined) areas.set(one.id, { from, to });
    } else if (one.kind === 'msm:team') teams.set(one.id, teamName(one.id));
  }
  const { namespace, path } = splitId(game.id);
  const mechanics = Array.isArray(data.mechanics)
    ? data.mechanics.filter(
        (one): one is MechanicData => isRecord(one) && typeof one.type === 'string',
      )
    : [];
  const roles = Array.isArray(data.roles)
    ? data.roles.flatMap((one) => (isRecord(one) && typeof one.id === 'string' ? [one.id] : []))
    : [];
  const kind = text(round.kind) === 'endless' ? 'endless' : 'rounds';
  const start = text(round.start, 'command');
  return {
    id: game.id,
    namespace,
    path,
    name: text(data.name, path),
    type: text(data.type, 'custom'),
    round: {
      kind,
      start: start === 'enough_players' || start === 'world_start' ? start : 'command',
      countdown: num(round.countdown, 0),
    },
    mechanics,
    lobbySpawn: lobby === undefined ? undefined : posOf(lobby.spawn),
    areas,
    teams,
    roles,
  };
}

/** Every world position a game names (lobby, areas, bases, generators, shops), for fitting. */
export function placesOf(facts: RoundFacts): WorldPos[] {
  const out: WorldPos[] = [];
  if (facts.lobbySpawn !== undefined) out.push(facts.lobbySpawn);
  for (const mechanic of facts.mechanics) {
    const floor = floorBox(facts, mechanic);
    if (floor !== undefined) out.push(floor.from, floor.to);
    for (const key of ['bases', 'generators', 'shops'] as const) {
      const list = mechanic[key];
      if (!Array.isArray(list)) continue;
      for (const one of list) {
        if (!isRecord(one)) continue;
        for (const field of ['bed', 'spawn', 'at'] as const) {
          const pos = posOf(one[field]);
          if (pos !== undefined) out.push(pos);
        }
      }
    }
  }
  return out;
}

/** A floor mechanic's box: its own `from` and `to`, else its area's. */
export function floorBox(facts: RoundFacts, mechanic: MechanicData): WorldBox | undefined {
  if (mechanic.type !== 'floor') return undefined;
  const from = posOf(mechanic.from);
  const to = posOf(mechanic.to);
  if (from !== undefined && to !== undefined) return { from, to };
  return facts.areas.get(text(mechanic.area));
}

/** The team bases of a `team_base` mechanic, in order. */
export function basesOf(
  facts: RoundFacts,
): { readonly team: string; readonly bed: WorldPos; readonly spawn: WorldPos }[] {
  const mechanic = mechanicOf(facts, 'team_base');
  const bases = mechanic?.bases;
  if (!Array.isArray(bases)) return [];
  return bases.flatMap((one) => {
    if (!isRecord(one)) return [];
    const bed = posOf(one.bed);
    const spawn = posOf(one.spawn);
    const team = text(one.team);
    return bed === undefined || spawn === undefined || team === ''
      ? []
      : [{ team: facts.teams.get(team) ?? teamName(team), bed, spawn }];
  });
}
