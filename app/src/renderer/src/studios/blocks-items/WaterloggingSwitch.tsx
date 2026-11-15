/**
 * The Block Studio's Waterlogging switch (B452, ADR 0094 D7, ADR 0101 D1): `msm:waterloggable`
 * on the types that take it (`WATERLOGGABLE_BLOCK_TYPES`: simple, pillar and facing blocks), never
 * with storage or a machine (limit Q8: the switch is off and says why, and a component already
 * there can still be removed). The new types vanilla waterlogs by itself (ladder, lantern, chain,
 * signs, candle, sea pickle, scaffolding) say so instead; the other types show nothing.
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
]);

/** What the switch shows for block data of `type`. */
export type WaterloggingState =
  /** The switch, on or off. */
  | 'switch'
  /** The switch is off and disabled: storage or a machine cannot hold water. */
  | 'blocked'
  /** A note: the type holds water by itself. */
  | 'own'
  /** Nothing (the type never holds water and has no component to remove). */
  | 'none';

/** What the switch shows for `type` and its data. */
export function waterloggingState(type: BlockTypeName, data: Json | undefined): WaterloggingState {
  if (SELF_WATERLOGGED_TYPES.includes(type)) return 'own';
  const allowed = WATERLOGGABLE_BLOCK_TYPES.includes(type);
  if (!allowed) return hasWaterloggable(data) ? 'switch' : 'none';
  if (containerOf(data) !== undefined || machineOf(data) !== undefined) return 'blocked';
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
  if (state === 'blocked') {
    return (
      <>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            data-testid="block-waterlogged"
            checked={on}
            disabled={!on}
            onChange={(event) => props.replace(withWaterloggable(data, event.target.checked))}
          />
          Can stand in water
        </label>
        <p className="text-muted text-xs" data-testid="block-waterlogged-blocked">
          Storage and machines cannot stand in water.
          {on ? ' Untick it: the game leaves it dry.' : ''}
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
