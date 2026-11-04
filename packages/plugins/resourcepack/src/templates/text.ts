/**
 * Text templates: language files.
 */
import type { ElementTemplate } from '@msm/plugin-api';
import { langKind } from '../kinds/lang';

/** The text templates, in picker order. */
export const textTemplates: readonly ElementTemplate[] = [
  {
    id: 'lang',
    kind: langKind.id,
    category: 'Text',
    title: 'Language file',
    description: 'Translations, for example en_us, with sample block and item names to rename.',
    defaultName: 'en_us',
    data: (context) => ({
      [`block.${context.projectNamespace}.example_block`]: 'Example Block',
      [`item.${context.projectNamespace}.example_item`]: 'Example Item',
    }),
  },
];
