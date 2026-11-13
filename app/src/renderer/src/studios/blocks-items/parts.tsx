/**
 * Small fields shared by the Block and Item Studios: a text field that coalesces typing, a
 * checkbox, the model field with "Go to model", an event picker, inline problems and the
 * Block Studio's shape outline preview.
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/core';
import { FULL_CUBE } from '@msm/plugin-blocks-items';
import { ExternalLink } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { iconButtonClass } from '../../components/ui/Button';
import { type FormProblem, inputClass, ProblemList } from '../../forms';
import { useStructureStudioHost } from '../structures/host';
import { IdField, SelectField } from '../structures/pickers';
import { findElement, MODEL_KIND, type PixelBox } from './blocks-items-model';

/** The problems of `problems` at exactly `pointer`. */
export function ProblemsAt({
  problems,
  pointer,
}: {
  problems: readonly FormProblem[];
  pointer: string;
}) {
  return <ProblemList problems={problems.filter((problem) => problem.path === pointer)} />;
}

/** A free-text field; `onCommit(undefined)` when cleared. */
export function TextField(props: {
  label: string;
  value: Json | undefined;
  onCommit(value: string | undefined): void;
  testId?: string;
  placeholder?: string;
}) {
  const external = typeof props.value === 'string' ? props.value : '';
  const [text, setText] = useState(external);
  const id = useId();
  useEffect(() => setText(external), [external]);
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-xs">
      <label htmlFor={id} className="text-muted">
        {props.label}
      </label>
      <input
        id={id}
        type="text"
        className={inputClass}
        data-testid={props.testId}
        placeholder={props.placeholder}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          props.onCommit(next === '' ? undefined : next);
        }}
      />
    </div>
  );
}

/** A labelled checkbox. */
export function CheckField(props: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
  testId?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        data-testid={props.testId}
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      {props.label}
    </label>
  );
}

/** The model id with registry suggestions and "Go to model" when the project defines it. */
export function ModelField(props: {
  project: Project;
  value: Json | undefined;
  suggest(registry: string, prefix: string): string[];
  onCommit(value: string | undefined): void;
  invalid: boolean;
}) {
  const host = useStructureStudioHost();
  const model = typeof props.value === 'string' ? props.value : '';
  const own = model === '' ? undefined : findElement(props.project, model, MODEL_KIND);
  return (
    <div className="flex items-end gap-1">
      <IdField
        label="Model"
        value={model}
        registry="model"
        suggest={props.suggest}
        testId="msm-model"
        invalid={props.invalid}
        className="flex-1"
        onCommit={(text) => props.onCommit(text === '' ? undefined : text)}
      />
      <button
        type="button"
        aria-label="Go to model"
        title={
          own === undefined
            ? 'The model is not part of this project'
            : host === null
              ? 'Not available here'
              : `Open ${model}`
        }
        className={iconButtonClass}
        disabled={own === undefined || host === null}
        onClick={() => {
          if (own !== undefined) host?.openElement(own.id);
        }}
      >
        <ExternalLink size={12} aria-hidden />
      </button>
    </div>
  );
}

/** A select over the element's events; the empty choice clears the field. */
export function EventSelect(props: {
  label: string;
  value: Json | undefined;
  events: readonly string[];
  onChange(value: string | undefined): void;
  testId?: string;
  emptyLabel?: string;
}) {
  return (
    <SelectField
      label={props.label}
      value={typeof props.value === 'string' && props.value !== '' ? props.value : undefined}
      choices={props.events}
      emptyLabel={props.emptyLabel ?? '(none)'}
      onChange={props.onChange}
      {...(props.testId === undefined ? {} : { testId: props.testId })}
    />
  );
}

/** The twelve edges of a box, as pairs of corner indices (bit 0: x, bit 1: y, bit 2: z). */
const BOX_EDGES: readonly (readonly [number, number])[] = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

const COS30 = Math.cos(Math.PI / 6);

/** An isometric projection of a pixel position: x to the right and down, z to the left. */
function project(x: number, y: number, z: number): [number, number] {
  return [(x - z) * COS30, (x + z) * 0.5 - y];
}

/** The SVG path of a box's outline. */
function boxPath(box: readonly number[]): string {
  const [x1 = 0, y1 = 0, z1 = 0, x2 = 16, y2 = 16, z2 = 16] = box;
  const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((bits) =>
    project(bits & 1 ? x2 : x1, bits & 2 ? y2 : y1, bits & 4 ? z2 : z1),
  );
  return BOX_EDGES.map(([a, b]) => {
    const [ax, ay] = corners[a] as [number, number];
    const [bx, by] = corners[b] as [number, number];
    return `M${ax.toFixed(2)} ${ay.toFixed(2)}L${bx.toFixed(2)} ${by.toFixed(2)}`;
  }).join('');
}

/**
 * A live isometric outline of a block shape (ADR 0059): the block space dashed, each box drawn
 * over it; walk-through shapes dashed too.
 */
export function ShapePreview(props: { boxes: readonly PixelBox[]; walkThrough: boolean }) {
  const count = props.boxes.length;
  return (
    <svg
      role="img"
      aria-label={`Shape outline: ${count} ${count === 1 ? 'box' : 'boxes'}${props.walkThrough ? ', walk-through' : ''}`}
      data-testid="block-shape-preview"
      viewBox="-15 -17 30 34"
      width={120}
      height={136}
      className="shrink-0 text-muted"
    >
      <path
        d={boxPath(FULL_CUBE)}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.35}
        strokeDasharray="0.8 0.8"
        strokeWidth={0.2}
      />
      {props.boxes.map((box, index) => (
        <path
          key={index}
          data-testid="block-shape-preview-box"
          d={boxPath(box)}
          fill="none"
          stroke="var(--color-accent, currentColor)"
          strokeDasharray={props.walkThrough ? '1 0.6' : undefined}
          strokeWidth={0.45}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
