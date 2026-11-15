/**
 * The Vehicle Studio's short form for Very easy (B419, the plan's "Very easy wording"): "How
 * fast", "Needs fuel" with "What fuel?", "Has a cannon" (for a vehicle with a turret or a barrel),
 * "How many seats" and "Colour". No ids are shown except the fuel item's picker. Shown only in
 * Very easy, where it stands in for the full Studio.
 *
 * @packageDocumentation
 */

import { useId, useState } from 'react';
import { decodePicture } from '../../../components/texture-editor/png-canvas';
import { Button } from '../../../components/ui/Button';
import { inputClass } from '../../../forms';
import { textureLocations } from '../../../preview/model-chain';
import { asObject } from '../../blocks-items/blocks-items-model';
import { useBlocksItemsStudioHost } from '../../blocks-items/host';
import { CheckField } from '../../blocks-items/parts';
import { IdField } from '../../structures/pickers';
import { useVeryEasyLayout } from '../../very-easy';
import { Section } from '../../worldgen/parts';
import { encodeTexture } from './ModelSection';
import type { VehicleSectionProps } from './parts';
import {
  cannonIndex,
  cannonWeapon,
  effectiveSeatOffsets,
  FALLBACK_SPEED_CAP,
  geometryElement,
  geometryIdOf,
  geometryTextureSize,
  hasAsset,
  maxSpeedOf,
  seatsForCount,
  starterTexturePixels,
  TICKS_PER_SECOND,
  textureAssetOf,
  textureIdOf,
  textureWrite,
  tintPixels,
  weaponsOf,
} from './vehicle-model';

/** Whether "Has a cannon" is offered: the vehicle has a turret, a barrel bone or a cannon. */
export function offersCannon(data: unknown, bones: readonly string[] | null): boolean {
  const object = asObject(data as never);
  return (
    object.turret !== undefined ||
    cannonIndex(data as never) >= 0 ||
    (bones ?? []).some((bone) => /barrel|cannon|turret/i.test(bone))
  );
}

/** The "Basics" section of Very easy. */
export function BasicsSection(props: VehicleSectionProps) {
  const { data, set, replace, target, project, bones } = props;
  const host = useBlocksItemsStudioHost();
  const veryEasy = useVeryEasyLayout();
  const speedId = useId();
  const seatsId = useId();
  const colourId = useId();
  const [colour, setColour] = useState('#3c6edc');
  const [status, setStatus] = useState<string | null>(null);
  if (!veryEasy) return null;
  const cap = target.vehicles?.maxSpeed ?? FALLBACK_SPEED_CAP;
  const perSecond = Math.round(maxSpeedOf(data) * TICKS_PER_SECOND);
  const engine = asObject(asObject(data).engine);
  const fuel = asObject(engine.fuel);
  const fuelItems = Array.isArray(fuel.items) ? fuel.items : [];
  const firstFuel = asObject(fuelItems[0]).item;
  const cannon = cannonIndex(data);
  const seats = effectiveSeatOffsets(data).length;
  const textureId = textureIdOf(data);
  const paint = async () => {
    if (host?.applyChanges === undefined || textureId === '') return;
    const { namespace, path } = textureAssetOf(textureId);
    try {
      let pixels: Uint8ClampedArray;
      let size: { width: number; height: number };
      if (hasAsset(project, namespace, path) && host.modelPreview !== undefined) {
        const location = textureLocations(textureId, host.modelPreview.folders);
        const bytes = await host.modelPreview.readProjectAsset(
          location.namespace,
          location.projectPath,
        );
        if (bytes === null) throw new Error(`Cannot read ${textureId}.`);
        const image = await decodePicture(bytes);
        pixels = tintPixels(image.data, colour);
        size = { width: image.width, height: image.height };
      } else {
        size = geometryTextureSize(geometryElement(project, geometryIdOf(data))?.data);
        pixels = starterTexturePixels(size.width, size.height, colour);
      }
      const change = textureWrite(
        project,
        textureId,
        encodeTexture(size.width, size.height, pixels),
      );
      await host.applyChanges(change.items, 'Colour the vehicle', change.writes);
      setStatus('Painted. Undo puts the old colours back.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <Section title="Basics" testId="vehicle-basics">
      <div className="flex items-center gap-2 text-sm">
        <label htmlFor={speedId}>How fast</label>
        <input
          id={speedId}
          type="range"
          min={1}
          max={Math.round(cap * TICKS_PER_SECOND)}
          step={1}
          value={perSecond}
          data-testid="vehicle-basics-speed"
          onChange={(event) =>
            set(
              ['movement', 'max_speed'],
              Math.round((Number(event.target.value) / TICKS_PER_SECOND) * 1000) / 1000,
              'typing:/movement/max_speed',
            )
          }
        />
        <span className="text-muted text-xs">{perSecond} blocks a second</span>
      </div>
      <CheckField
        label="Needs fuel"
        checked={engine.fuel !== undefined}
        testId="vehicle-basics-fuel"
        onChange={(checked) =>
          set(
            ['engine', 'fuel'],
            checked ? { items: [{ item: 'minecraft:coal', ticks: 1200 }] } : undefined,
          )
        }
      />
      {engine.fuel !== undefined && (
        <div className="pl-6">
          <IdField
            label="What fuel?"
            value={typeof firstFuel === 'string' ? firstFuel : ''}
            registry="item"
            suggest={props.suggest}
            testId="vehicle-basics-fuel-item"
            onCommit={(text) =>
              set(
                ['engine', 'fuel', 'items'],
                [
                  {
                    ...asObject(fuelItems[0]),
                    item: text,
                    ticks: asObject(fuelItems[0]).ticks ?? 1200,
                  },
                  ...fuelItems.slice(1),
                ],
              )
            }
          />
        </div>
      )}
      {offersCannon(data, bones) && (
        <CheckField
          label="Has a cannon"
          checked={cannon >= 0}
          testId="vehicle-basics-cannon"
          onChange={(checked) => {
            const weapons = weaponsOf(data);
            if (checked) set(['weapons'], [...weapons, cannonWeapon(data)]);
            else {
              const next = weapons.filter((_, at) => at !== cannon);
              set(['weapons'], next.length === 0 ? undefined : next);
            }
          }}
        />
      )}
      <div className="flex items-center gap-2 text-sm">
        <label htmlFor={seatsId}>How many seats</label>
        <select
          id={seatsId}
          className={inputClass}
          data-testid="vehicle-basics-seats"
          value={seats}
          onChange={(event) =>
            replace({ ...asObject(data), seats: seatsForCount(data, Number(event.target.value)) })
          }
        >
          {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <label htmlFor={colourId}>Colour</label>
        <input
          id={colourId}
          type="color"
          className="h-7 w-12"
          data-testid="vehicle-basics-colour"
          value={colour}
          onChange={(event) => setColour(event.target.value)}
        />
        <Button
          className="text-xs"
          data-testid="vehicle-basics-paint"
          disabled={host?.applyChanges === undefined || textureId === ''}
          onClick={() => void paint()}
        >
          Paint it
        </Button>
      </div>
      {status !== null && (
        <p role="status" className="text-muted text-xs">
          {status}
        </p>
      )}
    </Section>
  );
}
