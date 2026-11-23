/**
 * A mob variant (ADR 0121 D4; B620 stub, B627 builds the body). Until then the six variants keep
 * B615's flat pictures (`existing/SkinView`), and the zombie nautilus says "not yet".
 */

import SkinView from '../../existing/SkinView';
import { NotYet } from '../../frame/LiveViewFrame';
import type { LiveViewProps } from '../../registry';

export default function VariantView(props: LiveViewProps) {
  if (props.element.kind === 'minecraft:zombie_nautilus_variant') {
    return <NotYet title="Zombie nautilus variant" brief="B627" />;
  }
  return <SkinView {...props} />;
}
