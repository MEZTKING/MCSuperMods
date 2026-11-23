/**
 * The live view of `minecraft:waypoint_style` (ADR 0121 D7, B625): the dot each distance shows,
 * on strips like the locator bar, with the distances it covers (B619's rule 3S11: below
 * `near_distance` the first sprite, from `far_distance` the last, the middle ones sharing the
 * range evenly), and a distance slider that moves along them. A dot is drawn at its own pixel
 * size at GUI scale 2, centred on the bar, which is the user's own `locator_bar_background`
 * (nine-slice, from the jar) or MSM's plain bar when the Minecraft folder is not set up.
 * Follows an edit at once.
 */

import type { Json } from '@msm/plugin-api';
import { useId, useMemo, useState } from 'react';
import { useVeryEasy } from '../../../studios/very-easy';
import { resourceFoldersOf } from '../../frame/item-picture';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import type { LiveViewProps } from '../../registry';
import { PixelPicture } from '../particle/LookPicture';
import {
  isVanillaPath,
  type PictureState,
  STAND_IN_WORDS,
  useLookPicture,
  useLookPictures,
} from '../particle/look-pictures';
import {
  DEFAULT_FAR_DISTANCE,
  DEFAULT_NEAR_DISTANCE,
  type SpriteRange,
  spriteIndex,
  spriteRanges,
  waypointSpritePath,
} from './sprites';

/** GUI scale the strip is drawn at. */
const SCALE = 2;
/** The locator bar's width in GUI pixels (the experience bar's place, 3S11). */
const BAR_WIDTH = 182;
/** A strip segment's width in GUI pixels. */
const SEGMENT_WIDTH = 40;
const BAR_HEIGHT = 5;
/** The bar background sprite and its nine-slice border (left, right 5; top, bottom 1). */
const BAR_SPRITE = 'gui/sprites/hud/locator_bar_background';

/** The notes under the view. */
export const WAYPOINT_NOTES: readonly string[] = [
  'In the game each dot is tinted the colour of its player or mob, and sits on the bar where it is; here it is untinted and centred.',
];

type JsonObject = { [key: string]: Json };
const asObject = (value: Json): JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};

const blocks = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} ${rounded === 1 ? 'block' : 'blocks'}`;
};

/** A range in words. */
export function rangeWords(range: SpriteRange): string {
  if (range.from <= 0 && range.to === null) return 'At every distance';
  if (range.from <= 0 && range.to !== null) return `Closer than ${blocks(range.to)}`;
  if (range.to === null) return `${blocks(range.from)} and further`;
  return `${blocks(range.from)} to ${blocks(range.to)}`;
}

/** The style's numbers, with the defaults. */
export function waypointStyleOf(data: Json): { sprites: string[]; near: number; far: number } {
  const object = asObject(data);
  const sprites = Array.isArray(object.sprites)
    ? object.sprites.map((entry) => (typeof entry === 'string' ? entry : ''))
    : [];
  const near =
    typeof object.near_distance === 'number' ? object.near_distance : DEFAULT_NEAR_DISTANCE;
  const far = typeof object.far_distance === 'number' ? object.far_distance : DEFAULT_FAR_DISTANCE;
  return { sprites, near, far };
}

/** A bar of `width` GUI pixels with a dot centred on it. */
function Bar(props: {
  width: number;
  background: PictureState;
  dot: PictureState | undefined;
  label: string;
  testId?: string;
}) {
  const { width, background, dot } = props;
  const barStyle =
    background.state === 'found'
      ? {
          borderStyle: 'solid',
          borderWidth: `${SCALE}px ${5 * SCALE}px`,
          borderImageSource: `url("${background.url}")`,
          borderImageSlice: '1 5 1 5 fill',
          borderImageRepeat: 'stretch',
          imageRendering: 'pixelated' as const,
        }
      : { background: '#3a3a3a', border: `${SCALE}px solid #1e1e1e`, borderRadius: SCALE * 2 };
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: width * SCALE, height: 13 * SCALE }}
      data-testid={props.testId}
    >
      <div
        aria-hidden
        className="absolute left-0 box-border"
        style={{ width: width * SCALE, height: BAR_HEIGHT * SCALE, top: 4 * SCALE, ...barStyle }}
      />
      {dot?.state === 'found' ? (
        <PixelPicture
          url={dot.url}
          width={9 * SCALE}
          height={9 * SCALE}
          label={props.label}
          style={{ position: 'relative' }}
        />
      ) : (
        <span
          role="img"
          aria-label={props.label}
          className="relative flex items-center justify-center rounded-full border border-dashed border-muted text-[10px] text-muted"
          style={{ width: 9 * SCALE, height: 9 * SCALE }}
        >
          {dot?.state === 'loading' ? '' : '?'}
        </span>
      )}
    </div>
  );
}

/** The view; see the module comment. */
export default function WaypointStyleView(props: LiveViewProps) {
  const { project, element, vanillaAssets, readProject } = props;
  const veryEasy = useVeryEasy();
  const sliderId = useId();
  const style = waypointStyleOf(element.data);
  const { sprites, near, far } = style;
  const textures = resourceFoldersOf(project)?.textures ?? 'textures';
  const spriteKey = JSON.stringify(sprites);
  const paths = useMemo(
    () =>
      (JSON.parse(spriteKey) as string[]).map((sprite) =>
        sprite === '' ? null : waypointSpritePath(sprite, textures),
      ),
    [spriteKey, textures],
  );
  const source = { vanillaAssets, readProject };
  const dots = useLookPictures(paths, source);
  const background = useLookPicture(`assets/minecraft/${textures}/${BAR_SPRITE}.png`, source);
  const [distance, setDistance] = useState(0);
  const ranges = spriteRanges(near, far, sprites.length);
  const shown = spriteIndex(distance, near, far, sprites.length);
  const most = Math.max(Math.ceil(far * 1.25), near + 16, 64);
  const words = (index: number) =>
    veryEasy || sprites[index] === '' ? `Dot ${index + 1}` : (sprites[index] ?? '');

  const notSetUp = vanillaAssets === null;
  const missing = sprites
    .map((sprite, index) => ({ sprite, index }))
    .filter(({ index }) => dots[index]?.state === 'missing')
    .filter(({ index }) => !(notSetUp && isVanillaPath(paths[index] ?? '')));
  const notes = [
    ...WAYPOINT_NOTES,
    ...(far <= near && sprites.length > 1
      ? ['The far distance is not past the near distance, so only the first and last dots show.']
      : []),
    ...(notSetUp ? [STAND_IN_WORDS] : []),
    ...missing.map(
      ({ index }) => `${words(index)} has no picture yet: it shows as a question mark.`,
    ),
  ];
  const wantsVanilla = paths.some((path) => path !== null && isVanillaPath(path));

  return (
    <LiveViewFrame
      title="Waypoint style"
      fidelity="about_right"
      notes={notes}
      needsSetUp={notSetUp && wantsVanilla}
      onSetup={props.onSetup}
      controls={
        sprites.length > 0 && (
          <div className="flex flex-col gap-1 text-xs">
            <label htmlFor={sliderId} className="text-muted">
              Distance: {blocks(distance)}
            </label>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={most}
              step={1}
              value={Math.min(distance, most)}
              data-testid="waypoint-distance"
              onChange={(event) => setDistance(Number(event.target.value))}
            />
          </div>
        )
      }
    >
      {sprites.length === 0 ? (
        <p className="text-muted text-sm" data-testid="waypoint-empty">
          No dots yet: the style needs at least one sprite.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div
            className="max-w-full overflow-x-auto rounded bg-black/70 p-2"
            data-testid="waypoint-bar"
            data-index={shown}
          >
            <Bar
              width={BAR_WIDTH}
              background={background}
              dot={dots[shown]}
              label={`At ${blocks(distance)}: ${words(shown)}`}
            />
          </div>
          <ol className="flex flex-wrap gap-2" aria-label="The dot at each distance">
            {ranges.map((range) => (
              <li
                key={range.index}
                className={`flex flex-col items-center gap-1 rounded bg-black/70 p-1 text-white text-xs ${
                  range.index === shown ? 'ring-2 ring-accent' : ''
                }`}
                data-testid={`waypoint-step-${range.index}`}
                data-state={dots[range.index]?.state ?? 'loading'}
              >
                <Bar
                  width={SEGMENT_WIDTH}
                  background={background}
                  dot={dots[range.index]}
                  label={words(range.index)}
                />
                <span>{rangeWords(range)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </LiveViewFrame>
  );
}
