/**
 * A sulfur cube archetype (the plan's batch 3 table; B627): the cube's stand-in body at a size you
 * pick, wearing Minecraft's sulfur cube pictures (the archetype has no look of its own, B619 3S3;
 * a resource pack in the project may repaint them), the path of one hit drawn from its knockback
 * and attributes (`bounce.ts`), what else it does in words, and its hit and push sounds with Play.
 * Follows an edit 150 ms after it.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';
import { useMemo, useState } from 'react';
import type { ReadProjectSound } from '../../../audio/provider';
import { SoundPlayButton } from '../../../audio/SoundPlayButton';
import { thingName, thingWords } from '../../../components/thing-picker/thing-sources';
import { resourceFoldersOf } from '../../frame/item-picture';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import { LIVE_VIEW_DEBOUNCE_MS } from '../../frame/live-data';
import type { LiveViewProps } from '../../registry';
import { bodyFor, SULFUR_CUBE_LAYERS, scaleBody, sulfurCubeScale } from '../bodies';
import { BodyLook } from '../variant/BodyLook';
import { BODY_NOTES } from '../variant/variant-model';
import { bounceCount, bounceNumbers, bouncePath } from './bounce';

type JsonObject = { [key: string]: Json };
const isObject = (value: Json | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The sizes the view offers, in words. */
export const CUBE_SIZES: readonly { size: number; words: string }[] = [
  { size: 0, words: 'Small' },
  { size: 1, words: 'Middle' },
  { size: 2, words: 'Big' },
];

/** A sound event field (`"id"` or `{ sound_id }`) as an id. */
const soundId = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value !== ''
    ? value
    : isObject(value) && typeof value.sound_id === 'string'
      ? value.sound_id
      : undefined;

/** What the archetype does beyond its look and bounce, in words. */
export function cubeFacts(project: LiveViewProps['project'], data: Json | undefined): string[] {
  const object = isObject(data) ? data : {};
  const out: string[] = [];
  const items = object.items;
  if (typeof items === 'string' && items !== '') {
    out.push(
      items.startsWith('#')
        ? `Takes this shape when fed an item of the group ${thingWords(items.slice(1))}.`
        : `Takes this shape when fed ${thingName(project, items)}.`,
    );
  } else if (Array.isArray(items) && items.length > 0) {
    const names = items.filter((item): item is string => typeof item === 'string');
    out.push(`Takes this shape when fed ${names.map((id) => thingName(project, id)).join(', ')}.`);
  }
  if (object.buoyant === true) out.push('Floats in water.');
  if (isObject(object.explosion)) {
    const { fuse, power, causes_fire: fire } = object.explosion;
    out.push(
      `Explodes after ${typeof fuse === 'number' ? fuse : '?'} ticks with power ${typeof power === 'number' ? power : '?'}${fire === true ? ', setting fires' : ''}.`,
    );
  }
  if (isObject(object.contact_damage)) {
    const { damage_type: type, amount } = object.contact_damage;
    const value = typeof amount === 'number' ? String(amount) : 'some';
    out.push(
      `Hurts what touches it: ${value} damage${typeof type === 'string' ? ` (${thingWords(type)})` : ''}.`,
    );
  }
  return out;
}

/** The path of one hit as an SVG line, scaled to fit. */
function BouncePath(props: { data: Json | undefined }) {
  const numbers = bounceNumbers(props.data);
  const path = bouncePath(numbers);
  const width = 280;
  const height = 90;
  const maxX = Math.max(1, ...path.map((point) => point.x));
  const maxY = Math.max(0.5, ...path.map((point) => point.y));
  const scale = Math.min((width - 10) / maxX, (height - 10) / maxY);
  const points = path
    .map(
      (point) => `${(5 + point.x * scale).toFixed(1)},${(height - 5 - point.y * scale).toFixed(1)}`,
    )
    .join(' ');
  const bounces = bounceCount(path);
  const last = path[path.length - 1];
  return (
    <figure className="m-0 flex flex-col gap-1">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="The path of one hit, seen from the side"
        className="rounded border border-border"
        data-testid="sulfur-cube-bounce"
        data-bounces={bounces}
        data-distance={(last?.x ?? 0).toFixed(2)}
      >
        <line
          x1={0}
          x2={width}
          y1={height - 5}
          y2={height - 5}
          stroke="currentColor"
          opacity={0.3}
        />
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} />
      </svg>
      <figcaption className="text-muted text-xs" data-testid="sulfur-cube-bounce-words">
        {`One hit: pushed ${numbers.horizontal} sideways and ${numbers.vertical} up; it travels about ${(last?.x ?? 0).toFixed(1)} blocks${bounces === 0 ? '' : ` and bounces ${bounces} time${bounces === 1 ? '' : 's'}`}.`}
      </figcaption>
    </figure>
  );
}

/** The view; see the module comment. */
export default function SulfurCubeView(props: LiveViewProps) {
  const { project, element } = props;
  const [size, setSize] = useState(1);
  const folders = resourceFoldersOf(project);
  const texturesFolder = folders?.textures ?? 'textures';
  const body = bodyFor(element.kind, undefined, false);
  const layers = SULFUR_CUBE_LAYERS.map((layer) => ({
    path: `assets/minecraft/${texturesFolder}/entity/sulfur_cube/${layer.picture}.png`,
    label: layer.bone === 'outer' ? 'The outer picture' : 'The inner picture',
    rect: layer.rect,
  }));
  const factor = sulfurCubeScale(size);
  const transform = useMemo(() => (geo: Json) => scaleBody(geo, factor), [factor]);
  const readProject = props.readProject;
  const readProjectAsset = useMemo<ReadProjectSound | undefined>(
    () =>
      readProject === undefined
        ? undefined
        : (namespace: string, path: string) => readProject(`assets/${namespace}/${path}`),
    [readProject],
  );
  const settings =
    isObject(element.data) && isObject(element.data.sound_settings)
      ? element.data.sound_settings
      : {};
  const sounds = [
    { field: 'hit_sound', words: 'When hit', event: soundId(settings.hit_sound) },
    { field: 'push_sound', words: 'When pushed', event: soundId(settings.push_sound) },
  ];
  const facts = cubeFacts(project, element.data);
  return (
    <LiveViewFrame
      title="Sulfur cube"
      fidelity="about_right"
      notes={[
        ...BODY_NOTES,
        'The path of a hit is worked out by MSM with ordinary mob movement; the cube’s own movement is only in the game.',
        ...(size === 0
          ? [
              'The game wears smaller pictures at the smallest size; they are drawn here with the full-size ones.',
            ]
          : []),
      ]}
      needsSetUp={props.vanillaAssets === null}
      onSetup={props.onSetup}
      controls={
        <fieldset className="m-0 border-0 p-0 flex flex-wrap gap-1">
          <legend className="sr-only">Size</legend>
          {CUBE_SIZES.map((entry) => (
            <button
              key={entry.size}
              type="button"
              aria-pressed={entry.size === size}
              data-testid={`sulfur-cube-size-${entry.size}`}
              className={`rounded border px-2 py-0.5 text-xs ${entry.size === size ? 'border-accent' : 'border-border'}`}
              onClick={() => setSize(entry.size)}
            >
              {entry.words}
            </button>
          ))}
        </fieldset>
      }
    >
      <p className="text-sm" data-testid="sulfur-cube-words">
        {`${thingName(project, element.id)}: a kind of sulfur cube${facts.length === 0 ? '.' : `. ${facts.join(' ')}`}`}
      </p>
      {body !== 'flat_sheet' && (
        <BodyLook
          body={body}
          bodyKey="sulfur_cube"
          transform={transform}
          transformKey={String(factor)}
          layers={layers}
          source={{ vanillaAssets: props.vanillaAssets, readProject: props.readProject }}
          label={`${thingName(project, element.id)}, ${CUBE_SIZES[size]?.words.toLowerCase() ?? ''} size`}
          debounceMs={LIVE_VIEW_DEBOUNCE_MS}
          testId="sulfur-cube-body"
        />
      )}
      <BouncePath data={element.data} />
      <ul className="flex flex-col gap-1" data-testid="sulfur-cube-sounds">
        {sounds.map((sound) => (
          <li key={sound.field} className="flex flex-wrap items-center gap-2 text-sm">
            {sound.event === undefined ? (
              <span className="text-muted text-xs">(none)</span>
            ) : (
              <SoundPlayButton
                event={sound.event}
                compact
                project={project}
                {...(props.sounds === undefined ? {} : { sounds: props.sounds })}
                {...(readProjectAsset === undefined ? {} : { readProjectAsset })}
                label={`Play ${sound.words.toLowerCase()}`}
                testId={`sulfur-cube-play-${sound.field}`}
              />
            )}
            <span>{sound.words}</span>
            {sound.event !== undefined && (
              <span className="text-muted text-xs">{thingWords(sound.event, 'sound')}</span>
            )}
          </li>
        ))}
      </ul>
    </LiveViewFrame>
  );
}
