/**
 * A picture for each block type in the Block Studio's Type picker (B452, ADR 0101 D1): line
 * pictures from `lucide-react` (already used across the app) and two drawn here (stairs and a
 * ladder, which it has no picture for). No Minecraft picture is used.
 *
 * @packageDocumentation
 */

import {
  Axis3d,
  Bean,
  BedDouble,
  Box,
  BrickWall,
  Cake,
  CircleDot,
  Citrus,
  Construction,
  Cuboid,
  Cylinder,
  DoorClosed,
  Fence,
  Flame,
  Flower,
  Flower2,
  Grape,
  Grid2x2,
  Grid3x3,
  LampCeiling,
  Layers,
  Leaf,
  LeafyGreen,
  Lightbulb,
  Link,
  Minus,
  Nut,
  Orbit,
  PanelBottom,
  PanelTop,
  RectangleHorizontal,
  Scroll,
  Signpost,
  Sprout,
  Wand,
  Wheat,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { BlockTypeName } from './block-type-model';

/** A picture component: lucide's icons and the ones drawn here. */
type Picture = ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;

/** A picture drawn here, in lucide's style (24 by 24, round strokes). */
function drawn(paths: readonly string[], name: string): Picture {
  const Drawn = (props: { size?: number | string; 'aria-hidden'?: boolean }) => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.size ?? 24}
      height={props.size ?? 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={props['aria-hidden'] ?? true}
    >
      <title>{name}</title>
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
  Drawn.displayName = name;
  return Drawn;
}

const Stairs = drawn(['M3 21h18', 'M3 21V15h6V9h6V3h6v18'], 'Stairs');
const Ladder = drawn(['M7 2v20', 'M17 2v20', 'M7 6h10', 'M7 12h10', 'M7 18h10'], 'Ladder');
/** A wavy strand with leaves, as kelp. */
const Strand = drawn(
  ['M12 22c-3-3 3-6 0-9s3-6 0-9', 'M12 16c2 0 3-1 4-3', 'M12 9c-2 0-3-1-4-3'],
  'Strand',
);
/** Two jointed stalks, as sugar cane. */
const Stalks = drawn(
  ['M9 22V2', 'M15 22V7', 'M7 8h4', 'M7 15h4', 'M13 12h4', 'M13 18h4'],
  'Stalks',
);
/** A patch spread over two faces of a corner, as glow lichen. */
const Lichen = drawn(
  ['M3 3v18h18', 'M3 7a3 3 0 0 0 3 3', 'M3 13a3 3 0 0 1 3 3 3 3 0 0 0 3 3', 'M14 21a3 3 0 0 1 3-3'],
  'Lichen',
);
/** A big leaf on a stem. */
const Dripleaf = drawn(['M12 22V10', 'M3 9c4-4 14-4 18 0-5 2-13 2-18 0z'], 'Dripleaf');
/** A flower pot with a sprout. */
const FlowerPot = drawn(
  [
    'M5 13h14',
    'M6 13l2 8h8l2-8',
    'M12 13V7',
    'M12 9c-2 0-4-2-4-4 2 0 4 2 4 4z',
    'M12 8c2 0 4-2 4-4-2 0-4 2-4 4z',
  ],
  'Flower pot',
);

/** The picture of each type. */
const PICTURES: Readonly<Record<BlockTypeName, Picture>> = {
  block: Box,
  pillar: Cylinder,
  horizontal: Cuboid,
  directional: Axis3d,
  slab: PanelBottom,
  stairs: Stairs,
  wall: BrickWall,
  fence: Fence,
  fence_gate: Grid2x2,
  door: DoorClosed,
  trapdoor: PanelTop,
  button: CircleDot,
  pressure_plate: Minus,
  pane: Grid3x3,
  portal: Orbit,
  crop: Wheat,
  sapling: Sprout,
  leaves: Leaf,
  berry_bush: Grape,
  tall_plant: Flower2,
  potted_plant: Flower,
  vine: LeafyGreen,
  sea_pickle: Bean,
  stem: Citrus,
  cocoa: Nut,
  layers: Layers,
  bed: BedDouble,
  cake: Cake,
  ladder: Ladder,
  torch: Flame,
  lantern: LampCeiling,
  chain: Link,
  candle: Lightbulb,
  rod: Wand,
  carpet: RectangleHorizontal,
  scaffolding: Construction,
  sign: Signpost,
  hanging_sign: Scroll,
  growing_plant: Strand,
  column_plant: Stalks,
  multiface: Lichen,
  dripleaf: Dripleaf,
  flower_pot: FlowerPot,
};

/** The picture of a block type, hidden from screen readers (the label says the type). */
export function BlockTypePicture(props: { type: BlockTypeName; size?: number }) {
  const Shown = PICTURES[props.type];
  return <Shown size={props.size ?? 20} aria-hidden />;
}
