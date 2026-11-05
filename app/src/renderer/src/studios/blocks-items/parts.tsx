/**
 * Small fields shared by the Block and Item Studios: a text field that coalesces typing, a
 * checkbox, the model field with "Go to model", an event picker and inline problems.
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/core';
import { ExternalLink } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { iconButtonClass } from '../../components/ui/Button';
import { type FormProblem, inputClass, ProblemList } from '../../forms';
import { useStructureStudioHost } from '../structures/host';
import { IdField, SelectField } from '../structures/pickers';
import { findElement, MODEL_KIND } from './blocks-items-model';

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
