/**
 * **Try it on** (B610): a predicate tried in a situation you choose, or an item modifier tried on
 * an item you pick. The registry's entry for both kinds (`data/index.ts`) loads this file; each
 * view lives in its own folder.
 */

import type { LiveViewProps } from '../registry';
import ItemModifierView from './item-modifier/ItemModifierView';
import PredicateView from './predicate/PredicateView';

export default function TryItOn(props: LiveViewProps) {
  return props.element.kind === 'minecraft:item_modifier' ? (
    <ItemModifierView {...props} />
  ) : (
    <PredicateView {...props} />
  );
}
