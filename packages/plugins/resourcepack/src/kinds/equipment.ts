/**
 * `minecraft:equipment`: an equipment asset (`assets/<ns>/equipment/<path>.json`), the layers
 * drawn when an armour piece whose `equippable` component names it is worn (ADR 0042 D2).
 */
import type { ElementKind, OutputFile } from '@msm/plugin-api';
import { splitResourceLocation } from '../lowering/paths';

const SCHEMA = '::java::assets::equipment::Equipment';

/**
 * The folder under `assets/<namespace>/`. Not a target fact yet: `ResourceFolderKey` is a
 * closed key set every target (including contributed ones) must fill, so adding a key would
 * not be additive in plugin API 1.x. The folder is fixed by ADR 0042 D2 and has the same name
 * on every supported target; it becomes a folder key at the next major API version.
 */
export const EQUIPMENT_FOLDER = 'equipment';

export const equipmentKind: ElementKind = {
  id: 'minecraft:equipment',
  schema: SCHEMA,
  folder: 'equipment',
  defaultData: { layers: {} },
  lower: (element): OutputFile[] => {
    const { namespace, path } = splitResourceLocation(element.id);
    return [
      {
        path: `assets/${namespace}/${EQUIPMENT_FOLDER}/${path}.json`,
        contents: structuredClone(element.data),
        layer: 'resourcepack',
        schema: SCHEMA,
      },
    ];
  },
};
