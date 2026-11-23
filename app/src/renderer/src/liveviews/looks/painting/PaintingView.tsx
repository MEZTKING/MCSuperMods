/**
 * A painting on a wall at its size, beside a player figure for scale (ADR 0121 D5, B628): the
 * painting's picture (`textures/painting/` under its `asset_id`, the project's or the user's own
 * jar's) stretched over its `width` by `height` blocks, one block above the floor on a wall of
 * blocks, with MSM's own figure of a player (1.8 blocks tall) standing beside it. Drawn flat from
 * the front and, with WebGL, on B623's wall and frame shapes. About right: the sizes are the
 * data's; the game's light is not shown.
 */

import type { Json } from '@msm/plugin-api';
import { useMemo } from 'react';
import { pngDataUrl } from '../../../preview/bundle-source';
import { usePlain } from '../../../studios/plain';
import { resourceFoldersOf } from '../../frame/item-picture';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import type { LiveViewProps } from '../../registry';
import {
  idWords,
  recordOf,
  ShapeCanvas,
  stringOf,
  texturePathOf,
  useLookBytes,
  useSettled,
} from '../banner/look-parts';
import { encodePng, readPixels } from '../banner/pixels';
import { STAND_IN_WORDS, splitId } from '../particle/look-pictures';
import { paintingAtlas, paintingBlocks, paintingGeo, standInPicture } from './compose';

/** The player's height and width in blocks (the game's standing hit box). */
export const PLAYER_HEIGHT = 1.8;
const PLAYER_WIDTH = 0.6;

/** The drawing's widest size on screen, in CSS pixels. */
const MAX_DRAWING = 360;

/** The jar path of a painting's picture. */
export function paintingPicturePath(assetId: string, textures = 'textures'): string {
  return texturePathOf(assetId, 'painting', textures);
}

/** MSM's own player figure, `size` CSS pixels a block, feet at (`x`, `floor`). */
function PlayerFigure(props: { x: number; floor: number; size: number }) {
  const { x, floor, size } = props;
  const px = (blocks: number) => blocks * size;
  const top = floor - px(PLAYER_HEIGHT);
  const head = px(0.5);
  const body = px(0.6);
  const legs = px(PLAYER_HEIGHT) - head - body;
  const w = px(PLAYER_WIDTH);
  return (
    <g
      data-testid="live-painting-player"
      data-height={PLAYER_HEIGHT}
      aria-label="A player for scale"
    >
      <rect x={x + (w - head) / 2} y={top} width={head} height={head} fill="#c69a74" />
      <rect x={x} y={top + head} width={w} height={body} fill="#3a7ca5" />
      <rect x={x - w / 4} y={top + head} width={w / 4} height={body} fill="#c69a74" />
      <rect x={x + w} y={top + head} width={w / 4} height={body} fill="#c69a74" />
      <rect x={x} y={top + head + body} width={w / 2} height={legs} fill="#3b3f78" />
      <rect x={x + w / 2} y={top + head + body} width={w / 2} height={legs} fill="#34386c" />
    </g>
  );
}

/** The view; see the module comment. */
export default function PaintingView(props: LiveViewProps) {
  const { project, element, vanillaAssets, readProject } = props;
  const veryEasy = usePlain();
  const data = useSettled(element.data as Json);
  const record = recordOf(data);
  const width = paintingBlocks(record?.width);
  const height = paintingBlocks(record?.height);
  const assetId = stringOf(record?.asset_id);
  const textures = resourceFoldersOf(project)?.textures ?? 'textures';
  const path = assetId === undefined ? null : paintingPicturePath(assetId, textures);
  const bytes = useLookBytes(path === null ? [] : [path], { vanillaAssets, readProject });
  const found = useMemo(
    () => (bytes === null || path === null ? null : readPixels(bytes[path])),
    [bytes, path],
  );
  const picture = useMemo(() => found ?? standInPicture(width, height), [found, width, height]);
  const url = useMemo(() => pngDataUrl(encodePng(picture)), [picture]);
  const atlas = useMemo(() => paintingAtlas(picture), [picture]);
  const geo = useMemo(
    () => paintingGeo(width, height, picture.width, picture.height),
    [width, height, picture],
  );

  // The drawing: one block of wall round the painting, the player two blocks to its right.
  const wallWidth = width + 2;
  const wallHeight = Math.max(height + 2, 3);
  const total = wallWidth + 2;
  const size = Math.max(6, Math.min(32, Math.floor(MAX_DRAWING / total)));
  const floor = wallHeight * size;
  const lines: number[] = [];
  for (let i = 1; i < wallWidth; i += 1) lines.push(i);

  const name = idWords(project, element.id);
  const perBlockX = picture.width / width;
  const perBlockY = picture.height / height;
  const notes = [
    'The painting is drawn flat from the front with MSM’s own wall and player; the game’s light is not shown.',
    ...(found !== null && (perBlockX !== perBlockY || !Number.isInteger(perBlockX))
      ? [
          `The picture is ${picture.width} by ${picture.height} pixels; the game stretches it over ${width} by ${height} blocks.`,
        ]
      : []),
    ...(vanillaAssets === null &&
    assetId !== undefined &&
    splitId(assetId).namespace === 'minecraft'
      ? [STAND_IN_WORDS]
      : []),
    ...(assetId === undefined
      ? ['The painting names no picture yet (its asset id is empty): MSM draws a blank canvas.']
      : bytes !== null && found === null
        ? [
            veryEasy
              ? 'The painting has no picture yet: MSM draws a blank canvas.'
              : `The painting has no picture yet: ${path ?? ''}. MSM draws a blank canvas.`,
          ]
        : []),
  ];
  return (
    <LiveViewFrame
      title="Painting"
      fidelity="about_right"
      notes={notes}
      needsSetUp={
        vanillaAssets === null &&
        assetId !== undefined &&
        splitId(assetId).namespace === 'minecraft'
      }
      onSetup={props.onSetup}
    >
      <p className="text-sm" data-testid="live-painting-words">
        {`${name}: ${width} by ${height} block${width * height === 1 ? '' : 's'}, beside a player ${PLAYER_HEIGHT} blocks tall.`}
      </p>
      <svg
        role="img"
        aria-label={`${name} on a wall beside a player`}
        width={total * size}
        height={floor}
        viewBox={`0 0 ${total * size} ${floor}`}
        data-testid="live-painting"
        data-block={size}
      >
        <rect x={0} y={0} width={wallWidth * size} height={floor} fill="#c4beb2" />
        {lines.map((i) => (
          <line
            key={`x${i}`}
            x1={i * size}
            x2={i * size}
            y1={0}
            y2={floor}
            stroke="#b0aa9e"
            strokeWidth={1}
          />
        ))}
        {Array.from({ length: wallHeight - 1 }, (_, i) => i + 1).map((i) => (
          <line
            key={`y${i}`}
            x1={0}
            x2={wallWidth * size}
            y1={i * size}
            y2={i * size}
            stroke="#b0aa9e"
            strokeWidth={1}
          />
        ))}
        <image
          href={url}
          x={size}
          y={floor - (height + 1) * size}
          width={width * size}
          height={height * size}
          preserveAspectRatio="none"
          style={{ imageRendering: 'pixelated' }}
          data-testid="live-painting-picture"
          data-width={width}
          data-height={height}
          data-found={found !== null}
        />
        <PlayerFigure x={(wallWidth + 0.7) * size} floor={floor} size={size} />
      </svg>
      <ShapeCanvas
        geo={geo}
        pixels={atlas}
        name="painting"
        folders={resourceFoldersOf(project)}
        testId="live-painting-canvas"
      />
    </LiveViewFrame>
  );
}
