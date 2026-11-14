/**
 * `minecraft:particle`: a particle description (`assets/<ns>/particles/<path>.json`, `{
 * "textures": [...] }`), the sprites the client draws a particle type with (ADR 0080 D2). A
 * resource pack can retexture vanilla particles with it (`minecraft:flame` pointing at a
 * project sprite); it cannot add particle types, which need the Fabric mod jar (`msm:particle`
 * of `@msm/plugin-blocks-items`, which writes its own description).
 */
import type { ElementKind, OutputFile } from '@msm/plugin-api';
import { splitResourceLocation } from '../lowering/paths';

const SCHEMA = '::java::assets::particle::Particle';

/**
 * The folder under `assets/<namespace>/` when the target has no particle facts
 * (`TargetFacts.particles.descriptionFolder`, plugin API 1.14.0). Not a `ResourceFolderKey`:
 * adding a key would not be additive in plugin API 1.x (ADR 0080 D2), as for
 * `EQUIPMENT_FOLDER`.
 */
export const PARTICLE_DESCRIPTION_FOLDER = 'particles';

export const particleKind: ElementKind = {
  id: 'minecraft:particle',
  schema: SCHEMA,
  folder: 'particles',
  defaultData: { textures: ['minecraft:generic_0'] },
  lower: (element, target): OutputFile[] => {
    const { namespace, path } = splitResourceLocation(element.id);
    const folder = target.particles?.descriptionFolder ?? PARTICLE_DESCRIPTION_FOLDER;
    return [
      {
        path: `assets/${namespace}/${folder}/${path}.json`,
        contents: structuredClone(element.data),
        layer: 'resourcepack',
        schema: SCHEMA,
      },
    ];
  },
};
