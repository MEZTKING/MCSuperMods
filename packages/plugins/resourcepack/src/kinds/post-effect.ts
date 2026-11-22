/**
 * `minecraft:post_effect`: a post-processing effect chain (`assets/<ns>/post_effect/<path>.json`),
 * the passes the game draws over the screen, for example while spectating a creeper, spider or
 * enderman, or for the blur behind menus (ADR 0106 D2).
 */
import type { ElementKind, OutputFile } from '@msm/plugin-api';
import { splitResourceLocation } from '../lowering/paths';

const SCHEMA = '::java::assets::shader::post::PostEffect';

/**
 * The folder under `assets/<namespace>/`. Not a target fact: `ResourceFolderKey` is a closed
 * key set every target must fill, so adding a key would not be additive in plugin API 1.x (as
 * for `EQUIPMENT_FOLDER`). The folder has this name on every supported target (the Spyglass
 * URI binder names it so since 1.21.2; `CHANGES.md` of both targets).
 */
export const POST_EFFECT_FOLDER = 'post_effect';

export const postEffectKind: ElementKind = {
  id: 'minecraft:post_effect',
  schema: SCHEMA,
  folder: 'post_effect',
  defaultData: { passes: [] },
  lower: (element): OutputFile[] => {
    const { namespace, path } = splitResourceLocation(element.id);
    return [
      {
        path: `assets/${namespace}/${POST_EFFECT_FOLDER}/${path}.json`,
        contents: structuredClone(element.data),
        layer: 'resourcepack',
        schema: SCHEMA,
      },
    ];
  },
};
