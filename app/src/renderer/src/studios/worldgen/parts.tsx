/**
 * Building blocks shared by the worldgen Studios: a schema sub-form mounted at a pointer, an
 * ordered id list, and a collapsible section.
 */

import type { Json } from '@msm/core';
import type { SchemaNode } from '@msm/schemas';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button, iconButtonClass } from '../../components/ui/Button';
import {
  type ChangeOptions,
  type CompletionSource,
  type FormProblem,
  IdDraftInput,
  IdInput,
  idSuggestions,
  isWithin,
  SchemaForm,
} from '../../forms';
import { moved } from './worldgen-model';

/** A titled section of a Studio. */
export function Section({
  title,
  children,
  testId,
}: {
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section aria-label={title} data-testid={testId} className="flex flex-col gap-2">
      <h3 className="font-medium text-sm">{title}</h3>
      <div className="flex flex-col gap-2 pl-2">{children}</div>
    </section>
  );
}

export interface SubFormProps {
  node: SchemaNode;
  value: Json | undefined;
  /** Where the sub-form's root sits in the element. */
  pointer: string;
  /** Accessible name of the sub-form's root. */
  label: string;
  onChange(pointer: string, value: Json | undefined, options?: ChangeOptions): void;
  problems: readonly FormProblem[];
  completions: CompletionSource;
  /** Pointers relative to the sub-form's root that are not rendered. */
  hiddenPaths?: readonly string[];
}

/** The schema form for one part of the element, editing it at {@link SubFormProps.pointer}. */
export function SubForm({
  node,
  value,
  pointer,
  label,
  onChange,
  problems,
  completions,
  hiddenPaths,
}: SubFormProps) {
  const local = problems
    .filter((problem) => isWithin(problem.path, pointer))
    .map((problem) => ({ ...problem, path: problem.path.slice(pointer.length) }));
  return (
    <SchemaForm
      node={node}
      value={value}
      rootLabel={label}
      problems={local}
      completions={completions}
      {...(hiddenPaths === undefined ? {} : { hiddenPaths })}
      onChange={(at, next, options) => onChange(`${pointer}${at}`, next, options)}
    />
  );
}

export interface IdListProps {
  /** Accessible name of the list; rows are "<label> <n>". */
  label: string;
  ids: readonly string[];
  /** The registry suggestions come from, for example `worldgen/placed_feature`. */
  registry: string;
  suggest(registry: string, prefix: string): string[];
  onChange(next: string[]): void;
  /** Pointer of the list, for row problems. */
  pointer: string;
  problems: readonly FormProblem[];
}

/** An ordered list of registry ids: edit, move, remove, add. */
export function IdList({
  label,
  ids,
  registry,
  suggest,
  onChange,
  pointer,
  problems,
}: IdListProps) {
  const [draft, setDraft] = useState('');
  const suggestions = (text: string) => idSuggestions(suggest, registry, text);
  const add = () => {
    const id = draft.trim();
    if (id === '') return;
    onChange([...ids, id]);
    setDraft('');
  };
  return (
    <div className="flex flex-col gap-1">
      {ids.length === 0 && <p className="text-muted text-xs">None.</p>}
      <ol className="flex flex-col gap-1">
        {ids.map((id, index) => {
          const name = `${label} ${index + 1}`;
          const rowProblems = problems.filter((problem) =>
            isWithin(problem.path, `${pointer}/${index}`),
          );
          return (
            <li key={`${index}:${id}`} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1">
                <IdInput
                  value={id}
                  label={name}
                  suggestions={suggestions}
                  invalid={rowProblems.some((problem) => problem.severity === 'error')}
                  onCommit={(text) =>
                    onChange(ids.map((entry, at) => (at === index ? text.trim() : entry)))
                  }
                />
                <button
                  type="button"
                  aria-label={`Move ${name} up`}
                  className={iconButtonClass}
                  disabled={index === 0}
                  onClick={() => onChange(moved(ids, index, index - 1))}
                >
                  <ArrowUp size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${name} down`}
                  className={iconButtonClass}
                  disabled={index === ids.length - 1}
                  onClick={() => onChange(moved(ids, index, index + 1))}
                >
                  <ArrowDown size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  className={iconButtonClass}
                  onClick={() => onChange(ids.filter((_, at) => at !== index))}
                >
                  <X size={12} aria-hidden />
                </button>
              </div>
              {rowProblems.map((problem, at) => (
                <p
                  key={at}
                  className={`text-xs ${problem.severity === 'error' ? 'text-error' : 'text-warning'}`}
                >
                  {problem.message}
                </p>
              ))}
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-1">
        <IdDraftInput
          value={draft}
          label={`New entry in ${label}`}
          placeholder="namespace:id"
          suggestions={suggestions}
          onChange={setDraft}
          onSubmit={add}
        />
        <Button
          className="text-xs"
          disabled={draft.trim() === ''}
          onClick={add}
          aria-label={`Add to ${label}`}
        >
          <Plus size={12} aria-hidden />
          Add
        </Button>
      </div>
    </div>
  );
}

/** The "Advanced (all fields)" switch of a Studio. */
export function AdvancedToggle({
  checked,
  onChange,
  testId,
}: {
  checked: boolean;
  onChange(next: boolean): void;
  testId: string;
}) {
  return (
    <label className="flex items-center gap-1 self-end text-sm">
      <input
        type="checkbox"
        data-testid={testId}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      Advanced (all fields)
    </label>
  );
}
