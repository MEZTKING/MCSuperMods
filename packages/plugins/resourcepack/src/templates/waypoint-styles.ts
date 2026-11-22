/**
 * Waypoint style templates (ADR 0106 D2): how a waypoint looks on the locator bar.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { waypointStyleKind } from '../kinds/waypoint-style';

/** The waypoint style templates, in picker order. */
export const waypointStyleTemplates: readonly ElementTemplate[] = [
  {
    id: 'waypoint_style',
    kind: waypointStyleKind.id,
    category: 'Locator bar',
    title: 'Waypoint style',
    description:
      'A locator bar dot that changes from the bow tie up close to the plain dot far away; use it with /waypoint modify <target> style set <id>. Draw your own dots under textures/gui/sprites/hud/locator_bar_dot/.',
    data: () => ({
      near_distance: 64,
      far_distance: 256,
      sprites: ['minecraft:bowtie', 'minecraft:default_0', 'minecraft:default_1'],
    }),
  },
];
