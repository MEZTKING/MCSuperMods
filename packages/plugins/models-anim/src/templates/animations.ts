/**
 * `msm:animation` templates. Animation names are the short names an entity's
 * `msm:animated_model` refers to (`idle`, `walk`); bone names follow the biped model template.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { ANIMATION_FORMAT_VERSION, ANIMATION_KIND } from '../kinds';
import { ENTITY_PREFIX } from './shared';

const CATEGORY = 'Entity animations';

/** A one-second swing between `+angle` and `-angle` about x, starting at `+angle`. */
const swing = (angle: number) => ({
  rotation: {
    '0.0': [angle, 0, 0],
    '0.5': [-angle, 0, 0],
    '1.0': [angle, 0, 0],
  },
});

export const animationTemplates: readonly ElementTemplate[] = [
  {
    id: 'msm_animation_idle_walk',
    kind: ANIMATION_KIND,
    category: CATEGORY,
    title: 'Idle and walk animations',
    description:
      'An idle bob and a walk cycle swinging the arms and legs of the biped model; name it entity/<name>_animations.',
    prefix: ENTITY_PREFIX,
    data: () => ({
      format_version: ANIMATION_FORMAT_VERSION,
      animations: {
        idle: {
          loop: true,
          animation_length: 2,
          bones: {
            body: { position: { '0.0': [0, 0, 0], '1.0': [0, 0.5, 0], '2.0': [0, 0, 0] } },
            right_arm: { rotation: { '0.0': [0, 0, 0], '1.0': [0, 0, 3], '2.0': [0, 0, 0] } },
            left_arm: { rotation: { '0.0': [0, 0, 0], '1.0': [0, 0, -3], '2.0': [0, 0, 0] } },
          },
        },
        walk: {
          loop: true,
          animation_length: 1,
          bones: {
            right_leg: swing(30),
            left_leg: swing(-30),
            right_arm: swing(-25),
            left_arm: swing(25),
          },
        },
      },
    }),
  },
];
