/**
 * The app-reported warning `controls.hud-picture-missing` (B420a): a HUD element names a sprite
 * or icon picture of the project's own that the project has no file for, so the game draws
 * nothing in its place. Lowering cannot see the project's assets, only the session can, so the
 * check runs here, as the sign writing screen and particle picture warnings do. Pure.
 *
 * @packageDocumentation
 */

import type { Json, Problem, Project } from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import { HUD_KIND, HUD_SPRITE_FIELDS, hudSpritePath } from '@msm/plugin-controls';

/** A sprite a HUD element names that the project has no picture for. */
export interface MissingSprite {
  field: string;
  sprite: string;
  /** The picture's asset path (`assets/<ns>/textures/gui/sprites/<name>.png`). */
  path: string;
}

/**
 * The project's own sprites (not `minecraft:` or without a namespace) that `data` names and the
 * project has no picture for; the game draws nothing in their place.
 */
export function missingSprites(
  project: Project,
  target: Pick<TargetFacts, 'folders'>,
  data: Json | undefined,
): MissingSprite[] {
  const object = typeof data === 'object' && data !== null && !Array.isArray(data) ? data : {};
  const out: MissingSprite[] = [];
  for (const field of HUD_SPRITE_FIELDS) {
    const sprite = object[field];
    if (typeof sprite !== 'string' || sprite === '') continue;
    if (!sprite.includes(':') || sprite.startsWith('minecraft:')) continue;
    const path = hudSpritePath(target, sprite);
    if (path === undefined) continue;
    const [, owner, ...rest] = path.split('/');
    const inner = rest.join('/');
    const found = project.namespaces.some(
      (entry) => entry.name === owner && entry.assets.some((asset) => asset.path === inner),
    );
    if (!found) out.push({ field, sprite, path });
  }
  return out;
}

/** The code of the warning. */
export const HUD_PICTURE_MISSING_CODE = 'controls.hud-picture-missing';

/**
 * One warning per picture a HUD element names (`sprite`, `back_sprite`, `icon`, `half_icon`,
 * `empty_icon`) that is not an asset of the project; `minecraft:` pictures are never reported.
 * The pointer is the field. Without a target nothing is reported.
 *
 * @param project - The project.
 * @param target - The project's target, or `undefined`.
 */
export function hudPictureProblems(
  project: Project,
  target: Pick<TargetFacts, 'folders'> | undefined,
): Problem[] {
  if (target === undefined) return [];
  return project.namespaces
    .flatMap((namespace) => namespace.elements)
    .filter((element) => element.kind === HUD_KIND)
    .flatMap((element) =>
      missingSprites(project, target, element.data).map(
        (missing): Problem => ({
          severity: 'warning',
          code: HUD_PICTURE_MISSING_CODE,
          elementId: element.id,
          path: `/${missing.field}`,
          message: `The HUD element names the picture ${missing.sprite} but the project has no ${missing.path}. Add the picture in the HUD Studio or choose another; until then the game draws nothing there.`,
        }),
      ),
    );
}
