/**
 * The worldgen element templates (ADR 0020, ADR 0022 D9), in picker order: biomes, configured
 * and placed features, dimensions, the world preset and two dimension types (ADR 0100), then one per tier-B registry. Every
 * template uses only vanilla ids or ids derived from the new element's own id.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { advancedTemplates } from './advanced';
import { biomeTemplates } from './biomes';
import { dimensionTypeTemplates } from './dimension-types';
import { dimensionTemplates } from './dimensions';
import { featureTemplates } from './features';

export const worldgenTemplates: readonly ElementTemplate[] = Object.freeze([
  ...biomeTemplates,
  ...featureTemplates,
  ...dimensionTemplates,
  ...dimensionTypeTemplates,
  ...advancedTemplates,
]);
