/**
 * The Custom biome with a jigsaw structure starter (plan D5, D9): the Custom biome and the
 * Jigsaw village-style structure starters in one project, with the hamlet's biome tag listing
 * the new biome as well as every vanilla forest. It is the Phase 3 exit-criterion content and
 * the source of `fixtures/sample-worldgen/`.
 */
import type { BundleContext, ContentBundle } from '@msm/plugin-api';
import { concatBundles, packElement } from '../content/bundle';
import { customBiomeContent, customBiomeIds } from './custom-biome';
import { jigsawStructureContent } from './jigsaw-structure';

export function worldgenPackBundle(context: BundleContext): ContentBundle {
  const { biome } = customBiomeIds(context.namespace);
  return concatBundles(
    {
      elements: [
        packElement(
          context.namespace,
          `${context.projectName}: the Amber Woods biome with jigsaw hamlets`,
          'The pack description shown in the resource pack and data pack lists. Both packs are exported from this one element.',
        ),
      ],
      assets: [],
    },
    customBiomeContent(context),
    jigsawStructureContent(context, [biome]),
  );
}
