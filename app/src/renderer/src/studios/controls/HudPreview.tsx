/**
 * The HUD Studio's layout preview (B420, ADR 0089 D9): an MSM-drawn 16:9 game screen (sky,
 * ground, crosshair, an outlined hotbar and status rows; no Mojang art) with every HUD element of
 * the project placed by `hud-layout.ts`, the twin of the runtime's `HudLayout`, at GUI scale 2, 3
 * or 4 of a 1920 by 1080 window. The element being edited is outlined and shows the value of the
 * "Preview value" control; the others show a sample. Elements that only show in a vehicle appear
 * with "Riding a vehicle" on. Sprites are drawn from the project's pictures when the host can
 * read them, else in the element's colours.
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/core';
import type { TargetFacts } from '@msm/plugin-api';
import { hudSpritePath } from '@msm/plugin-controls';
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react';
import { useBlocksItemsStudioHost } from '../blocks-items/host';
import { useVeryEasy } from '../very-easy';
import { Section } from '../worldgen/parts';
import {
  HUD_DEFAULTS,
  type HudPreviewItem,
  hudPreviewItem,
  maxNumberOf,
  previewShows,
  projectHuds,
  sampleValue,
} from './controls-model';
import { guiSize, HUD_LAYOUT, layoutHud, type Pair } from './hud-layout';

/** The window the preview stands for, in pixels. */
export const PREVIEW_WINDOW: Pair = [1920, 1080];
/** The GUI scales the preview offers (ADR 0089 D9). */
export const PREVIEW_SCALES = [2, 3, 4] as const;
/** The scale it opens at. */
export const DEFAULT_PREVIEW_SCALE = 3;

/** The hotbar's outline size in GUI pixels. */
const HOTBAR: Pair = [182, 22];

/** Everything the preview places on one GUI size. */
export interface PreviewLayout {
  gui: Pair;
  items: (HudPreviewItem & { position: Pair })[];
}

/**
 * The preview's layout: the project's HUD elements (with `current` standing in for its own
 * element and showing `value`), the ones that show only in a vehicle left out unless
 * `inVehicle`, placed on the GUI of `scale`.
 */
export function previewLayout(
  project: Project,
  current: { id: string; data: Json },
  options: { scale: number; inVehicle: boolean; value?: number },
): PreviewLayout {
  const gui = guiSize(PREVIEW_WINDOW, options.scale);
  const items: HudPreviewItem[] = [];
  for (const element of projectHuds(project)) {
    if (element.id === current.id) continue;
    if (!previewShows(element.data, options.inVehicle)) continue;
    items.push(hudPreviewItem(element.id, element.data));
  }
  items.push(hudPreviewItem(current.id, current.data, options.value));
  const positions = layoutHud(
    items.map((item) => item.box),
    gui,
  );
  return {
    gui,
    items: items.map((item) => ({ ...item, position: positions.get(item.box.id) ?? [0, 0] })),
  };
}

/** Pictures by sprite id, as `data:` URLs, read through the host's thumbnails. */
function useSpritePictures(
  sprites: readonly string[],
  target: Pick<TargetFacts, 'folders'>,
): ReadonlyMap<string, string> {
  const host = useBlocksItemsStudioHost();
  const [pictures, setPictures] = useState<ReadonlyMap<string, string>>(new Map());
  const key = [...new Set(sprites)].sort().join('|');
  const revision = host?.revision ?? 0;
  useEffect(() => {
    if (host === null || key === '') {
      setPictures(new Map());
      return;
    }
    let live = true;
    const ids = key.split('|');
    Promise.all(
      ids.map(async (sprite): Promise<[string, string] | null> => {
        const path = hudSpritePath(target, sprite);
        if (path === undefined) return null;
        try {
          const bytes = await host.thumbnail(path, 64);
          if (bytes.length === 0) return null;
          let binary = '';
          for (const byte of bytes) binary += String.fromCharCode(byte);
          return [sprite, `data:image/png;base64,${btoa(binary)}`];
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (live) setPictures(new Map(entries.filter((entry) => entry !== null)));
    });
    return () => {
      live = false;
    };
  }, [host, key, revision, target]);
  return pictures;
}

const str = (value: Json | undefined): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/** A sprite drawn over `[x, y, w, h]`, its left `clip` pixels only when given. */
function SpriteImage(props: {
  href: string;
  box: [number, number, number, number];
  clip?: number;
  clipId: string;
}) {
  const [x, y, w, h] = props.box;
  return (
    <>
      {props.clip !== undefined && (
        <clipPath id={props.clipId}>
          <rect x={x} y={y} width={props.clip} height={h} />
        </clipPath>
      )}
      <image
        href={props.href}
        x={x}
        y={y}
        width={w}
        height={h}
        preserveAspectRatio="none"
        style={{ imageRendering: 'pixelated' }}
        {...(props.clip === undefined ? {} : { clipPath: `url(#${props.clipId})` })}
      />
    </>
  );
}

/** One element on the preview screen. */
function PreviewItem(props: {
  item: PreviewLayout['items'][number];
  current: boolean;
  pictures: ReadonlyMap<string, string>;
  uid: string;
}) {
  const { item, pictures } = props;
  const [x, y] = item.position;
  const [w, h] = item.box.size;
  const data = item.data;
  const picture = (field: string): string | undefined => {
    const sprite = str(data[field]);
    return sprite === undefined ? undefined : pictures.get(sprite);
  };
  let body: ReactNode = null;
  if (item.type === 'bar') {
    const back = picture('back_sprite');
    const fill = picture('sprite');
    body = (
      <>
        {back !== undefined ? (
          <SpriteImage href={back} box={[x, y, w, h]} clipId={`${props.uid}-b`} />
        ) : (
          <rect
            x={x}
            y={y}
            width={w}
            height={h}
            fill={str(data.back_color) ?? HUD_DEFAULTS.backColor}
          />
        )}
        {fill !== undefined ? (
          <SpriteImage
            href={fill}
            box={[x, y, w, h]}
            clip={item.filled}
            clipId={`${props.uid}-f`}
          />
        ) : (
          <rect
            x={x}
            y={y}
            width={item.filled}
            height={h}
            fill={str(data.fill_color) ?? HUD_DEFAULTS.fillColor}
          />
        )}
      </>
    );
  } else if (item.type === 'icons' && item.icons !== null) {
    const { full, half, empty } = item.icons;
    const step = HUD_LAYOUT.iconStep;
    const size = HUD_LAYOUT.iconSize;
    const icon = (kind: 'icon' | 'half_icon' | 'empty_icon', index: number) => {
      const ix = x + index * step;
      const href = picture(kind);
      if (href !== undefined) {
        return (
          <SpriteImage
            key={`${kind}-${index}`}
            href={href}
            box={[ix, y, size, size]}
            clipId={`${props.uid}-${index}`}
          />
        );
      }
      return (
        <g key={`${kind}-${index}`}>
          <rect
            x={ix + 0.5}
            y={y + 0.5}
            width={size - 1}
            height={size - 1}
            fill={kind === 'empty_icon' ? '#00000080' : 'none'}
            stroke="#1a1a1a"
            strokeWidth={1}
          />
          {kind !== 'empty_icon' && (
            <rect
              x={ix + 1}
              y={y + 1}
              width={kind === 'half_icon' ? (size - 2) / 2 : size - 2}
              height={size - 2}
              fill="#d83a3a"
            />
          )}
        </g>
      );
    };
    body = (
      <>
        {Array.from({ length: full }, (_, index) => icon('icon', index))}
        {Array.from({ length: half }, (_, index) => icon('half_icon', full + index))}
        {Array.from({ length: empty }, (_, index) => icon('empty_icon', full + half + index))}
      </>
    );
  } else {
    const colour = str(data.color) ?? HUD_DEFAULTS.textColor;
    const text = (dx: number, fill: string) => (
      <text
        x={x + dx}
        y={y + 8 + dx}
        fill={fill}
        fontSize={8}
        fontFamily="ui-monospace, monospace"
        textLength={w > 0 ? w - 1 : undefined}
        lengthAdjust="spacingAndGlyphs"
      >
        {item.line}
      </text>
    );
    body = (
      <>
        {data.shadow !== false && text(1, '#3f3f3f')}
        {text(0, colour)}
      </>
    );
  }
  return (
    <g
      data-testid={`hud-preview-item-${item.box.id}`}
      data-x={x}
      data-y={y}
      data-w={w}
      data-h={h}
      data-current={props.current ? 'true' : undefined}
    >
      {body}
      {props.current && w > 0 && h > 0 && (
        <rect
          x={x - 1.5}
          y={y - 1.5}
          width={w + 3}
          height={h + 3}
          fill="none"
          stroke="#ffd84a"
          strokeWidth={1}
          strokeDasharray="2 1"
        />
      )}
    </g>
  );
}

/** The "Preview" section of the HUD Studio. */
export function HudPreview(props: {
  project: Project;
  elementId: string;
  data: Json;
  target: Pick<TargetFacts, 'folders'>;
}) {
  const { project, elementId, data, target } = props;
  const [scale, setScale] = useState<number>(DEFAULT_PREVIEW_SCALE);
  const [inVehicle, setInVehicle] = useState(false);
  const veryEasy = useVeryEasy();
  const [value, setValue] = useState<number | undefined>(undefined);
  const uid = useId().replaceAll(':', '');
  const max = maxNumberOf(data);
  const shown = value ?? sampleValue(data);
  const layout = useMemo(
    () => previewLayout(project, { id: elementId, data }, { scale, inVehicle, value: shown }),
    [project, elementId, data, scale, inVehicle, shown],
  );
  const sprites = layout.items.flatMap((item) =>
    ['sprite', 'back_sprite', 'icon', 'half_icon', 'empty_icon']
      .map((field) => str(item.data[field]))
      .filter((sprite): sprite is string => sprite !== undefined),
  );
  const pictures = useSpritePictures(sprites, target);
  const [gw, gh] = layout.gui;
  const hotbarX = Math.floor((gw - HOTBAR[0]) / 2);
  const hotbarY = gh - HOTBAR[1];
  const isText =
    data !== null && typeof data === 'object' && !Array.isArray(data) && data.type === 'text';
  const valueId = useId();

  return (
    <Section title="Preview" testId="hud-preview">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <fieldset className="flex items-center gap-1" aria-label="GUI scale">
          <span className="text-muted">GUI scale</span>
          {PREVIEW_SCALES.map((entry) => (
            // biome-ignore lint/a11y/useSemanticElements: a toggle button, not a bare radio
            <button
              key={entry}
              type="button"
              role="radio"
              aria-checked={scale === entry}
              data-testid={`hud-preview-scale-${entry}`}
              className={`rounded border px-2 py-0.5 ${scale === entry ? 'border-accent' : 'border-border'}`}
              onClick={() => setScale(entry)}
            >
              {entry}
            </button>
          ))}
        </fieldset>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            data-testid="hud-preview-vehicle"
            checked={inVehicle}
            onChange={(event) => setInVehicle(event.target.checked)}
          />
          Riding a vehicle
        </label>
        <div className="flex items-center gap-1">
          <label htmlFor={valueId} className="text-muted">
            Preview value
          </label>
          {isText ? (
            <input
              id={valueId}
              type="number"
              step="any"
              className="w-20 rounded border border-border bg-transparent px-1"
              data-testid="hud-preview-value"
              value={shown}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) setValue(next);
              }}
            />
          ) : (
            <input
              id={valueId}
              type="range"
              min={0}
              max={max > 0 ? max : 1}
              step="any"
              data-testid="hud-preview-value"
              value={shown}
              onChange={(event) => setValue(Number(event.target.value))}
            />
          )}
        </div>
      </div>
      <p className="text-muted text-xs" data-testid="hud-preview-gui">
        A 1920 by 1080 window at GUI scale {scale} is {gw} by {gh} GUI pixels. Text widths are close
        to the game’s, not exact.
      </p>
      <svg
        viewBox={`0 0 ${gw} ${gh}`}
        className="w-full max-w-2xl rounded border border-border"
        style={{ aspectRatio: `${gw} / ${gh}` }}
        role="img"
        aria-label={
          veryEasy
            ? 'The game screen with what you show on it'
            : 'The game screen with your HUD elements'
        }
        data-testid="hud-preview-screen"
        data-gui={`${gw}x${gh}`}
      >
        <defs>
          <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6f9be8" />
            <stop offset="1" stopColor="#b9d3f5" />
          </linearGradient>
        </defs>
        <rect x={0} y={0} width={gw} height={gh * 0.55} fill={`url(#${uid}-sky)`} />
        <rect x={0} y={gh * 0.55} width={gw} height={gh * 0.45} fill="#5d8a3a" />
        <rect x={0} y={gh * 0.55} width={gw} height={3} fill="#4b7330" />
        <g stroke="#ffffff" strokeWidth={1} opacity={0.8}>
          <line x1={gw / 2 - 4} y1={gh / 2} x2={gw / 2 + 5} y2={gh / 2} />
          <line x1={gw / 2 + 0.5} y1={gh / 2 - 4.5} x2={gw / 2 + 0.5} y2={gh / 2 + 4.5} />
        </g>
        <g
          data-testid="hud-preview-hotbar"
          fill="none"
          stroke="#202020"
          strokeWidth={1}
          opacity={0.75}
        >
          <rect
            x={hotbarX + 0.5}
            y={hotbarY + 0.5}
            width={HOTBAR[0] - 1}
            height={HOTBAR[1] - 1}
            fill="#00000040"
          />
          {Array.from({ length: 8 }, (_, index) => (
            <line
              key={index}
              x1={hotbarX + 1 + 20 * (index + 1) + 0.5}
              y1={hotbarY + 1}
              x2={hotbarX + 1 + 20 * (index + 1) + 0.5}
              y2={hotbarY + HOTBAR[1] - 1}
            />
          ))}
          <rect x={hotbarX + 0.5} y={gh - 39 + 0.5} width={80} height={8} strokeDasharray="2 2" />
          <rect
            x={hotbarX + 101 + 0.5}
            y={gh - 39 + 0.5}
            width={80}
            height={8}
            strokeDasharray="2 2"
          />
        </g>
        {layout.items.map((item, index) => (
          <PreviewItem
            key={item.box.id}
            item={item}
            current={item.box.id === elementId}
            pictures={pictures}
            uid={`${uid}-${index}`}
          />
        ))}
      </svg>
    </Section>
  );
}
