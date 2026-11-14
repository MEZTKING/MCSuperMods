/**
 * Lowering of `msm:particle` (ADR 0080 D1, D2, D10): the runtime definition and the particle
 * description the client reads its pictures from. The pictures themselves are project assets
 * (`assets/<ns>/textures/particle/<name>.png`) or vanilla sprites, never fields, so lowering
 * writes no texture and no lang key.
 */
import type { Element, Json, JsonObject, OutputFile, TargetFacts } from '@msm/plugin-api';
import { MSM_SCHEMA_REFS } from '@msm/schemas';
import { DEFINITION_FORMAT } from './block';
import { BlocksItemsLoweringError, definitionPath, isRecord, splitResourceLocation } from './paths';

/** The vanilla schema of a particle description file (`{ "textures": [...] }`). */
export const PARTICLE_DESCRIPTION_SCHEMA = '::java::assets::particle::Particle';

/**
 * The description folder under `assets/<ns>/` when the target has no particle facts
 * (`TargetFacts.particles`, plugin API 1.14.0): the folder of every supported version.
 */
export const DEFAULT_PARTICLE_DESCRIPTION_FOLDER = 'particles';

/**
 * The picture folder under the textures folder when the target has no particle facts: the
 * folder of every supported version.
 */
export const DEFAULT_PARTICLE_TEXTURE_FOLDER = 'particle';

function particleData(element: Element): JsonObject {
  if (!isRecord(element.data)) {
    throw new BlocksItemsLoweringError(`Element ${element.id}: particle data must be an object.`);
  }
  return element.data;
}

/**
 * The runtime particle definition: the element data with `format` set to the format this
 * plugin writes. Every other field passes through unchanged (the element has no editor-only
 * field).
 *
 * @throws {@link BlocksItemsLoweringError} If the data is not an object.
 */
export function particleDefinition(element: Element): JsonObject {
  const definition = structuredClone(particleData(element));
  definition.format = DEFINITION_FORMAT;
  return definition;
}

/**
 * The particle description `{ "textures": [...] }`: the element's `textures` as written, in
 * frame order (an empty list when the data has none, which the schema reports).
 *
 * @throws {@link BlocksItemsLoweringError} If the data is not an object.
 */
export function particleDescription(element: Element): JsonObject {
  const textures = particleData(element).textures;
  return { textures: Array.isArray(textures) ? (structuredClone(textures) as Json[]) : [] };
}

/**
 * `assets/<namespace>/<descriptionFolder>/<path>.json`, the folder taken from the target's
 * particle facts (`particles` without them).
 */
export function particleDescriptionPath(
  target: Pick<TargetFacts, 'particles'>,
  namespace: string,
  path: string,
): string {
  const folder = target.particles?.descriptionFolder ?? DEFAULT_PARTICLE_DESCRIPTION_FOLDER;
  return `assets/${namespace}/${folder}/${path}.json`;
}

/**
 * The asset path of a particle sprite: `<ns>:<name>` is
 * `assets/<ns>/<textures>/<textureFolder>/<name>.png` (`minecraft` when no namespace is
 * written), the folders taken from the target. Used by hosts to report missing frame pictures
 * (ADR 0080 D10).
 *
 * @param target - The target supplying the textures and particle picture folders.
 * @param sprite - A sprite id such as `demo:spark_0`.
 * @returns The asset path, or `undefined` for a sprite id that is not a safe resource location.
 */
export function particleSpritePath(
  target: Pick<TargetFacts, 'particles' | 'folders'>,
  sprite: string,
): string | undefined {
  const id = sprite.includes(':') ? sprite : `minecraft:${sprite}`;
  try {
    const { namespace, path } = splitResourceLocation(id);
    const folder = target.particles?.textureFolder ?? DEFAULT_PARTICLE_TEXTURE_FOLDER;
    return `assets/${namespace}/${target.folders.resource.textures}/${folder}/${path}.png`;
  } catch {
    return undefined;
  }
}

/**
 * Lowers an `msm:particle` element: the runtime definition `msm/<ns>/particle/<path>.json`
 * (layer `msm`, schema `msm:particle_definition`) and the description
 * `assets/<ns>/<descriptionFolder>/<path>.json` (layer `resourcepack`, schema
 * {@link PARTICLE_DESCRIPTION_SCHEMA}).
 *
 * @param element - The element.
 * @param target - The target supplying the description folder.
 * @returns The output files.
 * @throws {@link BlocksItemsLoweringError} If the id is unsafe or the data is not an object.
 */
export function lowerParticle(element: Element, target: TargetFacts): OutputFile[] {
  const { namespace, path } = splitResourceLocation(element.id);
  return [
    {
      path: definitionPath('particle', namespace, path),
      contents: particleDefinition(element),
      layer: 'msm',
      schema: MSM_SCHEMA_REFS.particleDefinition,
    },
    {
      path: particleDescriptionPath(target, namespace, path),
      contents: particleDescription(element),
      layer: 'resourcepack',
      schema: PARTICLE_DESCRIPTION_SCHEMA,
    },
  ];
}
