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
