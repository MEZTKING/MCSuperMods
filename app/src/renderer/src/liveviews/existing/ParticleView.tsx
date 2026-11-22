/**
 * A particle (`msm:particle`) as the Particle Studio plays it (B615): the 2D preview of its
 * frames, over a bundle-backed host, and its numbers in one line.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';
import { thingName } from '../../components/thing-picker/thing-sources';
import { ParticlePreview } from '../../studios/blocks-items/ParticlePreview';
import { particleFrames } from '../../studios/blocks-items/particle-model';
import { LiveViewFrame } from '../frame/LiveViewFrame';
import { factsOf } from '../frame/live-data';
import type { LiveViewProps } from '../registry';
import { BundleHost } from './bundle-host';

const isRecord = (value: Json | undefined): value is { [key: string]: Json } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The particle's frames, life and size in words. */
export function particleWords(name: string, data: Json): string {
  const object = isRecord(data) ? data : {};
  const frames = particleFrames(data).length;
  const parts = [`${frames} frame${frames === 1 ? '' : 's'}`];
  if (typeof object.lifetime === 'number') parts.push(`lives ${object.lifetime} ticks`);
  if (typeof object.size === 'number') parts.push(`size ${object.size}`);
  if (object.emissive === true) parts.push('glows');
  return `${name}: ${parts.join(', ')}.`;
}

/** The view; see the module comment. */
export default function ParticleView(props: LiveViewProps) {
  const { project, element } = props;
  return (
    <LiveViewFrame
      title="Particle"
      fidelity="about_right"
      notes={['Played by MSM in 2D: the game draws it in the world, facing you.']}
    >
      <p className="text-sm" data-testid="live-particle-words">
        {particleWords(thingName(project, element.id), element.data)}
      </p>
      <BundleHost
        project={project}
        readProject={props.readProject}
        vanillaAssets={props.vanillaAssets}
        models
      >
        <ParticlePreview data={element.data} target={factsOf(project) ?? undefined} />
      </BundleHost>
    </LiveViewFrame>
  );
}
