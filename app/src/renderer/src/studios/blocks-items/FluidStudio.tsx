/**
 * Fluid Studio (ADR 0099 D1, ADR 0101 D1) for `msm:fluid` element data, loaded lazily:
 *
 * - "Preview": the still and flowing pictures with the tint multiplied over them (the overlay and
 *   the bucket beside them), vanilla water's or lava's pictures from the user's game where the
 *   fluid has none of its own (`fluid-model.ts`).
 * - "Liquid": names (the liquid and its bucket), what it behaves like, the colour, light and
 *   explosion resistance.
 * - "Flow": sliders in blocks a second and blocks, and whether two sources make a new one, with
 *   the defaults of "Behaves like" shown while a field is unset.
 * - "Pictures": the still, flowing, overlay and bucket pictures.
 * - "Something inside": the event fired while a mob or player is in the liquid.
 *
 * Everything else stays behind "Advanced (all fields)".
 *
 * @packageDocumentation
 */

import { FLUID_FLOW_DEFAULTS, fluidBucketId } from '@msm/plugin-blocks-items';
import { useEffect, useId, useState } from 'react';
import { pngDataUrl } from '../../components/AssetList';
import { Button } from '../../components/ui/Button';
import { inputClass } from '../../forms';
import { typingKey } from '../../forms/context';
import { IdField, NumberField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { AdvancedToggle, Section } from '../worldgen/parts';
import { asObject, pathSetter, pointerOf } from './blocks-items-model';
import {
  FLOW_RANGES,
  FLUID_BEHAVIOUR_LABELS,
  FLUID_BEHAVIOURS,
  type FluidPicture,
  fluidPreviewOf,
  pictureAssetPath,
  speedWords,
  spreadWords,
  tintFromColour,
} from './fluid-model';
import { useBlocksItemsStudioHost } from './host';
import { CheckField, EventSelect, ProblemsAt, TextField } from './parts';

const PICTURE_SIZE = 64;

/** The picture of `texture` as a data URL: a project thumbnail, or vanilla's from the game. */
function usePicture(texture: string): string | null {
  const host = useBlocksItemsStudioHost();
  const [url, setUrl] = useState<string | null>(null);
  const thumbnail = host?.thumbnail;
  const vanilla = host?.modelPreview?.vanilla ?? null;
  const revision = host?.revision ?? 0;
  const path = pictureAssetPath(texture);
  useEffect(() => {
    void revision;
    setUrl(null);
    const load = path.startsWith('assets/minecraft/')
      ? vanilla === null
        ? undefined
        : () => vanilla.readAsset(path)
      : thumbnail === undefined
        ? undefined
        : () => thumbnail(path, PICTURE_SIZE);
    if (load === undefined) return;
    let live = true;
    load().then(
      (bytes) => {
        if (live && bytes !== null) setUrl(pngDataUrl(bytes));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [thumbnail, vanilla, path, revision]);
  return url;
}

/** One tile of the preview: the picture's first frame with the tint multiplied over it. */
export function FluidTile(props: {
  label: string;
  picture: FluidPicture;
  tint: string | undefined;
  testId: string;
}) {
  const url = usePicture(props.picture.texture);
  return (
    <figure className="flex flex-col items-center gap-1" data-testid={props.testId}>
      <div
        className="relative size-16 overflow-hidden border border-border bg-bg"
        data-testid={`${props.testId}-picture`}
        data-texture={props.picture.texture}
      >
        {url !== null && (
          <img
            alt=""
            src={url}
            className="absolute inset-0 size-16 object-cover object-top [image-rendering:pixelated]"
          />
        )}
        {props.tint !== undefined && (
          <div
            aria-hidden
            className="absolute inset-0"
            data-testid={`${props.testId}-tint`}
            style={{ backgroundColor: props.tint, mixBlendMode: 'multiply' }}
          />
        )}
      </div>
      <figcaption className="text-center text-muted text-xs">
        {props.label}
        {props.picture.fallback ? ' (from your game)' : ''}
      </figcaption>
    </figure>
  );
}

/** A labelled slider over a whole number. */
function Slider(props: {
  label: string;
  words: string;
  value: number;
  min: number;
  max: number;
  testId: string;
  onChange(value: number): void;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <label htmlFor={id} className="text-muted">
        {props.label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="range"
          min={props.min}
          max={props.max}
          step={1}
          value={props.value}
          data-testid={props.testId}
          onChange={(event) => props.onChange(Number(event.target.value))}
        />
        <span data-testid={`${props.testId}-words`}>{props.words}</span>
      </div>
    </div>
  );
}

/** The Fluid Studio. */
export default function FluidStudio(props: StudioProps) {
  const { element, problems, suggest, onChange, target } = props;
  const [advanced, setAdvanced] = useState(false);
  const behaviourId = useId();
  const colourId = useId();
  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  const at = (path: readonly (string | number)[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );

  if (advanced) {
    return (
      <section aria-label="Fluid Studio" data-testid="fluid-studio" className="flex flex-col gap-3">
        <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="fluid-advanced-toggle" />
        {props.form}
      </section>
    );
  }

  const preview = fluidPreviewOf(element.data);
  const flow = asObject(data.flow);
  const defaults = FLUID_FLOW_DEFAULTS[preview.behaviour];
  const name =
    typeof data.display_name === 'string' && data.display_name.trim() !== ''
      ? data.display_name
      : 'Liquid';
  let bucketId = '';
  try {
    bucketId = fluidBucketId(element.id);
  } catch {
    bucketId = '';
  }
  const events = Object.keys(asObject(data.events));
  /** Sets one flow field; removes `flow` when nothing is left. */
  const setFlow = (key: string, value: number | boolean | undefined) => {
    const rest = { ...flow };
    if (value === undefined) delete rest[key];
    else rest[key] = value;
    if (Object.keys(rest).length === 0) set(['flow'], undefined);
    else set(['flow', key], value, typingKey(pointerOf(['flow', key])));
  };
  const texture = (slot: 'still' | 'flowing' | 'overlay' | 'bucket') => {
    const value = asObject(data.textures)[slot];
    return typeof value === 'string' ? value : '';
  };
  const setTexture = (slot: string, value: string) => {
    const textures = { ...asObject(data.textures) };
    if (value === '') delete textures[slot];
    else textures[slot] = value;
    set(['textures'], Object.keys(textures).length === 0 ? undefined : textures);
  };

  const previewSection = (
    <Section title="Preview" testId="fluid-preview">
      <div className="flex flex-wrap gap-3">
        <FluidTile
          label="Still"
          picture={preview.still}
          tint={preview.tint}
          testId="fluid-preview-still"
        />
        <FluidTile
          label="Flowing"
          picture={preview.flowing}
          tint={preview.tint}
          testId="fluid-preview-flowing"
        />
        {preview.overlay !== undefined && (
          <FluidTile
            label="Overlay"
            picture={preview.overlay}
            tint={preview.tint}
            testId="fluid-preview-overlay"
          />
        )}
        <FluidTile
          label="Bucket"
          picture={preview.bucket}
          tint={undefined}
          testId="fluid-preview-bucket"
        />
      </div>
      <p className="text-muted text-xs" data-testid="fluid-preview-words">
        {`${name} flows ${speedWords(preview.flow.tickDelay)} and ${fluidSpreadWords(
          preview.flow.dropOff,
        )}${preview.light > 0 ? `, with light level ${preview.light}` : ''}.`}
      </p>
      {target.blocks?.fluidModel === 'two_fluids' && (
        <p className="text-muted text-xs" data-testid="fluid-two-fluids">
          Minecraft {target.mcVersion} keeps still and flowing liquid apart; both are made for you.
        </p>
      )}
    </Section>
  );

  const liquid = (
    <Section title="Liquid" testId="fluid-liquid">
      <TextField
        label="Name"
        value={data.display_name}
        testId="fluid-name"
        placeholder="Swamp Water"
        onCommit={(value) => set(['display_name'], value, typingKey('/display_name'))}
      />
      {at(['display_name'])}
      <TextField
        label="Bucket name"
        value={data.bucket_display_name}
        testId="fluid-bucket-name"
        placeholder={`${name} Bucket`}
        onCommit={(value) => set(['bucket_display_name'], value, typingKey('/bucket_display_name'))}
      />
      {bucketId !== '' && (
        <p className="text-muted text-xs" data-testid="fluid-also-makes">
          Also makes: {bucketId}
        </p>
      )}
      <div className="flex min-w-0 flex-col gap-0.5 text-xs">
        <label htmlFor={behaviourId} className="text-muted">
          Behaves like
        </label>
        <select
          id={behaviourId}
          className={inputClass}
          data-testid="fluid-behaves-like"
          value={preview.behaviour}
          onChange={(event) =>
            set(['behaves_like'], event.target.value === 'water' ? undefined : event.target.value)
          }
        >
          {FLUID_BEHAVIOURS.map((value) => (
            <option key={value} value={value}>
              {FLUID_BEHAVIOUR_LABELS[value]}
            </option>
          ))}
        </select>
      </div>
      {at(['behaves_like'])}
      <div className="flex flex-wrap items-end gap-2">
        <CheckField
          label="Coloured"
          checked={preview.tint !== undefined}
          testId="fluid-tint-on"
          onChange={(checked) => set(['tint'], checked ? 0x3f76e4 : undefined)}
        />
        {preview.tint !== undefined && (
          <div className="flex min-w-0 flex-col gap-0.5 text-xs">
            <label htmlFor={colourId} className="text-muted">
              Colour
            </label>
            <input
              id={colourId}
              type="color"
              data-testid="fluid-tint"
              value={preview.tint}
              onChange={(event) => {
                const tint = tintFromColour(event.target.value);
                if (tint !== undefined) set(['tint'], tint, typingKey('/tint'));
              }}
            />
          </div>
        )}
        <NumberField
          label="Explosion resistance"
          value={data.explosion_resistance}
          allowEmpty
          testId="fluid-explosion-resistance"
          onCommit={(value) =>
            set(['explosion_resistance'], value, typingKey('/explosion_resistance'))
          }
        />
      </div>
      {at(['tint'])}
      <Slider
        label="Light"
        words={preview.light === 0 ? 'No light' : `Light level ${preview.light}`}
        value={preview.light}
        min={FLOW_RANGES.light.min}
        max={FLOW_RANGES.light.max}
        testId="fluid-light"
        onChange={(value) => set(['light'], value === 0 ? undefined : value, typingKey('/light'))}
      />
      {at(['light'])}
    </Section>
  );

  const flowSection = (
    <Section title="Flow" testId="fluid-flow">
      <Slider
        label="Speed"
        words={speedWords(preview.flow.tickDelay)}
        value={preview.flow.tickDelay}
        min={FLOW_RANGES.tickDelay.min}
        max={FLOW_RANGES.tickDelay.max}
        testId="fluid-flow-speed"
        onChange={(value) => setFlow('tick_delay', value)}
      />
      <Slider
        label="How far it spreads"
        words={spreadWords(preview.flow.dropOff)}
        value={FLOW_RANGES.dropOff.max + FLOW_RANGES.dropOff.min - preview.flow.dropOff}
        min={FLOW_RANGES.dropOff.min}
        max={FLOW_RANGES.dropOff.max}
        testId="fluid-flow-spread"
        // The slider grows with the distance, so it runs against `drop_off`.
        onChange={(value) =>
          setFlow('drop_off', FLOW_RANGES.dropOff.max + FLOW_RANGES.dropOff.min - value)
        }
      />
      <Slider
        label="Looks for a way down"
        words={`up to ${preview.flow.slopeDistance} ${preview.flow.slopeDistance === 1 ? 'block' : 'blocks'} away`}
        value={preview.flow.slopeDistance}
        min={FLOW_RANGES.slopeDistance.min}
        max={FLOW_RANGES.slopeDistance.max}
        testId="fluid-flow-slope"
        onChange={(value) => setFlow('slope_distance', value)}
      />
      <CheckField
        label="Two sources side by side make a new source"
        checked={preview.flow.infinite}
        testId="fluid-flow-infinite"
        onChange={(checked) => setFlow('infinite', checked)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted text-xs">
          Like {preview.behaviour === 'lava' ? 'lava' : 'water'} unless changed:{' '}
          {speedWords(defaults.tickDelay)}, {fluidSpreadWords(defaults.dropOff)}.
        </p>
        <Button
          className="text-xs"
          data-testid="fluid-flow-defaults"
          disabled={data.flow === undefined}
          onClick={() => set(['flow'], undefined)}
        >
          Use the defaults
        </Button>
      </div>
      {at(['flow'])}
      {(['tick_delay', 'slope_distance', 'drop_off', 'infinite'] as const).map((key) => (
        <ProblemsAt key={key} problems={problems} pointer={pointerOf(['flow', key])} />
      ))}
    </Section>
  );

  const pictures = (
    <Section title="Pictures" testId="fluid-pictures">
      {(
        [
          ['still', 'Still surface'],
          ['flowing', 'Flowing surface'],
          ['overlay', 'Overlay, beside glass (optional)'],
          ['bucket', 'Bucket'],
        ] as const
      ).map(([slot, label]) => (
        <IdField
          key={slot}
          label={label}
          value={texture(slot)}
          registry="texture"
          suggest={suggest}
          testId={`fluid-texture-${slot}`}
          onCommit={(value) => setTexture(slot, value)}
        />
      ))}
      {at(['textures'])}
      <p className="text-muted text-xs">
        Empty pictures use {preview.behaviour === 'lava' ? 'lava' : 'water'}'s from your game. A
        picture with an animation file beside it moves, as water does.
      </p>
    </Section>
  );

  const inside = (
    <Section title="Something inside" testId="fluid-inside">
      <EventSelect
        label="While a mob or player is in it"
        value={data.on_entity_inside}
        events={events}
        testId="fluid-on-entity-inside"
        onChange={(value) => set(['on_entity_inside'], value)}
      />
      {at(['on_entity_inside'])}
      <p className="text-muted text-xs">
        Runs at most twice a second for each mob or player. Add the event under Advanced.
      </p>
    </Section>
  );

  return (
    <section aria-label="Fluid Studio" data-testid="fluid-studio" className="flex flex-col gap-4">
      <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="fluid-advanced-toggle" />
      <ProblemsAt problems={problems} pointer="" />
      {previewSection}
      {liquid}
      {flowSection}
      {pictures}
      {inside}
    </section>
  );
}

/** "spreads 7 blocks" for the defaults line. */
function fluidSpreadWords(dropOff: number): string {
  return spreadWords(dropOff)
    .replace(/^Spreads/, 'spreads')
    .replace(/ from its source.*$/, '');
}
