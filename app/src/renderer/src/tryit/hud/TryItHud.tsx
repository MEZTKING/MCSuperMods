/**
 * Try it's HUD layer (B429, ADR 0089 D4, D5, ADR 0091 D6): every HUD element the simulation
 * shows and, while the player rides a vehicle with a dashboard, its rows, drawn over the picture
 * as an SVG in GUI pixels at the game's automatic GUI scale for the picture's size in device
 * pixels. Placement is `hud-model.ts` over the HUD Studio's `hud-layout.ts` (the golden's twin);
 * sprites are the project's own pictures from the lowered files (no Mojang art), else the
 * element's colours. Drawing only; part of the lazy Try it chunk.
 *
 * Each drawn item is a `tryit-hud-item` with `data-id`, `data-x`, `data-y`, `data-w`, `data-h`
 * (GUI pixels), `data-value` and, for bars, `data-filled`; the layer is `tryit-hud` with
 * `data-gui` and `data-scale`.
 *
 * @packageDocumentation
 */

import type { JsonObject, TargetFacts } from '@msm/plugin-api';
import { hudSpritePath } from '@msm/plugin-controls';
import type { DashboardRow, HudFrameItem, SimFiles } from '@msm/sim';
import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react';
import { HUD_DEFAULTS, textWidth } from '../../studios/controls/controls-model';
import { HUD_LAYOUT, type Pair } from '../../studios/controls/hud-layout';
import {
  DASHBOARD,
  dashboardItems,
  hudItemOf,
  type PlacedHudItem,
  placeHud,
  type TryItHudItem,
  tryItGui,
} from './hud-model';

/** Props of {@link TryItHud}. */
export interface TryItHudProps {
  /** The elements drawn now (the simulation's `controls.hud.frame()`). */
  frame(): readonly HudFrameItem[];
  /** The ridden vehicle's dashboard rows (`controls.dashboard()`). */
  dashboard(): readonly DashboardRow[];
  /** The lowered files, for the project's sprites. */
  files: SimFiles;
  target: Pick<TargetFacts, 'folders'>;
}

const pictures = new WeakMap<Uint8Array, string>();

/** A PNG of the files as a `data:` URL (the Content Security Policy allows no `blob:`). */
function pictureOf(bytes: string | Uint8Array | undefined): string | undefined {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return undefined;
  let url = pictures.get(bytes);
  if (url === undefined) {
    let text = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    url = `data:image/png;base64,${btoa(text)}`;
    pictures.set(bytes, url);
  }
  return url;
}

/** The picture size of an element in device pixels, followed as it changes. */
function useDevicePixels(): [RefObject<HTMLDivElement | null>, Pair] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Pair>([0, 0]);
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const measure = (): void => {
      const ratio = globalThis.devicePixelRatio || 1;
      const next: Pair = [
        Math.round(element.clientWidth * ratio),
        Math.round(element.clientHeight * ratio),
      ];
      setSize((before) => (before[0] === next[0] && before[1] === next[1] ? before : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}

/** The HUD over Try it's picture; see the module comment. */
export function TryItHud(props: TryItHudProps) {
  const [ref, device] = useDevicePixels();
  const uid = useId();
  const items: TryItHudItem[] = [
    ...props.frame().flatMap((item) => {
      const drawn = hudItemOf(item);
      return drawn === null ? [] : [drawn];
    }),
    ...dashboardItems(props.dashboard()),
  ];
  const { gui, scale } = tryItGui(device[0] > 0 && device[1] > 0 ? device : [854, 480]);
  const placed = placeHud(items, gui);
  const sprite = (definition: JsonObject, field: string): string | undefined => {
    const id = definition[field];
    if (typeof id !== 'string' || id === '') return undefined;
    const path = hudSpritePath(props.target, id);
    return path === undefined ? undefined : pictureOf(props.files.get(path));
  };
  const ratio = globalThis.devicePixelRatio || 1;
  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      {placed.length > 0 && (
        <svg
          aria-hidden="true"
          data-testid="tryit-hud"
          data-gui={`${gui[0]} ${gui[1]}`}
          data-scale={scale}
          viewBox={`0 0 ${gui[0]} ${gui[1]}`}
          width={(gui[0] * scale) / ratio}
          height={(gui[1] * scale) / ratio}
          className="absolute top-0 left-0"
          style={{ imageRendering: 'pixelated' }}
        >
          {placed.map((item, index) => (
            <HudItem key={item.box.id} item={item} sprite={sprite} uid={`${uid}-${index}`} />
          ))}
        </svg>
      )}
    </div>
  );
}

/** A picture over `[x, y, w, h]`, its left `clip` pixels only when given. */
function Sprite(props: {
  href: string;
  box: [number, number, number, number];
  clip?: number;
  id: string;
}) {
  const [x, y, w, h] = props.box;
  return (
    <>
      {props.clip !== undefined && (
        <clipPath id={props.id}>
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
        {...(props.clip === undefined ? {} : { clipPath: `url(#${props.id})` })}
      />
    </>
  );
}

/** A line of HUD text with the game's drop shadow. */
function Line(props: {
  x: number;
  y: number;
  text: string;
  colour: string;
  shadow: boolean;
  width: number;
}) {
  const text = (dx: number, fill: string) => (
    <text
      x={props.x + dx}
      y={props.y + 8 + dx}
      fill={fill}
      fontSize={8}
      fontFamily="ui-monospace, monospace"
      textLength={props.width > 1 ? props.width - 1 : undefined}
      lengthAdjust="spacingAndGlyphs"
    >
      {props.text}
    </text>
  );
  return (
    <>
      {props.shadow && text(1, '#3f3f3f')}
      {text(0, props.colour)}
    </>
  );
}

function HudItem(props: {
  item: PlacedHudItem;
  sprite(definition: JsonObject, field: string): string | undefined;
  uid: string;
}) {
  const { item } = props;
  const [x, y] = item.position;
  const [w, h] = item.box.size;
  let body: ReactNode = null;
  let value: string | undefined;
  let filled: number | undefined;
  switch (item.kind) {
    case 'bar': {
      const d = item.definition;
      const back = props.sprite(d, 'back_sprite');
      const fill = props.sprite(d, 'sprite');
      value = item.value === null ? '' : String(item.value);
      filled = item.filled;
      body = (
        <>
          {back !== undefined ? (
            <Sprite href={back} box={[x, y, w, h]} id={`${props.uid}-b`} />
          ) : (
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={typeof d.back_color === 'string' ? d.back_color : HUD_DEFAULTS.backColor}
            />
          )}
          {item.filled > 0 &&
            (fill !== undefined ? (
              <Sprite href={fill} box={[x, y, w, h]} clip={item.filled} id={`${props.uid}-f`} />
            ) : (
              <rect
                x={x}
                y={y}
                width={item.filled}
                height={h}
                fill={typeof d.fill_color === 'string' ? d.fill_color : HUD_DEFAULTS.fillColor}
              />
            ))}
        </>
      );
      break;
    }
    case 'icons': {
      const { full, half, empty } = item.icons;
      const size = HUD_LAYOUT.iconSize;
      value = item.value === null ? '' : String(item.value);
      const icon = (field: 'icon' | 'half_icon' | 'empty_icon', index: number) => {
        const ix = x + index * HUD_LAYOUT.iconStep;
        const href = props.sprite(item.definition, field);
        return href !== undefined ? (
          <Sprite
            key={`${field}-${index}`}
            href={href}
            box={[ix, y, size, size]}
            id={`${props.uid}-${index}`}
          />
        ) : (
          <rect
            key={`${field}-${index}`}
            x={ix + 1}
            y={y + 1}
            width={field === 'half_icon' ? (size - 2) / 2 : size - 2}
            height={size - 2}
            fill={field === 'empty_icon' ? '#00000080' : '#d83a3a'}
            stroke="#1a1a1a"
            strokeWidth={0.5}
          />
        );
      };
      body = (
        <>
          {Array.from({ length: full }, (_, index) => icon('icon', index))}
          {Array.from({ length: half }, (_, index) => icon('half_icon', full + index))}
          {Array.from({ length: empty }, (_, index) => icon('empty_icon', full + half + index))}
        </>
      );
      break;
    }
    case 'text':
      value = item.value === null ? '' : String(item.value);
      body = (
        <Line x={x} y={y} text={item.line} colour={item.colour} shadow={item.shadow} width={w} />
      );
      break;
    case 'dashboard': {
      const by = y + Math.floor((HUD_LAYOUT.textHeight - DASHBOARD.barHeight) / 2);
      filled = item.filled;
      body = (
        <>
          <Line
            x={x}
            y={y}
            text={item.label}
            colour="#ffffff"
            shadow
            width={textWidth(item.label)}
          />
          <rect
            x={x + item.barX}
            y={by}
            width={DASHBOARD.barWidth}
            height={DASHBOARD.barHeight}
            fill={DASHBOARD.colours.back}
          />
          {item.filled > 0 && (
            <rect
              x={x + item.barX}
              y={by}
              width={item.filled}
              height={DASHBOARD.barHeight}
              fill={item.colour}
            />
          )}
        </>
      );
      break;
    }
  }
  return (
    <g
      data-testid="tryit-hud-item"
      data-id={item.box.id}
      data-kind={item.kind}
      data-x={x}
      data-y={y}
      data-w={w}
      data-h={h}
      {...(value === undefined ? {} : { 'data-value': value })}
      {...(filled === undefined ? {} : { 'data-filled': filled })}
      {...(item.kind === 'text' || item.kind === 'dashboard'
        ? { 'data-text': item.kind === 'text' ? item.line : item.label }
        : {})}
    >
      {body}
    </g>
  );
}
