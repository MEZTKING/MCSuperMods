/**
 * A mob skin (a wolf, cat, pig, cow, chicken or frog variant) as flat pictures (B615): every
 * texture the variant names, from the project's or the bundle's files, and where it appears in
 * words. The game wraps them round the vanilla mob's model, which MSM does not draw.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/plugin-api';
import { useEffect, useState } from 'react';
import { thingName } from '../../components/thing-picker/thing-sources';
import { pngDataUrl } from '../../preview/bundle-source';
import { resourceFoldersOf } from '../frame/item-picture';
import { LiveViewFrame } from '../frame/LiveViewFrame';
import type { LiveViewProps } from '../registry';
import { textureFile } from './PieceView';

const isRecord = (value: Json | undefined): value is { [key: string]: Json } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every picture a variant names, with a label (`wild`, `baby tame`, `look`). */
export function skinPictures(data: Json): { label: string; texture: string }[] {
  const out: { label: string; texture: string }[] = [];
  if (!isRecord(data)) return out;
  const add = (label: string, value: Json | undefined) => {
    if (typeof value === 'string' && value !== '') out.push({ label, texture: value });
  };
  for (const [key, prefix] of [
    ['assets', ''],
    ['baby_assets', 'baby '],
  ] as const) {
    const assets = data[key];
    if (isRecord(assets))
      for (const [name, value] of Object.entries(assets)) add(`${prefix}${name}`, value);
  }
  add('look', data.asset_id);
  add('baby look', data.baby_asset_id);
  return out;
}

/** Where the variant appears, in words. */
export function skinWhere(data: Json): string {
  const conditions =
    isRecord(data) && Array.isArray(data.spawn_conditions) ? data.spawn_conditions : [];
  const places: string[] = [];
  for (const entry of conditions) {
    const condition = isRecord(entry) && isRecord(entry.condition) ? entry.condition : undefined;
    const biomes = condition?.biomes;
    if (typeof biomes === 'string') places.push(biomes);
    else if (Array.isArray(biomes))
      for (const one of biomes) if (typeof one === 'string') places.push(one);
  }
  return places.length === 0
    ? 'Appears everywhere its mob does.'
    : `Appears in ${places.join(', ')}.`;
}

function Picture(props: {
  file: string;
  label: string;
  read: LiveViewProps['readProject'];
  vanilla: LiveViewProps['vanillaAssets'];
}) {
  const [url, setUrl] = useState<string | null>(null);
  const { file, read, vanilla } = props;
  useEffect(() => {
    setUrl(null);
    let live = true;
    const ask = file.startsWith('assets/minecraft/') ? vanilla?.readAsset(file) : read?.(file);
    void (ask ?? Promise.resolve(null)).then(
      (bytes) => {
        if (live && bytes !== null) setUrl(pngDataUrl(bytes));
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [file, read, vanilla]);
  return (
    <figure className="m-0 flex flex-col items-center gap-1 text-xs text-muted">
      {url === null ? (
        <span aria-hidden className="h-16 w-32 border border-border" />
      ) : (
        <img
          alt={props.label}
          src={url}
          className="h-auto w-32 border border-border [image-rendering:pixelated]"
        />
      )}
      <figcaption>{props.label}</figcaption>
    </figure>
  );
}

/** The view; see the module comment. */
export default function SkinView(props: LiveViewProps) {
  const { project, element } = props;
  const folders = resourceFoldersOf(project);
  const pictures = skinPictures(element.data);
  return (
    <LiveViewFrame
      title="Mob skin"
      fidelity="about_right"
      notes={[
        'The pictures flat: the game wraps them round the vanilla mob, which MSM does not draw here.',
      ]}
    >
      <p className="text-sm" data-testid="live-skin-words">
        {`${thingName(project, element.id)}: ${pictures.length} picture${pictures.length === 1 ? '' : 's'}. ${skinWhere(element.data)}`}
      </p>
      {folders !== null && (
        <div className="flex flex-wrap gap-3" data-testid="live-skin-pictures">
          {pictures.map((picture) => (
            <Picture
              key={picture.label}
              file={textureFile(picture.texture, folders)}
              label={picture.label}
              read={props.readProject}
              vanilla={props.vanillaAssets}
            />
          ))}
        </div>
      )}
    </LiveViewFrame>
  );
}
