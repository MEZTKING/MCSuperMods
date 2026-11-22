/**
 * A vehicle (`msm:vehicle`) as the Vehicle Studio's Preview section draws it (B615): the 3D
 * canvas with Drive and Steer, over a bundle-backed host, and its numbers in one line.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';
import { thingName } from '../../components/thing-picker/thing-sources';
import { VehiclePreview } from '../../studios/entities/vehicle/VehiclePreview';
import {
  effectiveSeatOffsets,
  maxSpeedOf,
  weaponsOf,
} from '../../studios/entities/vehicle/vehicle-model';
import { LiveViewFrame } from '../frame/LiveViewFrame';
import type { LiveViewProps } from '../registry';
import { BundleHost } from './bundle-host';

/** The vehicle's seats, weapons and top speed in words. */
export function vehicleWords(name: string, data: Json): string {
  const seats = effectiveSeatOffsets(data).length;
  const weapons = weaponsOf(data).length;
  const parts = [
    `${seats} seat${seats === 1 ? '' : 's'}`,
    ...(weapons > 0 ? [`${weapons} weapon${weapons === 1 ? '' : 's'}`] : []),
    `top speed ${maxSpeedOf(data)}`,
  ];
  return `${name}: ${parts.join(', ')}.`;
}

/** The view; see the module comment. */
export default function VehicleView(props: LiveViewProps) {
  const { project, element } = props;
  return (
    <LiveViewFrame
      title="Vehicle"
      fidelity="about_right"
      notes={['Drawn by MSM: how it drives in the game is not simulated. Play is the real check.']}
    >
      <p className="text-sm" data-testid="live-vehicle-words">
        {vehicleWords(thingName(project, element.id), element.data)}
      </p>
      <BundleHost
        project={project}
        readProject={props.readProject}
        vanillaAssets={props.vanillaAssets}
      >
        <VehiclePreview project={project} elementId={element.id} data={element.data} />
      </BundleHost>
    </LiveViewFrame>
  );
}
