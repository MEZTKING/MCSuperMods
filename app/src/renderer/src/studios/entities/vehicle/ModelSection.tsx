/**
 * The Vehicle Studio's "Model and paint" section (B419, ADR 0091 D1, ADR 0090 D10, D12): the geo
 * model, texture and animation set pickers, the render scale, "Make a starter model" (a shape
 * from `vehicleGeometry` and one colour, one undo step through the host's `applyChanges`), "Paint
 * the texture" in the texture editor, and the paints (id, texture, dye).
 *
 * @packageDocumentation
 */

import { VEHICLE_SHAPES, type VehicleShape } from '@msm/plugin-entities';
import { Paintbrush, Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { encodePicture } from '../../../components/texture-editor/png-canvas';
import { Button, iconButtonClass } from '../../../components/ui/Button';
import { inputClass } from '../../../forms';
import { typingKey } from '../../../forms/context';
import { asObject, pointerOf } from '../../blocks-items/blocks-items-model';
import { useBlocksItemsStudioHost } from '../../blocks-items/host';
import { ProblemsAt } from '../../blocks-items/parts';
import { SelectField } from '../../structures/pickers';
import { Section } from '../../worldgen/parts';
import { ANIMATION_KIND, elementIdsOfKind, projectTextureIds } from '../entities-model';
import { IdAt, NumberAt, type VehicleSectionProps } from './parts';
import {
  GEO_MODEL_KIND,
  geometryElement,
  geometryIdOf,
  geometryTextureSize,
  SHAPE_COLOURS,
  SHAPE_LABELS,
  starterModelPlan,
  suggestedShape,
  textureAssetOf,
  textureIdOf,
} from './vehicle-model';

/** PNG bytes of RGBA pixels, through a canvas (the texture editor's encoder). */
export function encodeTexture(
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
): Uint8Array {
  return encodePicture({ width, height, data: pixels });
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** "Make a starter model": a shape, a colour and the button. */
function StarterModel(props: VehicleSectionProps) {
  const host = useBlocksItemsStudioHost();
  const apply = host?.applyChanges;
  const [shape, setShape] = useState<VehicleShape>(() => suggestedShape(props.data));
  const [colour, setColour] = useState<string>(SHAPE_COLOURS[shape]);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const shapeId = useId();
  const colourId = useId();
  const existing = geometryElement(props.project, geometryIdOf(props.data));
  const make = async () => {
    const element = props.project.namespaces
      .flatMap((namespace) => namespace.elements)
      .find((entry) => entry.id === props.elementId);
    if (element === undefined || apply === undefined) return;
    try {
      const plan = starterModelPlan(props.project, element, shape, colour, encodeTexture);
      await apply(plan.items, plan.label, plan.writes);
      setStatus({
        text: `Made ${plan.geometryId} with a ${SHAPE_LABELS[shape].toLowerCase()} shape and painted ${plan.textureId}. Undo takes it back.`,
        error: false,
      });
    } catch (error) {
      setStatus({ text: messageOf(error), error: true });
    }
  };
  return (
    <div
      className="flex flex-col gap-1 rounded border border-border p-2"
      data-testid="vehicle-starter-model"
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-col gap-0.5 text-xs">
          <label htmlFor={shapeId} className="text-muted">
            Starter shape
          </label>
          <select
            id={shapeId}
            className={inputClass}
            data-testid="vehicle-starter-shape"
            value={shape}
            onChange={(event) => {
              const next = event.target.value as VehicleShape;
              setShape(next);
              setColour(SHAPE_COLOURS[next]);
            }}
          >
            {VEHICLE_SHAPES.map((entry) => (
              <option key={entry} value={entry}>
                {SHAPE_LABELS[entry]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-0.5 text-xs">
          <label htmlFor={colourId} className="text-muted">
            Colour
          </label>
          <input
            id={colourId}
            type="color"
            className="h-7 w-12"
            data-testid="vehicle-starter-colour"
            value={colour}
            onChange={(event) => setColour(event.target.value)}
          />
        </div>
        <Button
          className="text-xs"
          data-testid="vehicle-make-starter-model"
          disabled={apply === undefined}
          title={
            apply === undefined ? 'Needs the full app (it writes a model and a picture)' : undefined
          }
          onClick={() => void make()}
        >
          {existing === undefined ? 'Make a starter model' : 'Replace with a starter model'}
        </Button>
      </div>
      <p className="text-muted text-xs">
        Plain boxes drawn for MSM, with the bones the parts below can turn. Repaint the picture
        later, or import your own model from Blockbench.
      </p>
      {status !== null && (
        <p
          role="status"
          className={`text-xs ${status.error ? 'text-error' : 'text-muted'}`}
          data-testid="vehicle-starter-status"
        >
          {status.text}
        </p>
      )}
    </div>
  );
}

/** The "Model and paint" section. */
export function ModelSection(props: VehicleSectionProps) {
  const { project, data, set, problems } = props;
  const host = useBlocksItemsStudioHost();
  const model = asObject(asObject(data).model);
  const geometryId = geometryIdOf(data);
  const textureId = textureIdOf(data);
  const textures = projectTextureIds(project);
  const paints = Array.isArray(model.paints) ? model.paints : [];
  const geometry = geometryElement(project, geometryId);
  const paint = () => {
    if (host === null || textureId === '') return;
    const { namespace, path } = textureAssetOf(textureId);
    host.paintTexture(namespace, path, geometryTextureSize(geometry?.data));
  };
  return (
    <Section title="Model and paint" testId="vehicle-model">
      <div className="flex flex-wrap items-end gap-2">
        <SelectField
          label="Model"
          value={geometryId === '' ? undefined : geometryId}
          choices={elementIdsOfKind(project, GEO_MODEL_KIND)}
          emptyLabel="(choose a geo model)"
          testId="vehicle-geometry"
          onChange={(value) => set(['model', 'geometry'], value ?? '')}
        />
        <SelectField
          label="Texture"
          value={textureId === '' ? undefined : textureId}
          choices={textures}
          emptyLabel="(choose a texture)"
          testId="vehicle-texture"
          onChange={(value) => set(['model', 'texture'], value ?? '')}
        />
        <button
          type="button"
          className={iconButtonClass}
          aria-label="Paint the texture"
          title={textureId === '' ? 'Choose a texture first' : `Paint ${textureId}`}
          data-testid="vehicle-paint-texture"
          disabled={host === null || textureId === ''}
          onClick={paint}
        >
          <Paintbrush size={12} aria-hidden />
        </button>
        <SelectField
          label="Animation set"
          value={typeof model.animations === 'string' ? model.animations : undefined}
          choices={elementIdsOfKind(project, ANIMATION_KIND)}
          emptyLabel="(none)"
          testId="vehicle-animations"
          onChange={(value) => set(['model', 'animations'], value)}
        />
        <NumberAt section={props} path={['model', 'scale']} label="Scale" testId="vehicle-scale" />
      </div>
      <ProblemsAt problems={problems} pointer="/model" />
      {(['geometry', 'texture', 'animations', 'scale'] as const).map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={pointerOf(['model', key])} />
      ))}
      <p className="text-muted text-xs">
        Vehicles are drawn by MSM’s own renderer on every version, without GeckoLib. An animation
        set may have “idle” and “moving”.
      </p>
      {/* Keyed by the vehicle: the shape, colour and status start again for another vehicle. */}
      <StarterModel key={props.elementId} {...props} />
      <fieldset className="flex flex-col gap-1 text-xs" data-testid="vehicle-paints">
        <legend className="text-muted">Paints (a dye switches to another texture)</legend>
        {paints.length === 0 && <p className="text-muted">No paints.</p>}
        {paints.map((entry, index) => {
          const paintObject = asObject(entry);
          return (
            <div
              key={index}
              className="flex flex-wrap items-end gap-2"
              data-testid={`vehicle-paint-${index}`}
            >
              <div className="flex flex-col gap-0.5">
                <label className="text-muted" htmlFor={`paint-${index}-id`}>
                  Paint id
                </label>
                <input
                  id={`paint-${index}-id`}
                  className={`${inputClass} w-24 font-mono`}
                  data-testid={`vehicle-paint-${index}-id`}
                  value={typeof paintObject.id === 'string' ? paintObject.id : ''}
                  onChange={(event) =>
                    set(
                      ['model', 'paints', index, 'id'],
                      event.target.value,
                      typingKey(`/model/paints/${index}/id`),
                    )
                  }
                />
              </div>
              <SelectField
                label="Texture"
                value={typeof paintObject.texture === 'string' ? paintObject.texture : undefined}
                choices={textures}
                emptyLabel="(choose a texture)"
                testId={`vehicle-paint-${index}-texture`}
                onChange={(value) => set(['model', 'paints', index, 'texture'], value ?? '')}
              />
              <IdAt
                section={props}
                path={['model', 'paints', index, 'dye']}
                label="Dye item"
                registry="item"
                testId={`vehicle-paint-${index}-dye`}
              />
              <button
                type="button"
                className={iconButtonClass}
                aria-label={`Remove paint ${index + 1}`}
                onClick={() => {
                  const next = paints.filter((_, at) => at !== index);
                  set(['model', 'paints'], next.length === 0 ? undefined : next);
                }}
              >
                <X size={12} aria-hidden />
              </button>
              <ProblemsAt problems={problems} pointer={pointerOf(['model', 'paints', index])} />
            </div>
          );
        })}
        <Button
          className="self-start text-xs"
          data-testid="vehicle-add-paint"
          disabled={paints.length >= 16}
          onClick={() =>
            set(
              ['model', 'paints'],
              [
                ...paints,
                {
                  id: `paint_${paints.length + 1}`,
                  texture: textureId === '' ? '' : `${textureId}_${paints.length + 1}`,
                  dye: 'minecraft:red_dye',
                },
              ],
            )
          }
        >
          <Plus size={12} aria-hidden />
          Add a paint
        </Button>
      </fieldset>
    </Section>
  );
}
