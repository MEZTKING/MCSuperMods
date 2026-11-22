/**
 * A liquid (`msm:fluid`) as the Fluid Studio's Preview shows it (B615): the still, flowing,
 * overlay and bucket pictures with the tint, over a bundle-backed host, and its flow in words.
 *
 * @packageDocumentation
 */

import { FluidPictures } from '../../studios/blocks-items/FluidPicture';
import { LiveViewFrame } from '../frame/LiveViewFrame';
import type { LiveViewProps } from '../registry';
import { BundleHost } from './bundle-host';

/** The view; see the module comment. */
export default function FluidView(props: LiveViewProps) {
  return (
    <LiveViewFrame
      title="Liquid"
      fidelity="about_right"
      notes={['The first frame of each picture, tinted; the game animates and lights them.']}
    >
      <BundleHost
        project={props.project}
        readProject={props.readProject}
        vanillaAssets={props.vanillaAssets}
        models
      >
        <FluidPictures element={props.element} testId="live-fluid" />
      </BundleHost>
    </LiveViewFrame>
  );
}
