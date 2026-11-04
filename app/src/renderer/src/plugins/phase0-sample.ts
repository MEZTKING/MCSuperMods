/**
 * Temporary built-in plugin for Phase 0: one element kind (recipes) so the shell has
 * something to create, edit and save. Replaced by `@msm/plugin-datapack` in Phase 2.
 *
 * @packageDocumentation
 */

import { parseResourceLocation } from '@msm/core';
import { definePlugin } from '@msm/plugin-api';

/** The Phase 0 sample plugin. */
export const phase0SamplePlugin = definePlugin({
  id: 'msm.phase0-sample',
  apiVersion: '^0.1.0',
  contributes: {
    elementKinds: [
      {
        id: 'minecraft:recipe',
        schema: '::java::data::recipe::Recipe',
        folder: 'recipe',
        lower: (el) => {
          const { namespace: ns, path } = parseResourceLocation(el.id);
          return [{ path: `data/${ns}/recipe/${path}.json`, contents: el.data, layer: 'datapack' }];
        },
      },
    ],
  },
});
