/**
 * `minecraft:shader`: a shader program definition (`assets/<ns>/shaders/<path>.json`), naming
 * its vertex and fragment sources, samplers and uniforms (ADR 0106 D2). The GLSL sources
 * themselves (`.vsh`, `.fsh`, `.glsl`) are project assets under `shaders/`, exported unchecked.
 */
import type { ElementKind, OutputFile } from '@msm/plugin-api';
import { splitResourceLocation } from '../lowering/paths';

const SCHEMA = '::java::assets::shader::program::ShaderProgram';

/**
 * The folder under `assets/<namespace>/`, shared with the GLSL source assets. Not a target
 * fact, for the reason given on `POST_EFFECT_FOLDER`; the Spyglass URI binder names it so on
 * every version (`CHANGES.md`).
 */
export const SHADERS_FOLDER = 'shaders';

export const shaderKind: ElementKind = {
  id: 'minecraft:shader',
  schema: SCHEMA,
  folder: 'shader',
  // Live views 3 (ADR 0121): the registry in the app picks the view by element kind.
  previewKind: 'live_view',
  defaultData: {
    vertex: 'minecraft:core/position',
    fragment: 'minecraft:core/position',
    uniforms: [],
  },
  lower: (element): OutputFile[] => {
    const { namespace, path } = splitResourceLocation(element.id);
    return [
      {
        path: `assets/${namespace}/${SHADERS_FOLDER}/${path}.json`,
        contents: structuredClone(element.data),
        layer: 'resourcepack',
        schema: SCHEMA,
      },
    ];
  },
};
