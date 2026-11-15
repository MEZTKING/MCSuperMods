/**
 * The app-reported warning `blocks-items.sign-gui-picture-missing` (B452, ADR 0094 D6 amended at
 * B448): a sign's or hanging sign's writing screen reads `textures/gui/signs/<path>.png` or
 * `textures/gui/hanging_signs/<path>.png` of the element's namespace, and lowering cannot copy
 * picture bytes, so the Block Studio saves the chosen picture there; only the session sees the
 * project's assets, so the check runs here, as the missing particle picture warning does. Pure.
 *
 * @packageDocumentation
 */

import type { Element, Problem, Project } from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import { signGuiTexturePath } from '@msm/plugin-blocks-items';

/** The code of the warning. */
export const SIGN_GUI_PICTURE_MISSING_CODE = 'blocks-items.sign-gui-picture-missing';

const BLOCK_KIND = 'msm:block';

/** The writing screen picture's texture slot of each sign type. */
const GUI_SLOT: Readonly<Record<'sign' | 'hanging_sign', string>> = {
  sign: 'sign',
  hanging_sign: 'hanging_gui',
};

/** The sign type of an `msm:block` element, or `undefined`. */
function signTypeOf(element: Element): 'sign' | 'hanging_sign' | undefined {
  const data = element.data;
  if (element.kind !== BLOCK_KIND || typeof data !== 'object' || data === null) return undefined;
  if (Array.isArray(data)) return undefined;
  return data.type === 'sign' || data.type === 'hanging_sign' ? data.type : undefined;
}

/**
 * One warning per `sign` or `hanging_sign` block whose writing screen picture
 * (`signGuiTexturePath`) is not an asset of the project: the game's sign screen then shows the
 * missing-picture pattern. The pointer is the writing screen slot when the element sets it, else
 * `/textures`. Without a target nothing is reported.
 *
 * @param project - The project.
 * @param target - The project's target, or `undefined`.
 */
export function signGuiPictureProblems(
  project: Project,
  target: Pick<TargetFacts, 'folders'> | undefined,
): Problem[] {
  if (target === undefined) return [];
  const problems: Problem[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const type = signTypeOf(element);
      if (type === undefined) continue;
      const assetPath = signGuiTexturePath(target, element.id, type);
      const [, owner, ...rest] = assetPath.split('/');
      const path = rest.join('/');
      const found = project.namespaces.some(
        (entry) => entry.name === owner && entry.assets.some((asset) => asset.path === path),
      );
      if (found) continue;
      const data = element.data as { textures?: unknown };
      const textures =
        typeof data.textures === 'object' && data.textures !== null
          ? (data.textures as Record<string, unknown>)
          : {};
      const slot = GUI_SLOT[type];
      const words = type === 'sign' ? 'sign' : 'hanging sign';
      problems.push({
        severity: 'warning',
        code: SIGN_GUI_PICTURE_MISSING_CODE,
        elementId: element.id,
        path: typeof textures[slot] === 'string' ? `/textures/${slot}` : '/textures',
        message: `The ${words}'s writing screen has no picture: the project has no ${assetPath}. Choose the writing screen picture (or the board picture) in the Block Studio's Textures section, which saves a copy there; until then the screen shows the missing-picture pattern.`,
      });
    }
  }
  return problems;
}
