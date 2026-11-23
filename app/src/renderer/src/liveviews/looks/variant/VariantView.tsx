/**
 * A mob variant (ADR 0121 D4; the plan's batch 3 table; B627): the mob's stand-in body wearing
 * the variant's picture, turning (wild, tame and angry for wolves; the baby where the variant
 * names a baby picture; the body the variant's `model` names), and where it appears, with biome
 * tags opened up. The zombie nautilus has no body (no-go in the spike B619, 3L5): its picture is
 * shown flat with its measured parts named, and the view says so.
 *
 * Pictures are read from the project first (a resource pack may repaint Minecraft's), then from
 * the user's own jar cache; nothing is bundled. Follows an edit 150 ms after it.
 *
 * @packageDocumentation
 */

import { useState } from 'react';
import { thingName } from '../../../components/thing-picker/thing-sources';
import { pngDataUrl } from '../../../preview/bundle-source';
import { textureFile } from '../../existing/PieceView';
import { resourceFoldersOf } from '../../frame/item-picture';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import { LIVE_VIEW_DEBOUNCE_MS } from '../../frame/live-data';
import type { LiveViewProps } from '../../registry';
import { bodyFor, bodyIdFor } from '../bodies';
import type { LookPictureSource } from '../particle/look-pictures';
import { BodyLook, useLayerBytes } from './BodyLook';
import { SpawnPlaces } from './SpawnPlaces';
import {
  BODY_NOTES,
  FLAT_SHEET_WORDS,
  hasBabyLook,
  isWolf,
  MODEL_WORDS,
  mobWordsOf,
  NAUTILUS_SHEET_SIZE,
  nautilusParts,
  spawnRules,
  variantModel,
  variantTexture,
  WOLF_LOOK_WORDS,
  WOLF_LOOKS,
  type WolfLook,
} from './variant-model';

/** The ages a variant can be shown at. */
const AGES: readonly ('adult' | 'baby')[] = ['adult', 'baby'];

/** A small choice row of toggle buttons. */
function Choice<T extends string>(props: {
  label: string;
  value: T;
  choices: readonly T[];
  words: Readonly<Record<T, string>>;
  onChange(value: T): void;
  testId: string;
}) {
  return (
    <fieldset className="m-0 border-0 p-0 flex flex-wrap gap-1">
      <legend className="sr-only">{props.label}</legend>
      {props.choices.map((choice) => (
        <button
          key={choice}
          type="button"
          aria-pressed={choice === props.value}
          data-testid={`${props.testId}-${choice}`}
          className={`rounded border px-2 py-0.5 text-xs ${choice === props.value ? 'border-accent' : 'border-border'}`}
          onClick={() => props.onChange(choice)}
        >
          {props.words[choice]}
        </button>
      ))}
    </fieldset>
  );
}

/** The zombie nautilus's picture, flat, with its measured parts named (3L5). */
function FlatSheet(props: { path: string | null; model: string; source: LookPictureSource }) {
  const read = useLayerBytes([props.path], props.source, LIVE_VIEW_DEBOUNCE_MS);
  const bytes = read.status === 'ready' ? (read.bytes[0] ?? null) : null;
  const parts = nautilusParts(props.model);
  const shown = 256;
  const scale = shown / NAUTILUS_SHEET_SIZE;
  return (
    <div className="flex flex-col gap-2" data-testid="variant-flat-sheet">
      <p className="text-sm" data-testid="variant-flat-sheet-words">
        {FLAT_SHEET_WORDS}
      </p>
      {bytes !== null && (
        <div className="relative border border-border" style={{ width: shown, height: shown }}>
          <img
            src={pngDataUrl(bytes)}
            alt="The zombie nautilus picture, flat"
            width={shown}
            height={shown}
            style={{ imageRendering: 'pixelated' }}
          />
          {parts.map((part, index) => (
            <span
              key={part.name}
              aria-hidden
              title={part.name}
              className="absolute border border-accent text-[9px] leading-none text-accent"
              style={{
                left: part.rect[0] * scale,
                top: part.rect[1] * scale,
                width: (part.rect[2] - part.rect[0]) * scale,
                height: (part.rect[3] - part.rect[1]) * scale,
              }}
            >
              {index + 1}
            </span>
          ))}
        </div>
      )}
      {read.status === 'ready' && bytes === null && (
        <p className="text-warning text-xs" data-testid="variant-flat-sheet-missing">
          The picture was not found.
        </p>
      )}
      <ol className="flex flex-col gap-0.5 text-xs" data-testid="variant-flat-sheet-parts">
        {parts.map((part, index) => (
          <li key={part.name}>{`${index + 1}. ${part.name}`}</li>
        ))}
      </ol>
    </div>
  );
}

/** The view; see the module comment. */
export default function VariantView(props: LiveViewProps) {
  const { project, element } = props;
  const kind = element.kind;
  const [wolf, setWolf] = useState<WolfLook>('wild');
  const [age, setAge] = useState<'adult' | 'baby'>('adult');
  const folders = resourceFoldersOf(project);
  const model = variantModel(element.data);
  const babyPicture = variantTexture(kind, element.data, { wolf, baby: true });
  const canBaby = hasBabyLook(kind) && babyPicture !== undefined;
  const baby = canBaby && age === 'baby';
  const texture = variantTexture(kind, element.data, { wolf, baby });
  const path = texture === undefined || folders === null ? null : textureFile(texture, folders);
  const body = bodyFor(kind, model, baby);
  const bodyId = bodyIdFor(kind, model, baby);
  const mob = mobWordsOf(kind);
  const name = thingName(project, element.id);
  const source = { vanillaAssets: props.vanillaAssets, readProject: props.readProject };
  const flat = body === 'flat_sheet';
  const notes = [
    ...(flat ? [] : BODY_NOTES),
    ...(isWolf(kind) || kind === 'minecraft:cat_variant'
      ? ['A tame animal’s collar is not drawn.']
      : []),
  ];
  const words = [
    `${name}: a ${mob.toLowerCase()} look`,
    model === 'normal' ? '' : ` on ${MODEL_WORDS[model] ?? `the ${model} body`}`,
    texture === undefined ? ', with no picture named yet.' : '.',
  ].join('');
  return (
    <LiveViewFrame
      title={`${mob} variant`}
      fidelity={flat ? 'only_in_game' : 'about_right'}
      notes={notes}
      needsSetUp={props.vanillaAssets === null && texture?.startsWith('minecraft:') === true}
      onSetup={props.onSetup}
      controls={
        <div className="flex flex-wrap gap-3">
          {isWolf(kind) && (
            <Choice
              label="Look"
              value={wolf}
              choices={WOLF_LOOKS}
              words={WOLF_LOOK_WORDS}
              onChange={setWolf}
              testId="variant-wolf"
            />
          )}
          {canBaby && (
            <Choice<'adult' | 'baby'>
              label="Age"
              value={age}
              choices={AGES}
              words={{ adult: 'Grown-up', baby: 'Baby' }}
              onChange={setAge}
              testId="variant-age"
            />
          )}
        </div>
      }
    >
      <p className="text-sm" data-testid="variant-words" data-body={bodyId} data-path={path ?? ''}>
        {words}
      </p>
      {body === 'flat_sheet' ? (
        <FlatSheet path={path} model={model} source={source} />
      ) : (
        <BodyLook
          body={body}
          bodyKey={bodyId}
          layers={[{ path, label: `The ${mob.toLowerCase()} picture` }]}
          source={source}
          label={`${name} on the ${mob.toLowerCase()} body`}
          debounceMs={LIVE_VIEW_DEBOUNCE_MS}
          testId="variant-body"
        />
      )}
      <SpawnPlaces project={project} vanilla={props.vanilla} rules={spawnRules(element.data)} />
    </LiveViewFrame>
  );
}
