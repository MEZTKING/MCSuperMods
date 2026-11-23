/**
 * Which sprite of a waypoint style shows at a distance (ADR 0121 D5; B620 interface, B625 builds
 * it). The rule of the B619 spike (3S11): below `near` the first, from `far` the last, the middle
 * ones evenly between: 1 + floor((d - near) / (far - near) * (n - 2)).
 */

/** The index of the sprite at a distance; 0 when there are none. */
export function spriteIndex(distance: number, near: number, far: number, count: number): number {
  if (count <= 1) return 0;
  if (distance < near) return 0;
  if (distance >= far) return count - 1;
  const span = far - near;
  if (span <= 0) return count - 1;
  return 1 + Math.floor(((distance - near) / span) * (count - 2));
}

/**
 * The distances a style names when its data leaves them out: `near_distance` 128 and
 * `far_distance` 322, as the vendored schema of both targets documents them.
 */
export const DEFAULT_NEAR_DISTANCE = 128;
export const DEFAULT_FAR_DISTANCE = 322;

/** Where the locator bar's dot sprites live under a namespace's textures folder. */
export const LOCATOR_DOT_FOLDER = 'gui/sprites/hud/locator_bar_dot';

/** The jar path of a waypoint sprite id (`minecraft:default_0`). */
export function waypointSpritePath(sprite: string, texturesFolder = 'textures'): string {
  const colon = sprite.indexOf(':');
  const namespace = colon < 0 ? 'minecraft' : sprite.slice(0, colon);
  const path = sprite.slice(colon + 1);
  return `assets/${namespace}/${texturesFolder}/${LOCATOR_DOT_FOLDER}/${path}.png`;
}

/** The distances one sprite shows over: from `from` (inclusive) up to `to` (exclusive, or none). */
export interface SpriteRange {
  readonly index: number;
  readonly from: number;
  readonly to: number | null;
}

/**
 * The distance range of each of `count` sprites under {@link spriteIndex}'s rule: the first below
 * `near`, the last from `far`, the middle ones sharing the rest evenly. A sprite that never shows
 * (a range of no length) is left out.
 */
export function spriteRanges(near: number, far: number, count: number): SpriteRange[] {
  if (count <= 0) return [];
  if (count === 1) return [{ index: 0, from: 0, to: null }];
  const out: SpriteRange[] = [];
  if (near > 0) out.push({ index: 0, from: 0, to: near });
  const middle = count - 2;
  const span = far - near;
  if (span > 0 && middle > 0) {
    for (let index = 1; index <= middle; index += 1) {
      const from = near + ((index - 1) * span) / middle;
      const to = near + (index * span) / middle;
      out.push({ index, from, to });
    }
  }
  // With no middle sprites (or far not past near) the last one shows from `near` on.
  out.push({ index: count - 1, from: span > 0 && middle > 0 ? far : near, to: null });
  return out;
}
