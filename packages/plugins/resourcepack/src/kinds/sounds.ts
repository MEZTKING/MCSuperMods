/**
 * `minecraft:sounds`: the sound events file of a namespace (`assets/<ns>/<sounds.json>`).
 * There is one per namespace, so the element id must be `<ns>:sounds`.
 */
import type { ElementKind } from '@msm/plugin-api';
import { lowerJsonAsset } from '../lowering/json-asset';
import { ResourcePackLoweringError, splitResourceLocation } from '../lowering/paths';

const SCHEMA = '::java::assets::sounds::Sounds';

/** The only path a sounds element may have. */
export const SOUNDS_ELEMENT_PATH = 'sounds';

export const soundsKind: ElementKind = {
  id: 'minecraft:sounds',
  schema: SCHEMA,
  folder: 'sounds',
  defaultData: {},
  lower: (element, target) => {
    const { namespace, path } = splitResourceLocation(element.id);
    if (path !== SOUNDS_ELEMENT_PATH) {
      throw new ResourcePackLoweringError(
        `Element ${element.id}: a sounds file must have the id ${namespace}:${SOUNDS_ELEMENT_PATH}.`,
      );
    }
    return lowerJsonAsset(element, target, 'sounds_file', SCHEMA);
  },
};
