/**
 * The Showcase cards source (ADR 0124 D3; B660): one entry per card of **See what you can make**
 * whose example the target offers (`showcasesFor`). A card's action is its **Make this**: one flow
 * folds the card into the flow's result, several flows are the chooser a tile with the same flows
 * folds into, and a card that makes its example folds into the example. Its preview is the card's
 * still (B665).
 *
 * @packageDocumentation
 */

import type { ExampleProject, TargetFacts } from '@msm/plugin-api';
import type { SearchEntry } from '@msm/search';
import { SHOWCASES, type ShowcaseList, showcasesFor } from '../../showcase/showcases';
import { asAction, asPreview, entryIds, type SearchActionDescriptor } from './shared';
import { type FlowAvailability, flowsAction } from './tiles';

/** The card entries on the target. */
export function showcaseEntries(
  target: TargetFacts,
  examples: readonly ExampleProject[],
  availability: Pick<FlowAvailability, 'flowAvailable' | 'starterAvailable'>,
  list: ShowcaseList = SHOWCASES,
): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const clip of showcasesFor(target, examples, list)) {
    let action: SearchActionDescriptor | undefined;
    if (clip.make.type === 'example') {
      action = { type: 'example', example: clip.exampleId };
    } else if (clip.make.type === 'flows') {
      action = flowsAction(
        clip.make.flowIds.filter((id) => availability.flowAvailable(id)),
        (clip.make.starterIds ?? []).filter((id) => availability.starterAvailable(id)),
      );
    }
    if (action === undefined) continue;
    out.push({
      id: entryIds.card(clip.id),
      source: 'tile',
      title: clip.title,
      sentence: clip.sentence,
      words: ['showcase', 'make'],
      available: true,
      action: asAction(action),
      preview: asPreview({ type: 'showcase', card: clip.id, example: clip.exampleId }),
    });
  }
  return out;
}
