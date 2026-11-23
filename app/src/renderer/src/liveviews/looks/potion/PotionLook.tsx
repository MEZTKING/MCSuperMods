/**
 * The look of `msm:potion` (ADR 0121 D7, B625): the bottle, splash bottle, lingering bottle and
 * tipped arrow in the potion's colour, over the names B615's view showed. Each is drawn as its
 * item definition in the user's own jar says: the model's layers (`layer0`, `layer1`), each
 * tinted by the definition's tint of the same index, a `minecraft:potion` tint taking the
 * potion's colour (`potion-colour.ts`) and a `minecraft:constant` its value. Without the
 * Minecraft folder MSM draws its own bottles (`drawn-bottles.tsx`) and says so. The colour
 * follows the effects at once.
 *
 * The default export is the live view (the Creator and the AI review); {@link PotionLookFrame}
 * is what the Potion Studio's Preview draws above its own names.
 */

import type { Element, Json, Project } from '@msm/plugin-api';
import { useEffect, useState } from 'react';
import { pngDataUrl } from '../../../preview/bundle-source';
import type { ResourceFolders, VanillaAssetReader } from '../../../preview/model-chain';
import { PotionNames } from '../../../studios/blocks-items/PotionNames';
import { potionItemNames } from '../../../studios/blocks-items/potion-model';
import { useVeryEasy } from '../../../studios/very-easy';
import { resourceFoldersOf, wordsOfPath } from '../../frame/item-picture';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import type { LiveViewProps } from '../../registry';
import { PixelPicture } from '../particle/LookPicture';
import {
  cssColour,
  type LookPictureSource,
  readLookAsset,
  readLookJson,
  STAND_IN_WORDS,
} from '../particle/look-pictures';
import { DrawnPotionThing, type PotionThing } from './drawn-bottles';
import { DEFAULT_POTION_TINT, potionColour } from './potion-colour';

/** The things a potion makes, in the order the names list them. */
export const POTION_THINGS: readonly PotionThing[] = [
  'potion',
  'splash_potion',
  'lingering_potion',
  'tipped_arrow',
];

/** The things this potion's data makes (splash and lingering can be turned off). */
export function potionThings(data: Json | undefined): PotionThing[] {
  const object =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? data
      : ({} as Record<string, Json>);
  return POTION_THINGS.filter((thing) => {
    if (thing === 'splash_potion') return object.splash !== false;
    if (thing === 'lingering_potion' || thing === 'tipped_arrow') return object.lingering !== false;
    return true;
  });
}

/** One layer of a drawn item: its picture and the tint it takes. */
interface Layer {
  readonly url: string;
  /** `potion` (the potion's colour), a constant `0xRRGGBB`, or none. */
  readonly tint: 'potion' | number | null;
}

type Drawn =
  | { readonly state: 'loading' }
  | { readonly state: 'jar'; readonly layers: readonly Layer[] }
  | { readonly state: 'drawn' };

const isRecord = (value: Json | undefined): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The texture of a model's `layer<n>`, following `#` references. */
function layerTexture(textures: Record<string, Json>, key: string): string | undefined {
  let value = textures[key];
  for (let depth = 0; depth < 4 && typeof value === 'string' && value.startsWith('#'); depth += 1) {
    value = textures[value.slice(1)];
  }
  return typeof value === 'string' ? value : undefined;
}

const split = (id: string) => {
  const colon = id.indexOf(':');
  return colon < 0
    ? { namespace: 'minecraft', path: id }
    : { namespace: id.slice(0, colon), path: id.slice(colon + 1) };
};

/** Reads `thing`'s layers from its item definition and model (project first, then the jar). */
export async function potionThingLayers(
  thing: PotionThing,
  folders: ResourceFolders,
  source: LookPictureSource,
): Promise<Layer[] | null> {
  const definition = await readLookJson(
    `assets/minecraft/${folders.item_definition}/${thing}.json`,
    source,
  );
  const model = isRecord(definition) && isRecord(definition.model) ? definition.model : undefined;
  if (model === undefined || typeof model.model !== 'string') return null;
  const tints = Array.isArray(model.tints) ? model.tints : [];
  const { namespace, path } = split(model.model);
  const modelJson = await readLookJson(`assets/${namespace}/${folders.model}/${path}.json`, source);
  if (!isRecord(modelJson) || !isRecord(modelJson.textures)) return null;
  const textures = modelJson.textures;
  const layers: Layer[] = [];
  for (let index = 0; index < 8; index += 1) {
    const texture = layerTexture(textures, `layer${index}`);
    if (texture === undefined) break;
    const where = split(texture);
    const bytes = await readLookAsset(
      `assets/${where.namespace}/${folders.textures}/${where.path}.png`,
      source,
    );
    if (bytes === null) return null;
    const tint = tints[index];
    layers.push({
      url: pngDataUrl(bytes),
      tint: !isRecord(tint)
        ? null
        : tint.type === 'minecraft:potion' || tint.type === 'potion'
          ? 'potion'
          : typeof tint.value === 'number'
            ? tint.value
            : null,
    });
  }
  return layers.length === 0 ? null : layers;
}

function useDrawnThings(
  things: readonly PotionThing[],
  folders: ResourceFolders | null,
  source: LookPictureSource,
): readonly Drawn[] {
  const key = things.join(',');
  const { vanillaAssets, readProject } = source;
  const [drawn, setDrawn] = useState<readonly Drawn[]>(() =>
    things.map(() => ({ state: 'loading' })),
  );
  useEffect(() => {
    let live = true;
    const list = key === '' ? [] : (key.split(',') as PotionThing[]);
    setDrawn(list.map(() => ({ state: 'loading' })));
    void Promise.all(
      list.map(async (thing): Promise<Drawn> => {
        if (folders === null) return { state: 'drawn' };
        const layers = await potionThingLayers(thing, folders, {
          vanillaAssets,
          readProject,
        }).catch(() => null);
        return layers === null ? { state: 'drawn' } : { state: 'jar', layers };
      }),
    ).then((found) => {
      if (live) setDrawn(found);
    });
    return () => {
      live = false;
    };
  }, [key, folders, vanillaAssets, readProject]);
  return drawn;
}

/** One thing, drawn at 48 by 48. */
function Thing(props: {
  thing: PotionThing;
  drawn: Drawn | undefined;
  colour: string;
  label: string;
}) {
  const { drawn, colour } = props;
  const size = 48;
  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      data-testid={`potion-look-${props.thing}`}
      data-colour={colour}
      data-drawn={drawn?.state ?? 'loading'}
    >
      {drawn?.state === 'jar' ? (
        <span
          role="img"
          aria-label={props.label}
          className="block"
          style={{ width: size, height: size }}
        >
          {drawn.layers.map((layer, index) => (
            <PixelPicture
              key={index}
              url={layer.url}
              width={size}
              height={size}
              layer
              tint={
                layer.tint === 'potion'
                  ? colour
                  : layer.tint === null
                    ? undefined
                    : cssColour(layer.tint)
              }
            />
          ))}
        </span>
      ) : drawn?.state === 'drawn' ? (
        <DrawnPotionThing thing={props.thing} colour={colour} size={size} label={props.label} />
      ) : null}
    </div>
  );
}

/** Props of {@link PotionLookFrame}. */
export interface PotionLookFrameProps {
  readonly project: Project;
  readonly element: Element;
  readonly vanillaAssets: VanillaAssetReader | null;
  readonly readProject?: ((path: string) => Promise<Uint8Array | null>) | undefined;
  /** Whether to list the names and ids below (the live view does; the Studio has its own). */
  readonly names: boolean;
}

const THING_WORDS: Readonly<Record<PotionThing, string>> = {
  potion: 'Potion',
  splash_potion: 'Splash potion',
  lingering_potion: 'Lingering potion',
  tipped_arrow: 'Tipped arrow',
};

/** The bottles in the frame; see the module comment. */
export function PotionLookFrame(props: PotionLookFrameProps) {
  const { project, element, vanillaAssets, readProject } = props;
  const veryEasy = useVeryEasy();
  const folders = resourceFoldersOf(project);
  const things = potionThings(element.data);
  const drawn = useDrawnThings(things, folders, { vanillaAssets, readProject });
  const mix = potionColour(project, element.data);
  const colour = cssColour(mix.colour ?? DEFAULT_POTION_TINT);
  const names = potionItemNames(element);
  const nameOf = (thing: PotionThing) =>
    names.find((entry) => entry.key.includes(`.${thing}.effect.`))?.text ?? THING_WORDS[thing];
  const effectWords = (id: string) => (veryEasy ? wordsOfPath(id) : id);
  const usedDrawing = drawn.some((entry) => entry.state === 'drawn');
  const notes = [
    'Drawn flat at its slot size: in the game the colour is the same, the bottle sits in your hand or slot.',
    ...(mix.unknown.length > 0
      ? [
          `The colour of ${mix.unknown.map(effectWords).join(', ')} is in Minecraft’s code, not in a file, so it is left out of the bottle’s colour here.`,
        ]
      : []),
    ...(!mix.anyVisible
      ? ['No effect shows particles, so the bottle keeps the plain potion colour.']
      : []),
    ...(usedDrawing
      ? [
          vanillaAssets === null
            ? STAND_IN_WORDS
            : 'MSM drew the bottles it could not find in your Minecraft files.',
        ]
      : []),
  ];
  return (
    <LiveViewFrame
      title="Potion"
      fidelity={mix.unknown.length > 0 ? 'only_in_game' : 'about_right'}
      notes={notes}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span
            aria-hidden
            className="inline-block h-4 w-4 rounded border border-border"
            style={{ background: colour }}
          />
          <span data-testid="potion-look-colour" data-colour={colour}>
            {mix.colour === null
              ? 'Plain potion colour'
              : veryEasy
                ? 'Its colour'
                : `Colour ${colour}`}
          </span>
        </div>
        <ul className="flex flex-wrap gap-3" aria-label="What the potion makes">
          {things.map((thing, index) => (
            <li key={thing} className="flex w-24 flex-col items-center gap-1 text-center text-xs">
              <div className="rounded border border-border bg-[#8b8b8b] p-1">
                <Thing thing={thing} drawn={drawn[index]} colour={colour} label={nameOf(thing)} />
              </div>
              <span>{nameOf(thing)}</span>
            </li>
          ))}
        </ul>
        {props.names && <PotionNames element={element} testId="live-potion" />}
      </div>
    </LiveViewFrame>
  );
}

/** The live view; see the module comment. */
export default function PotionLook(props: LiveViewProps) {
  return (
    <PotionLookFrame
      project={props.project}
      element={props.element}
      vanillaAssets={props.vanillaAssets}
      readProject={props.readProject}
      names
    />
  );
}
