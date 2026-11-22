/**
 * The Block Studio's Waterlogging switch (B452, ADR 0094 D7, ADR 0101 D1): `msm:waterloggable`
 * on the types that take it (`WATERLOGGABLE_BLOCK_TYPES`: simple, pillar and facing blocks). The
 * new types vanilla waterlogs by itself (ladder, lantern, chain, signs, candle, sea pickle,
 * scaffolding, and B516's dripleaf) say so instead; the other types show nothing.
 *
 * B516 (ADR 0104 D3, ADR 0112 D1): storage and machines hold water too, as vanilla's chests do,
 * keeping their contents, screen and hoppers; their switch reads **Holds water**.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import {
  containerOf,
  hasWaterloggable,
  machineOf,
  WATERLOGGABLE_BLOCK_TYPES,
  WATERLOGGABLE_COMPONENT,
} from '@msm/plugin-blocks-items';
import type { FormProblem } from '../../forms';
import type { BlockTypeName } from './block-type-model';
import { asObject, pointerOf } from './blocks-items-model';
import { CheckField, ProblemsAt } from './parts';

/** The types that hold water by themselves, as vanilla's (ADR 0094 D7). */
export const SELF_WATERLOGGED_TYPES: readonly BlockTypeName[] = Object.freeze([
  'ladder',
  'lantern',
  'chain',
  'sign',
  'hanging_sign',
  'candle',
  'sea_pickle',
  'scaffolding',
  'dripleaf',
]);

/** What the switch shows for block data of `type`. */
export type WaterloggingState =
  /** The switch, on or off. */
  | 'switch'
  /** The switch of storage or a machine, "Holds water" (ADR 0104 D3). */
  | 'storage'
  /** A note: the type holds water by itself. */
  | 'own'
  /** Nothing (the type never holds water and has no component to remove). */
  | 'none';

/** What the switch shows for `type` and its data. */
export function waterloggingState(type: BlockTypeName, data: Json | undefined): WaterloggingState {
  if (SELF_WATERLOGGED_TYPES.includes(type)) return 'own';
  const allowed = WATERLOGGABLE_BLOCK_TYPES.includes(type);
  if (!allowed) return hasWaterloggable(data) ? 'switch' : 'none';
  if (containerOf(data) !== undefined || machineOf(data) !== undefined) return 'storage';
  return 'switch';
}

/** The data with `msm:waterloggable` added (`on`) or removed, in one edit. */
export function withWaterloggable(data: Json | undefined, on: boolean): Json {
  const source = asObject(data);
  const components = { ...asObject(source.components) };
  if (on) components[WATERLOGGABLE_COMPONENT] = {};
  else delete components[WATERLOGGABLE_COMPONENT];
  const out: { [key: string]: Json } = { ...source };
  if (Object.keys(components).length === 0) delete out.components;
  else out.components = components;
  return out;
}

/** Props of {@link WaterloggingSwitch}. */
export interface WaterloggingSwitchProps {
  type: BlockTypeName;
  data: Json;
  problems: readonly FormProblem[];
  /** Replaces the whole element data in one edit. */
  replace(data: Json): void;
}

export function WaterloggingSwitch(props: WaterloggingSwitchProps) {
  const { type, data, problems } = props;
  const state = waterloggingState(type, data);
  if (state === 'none') return null;
  const problemsAt = (
    <ProblemsAt problems={problems} pointer={pointerOf(['components', WATERLOGGABLE_COMPONENT])} />
  );
  if (state === 'own') {
    return (
      <p className="text-muted text-xs" data-testid="block-waterlogged-own">
        It can stand in water by itself, as in Minecraft.
      </p>
    );
  }
  const on = hasWaterloggable(data);
  if (state === 'storage') {
    return (
      <>
        <CheckField
          label="Holds water (placed underwater, it fills with water and keeps its contents)"
          checked={on}
          testId="block-waterlogged"
          onChange={(checked) => props.replace(withWaterloggable(data, checked))}
        />
        <p className="text-muted text-xs" data-testid="block-waterlogged-storage">
          Its screen, hoppers and comparators work as before; breaking it leaves the water.
        </p>
        {problemsAt}
      </>
    );
  }
  return (
    <>
      <CheckField
        label="Can stand in water (placed underwater, it stays full of water, like a slab)"
        checked={on}
        testId="block-waterlogged"
        onChange={(checked) => props.replace(withWaterloggable(data, checked))}
      />
      {problemsAt}
    </>
  );
}
