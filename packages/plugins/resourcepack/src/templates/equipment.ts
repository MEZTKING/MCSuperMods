/**
 * Equipment asset templates (ADR 0042 D2): the worn look of an armour material.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { equipmentKind } from '../kinds/equipment';

/** The equipment templates, in picker order. */
export const equipmentTemplates: readonly ElementTemplate[] = [
  {
    id: 'equipment-humanoid',
    kind: equipmentKind.id,
    category: 'Models',
    title: 'Equipment (humanoid armour)',
    description:
      'How armour of one material looks when worn: textures entity/equipment/humanoid/<name> and entity/equipment/humanoid_leggings/<name>.',
    data: (context) => ({
      layers: {
        humanoid: [{ texture: context.id }],
        humanoid_leggings: [{ texture: context.id }],
      },
    }),
  },
];
