/**
 * Building blocks shared by the worldgen Studios: a schema sub-form mounted at a pointer, an
 * ordered id list, and a collapsible section.
 */

import type { Json } from '@msm/core';
import type { SchemaNode } from '@msm/schemas';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import { Button, iconButtonClass } from '../../components/ui/Button';
import {
  InMore,
  MoreOptions,
  type MoreSlot,
  MoreSlotContext,
} from '../../components/ui/MoreOptions';
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
import { useCommonSection, usePlain } from '../plain';
import { PlainIdList } from '../plain-things';
import { sectionWhy } from '../section-why';
import { moved } from './worldgen-model';

/**
 * A titled section of a Studio (ADR 0130 D2, D3): its title, a one-line why in the subject's
 * terms (`why`, else `sectionWhy` by test id), its common settings, and at the bottom a
 * **More options** with the section's `more` and every part its fields send there with
 * `InMore` (an id field's raw id, a rarer field). A section the Studio does not list among its
 * common ones (`StudioEntry.common`) shows its title and why, and everything else in its More
 * options.
 */
export function Section({
  title,
  children,
  testId,
  why,
  more,
}: {
  title: string;
  children: ReactNode;
  testId?: string;
  /** The one-line why; `sectionWhy` has one for most test ids. */
  why?: string;
  /** What only the section's More options shows. */
  more?: ReactNode;
}) {
  const common = useCommonSection(testId);
  const plain = usePlain();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [waiting, setWaiting] = useState(0);
  const register = useCallback(() => {
    setWaiting((count) => count + 1);
    return () => setWaiting((count) => count - 1);
  }, []);
  const moreSlot = useMemo<MoreSlot>(() => ({ slot, register }), [slot, register]);
  const reason = why ?? (testId === undefined ? undefined : sectionWhy(testId));
  const key = testId ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const heading = (
    <>
      <h3 className="font-medium text-sm">{title}</h3>
      {reason !== undefined && (
        <p
          className="text-muted text-xs"
          data-testid={testId === undefined ? undefined : `${testId}-why`}
        >
          {reason}
        </p>
      )}
    </>
  );
  // Inside a More options already (or a section that is all More options): everything in place.
  if (!plain) {
    return (
      <section aria-label={title} data-testid={testId} className="flex flex-col gap-2">
        {heading}
        <MoreSlotContext.Provider value={null}>
          <div className="flex flex-col gap-2 pl-2">
            {children}
            {more}
          </div>
        </MoreSlotContext.Provider>
      </section>
    );
  }
  if (!common) {
    return (
      <section aria-label={title} data-testid={testId} className="flex flex-col gap-2">
        {heading}
        <div className="flex flex-col gap-2 pl-2">
          <MoreOptions storageKey={key}>
            <MoreSlotContext.Provider value={null}>
              {children}
              {more}
            </MoreSlotContext.Provider>
          </MoreOptions>
        </div>
      </section>
    );
  }
  return (
    <section aria-label={title} data-testid={testId} className="flex flex-col gap-2">
      {heading}
      <div className="flex flex-col gap-2 pl-2">
        <MoreSlotContext.Provider value={moreSlot}>{children}</MoreSlotContext.Provider>
        {(more !== undefined || waiting > 0) && (
          <MoreOptions storageKey={key}>
            <MoreSlotContext.Provider value={null}>
              {more}
              <div ref={setSlot} className="flex flex-col gap-2" />
            </MoreSlotContext.Provider>
          </MoreOptions>
        )}
      </div>
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

/**
 * An ordered list of registry ids. Plain (ADR 0130 D2): the things by name, added through the
 * ThingPicker, with the ids to edit, move, remove and add in the section's More options.
 */
export function IdList(props: IdListProps) {
  const plain = usePlain();
  if (!plain) return <RawIdList {...props} />;
  return (
    <>
      <PlainIdList
        label={props.label}
        ids={props.ids}
        registry={props.registry}
        onChange={props.onChange}
      />
      <InMore fallbackKey={`ids-${props.pointer}`}>
        <RawIdList {...props} />
      </InMore>
    </>
  );
}

/** The ids of an {@link IdList}: edit, move, remove, add. */
function RawIdList({ label, ids, registry, suggest, onChange, pointer, problems }: IdListProps) {
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
