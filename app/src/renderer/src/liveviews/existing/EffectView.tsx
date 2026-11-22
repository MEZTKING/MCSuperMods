/**
 * A status effect (`msm:effect`) as the Effect Studio's Preview shows it (B615): the icon, the
 * name in its category's colour and levels I and II in words, over a bundle-backed host.
 *
 * @packageDocumentation
 */

import type { Element } from '@msm/plugin-api';
import { EffectPreviewCard, useIconThumbnail } from '../../studios/blocks-items/EffectPreview';
import { effectIconPath } from '../../studios/blocks-items/effect-model';
import { LiveViewFrame } from '../frame/LiveViewFrame';
import type { LiveViewProps } from '../registry';
import { BundleHost } from './bundle-host';

function Card({ element }: { element: Element }) {
  const icon = useIconThumbnail(effectIconPath(element.id).assetPath, true);
  return <EffectPreviewCard element={element} iconUrl={icon} testId="live-effect" />;
}

/** The view; see the module comment. */
export default function EffectView(props: LiveViewProps) {
  return (
    <LiveViewFrame
      title="Status effect"
      fidelity="about_right"
      notes={['What it does each tick is listed, not played.']}
    >
      <BundleHost
        project={props.project}
        readProject={props.readProject}
        vanillaAssets={props.vanillaAssets}
        models
      >
        <Card element={props.element} />
      </BundleHost>
    </LiveViewFrame>
  );
}
