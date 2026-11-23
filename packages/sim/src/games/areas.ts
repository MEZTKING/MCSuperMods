/**
 * Areas in Try it (ADR 0117 D4, B558). An area's lowered tick (B552: the predicate tests each
 * player's position against the box, a `.now` tag, then `entered` or `left` with their hooks)
 * runs in the function engine; the predicate sees world positions (the engine adds the area's
 * corner), so walking in and out fires the hooks Rules attach to, as in the game. This module
 * draws each area's box as an outline in the area (inclusive corners, B552), reads whether the
 * player is in it from the tag `<ns>.area.<path>`, and says each walk in and out in "What
 * happened". "Rebuild now" runs the area's own `reset` function (its `place template` lines are
 * placed from the project's templates, B558).
 *
 * Pure.
 */

import type { BlockPos, Box } from '../types.js';
import {
  AREA_KIND,
  dimensionOf,
  elementsOf,
  type GamesProject,
  gamesFunction,
  idWords,
  listOf,
  OVERWORLD,
  objectOf,
  posOf,
  splitId,
  textOf,
} from './data.js';

/** The player's tag while inside an area: `<ns>.area.<path>` with `/` as `.` (B552). */
export function areaTag(id: string): string {
  const { namespace, path } = splitId(id);
  return `${namespace}.area.${path.replaceAll('/', '.')}`;
}

/** One area as Try it shows it. */
export interface AreaView {
  readonly id: string;
  /** The area's name as players see it. */
  readonly name: string;
  /** Its corners in the area (inclusive), or `null` in another dimension. */
  readonly min: BlockPos | null;
  readonly max: BlockPos | null;
  /** How much of it is in the test area: `whole`, `part` or `none`. */
  readonly inArea: 'whole' | 'part' | 'none';
  /** The player's tag while inside (`<ns>.area.<path>`). */
  readonly tag: string;
  /** Its `reset` function, when it has one (`reset` in its data). */
  readonly reset: string | null;
}

/** The size of the test area, for {@link areaViews}. */
export interface AreaSize {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Every area, with its box moved into the area by `corner`. */
export function areaViews(games: GamesProject, corner: BlockPos, size: AreaSize): AreaView[] {
  return elementsOf(games, AREA_KIND).map((element) => {
    const data = objectOf(element.data);
    const from = posOf(data.from);
    const to = posOf(data.to);
    const name = textOf(data.name).trim();
    const reset = listOf(objectOf(data.reset).structures).length > 0;
    const base = {
      id: element.id,
      name: name === '' ? idWords(element.id) : name,
      tag: areaTag(element.id),
      reset: reset ? gamesFunction(element.id, 'area', 'reset') : null,
    };
    if (dimensionOf(element.data) !== OVERWORLD) {
      return { ...base, min: null, max: null, inArea: 'none' as const };
    }
    const min = {
      x: Math.min(from[0], to[0]) - corner.x,
      y: Math.min(from[1], to[1]) - corner.y,
      z: Math.min(from[2], to[2]) - corner.z,
    };
    const max = {
      x: Math.max(from[0], to[0]) - corner.x,
      y: Math.max(from[1], to[1]) - corner.y,
      z: Math.max(from[2], to[2]) - corner.z,
    };
    const inside = (p: BlockPos) =>
      p.x >= 0 && p.y >= 0 && p.z >= 0 && p.x < size.x && p.y < size.y && p.z < size.z;
    const overlaps =
      max.x >= 0 && max.y >= 0 && max.z >= 0 && min.x < size.x && min.y < size.y && min.z < size.z;
    return {
      ...base,
      min,
      max,
      inArea: inside(min) && inside(max) ? 'whole' : overlaps ? 'part' : 'none',
    };
  });
}

/** The outline of the areas in the test area: one box each, in block units from `pos`. */
export function areaOutline(views: readonly AreaView[]): {
  readonly pos: BlockPos;
  readonly boxes: readonly Box[];
} | null {
  const boxes: Box[] = [];
  for (const view of views) {
    if (view.min === null || view.max === null || view.inArea === 'none') continue;
    boxes.push([
      view.min.x,
      view.min.y,
      view.min.z,
      view.max.x + 1,
      view.max.y + 1,
      view.max.z + 1,
    ]);
  }
  return boxes.length === 0 ? null : { pos: { x: 0, y: 0, z: 0 }, boxes };
}

/** Says each walk in and out of an area, from the player's tags as the functions keep them. */
export class AreaWatch {
  private inside = new Set<string>();

  /** Forgets who was where ("Clear the area", a new ground). */
  clear(): void {
    this.inside = new Set();
  }

  /** The areas the player is in now, by id. */
  get now(): ReadonlySet<string> {
    return this.inside;
  }

  /**
   * Compares the player's tags with the last tick's: `say` gets one line per walk in or out.
   */
  tick(
    views: readonly AreaView[],
    tags: ReadonlySet<string> | undefined,
    say: (text: string) => void,
  ): void {
    const next = new Set<string>();
    for (const view of views) {
      if (tags?.has(view.tag) === true) next.add(view.id);
    }
    for (const view of views) {
      const was = this.inside.has(view.id);
      const is = next.has(view.id);
      if (!was && is) say(`You walked into the area ${view.name}.`);
      if (was && !is) say(`You walked out of the area ${view.name}.`);
    }
    this.inside = next;
  }
}
