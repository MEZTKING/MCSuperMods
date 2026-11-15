/**
 * The Rule book Studio (ADR 0082 D1, D7 (a)): an `msm:rules` element as a list of rule cards with
 * "Add a rule", the counters the rules use, the book's own problems in plain words, and, in
 * Advanced mode, "What this becomes" and "Copy as my own script" (D7 (d)). Loaded lazily (`studios.tsx`), so it is a chunk of its own.
 * Every edit is one undoable `onChange('', nextBook)`; typing coalesces.
 *
 * @packageDocumentation
 */

import type { Element, Json } from '@msm/core';
import { Plus, X } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ThingPictures } from '../../components/thing-picker/ThingPicker';
import { Button, iconButtonClass } from '../../components/ui/Button';
import { inputClass } from '../../forms';
import { typingKey } from '../../forms/context';
import { useBlocksItemsStudioHost } from '../blocks-items/host';
import { useStructureStudioHost } from '../structures/host';
import type { StudioProps } from '../types';
import { bookChange, createChange, type NewElement } from './book-changes';
import { planCopyAsScript } from './copy-as-script';
import { makeRulesEnv, type RulesEnv, RulesEnvContext } from './env';
import { useRulesMode } from './mode';
import { ProblemLines } from './parts';
import { usePlainProblemWords } from './problem-words';
import { RuleCard } from './RuleCard';
import {
  addRule,
  asArray,
  asObject,
  countersOf,
  newRule,
  pointerOf,
  problemAnchor,
  type RuleBookData,
  rulesOf,
  setAt,
} from './rules-model';
import { WhatThisBecomes } from './WhatThisBecomes';

const SCOPE_WORDS: Record<'player' | 'mob' | 'world', string> = {
  player: 'for each player',
  mob: 'for each mob',
  world: 'for the world',
};

/** The Rule book Studio. */
export function RuleBookStudio(props: StudioProps) {
  const { project, element, target, onChange, focusPointer, onFocused } = props;
  const book: RuleBookData = useMemo(() => asObject(element.data) ?? {}, [element.data]);
  const mode = useRulesMode();
  const plainWords = usePlainProblemWords();
  const host = useBlocksItemsStudioHost();
  const container = useRef<HTMLDivElement | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const registries = useMemo(
    () => props.context.registries(project, element.kind),
    [props.context, project, element.kind],
  );
  const pictures = useMemo<ThingPictures | null>(() => {
    const vanilla = host?.modelPreview?.vanilla;
    if (host === null && vanilla === undefined) return null;
    return {
      project: host?.thumbnail,
      vanilla:
        vanilla === null || vanilla === undefined ? undefined : (path) => vanilla.readAsset(path),
      revision: host?.revision,
    };
  }, [host]);
  const requestFocus = useCallback((pointer: string) => {
    pendingFocus.current = pointer;
  }, []);
  const env: RulesEnv = useMemo(
    () =>
      makeRulesEnv({
        project,
        bookId: element.id,
        book,
        registries,
        texturesFolder: target.folders.resource.textures,
        pictures,
        mode,
        problems: props.sessionProblems,
        plainWords,
        requestFocus,
      }),
    [
      project,
      element.id,
      book,
      registries,
      target,
      pictures,
      mode,
      props.sessionProblems,
      plainWords,
      requestFocus,
    ],
  );
  const change = useCallback(
    (next: RuleBookData, coalesce?: string) => {
      if (coalesce === undefined) onChange('', next as Json);
      else onChange('', next as Json, { coalesce });
    },
    [onChange],
  );

  // A book change with new elements ("Make a new on-screen number"): one undo step through the
  // host, where it can change other elements.
  const [changeError, setChangeError] = useState<string | null>(null);
  const hostApply = host?.applyChanges;
  const changeWith = useMemo(
    () =>
      hostApply === undefined
        ? undefined
        : (next: RuleBookData, created: readonly NewElement[], label: string) => {
            setChangeError(null);
            hostApply(
              [bookChange(element.id, element.data, next), ...created.map(createChange)],
              label,
              [],
            ).catch((error: unknown) =>
              setChangeError(error instanceof Error ? error.message : String(error)),
            );
          },
    [hostApply, element.id, element.data],
  );

  const focusAt = useCallback((pointer: string): boolean => {
    const node = container.current?.querySelector<HTMLElement>(
      `[data-pointer="${pointer.replace(/["\\]/g, '\\$&')}"]`,
    );
    if (node === null || node === undefined) return false;
    node.focus();
    node.scrollIntoView?.({ block: 'nearest' });
    return true;
  }, []);

  // Focus requested by a card (a moved or added rule, step or condition), after the edit renders.
  useEffect(() => {
    const pointer = pendingFocus.current;
    if (pointer === null) return;
    pendingFocus.current = null;
    focusAt(pointer);
  });

  // "Show me" from the Problems panel or Things to fix: the chip, row or card of the pointer.
  useEffect(() => {
    if (focusPointer === null) return;
    const anchor = problemAnchor(book, focusPointer);
    if (anchor !== '') focusAt(anchor);
    onFocused();
  }, [focusPointer, book, focusAt, onFocused]);

  const rules = rulesOf(book);
  const bookProblems = env.problems.get('') ?? [];
  const add = (): void => {
    change(addRule(book, newRule(book)));
    requestFocus(pointerOf('rules', rules.length));
  };

  return (
    <RulesEnvContext.Provider value={env}>
      <div ref={container} className="flex flex-col gap-3" data-testid="rule-book-studio">
        <header className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Rule book</h2>
          <p className="text-sm text-muted">
            Each rule says when something happens, what must be true, and what to do. No code
            needed.
          </p>
        </header>
        <ProblemLines problems={bookProblems} testId="rule-book-problems" />
        {changeError !== null && (
          <p role="alert" className="text-error text-xs" data-testid="rule-book-error">
            {changeError}
          </p>
        )}
        {rules.length === 0 ? (
          <p className="text-muted" data-testid="rule-book-empty">
            No rules yet. Add one to make something happen.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {rules.map((rule, index) => (
              <li key={keyOf(rule, index)}>
                <RuleCard
                  book={book}
                  index={index}
                  onChange={change}
                  {...(changeWith === undefined ? {} : { onChangeWith: changeWith })}
                />
              </li>
            ))}
          </ol>
        )}
        <Button className="self-start" data-testid="rule-add" onClick={add}>
          <Plus size={14} aria-hidden /> Add a rule
        </Button>
        <Counters book={book} onChange={change} />
        {mode.advanced && <WhatThisBecomes project={project} bookId={element.id} target={target} />}
        {mode.advanced && <CopyAsScript {...props} />}
      </div>
    </RulesEnvContext.Provider>
  );
}

/** What "Copy as my own script" last did. */
type CopyStatus =
  | {
      readonly kind: 'done';
      readonly text: string;
      readonly scriptId: string | null;
      readonly warnings: readonly string[];
    }
  | { readonly kind: 'error'; readonly text: string };

/**
 * "Copy as my own script" (ADR 0082 D7 (d), Advanced): one undo step that makes the book's
 * generated script a script of the user's own, its events hand-made events on its things, and
 * turns the book's rules off. Planned on click, not on every edit (it compiles the books).
 */
function CopyAsScript(props: StudioProps) {
  const { project, element, target } = props;
  const host = useBlocksItemsStudioHost();
  const structureHost = useStructureStudioHost();
  const [status, setStatus] = useState<CopyStatus | null>(null);
  const apply = host?.applyChanges;
  if (apply === undefined) return null;
  const copy = (): void => {
    const plan = planCopyAsScript(project, element.id, target);
    if (!plan.ok) {
      setStatus({ kind: 'error', text: plan.reason });
      return;
    }
    apply(plan.items, plan.label, []).then(
      () => {
        const things = plan.subjects.length === 1 ? 'thing' : 'things';
        const events =
          plan.subjects.length === 0
            ? ''
            : ` Its events are now your own on ${plan.subjects.length} ${things}.`;
        setStatus({
          kind: 'done',
          text:
            plan.scriptId === null
              ? `Copied: every rule here was plain, so no script was needed.${events} The rules here are turned off.`
              : `Copied to the script ${plan.scriptId}.${events} The rules here are turned off.`,
          scriptId: plan.scriptId,
          warnings: plan.warnings,
        });
      },
      (error: unknown) =>
        setStatus({ kind: 'error', text: error instanceof Error ? error.message : String(error) }),
    );
  };
  return (
    <section
      className="flex flex-col gap-1 rounded border border-border p-2"
      data-testid="rules-copy-as-script"
    >
      <h3 className="font-semibold">Copy as my own script</h3>
      <p className="text-xs text-muted">
        Makes the script and events these rules become your own, to change by hand, and turns these
        rules off so nothing runs twice. Undo puts everything back.
      </p>
      <Button className="self-start" data-testid="rules-copy-as-script-button" onClick={copy}>
        Copy as my own script
      </Button>
      {status?.kind === 'error' && (
        <p role="alert" className="text-error text-xs" data-testid="rules-copy-as-script-error">
          {status.text}
        </p>
      )}
      {status?.kind === 'done' && (
        <div className="flex flex-col gap-1 text-xs" data-testid="rules-copy-as-script-done">
          <p role="status">{status.text}</p>
          {status.warnings.map((warning) => (
            <p key={warning} className="text-warning">
              {warning}
            </p>
          ))}
          {status.scriptId !== null && structureHost !== null && (
            <button
              type="button"
              className="self-start underline"
              data-testid="rules-copy-as-script-open"
              onClick={() => structureHost.openElement(status.scriptId as Element['id'])}
            >
              Open the script
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** A React key for a rule: its `key`, or its place when it has none (hand-edited files). */
function keyOf(rule: Json, index: number): string {
  const key = asObject(rule)?.key;
  return typeof key === 'string' ? `key:${key}:${index}` : `index:${index}`;
}

/** The counters the book declares: their start values and removal. */
function Counters(props: {
  book: RuleBookData;
  onChange(next: RuleBookData, coalesce?: string): void;
}) {
  const { book } = props;
  const counters = countersOf(book);
  const headingId = useId();
  if (counters.length === 0) return null;
  const entries = asArray(book.counters);
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-1"
      data-testid="rule-counters"
    >
      <h3 id={headingId} className="font-semibold">
        Counters
      </h3>
      <p className="text-xs text-muted">
        Counters are saved with the world. A new test world starts them again.
      </p>
      <ul className="flex flex-col gap-1">
        {entries.map((entry, index) => {
          const counter = asObject(entry);
          const name = typeof counter?.name === 'string' ? counter.name : '';
          const scope = counter?.scope;
          const words =
            scope === 'player' || scope === 'mob' || scope === 'world' ? SCOPE_WORDS[scope] : '';
          const pointer = pointerOf('counters', index, 'start');
          return (
            <li key={`${String(scope)}:${name}`} className="flex items-center gap-2">
              <span className="min-w-0 flex-1">
                {name.replace(/_/g, ' ')} <span className="text-muted">{words}</span>
              </span>
              <label className="flex items-center gap-1 text-xs">
                starts at
                <input
                  type="number"
                  className={`${inputClass} w-20`}
                  aria-label={`${name.replace(/_/g, ' ')} starts at`}
                  value={typeof counter?.start === 'number' ? counter.start : 0}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (!Number.isFinite(value)) return;
                    props.onChange(
                      setAt(book, pointer, value === 0 ? undefined : value),
                      typingKey(pointer),
                    );
                  }}
                />
              </label>
              <button
                type="button"
                className={iconButtonClass}
                aria-label={`Remove the counter ${name.replace(/_/g, ' ')}`}
                onClick={() => props.onChange(setAt(book, pointerOf('counters', index), undefined))}
              >
                <X size={14} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default RuleBookStudio;
