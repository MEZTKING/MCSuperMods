/**
 * The Vehicle Studio's "Preview" section (B419, ADR 0091 D1): the lazy 3D canvas with the
 * "Drive" and "Steer" sliders, the turret's aim read out in words, and the markers' legend. The
 * canvas needs the host's model preview (folders and project assets) and a geometry of this
 * project; otherwise the section says what is missing.
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/core';
import { lazy, type ReactNode, Suspense, useId, useMemo, useState } from 'react';
import { vehicleRig } from '../../../preview/geo/vehicle-pose';
import { asObject } from '../../blocks-items/blocks-items-model';
import { useBlocksItemsStudioHost } from '../../blocks-items/host';
import { Section } from '../../worldgen/parts';
import type { VehicleMarker } from './VehicleCanvas';
import {
  effectiveSeatOffsets,
  geometryElement,
  geometryIdOf,
  maxSpeedOf,
  textureIdOf,
  weaponsOf,
} from './vehicle-model';

const VehicleCanvas = lazy(() => import('./VehicleCanvas'));

/** The turret's yaw in words: "ahead", "30° right", "45° left". */
export function aimWords(yaw: number): string {
  const rounded = Math.round(yaw);
  if (rounded === 0) return 'ahead';
  if (Math.abs(rounded) === 180) return 'behind';
  return `${Math.abs(rounded)}° ${rounded > 0 ? 'right' : 'left'}`;
}

/** The markers of seats, muzzles and the exhaust. */
export function vehicleMarkers(data: Json | undefined): VehicleMarker[] {
  const markers: VehicleMarker[] = effectiveSeatOffsets(data).map((offset, index) => ({
    key: `seat-${index}`,
    label: `Seat ${index + 1}`,
    offset,
    kind: 'seat',
  }));
  weaponsOf(data).forEach((weapon, index) => {
    const muzzle = asObject(asObject(weapon).muzzle);
    const offset = muzzle.offset;
    if (!Array.isArray(offset) || offset.length !== 3) return;
    const [x, y, z] = offset.map((value) => (typeof value === 'number' ? value : 0)) as [
      number,
      number,
      number,
    ];
    const id = asObject(weapon).id;
    markers.push({
      key: `muzzle-${index}`,
      label: `Muzzle of ${typeof id === 'string' ? id : `weapon ${index + 1}`}`,
      offset: [x, y, z],
      bone: typeof muzzle.bone === 'string' ? muzzle.bone : undefined,
      kind: 'muzzle',
    });
  });
  const exhaust = asObject(asObject(data).exhaust).offset;
  if (Array.isArray(exhaust) && exhaust.length === 3) {
    const [x, y, z] = exhaust.map((value) => (typeof value === 'number' ? value : 0)) as [
      number,
      number,
      number,
    ];
    markers.push({ key: 'exhaust', label: 'Exhaust', offset: [x, y, z], kind: 'exhaust' });
  }
  return markers;
}

function Slider(props: {
  label: string;
  value: number;
  onChange(value: number): void;
  testId: string;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2 text-xs">
      <label htmlFor={id} className="w-10 text-muted">
        {props.label}
      </label>
      <input
        id={id}
        type="range"
        min={-1}
        max={1}
        step={0.05}
        value={props.value}
        data-testid={props.testId}
        onChange={(event) => props.onChange(Number(event.target.value))}
        onDoubleClick={() => props.onChange(0)}
      />
    </div>
  );
}

/** The "Preview" section. */
export function VehiclePreview(props: { project: Project; elementId: string; data: Json }) {
  const { project, data } = props;
  const host = useBlocksItemsStudioHost();
  const [throttle, setThrottle] = useState(0);
  const [steer, setSteer] = useState(0);
  const [aim, setAim] = useState(0);
  const geometryId = geometryIdOf(data);
  const geometry = geometryElement(project, geometryId);
  const rigKey = JSON.stringify([asObject(data).turret ?? null, asObject(data).parts ?? null]);
  const rig = useMemo(() => vehicleRig(data), [rigKey]);
  const markerKey = JSON.stringify([
    asObject(data).seats ?? null,
    asObject(data).weapons ?? null,
    asObject(data).exhaust ?? null,
    asObject(data).size ?? null,
  ]);
  const markers = useMemo(() => vehicleMarkers(data), [markerKey]);
  const scaleValue = asObject(asObject(data).model).scale;
  const scale = typeof scaleValue === 'number' && scaleValue > 0 ? scaleValue : 1;
  const preview = host?.modelPreview;

  let body: ReactNode;
  if (geometry === undefined) {
    body = (
      <p className="text-muted text-xs" data-testid="vehicle-preview-message">
        {geometryId === ''
          ? 'Pick a model, or make a starter model under "Model and paint", to see the vehicle here.'
          : `Geo model ${geometryId} is not in the project, so there is nothing to draw.`}
      </p>
    );
  } else if (preview === undefined) {
    body = (
      <p className="text-muted text-xs" data-testid="vehicle-preview-message">
        The 3D preview is not available here.
      </p>
    );
  } else {
    body = (
      <Suspense fallback={<p className="text-muted text-xs">Loading the preview…</p>}>
        <VehicleCanvas
          geometry={geometry.data}
          textureId={textureIdOf(data)}
          scale={scale}
          rig={rig}
          markers={markers}
          throttle={throttle}
          steer={steer}
          maxSpeed={maxSpeedOf(data)}
          folders={preview.folders}
          readProjectAsset={preview.readProjectAsset}
          revision={host?.revision ?? 0}
          onAim={setAim}
          label={`3D preview of ${props.elementId}. Drag to turn the view; move the mouse to aim the turret.`}
        />
      </Suspense>
    );
  }

  return (
    <Section title="Preview" testId="vehicle-preview">
      {body}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Slider label="Drive" value={throttle} onChange={setThrottle} testId="vehicle-drive" />
        <Slider label="Steer" value={steer} onChange={setSteer} testId="vehicle-steer" />
        {rig.turret !== null && (
          <span className="text-muted text-xs" data-testid="vehicle-preview-turret">
            Turret: {aimWords(aim)}
          </span>
        )}
      </div>
      <p className="text-muted text-xs">
        Move the mouse over the vehicle to aim the turret; Drive spins the wheels, rotors and
        propellers. Numbered dots are seats, red dots muzzles, the grey dot the exhaust.
      </p>
    </Section>
  );
}
