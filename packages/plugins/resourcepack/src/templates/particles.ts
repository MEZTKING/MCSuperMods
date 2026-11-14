/**
 * Particle description templates (ADR 0081 D4): retexturing a vanilla particle with a picture
 * of the project. The sprite is `<projectNamespace>:<name>`, the picture
 * `assets/<projectNamespace>/textures/particle/<name>.png`.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { particleKind } from '../kinds/particle';

/** The particle templates, in picker order. */
export const particleTemplates: readonly ElementTemplate[] = [
  {
    id: 'particle_retexture',
    kind: particleKind.id,
    category: 'Particles',
    title: 'Retexture a vanilla particle',
    description:
      'Gives a vanilla particle (flame by default) a picture of your own: add it as textures/particle/<name>.png. Works in a plain resource pack.',
    defaultNamespace: 'minecraft',
    defaultName: 'flame',
    data: (context) => ({
      textures: [`${context.projectNamespace}:${context.path.split('/').pop() ?? context.path}`],
    }),
  },
];
