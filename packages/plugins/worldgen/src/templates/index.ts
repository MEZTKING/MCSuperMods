/**
 * The worldgen element templates (ADR 0020, ADR 0022 D9), in picker order: biomes, configured
 * and placed features, dimensions and the world preset, then one per tier-B registry. Every
 * template uses only vanilla ids or ids derived from the new element's own id.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { advancedTemplates } from './advanced';
import { biomeTemplates } from './biomes';
import { dimensionTemplates } from './dimensions';
import { featureTemplates } from './features';

export const worldgenTemplates: readonly ElementTemplate[] = Object.freeze([
  ...biomeTemplates,
  ...featureTemplates,
  ...dimensionTemplates,
  ...advancedTemplates,
]);
