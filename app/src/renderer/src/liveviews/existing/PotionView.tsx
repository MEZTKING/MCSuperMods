/**
 * A potion (`msm:potion`) as the Potion Studio's Preview shows it (B615): the names of the
 * potion, splash, lingering and arrow items and the ids the potion adds.
 *
 * @packageDocumentation
 */

import { PotionNames } from '../../studios/blocks-items/PotionNames';
import { LiveViewFrame } from '../frame/LiveViewFrame';
import type { LiveViewProps } from '../registry';

/** The view; see the module comment. */
export default function PotionView(props: LiveViewProps) {
  return (
    <LiveViewFrame
      title="Potion"
      fidelity="about_right"
      notes={['Potions need the Fabric mod export: vanilla data packs leave them out.']}
    >
      <PotionNames element={props.element} testId="live-potion" />
    </LiveViewFrame>
  );
}
