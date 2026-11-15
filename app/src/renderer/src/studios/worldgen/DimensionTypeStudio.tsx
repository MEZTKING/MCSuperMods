/**
 * Dimension Type Studio (ADR 0100 D1, D4) for `minecraft:dimension_type`, loaded lazily (a chunk
 * of its own): the sections Sky (with the sky swatch), Light, Time, Rules, Height and Spawning
 * over the target's schema and environment attributes; every other field is under "Advanced
 * (all fields)", which is the same element's schema form.
 */

import type { Json } from '@msm/core';
import { useState } from 'react';
import { childPointer, parsePointer, valueAt } from '../../forms/pointer';
import type { StudioProps } from '../types';
import {
  type DimensionSectionProps,
  HeightSection,
  LightSection,
  RulesSection,
  SkySection,
  SpawningSection,
  TimeSection,
} from './dimension-type-sections';
import { AdvancedToggle } from './parts';
import { asObject, writeAt } from './worldgen-model';

export default function DimensionTypeStudio(props: StudioProps) {
  const { element, node, target, problems, completions, suggest, onChange } = props;
  const [advanced, setAdvanced] = useState(false);

  const pointerOf = (path: readonly string[]) =>
    path.reduce<string>((pointer, key) => childPointer(pointer, key), '');
  /** Sets `value` at `path`, creating absent parent objects; `undefined` removes it. */
  const setPath = (path: readonly string[], value: Json | undefined, coalesce?: string) => {
    const options = coalesce === undefined ? undefined : { coalesce };
    if (value === undefined) {
      const pointer = pointerOf(path);
      if (valueAt(element.data, pointer) !== undefined) onChange(pointer, undefined, options);
      return;
    }
    const parent = pointerOf(path.slice(0, -1));
    if (parent === '' || valueAt(element.data, parent) !== undefined) {
      onChange(pointerOf(path), value, options);
      return;
    }
    const edit = writeAt(element.data, path, value);
    onChange(edit.pointer, edit.value, options);
  };

  if (advanced) {
    return (
      <section
        aria-label="Dimension Type Studio"
        data-testid="dimension-type-studio"
        className="flex flex-col gap-3"
      >
        <AdvancedToggle
          checked={advanced}
          onChange={setAdvanced}
          testId="dimension-advanced-toggle"
        />
        {props.form}
      </section>
    );
  }

  const sections: DimensionSectionProps = {
    data: asObject(element.data),
    node,
    target,
    setPath,
    subChange: (pointer, value, options) =>
      setPath(parsePointer(pointer), value, options?.coalesce),
    problemsAt: (path) => {
      const pointer = pointerOf(path);
      return problems.filter((problem) => problem.path === pointer);
    },
    problems,
    completions,
    suggest,
  };

  return (
    <section
      aria-label="Dimension Type Studio"
      data-testid="dimension-type-studio"
      className="flex flex-col gap-4"
    >
      <AdvancedToggle
        checked={advanced}
        onChange={setAdvanced}
        testId="dimension-advanced-toggle"
      />
      <p className="text-muted text-xs">
        A dimension type holds a dimension's sky, light, time and rules. A dimension uses it through
        its type; open or reload a world to see a change.
      </p>
      <SkySection {...sections} />
      <LightSection {...sections} />
      <TimeSection {...sections} />
      <RulesSection {...sections} />
      <HeightSection {...sections} />
      <SpawningSection {...sections} />
    </section>
  );
}
