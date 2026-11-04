/**
 * Pack templates: `pack.mcmeta`.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { packMcmetaKind } from '../kinds/pack-mcmeta';
import { kindDefaultOr } from './shared';

/** The pack templates, in picker order. */
export const packTemplates: readonly ElementTemplate[] = [
  {
    id: 'pack',
    kind: packMcmetaKind.id,
    category: 'Pack',
    title: 'Pack metadata',
    description: 'The pack description shown in the game (pack.mcmeta).',
    defaultName: 'pack',
    data: (context) => kindDefaultOr(context, packMcmetaKind.defaultData ?? {}),
  },
];
