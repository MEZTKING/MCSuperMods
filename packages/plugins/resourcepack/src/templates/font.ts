/**
 * Font templates: an icon font whose glyph is a project texture (ADR 0064 D2).
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { fontKind } from '../kinds/font';

/** The font templates, in picker order. */
export const fontTemplates: readonly ElementTemplate[] = [
  {
    id: 'font_icons',
    kind: fontKind.id,
    category: 'Fonts',
    title: 'Icon font',
    description:
      'A font with one icon: a bitmap glyph drawn from the texture font/<name>.png. Show it in text with {"text": "\\uE000", "font": "<namespace>:<name>"}.',
    data: (context) => ({
      providers: [
        {
          type: 'bitmap',
          file: `${context.namespace}:font/${context.path}.png`,
          ascent: 7,
          height: 8,
          chars: [''],
        },
      ],
    }),
  },
];
