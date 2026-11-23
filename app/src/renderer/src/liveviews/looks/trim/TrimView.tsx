/**
 * An armour trim on the armour figure (ADR 0121 D5, B628): a trim pattern in a material you pick,
 * or a trim material on a pattern you pick, on an armour you pick. The pattern's two layer
 * pictures are coloured as the game colours them (`palette.ts`: key colour i becomes palette
 * colour i, the key named by each layer's `.png.mcmeta`, the palette the material's or the
 * armour's `trim_overrides` swap) and drawn over the armour on the Creator's armour figure
 * (`preview/ArmourPreviewView.tsx`), beside the coloured layers flat and the palette as swatches.
 * Pictures come from the project, then the user's own jar. About right: confirmed by screenshot
 * on both targets within 0.021 chroma on MSM's own patterns (3S5); the armour figure is MSM's.
 */

import type { Json, Project } from '@msm/plugin-api';
import { useEffect, useId, useMemo, useState } from 'react';
import { ArmourPreviewView } from '../../../preview/ArmourPreviewView';
import { type ArmourTrimLayers, armourPreviewOfEquipment } from '../../../preview/armour-preview';
import { hasWebGL } from '../../../preview/webgl';
import { useVeryEasy } from '../../../studios/very-easy';
import { assetReader } from '../../existing/bundle-host';
import { resourceFoldersOf, wordsOfPath } from '../../frame/item-picture';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import { factsOf } from '../../frame/live-data';
import type { LiveViewProps } from '../../registry';
import type { VanillaDataReader, VanillaFolderFiles } from '../../vanilla-data';
import {
  FlatPicture,
  idWords,
  recordOf,
  stringOf,
  useLookBytes,
  useSettled,
} from '../banner/look-parts';
import { encodePng, type Pixels, type Rgb, readPixels, rgbToHex } from '../banner/pixels';
import {
  type LookPictureSource,
  readLookJson,
  STAND_IN_WORDS,
  splitId,
} from '../particle/look-pictures';
import {
  applyTrimPalette,
  keyPaletteOf,
  paletteColours,
  palettePath,
  TRIM_LAYERS,
  type TrimLayer,
  trimLayerPath,
  trimPaletteId,
} from './palette';

export const TRIM_PATTERN_KIND = 'minecraft:trim_pattern';
export const TRIM_MATERIAL_KIND = 'minecraft:trim_material';
const EQUIPMENT_KIND = 'minecraft:equipment';

/** Vanilla's files of one data folder, or none while loading or without the Minecraft folder. */
function useVanillaFolder(
  vanilla: VanillaDataReader,
  folder: string,
): { status: 'loading' | 'ready' | 'not_set_up'; files: VanillaFolderFiles } {
  const [answer, setAnswer] = useState<{
    status: 'loading' | 'ready' | 'not_set_up';
    files: VanillaFolderFiles;
  }>({ status: 'loading', files: {} });
  useEffect(() => {
    let live = true;
    const ask =
      typeof vanilla?.folder === 'function'
        ? vanilla.folder(folder)
        : Promise.resolve({ status: 'not_set_up' as const });
    void ask
      .then(
        (result) =>
          result.status === 'ready'
            ? { status: 'ready' as const, files: result.files }
            : { status: 'not_set_up' as const, files: {} },
        () => ({ status: 'not_set_up' as const, files: {} }),
      )
      .then((value) => {
        if (live) setAnswer(value);
      });
    return () => {
      live = false;
    };
  }, [vanilla, folder]);
  return answer;
}

/** The project's elements of a kind, by id. */
function projectData(project: Project, kind: string): Map<string, Json> {
  const out = new Map<string, Json>();
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind === kind) out.set(element.id, element.data as Json);
    }
  }
  return out;
}

/** One choice of a picker: the project's first, then Minecraft's. */
interface Choice {
  readonly id: string;
  readonly data: Json | undefined;
}

function choicesOf(own: Map<string, Json>, vanilla: VanillaFolderFiles): Choice[] {
  const out: Choice[] = [...own].map(([id, data]) => ({ id, data }));
  for (const id of Object.keys(vanilla).sort()) {
    if (!own.has(id)) out.push({ id, data: vanilla[id] });
  }
  return out;
}

/** The vanilla armours worth trimming: the target's armour materials (those with a humanoid look). */
function useVanillaArmours(project: Project, source: LookPictureSource): Choice[] {
  const names = factsOf(project)?.items?.armorMaterials ?? [];
  const key = names.join(',');
  const { vanillaAssets, readProject } = source;
  const [armours, setArmours] = useState<{ key: string; list: Choice[] } | null>(null);
  useEffect(() => {
    let live = true;
    const list = key === '' ? [] : key.split(',');
    void Promise.all(
      list.map(async (name): Promise<Choice | null> => {
        const id = `minecraft:${name}`;
        const data = await readLookJson(`assets/minecraft/equipment/${name}.json`, {
          vanillaAssets,
          readProject,
        });
        if (data === undefined) return vanillaAssets === null ? { id, data: undefined } : null;
        const layers = recordOf(recordOf(data)?.layers);
        return layers?.humanoid === undefined ? null : { id, data };
      }),
    ).then((found) => {
      if (live) setArmours({ key, list: found.filter((entry): entry is Choice => entry !== null) });
    });
    return () => {
      live = false;
    };
  }, [key, vanillaAssets, readProject]);
  return armours?.key === key ? armours.list : [];
}

/** A picker of ids, named in words. */
function Picker(props: {
  label: string;
  value: string;
  choices: readonly Choice[];
  project: Project;
  testId: string;
  onChange(id: string): void;
}) {
  const id = useId();
  return (
    <label className="flex flex-col gap-0.5" htmlFor={id}>
      {props.label}
      <select
        id={id}
        data-testid={props.testId}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className="rounded border border-border bg-surface px-1 py-0.5"
      >
        {props.choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {idWords(props.project, choice.id)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The palette swatches: each key colour and the colour it becomes. */
function Swatches(props: { keyColours: readonly Rgb[]; palette: readonly Rgb[] }) {
  return (
    <ol className="flex flex-wrap gap-1" aria-label="Key colours and what they become">
      {props.keyColours.map((colour, index) => {
        const to = props.palette[index] ?? colour;
        return (
          <li
            key={index}
            className="flex flex-col"
            data-testid="live-trim-swatch"
            data-key={rgbToHex(colour)}
            data-colour={rgbToHex(to)}
            title={`${rgbToHex(colour)} becomes ${rgbToHex(to)}`}
          >
            <span className="h-3 w-5" style={{ background: rgbToHex(colour) }} />
            <span className="h-3 w-5" style={{ background: rgbToHex(to) }} />
          </li>
        );
      })}
    </ol>
  );
}

const LAYER_WORDS: Readonly<Record<TrimLayer, string>> = {
  humanoid: 'Helmet, chestplate and boots',
  humanoid_leggings: 'Leggings',
};

/** The view; see the module comment. */
export default function TrimView(props: LiveViewProps) {
  const { project, element, vanillaAssets, readProject } = props;
  const veryEasy = useVeryEasy();
  const data = useSettled(element.data as Json);
  const isPattern = element.kind === TRIM_PATTERN_KIND;
  const textures = resourceFoldersOf(project)?.textures ?? 'textures';
  const source = { vanillaAssets, readProject };

  const vanillaPatterns = useVanillaFolder(props.vanilla, 'trim_pattern');
  const vanillaMaterials = useVanillaFolder(props.vanilla, 'trim_material');
  const others = isPattern
    ? choicesOf(projectData(project, TRIM_MATERIAL_KIND), vanillaMaterials.files)
    : choicesOf(projectData(project, TRIM_PATTERN_KIND), vanillaPatterns.files);
  const [otherPick, setOtherPick] = useState('');
  const other = others.find((choice) => choice.id === otherPick) ?? others[0];

  const vanillaArmours = useVanillaArmours(project, source);
  const armours: Choice[] = [
    ...[...projectData(project, EQUIPMENT_KIND)]
      .filter(([, value]) => recordOf(recordOf(value)?.layers)?.humanoid !== undefined)
      .map(([id, value]) => ({ id, data: value })),
    ...vanillaArmours,
  ];
  const [armourPick, setArmourPick] = useState('minecraft:iron');
  const armour = armours.find((choice) => choice.id === armourPick) ?? armours[0];

  const pattern: Choice | undefined = isPattern ? { id: element.id, data } : other;
  const material: Choice | undefined = isPattern ? other : { id: element.id, data };
  const assetId = stringOf(recordOf(pattern?.data)?.asset_id);
  const palette =
    material === undefined
      ? { id: null, override: false }
      : trimPaletteId(material.id, material.data, armour?.data);

  const layerPaths = TRIM_LAYERS.map((layer) =>
    assetId === undefined ? null : trimLayerPath(assetId, layer, textures),
  );
  const firstPaths = [
    ...layerPaths.flatMap((path) => (path === null ? [] : [path, `${path}.mcmeta`])),
    ...(palette.id === null ? [] : [palettePath(palette.id, textures)]),
  ];
  const first = useLookBytes(firstPaths, source);
  const keyIds = layerPaths.map((path) => {
    if (path === null || first === null) return null;
    const meta = first[`${path}.mcmeta`];
    if (meta === null || meta === undefined) return null;
    try {
      return keyPaletteOf(JSON.parse(new TextDecoder().decode(meta)) as Json);
    } catch {
      return null;
    }
  });
  const keyPaths = keyIds.map((id) => (id === null ? null : palettePath(id, textures)));
  const second = useLookBytes(
    keyPaths.filter((path): path is string => path !== null),
    source,
  );

  const paletteRgb = useMemo(
    () =>
      palette.id === null || first === null
        ? null
        : paletteColours(readPixels(first[palettePath(palette.id, textures)])),
    [first, palette.id, textures],
  );
  const layerKey = JSON.stringify(layerPaths);
  const keyKey = JSON.stringify(keyPaths);
  const layers = useMemo(() => {
    if (first === null || second === null) return null;
    const paths = JSON.parse(layerKey) as (string | null)[];
    const keys = JSON.parse(keyKey) as (string | null)[];
    return TRIM_LAYERS.map((layer, index) => {
      const path = paths[index] ?? null;
      const picture = path === null ? null : readPixels(first[path]);
      const keyPath = keys[index] ?? null;
      const key = keyPath === null ? null : paletteColours(readPixels(second[keyPath]));
      return {
        layer,
        key,
        coloured:
          picture === null
            ? null
            : applyTrimPalette(picture, key !== null && key.length > 0 ? key : null, paletteRgb),
      };
    });
  }, [first, second, paletteRgb, layerKey, keyKey]);

  const patternWords = pattern === undefined ? '' : idWords(project, pattern.id);
  const materialWords = material === undefined ? '' : idWords(project, material.id);
  const hasMaterial = material !== undefined;
  const trimLayers = useMemo<ArmourTrimLayers | null>(() => {
    if (layers === null) return null;
    const bytesOf = (picture: Pixels | null) => (picture === null ? null : encodePng(picture));
    return {
      label: !hasMaterial ? patternWords : `${patternWords} in ${materialWords.toLowerCase()}`,
      humanoid: bytesOf(layers[0]?.coloured ?? null),
      humanoid_leggings: bytesOf(layers[1]?.coloured ?? null),
    };
  }, [layers, patternWords, materialWords, hasMaterial]);

  const armourKey = JSON.stringify(armour ?? null);
  const preview = useMemo(() => {
    const chosen = JSON.parse(armourKey) as Choice | null;
    return chosen === null
      ? null
      : armourPreviewOfEquipment(chosen.id, (chosen.data ?? null) as Json | null, project);
  }, [armourKey, project]);

  const keyColours = layers?.find((entry) => entry.key !== null && entry.key.length > 0)?.key ?? [];
  const noKey = layers?.every((entry) => entry.coloured === null || entry.key === null) === true;
  const missingLayers =
    layers?.filter((entry) => entry.coloured === null).map((entry) => entry.layer) ?? [];
  const decal = recordOf(pattern?.data)?.decal === true;
  const names = (id: string) => (veryEasy ? wordsOfPath(id) : `${wordsOfPath(id)} (${id})`);
  const notes = [
    'Drawn on MSM’s own armour figure; the game’s light and shine are not shown.',
    ...(vanillaAssets === null ? [STAND_IN_WORDS] : []),
    ...(palette.override && palette.id !== null
      ? [
          `This armour shows the material in its own colours: ${names(palette.id)}, as the armour’s trim overrides say.`,
        ]
      : []),
    ...(material !== undefined && palette.id === null
      ? ['The material names no palette yet, so the trim shows uncoloured.']
      : []),
    ...(noKey
      ? [
          'The pattern’s pictures name no key palette (no .png.mcmeta with a base palette), so the game draws them as they are, uncoloured.',
        ]
      : []),
    ...(assetId !== undefined && layers !== null
      ? missingLayers.map((layer) =>
          veryEasy
            ? `The pattern has no picture for ${LAYER_WORDS[layer].toLowerCase()} yet.`
            : `The pattern has no picture for ${LAYER_WORDS[layer].toLowerCase()} yet: ${trimLayerPath(assetId, layer, textures)}.`,
        )
      : []),
    ...(pattern === undefined || assetId === undefined
      ? [
          isPattern
            ? 'The pattern names no pictures yet.'
            : 'Make or pick a trim pattern to see this material on.',
        ]
      : []),
    ...(decal
      ? ['This pattern is a decal: the game draws it a little differently over the armour.']
      : []),
  ];

  const controls = (
    <div className="flex flex-wrap items-end gap-3 text-xs">
      {others.length > 0 && other !== undefined && (
        <Picker
          label={isPattern ? 'Material' : 'Pattern'}
          value={other.id}
          choices={others}
          project={project}
          testId="live-trim-other"
          onChange={setOtherPick}
        />
      )}
      {armours.length > 0 && armour !== undefined && (
        <Picker
          label="Armour"
          value={armour.id}
          choices={armours}
          project={project}
          testId="live-trim-armour"
          onChange={setArmourPick}
        />
      )}
    </div>
  );
  const folders = resourceFoldersOf(project);
  const vanillaNamed =
    vanillaAssets === null &&
    [pattern?.id, material?.id, armour?.id].some(
      (id) => id !== undefined && splitId(id).namespace === 'minecraft',
    );

  return (
    <LiveViewFrame
      title="Armour trim"
      fidelity="about_right"
      notes={notes}
      needsSetUp={vanillaNamed}
      onSetup={props.onSetup}
      controls={controls}
    >
      {layers === null ? (
        <p className="text-sm text-muted">Reading the pictures…</p>
      ) : (
        <div className="flex flex-col gap-2" data-testid="live-trim">
          {paletteRgb !== null && keyColours.length > 0 && (
            <Swatches keyColours={keyColours} palette={paletteRgb} />
          )}
          <div className="flex flex-wrap gap-3">
            {layers.map((entry) =>
              entry.coloured === null ? null : (
                <figure
                  key={entry.layer}
                  className="m-0 flex flex-col items-center gap-1 text-xs text-muted"
                  data-testid={`live-trim-layer-${entry.layer}`}
                >
                  <FlatPicture
                    pixels={entry.coloured}
                    scale={3}
                    label={`${trimLayers?.label ?? ''}, ${LAYER_WORDS[entry.layer].toLowerCase()}`}
                  />
                  <figcaption>{LAYER_WORDS[entry.layer]}</figcaption>
                </figure>
              ),
            )}
          </div>
        </div>
      )}
      {preview !== null && folders !== null && (
        <ArmourPreviewView
          preview={preview}
          folders={folders}
          readProjectAsset={assetReader(readProject)}
          vanilla={vanillaAssets}
          webgl={hasWebGL()}
          trim={trimLayers}
          {...(veryEasy && armour !== undefined
            ? { equipmentName: idWords(project, armour.id) }
            : {})}
        />
      )}
    </LiveViewFrame>
  );
}
