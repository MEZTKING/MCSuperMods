/**
 * `minecraft:waypoint_style`: a locator bar waypoint style
 * (`assets/<ns>/waypoint_style/<path>.json`), the dot sprites a waypoint shows from near to far
 * (ADR 0106 D2). A player or mob uses it through `/waypoint modify <target> style set <style>`.
 */
import type { ElementKind, OutputFile } from '@msm/plugin-api';
import { splitResourceLocation } from '../lowering/paths';

const SCHEMA = '::java::assets::waypoint_style::WaypointStyle';

/**
 * The folder under `assets/<namespace>/`. Not a target fact, for the reason given on
 * `POST_EFFECT_FOLDER`; the Spyglass URI binder names it so since 1.21.6 (`CHANGES.md`).
 */
export const WAYPOINT_STYLE_FOLDER = 'waypoint_style';

export const waypointStyleKind: ElementKind = {
  id: 'minecraft:waypoint_style',
  schema: SCHEMA,
  folder: 'waypoint_style',
  // Live views 3 (ADR 0121): the registry in the app picks the view by element kind.
  previewKind: 'live_view',
  defaultData: { sprites: ['minecraft:default_0'] },
  lower: (element): OutputFile[] => {
    const { namespace, path } = splitResourceLocation(element.id);
    return [
      {
        path: `assets/${namespace}/${WAYPOINT_STYLE_FOLDER}/${path}.json`,
        contents: structuredClone(element.data),
        layer: 'resourcepack',
        schema: SCHEMA,
      },
    ];
  },
};
