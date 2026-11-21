/**
 * The sky behind Try it's area (B483, ADR 0100 D4, ADR 0101 D5). By default it is MSM's own
 * plain blue-grey, on purpose not Minecraft's (ADR 0085 D7). A project dimension pointing at a
 * dimension type of the project's own (the Dimension flow's "Give it its own sky and rules", or
 * the Dimension Type Studio) offers its sky instead: the sky colour of the type's swatch
 * (`skySwatch`, B471), as one flat colour. No sun, moon, stars, fog or clouds are drawn, and the
 * colour does not darken at night (the game's day and night clock is not simulated).
 *
 * Part of the lazy Try it chunk.
 */

import type { Project } from '@msm/core';
import { skySwatch } from '../../studios/worldgen/dimension-type-model';

/** MSM's own sky, the view's default. */
export const PREVIEW_SKY: readonly [number, number, number] = [0.58, 0.66, 0.74];

/** A sky the view can show. */
export interface SkyChoice {
  /** The dimension's id. */
  readonly dimension: string;
  /** The dimension's name in plain words, from its id. */
  readonly name: string;
  /** The project dimension type it uses. */
  readonly dimensionType: string;
  /** The sky colour, `#rrggbb`. */
  readonly hex: string;
  /** The same as 0..1 RGB. */
  readonly rgb: readonly [number, number, number];
}

const KIND_DIMENSION = 'minecraft:dimension';
const KIND_DIMENSION_TYPE = 'minecraft:dimension_type';

/** `[r, g, b]` (0..1) from `#rrggbb`; `null` for anything else. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (match === null) return null;
  const value = Number.parseInt(match[1] as string, 16);
  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255];
}

/** `Ruby Realm` from `mymod:ruby_realm`. */
function plainName(id: string): string {
  const path = id.slice(id.indexOf(':') + 1);
  return (path.split('/').at(-1) ?? path)
    .split('_')
    .filter((word) => word !== '')
    .map((word) => (word[0] ?? '').toUpperCase() + word.slice(1))
    .join(' ');
}

/** The skies of the project's dimensions that use a dimension type of the project, by id. */
export function projectSkies(project: Project | null): SkyChoice[] {
  // A session's project may be a partial one (a view test's); no namespaces, no skies.
  const namespaces: Project['namespaces'] | undefined = project?.namespaces;
  if (namespaces === undefined) return [];
  const elements = namespaces.flatMap((namespace) => namespace.elements);
  const types = new Map(
    elements
      .filter((element) => element.kind === KIND_DIMENSION_TYPE)
      .map((element) => [element.id as string, element.data] as const),
  );
  const out: SkyChoice[] = [];
  for (const element of elements) {
    if (element.kind !== KIND_DIMENSION) continue;
    const data = element.data;
    const type =
      typeof data === 'object' && data !== null && !Array.isArray(data) ? data.type : undefined;
    if (typeof type !== 'string' || !types.has(type)) continue;
    const hex = skySwatch(types.get(type)).top;
    const rgb = hexToRgb(hex);
    if (rgb === null) continue;
    out.push({ dimension: element.id, name: plainName(element.id), dimensionType: type, hex, rgb });
  }
  return out.sort((a, b) => (a.dimension < b.dimension ? -1 : a.dimension > b.dimension ? 1 : 0));
}
