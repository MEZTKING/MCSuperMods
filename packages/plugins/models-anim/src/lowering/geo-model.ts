/**
 * Lowering of `msm:geo_model` (ADR 0029 D2).
 */
import type { Element, OutputFile, Target } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { geoModelPath, splitResourceLocation } from './paths';
import { normalisedContents } from './shared';

/**
 * Lowers an `msm:geo_model` element to `assets/<ns>/geckolib/models/<path>.geo.json` (layer
 * `resourcepack`, schema `msm:geo_model`).
 *
 * @param element - The element.
 * @param _target - Unused: GeckoLib's layout does not depend on the game version.
 * @returns The output file.
 * @throws {@link ModelsAnimLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerGeoModel(element: Element, _target: Target): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  return [
    {
      path: geoModelPath(namespace, path),
      contents: normalisedContents(element, 'geo model'),
      layer: 'resourcepack',
      schema: MSM_SCHEMA_REFS.geoModel,
    },
  ];
}
