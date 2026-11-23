/**
 * The Rules section of the Block, Item, Mob and Effect Studios (ADR 0082 D7 (b)): the rules
 * whose subject is this thing, as rule cards with the thing fixed, and "Add a rule" (the When
 * chip pre-filled with the thing's first trigger). The rules live in rule books (`msm:rules`),
 * not in the thing, so every edit goes to the book through the host's `applyChanges` as one undo
 * step. "Add a rule" writes into the book that already holds the thing's rules, else into the
 * project's default book `<namespace>:rules`, created on demand (`turn-into-rules.ts`).
 *
 * The cards show the books' compile problems and, when the host gives the session's problems,
 * their schema and validator problems too ({@link bookProblems}).
 *
 * Typing in a card (a rule name, a message) is held back for {@link TYPING_DELAY_MS} and sent as
 * one step; any other edit sends at once. The Studios load this section lazily.
 *
 * @packageDocumentation
 */

import type { Element, Problem, Project } from '@msm/core';
import type { Target } from '@msm/plugin-api';
import { RULES_KIND } from '@msm/plugin-rules';
import { ExternalLink, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeItem } from '../../changeset/changeset';
import type { ThingPictures } from '../../components/thing-picker/ThingPicker';
import { Button } from '../../components/ui/Button';
import { registerPendingEdit } from '../../session/pending-edits';
import type { SchemaContext } from '../../session/schema-context';
import { useBlocksItemsStudioHost } from '../blocks-items/host';
import { useStructureStudioHost } from '../structures/host';
import { Section } from '../worldgen/parts';
import { bookChange, createChange, type NewElement } from './book-changes';
import { makeRulesEnv, RulesEnvContext } from './env';
import { useRulesMode } from './mode';
import { usePlainProblemWords } from './problem-words';
import { RuleCard } from './RuleCard';
import { addRule, asObject, newRule, pointerOf, type RuleBookData, rulesOf } from './rules-model';
import { bookForSubject, firstTriggerFor, NEW_BOOK_DATA, subjectRules } from './turn-into-rules';

/** How long typing in a card is held back before it is sent as one undo step. */
export const TYPING_DELAY_MS = 600;

/** The words for each kind of thing. */
const THING_WORDS: Readonly<Record<string, string>> = {
  'msm:block': 'block',
  'msm:item': 'item',
  'msm:entity': 'mob',
  'msm:effect': 'effect',
  'msm:key_bind': 'key',
  'msm:vehicle': 'vehicle',
  'msm:command': 'command',
};

/** What the Rules section says about a kind of thing. */
export function rulesSectionIntro(kind: string): string {
  const thing = THING_WORDS[kind] ?? 'thing';
  return `Rules say what this ${thing} does when something happens. No code needed.`;
}

/** Shown when the thing has no rules. */
export function noRulesNote(kind: string): string {
  return `No rules for this ${THING_WORDS[kind] ?? 'thing'} yet.`;
}

/** Shown when the host cannot change other elements (tests, previews). */
export const RULES_READ_ONLY_NOTE = 'Open the rule book to change these rules.';

// ---------------------------------------------------------------------------------------------
// Writing to books
// ---------------------------------------------------------------------------------------------

type ApplyChanges = (items: readonly ChangeItem[], label: string) => Promise<void>;

export { bookChange } from './book-changes';

/**
 * Book edits from the cards: a draft per book shown at once, sent through `apply` one after
 * another (typing after {@link TYPING_DELAY_MS}); a draft is dropped once the project has it.
 */
function useBookDrafts(apply: ApplyChanges | undefined, onError: (message: string) => void) {
  const [drafts, setDrafts] = useState<ReadonlyMap<string, RuleBookData>>(new Map());
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const chain = useRef<Promise<void>>(Promise.resolve());

  const flush = useCallback(
    (bookId: string) => {
      const timer = timers.current.get(bookId);
      if (timer !== undefined) clearTimeout(timer);
      timers.current.delete(bookId);
      const next = draftsRef.current.get(bookId);
      if (next === undefined || apply === undefined) return;
      chain.current = chain.current
        .then(() => apply([bookChange(bookId, {}, next)], 'Edit rules'))
        .then(
          () =>
            setDrafts((current) => {
              if (current.get(bookId) !== next) return current;
              const without = new Map(current);
              without.delete(bookId);
              return without;
            }),
          (error: unknown) => {
            setDrafts(new Map());
            onError(error instanceof Error ? error.message : String(error));
          },
        );
    },
    [apply, onError],
  );

  const change = useCallback(
    (bookId: string, next: RuleBookData, coalesce?: string) => {
      const map = new Map(draftsRef.current);
      map.set(bookId, next);
      draftsRef.current = map;
      setDrafts(map);
      const timer = timers.current.get(bookId);
      if (timer !== undefined) clearTimeout(timer);
      if (coalesce === undefined) {
        flush(bookId);
        return;
      }
      timers.current.set(
        bookId,
        setTimeout(() => flush(bookId), TYPING_DELAY_MS),
      );
    },
    [flush],
  );

  /** Sends `next` with new elements as one step, after any typing held back for the book. */
  const changeWith = useCallback(
    (bookId: string, next: RuleBookData, created: readonly NewElement[], label: string) => {
      const timer = timers.current.get(bookId);
      if (timer !== undefined) clearTimeout(timer);
      timers.current.delete(bookId);
      const map = new Map(draftsRef.current);
      map.set(bookId, next);
      draftsRef.current = map;
      setDrafts(map);
      if (apply === undefined) return;
      chain.current = chain.current
        .then(() => apply([bookChange(bookId, {}, next), ...created.map(createChange)], label))
        .then(
          () =>
            setDrafts((current) => {
              if (current.get(bookId) !== next) return current;
              const without = new Map(current);
              without.delete(bookId);
              return without;
            }),
          (error: unknown) => {
            setDrafts(new Map());
            onError(error instanceof Error ? error.message : String(error));
          },
        );
    },
    [apply, onError],
  );

  // Save and the discard check send held-back typing first; so does leaving the Studio.
  useEffect(() => {
    // Resolves once every edit sent so far (held back or already on its way) is in the project.
    const flushAll = (): Promise<void> => {
      for (const bookId of [...timers.current.keys()]) flush(bookId);
      return chain.current;
    };
    const unregister = registerPendingEdit(flushAll);
    return () => {
      unregister();
      void flushAll();
    };
  }, [flush]);

  return { drafts, change, changeWith };
}

// ---------------------------------------------------------------------------------------------
// The section
// ---------------------------------------------------------------------------------------------

/** Props of {@link RulesSection}. */
export interface RulesSectionProps {
  project: Project;
  /** The thing (a project block, item, mob or effect). */
  element: Element;
  target: Target;
  /** The Studio's schema context (for the registry view the pickers read). */
  context: SchemaContext;
}

/** The Rules section of a thing's Studio. */
export function RulesSection(props: RulesSectionProps) {
  const { project, element, target } = props;
  const host = useBlocksItemsStudioHost();
  const structureHost = useStructureStudioHost();
  const mode = useRulesMode();
  const plainWords = usePlainProblemWords();
  const rules = useMemo(() => subjectRules(project, target), [project, target]);
  const [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement | null>(null);
  const pendingFocus = useRef<{ bookId: string; pointer: string } | null>(null);
  const hostApply = host?.applyChanges;
  const apply = useMemo<ApplyChanges | undefined>(
    () => (hostApply === undefined ? undefined : (items, label) => hostApply(items, label, [])),
    [hostApply],
  );
  const { drafts, change, changeWith } = useBookDrafts(apply, setError);
  const requestFocus = useCallback((bookId: string, pointer: string) => {
    pendingFocus.current = { bookId, pointer };
  }, []);
  const sessionProblems = host?.problems;
  const problemsByBook = useMemo(
    () => bookProblems(rules.problems ?? [], sessionProblems),
    [rules, sessionProblems],
  );
  const registries = useMemo(
    () => props.context.registries(project, RULES_KIND),
    [props.context, project],
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

  // The books with a rule on this thing (drafts shown in place of the saved data).
  const groups = useMemo(() => {
    const books = [...rules.view.books].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return books.flatMap((book) => {
      const data = drafts.get(book.id) ?? asObject(book.data) ?? {};
      const indexes: number[] = [];
      rulesOf(data).forEach((rule, index) => {
        if (asObject(asObject(rule)?.when)?.subject === element.id) indexes.push(index);
      });
      return indexes.length === 0 ? [] : [{ book, data, indexes }];
    });
  }, [rules, drafts, element.id]);

  // Focus the card a move, a duplicate or "Add a rule" asked for, once it is shown.
  useEffect(() => {
    const wanted = pendingFocus.current;
    if (wanted === null) return;
    const node = container.current?.querySelector<HTMLElement>(
      `[data-rules-book="${quoted(wanted.bookId)}"] [data-pointer="${quoted(wanted.pointer)}"]`,
    );
    if (node === null || node === undefined) return;
    pendingFocus.current = null;
    node.focus();
    node.scrollIntoView?.({ block: 'nearest' });
  });

  const add = (): void => {
    if (apply === undefined) return;
    setError(null);
    const choice = bookForSubject(project, element.id);
    const saved = drafts.get(choice.id) ?? choice.data;
    const book = saved ?? structuredClone(NEW_BOOK_DATA);
    const trigger = firstTriggerFor(element.kind, element.data, { veryEasy: true });
    const rule = newRule(book, {
      ...(trigger === undefined ? {} : { trigger: trigger.id }),
      subject: element.id,
    });
    const next = addRule(book, rule);
    pendingFocus.current = { bookId: choice.id, pointer: pointerOf('rules', rulesOf(book).length) };
    if (saved !== undefined) {
      // An existing book: sent at once, after any typing held back for it.
      change(choice.id, next);
      return;
    }
    apply([bookChange(choice.id, undefined, next)], 'Add a rule').catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  };

  const kindWords = THING_WORDS[element.kind] ?? 'thing';
  return (
    <Section title="Rules" testId="rules-section">
      <div ref={container} className="flex flex-col gap-2">
        <p className="text-muted text-xs">{rulesSectionIntro(element.kind)}</p>
        {groups.length === 0 && (
          <p className="text-muted text-xs" data-testid="rules-section-empty">
            {noRulesNote(element.kind)}
          </p>
        )}
        {groups.map(({ book, data, indexes }) => (
          <BookGroup
            key={book.id}
            book={book}
            data={data}
            indexes={indexes}
            project={project}
            element={element}
            env={{
              registries,
              texturesFolder: target.folders.resource.textures,
              pictures,
              mode,
              plainWords,
              problems: problemsByBook.get(book.id) ?? NO_PROBLEMS,
            }}
            editable={apply !== undefined}
            showBookName={groups.length > 1 || mode.advanced}
            onOpen={structureHost === null ? undefined : () => structureHost.openElement(book.id)}
            onChange={(next, coalesce) => {
              setError(null);
              change(book.id, next, coalesce);
            }}
            onChangeWith={(next, created, label) => {
              setError(null);
              changeWith(book.id, next, created, label);
            }}
            requestFocus={requestFocus}
          />
        ))}
        {apply === undefined ? (
          groups.length > 0 && <p className="text-muted text-xs">{RULES_READ_ONLY_NOTE}</p>
        ) : (
          <Button
            className="self-start text-xs"
            data-testid="rules-section-add"
            aria-label={`Add a rule for this ${kindWords}`}
            onClick={add}
          >
            <Plus size={12} aria-hidden /> Add a rule
          </Button>
        )}
        {error !== null && (
          <p role="alert" className="text-error text-xs" data-testid="rules-section-error">
            {error}
          </p>
        )}
      </div>
    </Section>
  );
}

/** The rules of one book on the thing. */
function BookGroup(props: {
  book: Element;
  data: RuleBookData;
  indexes: readonly number[];
  project: Project;
  element: Element;
  env: Omit<Parameters<typeof makeRulesEnv>[0], 'project' | 'bookId' | 'book' | 'requestFocus'>;
  editable: boolean;
  showBookName: boolean;
  onOpen: (() => void) | undefined;
  onChange(next: RuleBookData, coalesce?: string): void;
  onChangeWith(next: RuleBookData, created: readonly NewElement[], label: string): void;
  requestFocus(bookId: string, pointer: string): void;
}) {
  const { book, data, project, element, env, requestFocus } = props;
  const value = useMemo(
    () =>
      makeRulesEnv({
        ...env,
        project,
        bookId: book.id,
        book: data,
        requestFocus: (pointer) => requestFocus(book.id, pointer),
      }),
    // `env` is rebuilt on each render of the section; its parts are what matter.
    [
      env.registries,
      env.texturesFolder,
      env.pictures,
      env.mode,
      env.plainWords,
      env.problems,
      project,
      book.id,
      data,
      requestFocus,
    ],
  );
  const fixed = useMemo(() => ({ id: element.id, kind: element.kind }), [element.id, element.kind]);
  const onChange = props.editable ? props.onChange : () => undefined;
  return (
    <RulesEnvContext.Provider value={value}>
      <div
        className="flex flex-col gap-2"
        data-rules-book={book.id}
        data-testid={`rules-section-book-${book.id}`}
      >
        {(props.showBookName || props.onOpen !== undefined) && (
          <p className="flex items-center gap-2 text-xs text-muted">
            {props.showBookName && <span>In the rule book {book.id}</span>}
            {props.onOpen !== undefined && (
              <button
                type="button"
                className="inline-flex items-center gap-1 underline"
                data-testid="rules-section-open-book"
                onClick={props.onOpen}
              >
                <ExternalLink size={12} aria-hidden /> Open the rule book
              </button>
            )}
          </p>
        )}
        <ol className="flex flex-col gap-3">
          {props.indexes.map((index) => (
            <li key={`${keyOf(data, index)}`}>
              <RuleCard
                book={data}
                index={index}
                onChange={onChange}
                {...(props.editable ? { onChangeWith: props.onChangeWith } : {})}
                fixedSubject={fixed}
              />
            </li>
          ))}
        </ol>
      </div>
    </RulesEnvContext.Provider>
  );
}

/**
 * The problems of each rule book: the compile problems of the section's own expansion (current
 * at once), plus the session's problems on the books (schema and validator problems, the
 * generated script's diagnostics), without the ones both report.
 */
export function bookProblems(
  compiled: readonly Problem[],
  session: readonly Problem[] | undefined,
): Map<string, Problem[]> {
  const map = new Map<string, Problem[]>();
  const seen = new Set<string>();
  for (const problem of [...compiled, ...(session ?? [])]) {
    if (problem.elementId === undefined) continue;
    const key = `${problem.elementId}|${problem.code}|${problem.path ?? ''}|${problem.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = map.get(problem.elementId) ?? [];
    list.push(problem);
    map.set(problem.elementId, list);
  }
  return map;
}

/** `text` for a double-quoted attribute selector. */
const quoted = (text: string): string => text.replace(/["\\]/g, '\\$&');

const NO_PROBLEMS: readonly Problem[] = [];

/** A React key for rule `index` of `book`: its `key` and place. */
function keyOf(book: RuleBookData, index: number): string {
  const key = asObject(rulesOf(book)[index])?.key;
  return typeof key === 'string' ? `key:${key}:${index}` : `index:${index}`;
}

export default RulesSection;
