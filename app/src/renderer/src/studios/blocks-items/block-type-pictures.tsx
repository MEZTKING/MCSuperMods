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
};

/** The picture of a block type, hidden from screen readers (the label says the type). */
export function BlockTypePicture(props: { type: BlockTypeName; size?: number }) {
  const Shown = PICTURES[props.type];
  return <Shown size={props.size ?? 20} aria-hidden />;
}
