/**
 * The structure Studios (plan D7), discovered by `studio-registry.ts`: the Structure Studio
 * for `minecraft:structure_template` and the Template Pool Studio for
 * `minecraft:worldgen/template_pool`.
 *
 * @packageDocumentation
 */

import type { StudioEntry } from '../types';
import { STRUCTURE_TEMPLATE_KIND, TEMPLATE_POOL_KIND } from './connections';
import { StructureStudio } from './StructureStudio';
import { TemplatePoolStudio } from './TemplatePoolStudio';

/** The Studios of this area, in priority order. */
export const studios: StudioEntry[] = [
  { id: 'msm.structure-template', kindId: STRUCTURE_TEMPLATE_KIND, component: StructureStudio },
  { id: 'msm.template-pool', kindId: TEMPLATE_POOL_KIND, component: TemplatePoolStudio },
];
