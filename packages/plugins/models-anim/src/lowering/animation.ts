/**
 * Lowering of `msm:animation` (ADR 0029 D2).
 */
import type { Element, OutputFile, Target } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { animationPath, splitResourceLocation } from './paths';
import { normalisedContents } from './shared';

/**
 * Lowers an `msm:animation` element to `assets/<ns>/geckolib/animations/<path>.animation.json`
 * (layer `resourcepack`, schema `msm:animation`).
 *
 * @param element - The element.
 * @param _target - Unused: GeckoLib's layout does not depend on the game version.
 * @returns The output file.
 * @throws {@link ModelsAnimLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerAnimation(element: Element, _target: Target): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  return [
    {
      path: animationPath(namespace, path),
      contents: normalisedContents(element, 'animation'),
      layer: 'resourcepack',
      schema: MSM_SCHEMA_REFS.animation,
    },
  ];
}
