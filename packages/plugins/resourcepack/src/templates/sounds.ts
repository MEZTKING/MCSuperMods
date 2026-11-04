/**
 * Sounds templates: the namespace's `sounds.json`.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { SOUNDS_ELEMENT_PATH, soundsKind } from '../kinds/sounds';

/** The sounds templates, in picker order. */
export const soundsTemplates: readonly ElementTemplate[] = [
  {
    id: 'sounds',
    kind: soundsKind.id,
    category: 'Sounds',
    title: 'Sounds',
    description:
      'Sound events of the namespace (one per namespace), starting with one event that plays vanilla sound files.',
    defaultName: SOUNDS_ELEMENT_PATH,
    fixedName: true,
    data: (context) => ({
      'block.example.chime': {
        sounds: ['minecraft:block/amethyst/resonate1', 'minecraft:block/amethyst/resonate2'],
        subtitle: `subtitles.${context.projectNamespace}.block.example.chime`,
      },
    }),
  },
];
