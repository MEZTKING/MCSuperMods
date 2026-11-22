/**
 * Trades (a villager profession, a trade set, a villager trade or a villager trade tag) on Try
 * it's merchant screen (B615; `merchant-model.ts`).
 *
 * @packageDocumentation
 */

import { LiveViewFrame } from '../frame/LiveViewFrame';
import type { LiveViewProps } from '../registry';
import { MerchantPart } from './MerchantPart';

const TITLES: Readonly<Record<string, string>> = {
  'msm:villager_profession': 'Village job',
  'minecraft:trade_set': 'Trade set',
  'minecraft:villager_trade': 'Villager trade',
  'minecraft:tag/villager_trade': 'Villager trades',
};

/** The view; see the module comment. */
export default function MerchantView(props: LiveViewProps) {
  return (
    <LiveViewFrame
      title={TITLES[props.element.kind] ?? 'Trades'}
      fidelity="about_right"
      notes={[
        'Offers are drawn as the game draws them, with MSM’s own random numbers: yours in the game will differ.',
      ]}
    >
      <MerchantPart project={props.project} element={props.element} testId="live-merchant" />
    </LiveViewFrame>
  );
}
