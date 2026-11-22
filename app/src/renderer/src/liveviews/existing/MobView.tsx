/**
 * A mob (`msm:entity`) as the preview panel draws it (B615): the geo renderer over the mob's geo
 * model, texture and animations (`resolveGeoScene`), the variant and baby switcher, its numbers
 * in one line, and, for a trader, Try it's merchant screen.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';
import { lazy, Suspense, useState } from 'react';
import { thingName } from '../../components/thing-picker/thing-sources';
import { EntityPreviewOptions } from '../../preview/geo/EntityPreviewOptions';
import {
  entityPreviewChoices,
  type GeoSceneOptions,
  resolveGeoScene,
} from '../../preview/geo/subject';
import { hasWebGL } from '../../preview/webgl';
import { resourceFoldersOf } from '../frame/item-picture';
import { LiveViewFrame } from '../frame/LiveViewFrame';
import type { LiveViewProps } from '../registry';
import { assetReader } from './bundle-host';

/** The merchant screen, loaded only for a trader (it lowers the project's trade files). */
const MerchantPart = lazy(() =>
  import('./MerchantPart').then((module) => ({ default: module.MerchantPart })),
);

const isRecordOf = (value: unknown): value is { [key: string]: unknown } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether an `msm:entity`'s data has `msm:trader`. */
function isTraderMob(data: unknown): boolean {
  return (
    isRecordOf(data) && isRecordOf(data.components) && isRecordOf(data.components['msm:trader'])
  );
}

const GeoCanvas = lazy(() => import('../../preview/geo/GeoCanvas'));

const isRecord = (value: Json | undefined): value is { [key: string]: Json } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The mob's numbers in words: health, speed, attack, where it spawns. */
export function mobWords(name: string, data: Json): string {
  const object = isRecord(data) ? data : {};
  const components = isRecord(object.components) ? object.components : {};
  const parts: string[] = [];
  const health = isRecord(components['msm:health']) ? components['msm:health'].max : undefined;
  if (typeof health === 'number') parts.push(`${health} health`);
  const speed = isRecord(components['msm:movement']) ? components['msm:movement'].speed : undefined;
  if (typeof speed === 'number') parts.push(`speed ${speed}`);
  const attack = isRecord(components['msm:attack']) ? components['msm:attack'].damage : undefined;
  if (typeof attack === 'number') parts.push(`${attack} attack damage`);
  const spawn = isRecord(object.spawn) ? object.spawn.biomes : undefined;
  if (Array.isArray(spawn) && spawn.length > 0)
    parts.push(`spawns in ${spawn.length} biome${spawn.length === 1 ? '' : 's'}`);
  if (isRecord(components['msm:trader'])) parts.push('trades');
  return parts.length === 0 ? name : `${name}: ${parts.join(', ')}.`;
}

/** The view; see the module comment. */
export default function MobView(props: LiveViewProps) {
  const { project, element } = props;
  const [options, setOptions] = useState<GeoSceneOptions>({});
  const folders = resourceFoldersOf(project);
  const scene = resolveGeoScene(
    project,
    { previewKind: 'entity', id: element.id, data: element.data },
    options,
  );
  const name = thingName(project, element.id);
  const webgl = hasWebGL();
  return (
    <LiveViewFrame
      title="Mob"
      fidelity="about_right"
      notes={[
        'Drawn by MSM’s own model renderer: the game’s light, shadows and behaviour are not shown. Play is the real check.',
      ]}
    >
      <p className="text-sm" data-testid="live-mob-words">
        {mobWords(name, element.data)}
      </p>
      <EntityPreviewOptions
        choices={entityPreviewChoices(element.data)}
        value={options}
        onChange={setOptions}
      />
      {!scene.ok ? (
        <p role="status" data-testid="live-mob-message" className="text-sm text-muted">
          {scene.message}
        </p>
      ) : !webgl || folders === null ? (
        <p role="status" className="text-sm text-muted" data-testid="live-mob-message">
          {`Model ${scene.modelId}. The 3D preview is unavailable: WebGL is disabled.`}
        </p>
      ) : (
        <div className="h-72 w-full max-w-md" data-testid="live-mob-canvas">
          <Suspense fallback={<p className="text-sm text-muted">Loading preview…</p>}>
            <GeoCanvas
              scene={scene}
              subjectId={element.id}
              folders={folders}
              readProjectAsset={assetReader(props.readProject)}
            />
          </Suspense>
        </div>
      )}
      {isTraderMob(element.data) && (
        <Suspense fallback={<p className="text-sm text-muted">Reading the trades…</p>}>
          <MerchantPart project={project} element={element} testId="live-mob-merchant" />
        </Suspense>
      )}
    </LiveViewFrame>
  );
}
