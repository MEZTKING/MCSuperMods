/**
 * The built-in plugins the app registers. Phase 1 ships the resource pack plugin; the Phase 0
 * sample plugin is gone.
 *
 * @packageDocumentation
 */

import type { Plugin } from '@msm/plugin-api';
import resourcePackPlugin from '@msm/plugin-resourcepack';

export { resourcePackPlugin };

/** Every built-in plugin, in registration order. */
export const builtInPlugins: readonly Plugin[] = Object.freeze([resourcePackPlugin]);
