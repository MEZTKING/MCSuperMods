/**
 * The search panel (ADR 0124 D6, D8, D10, D11): the field, the scope chips, the chips of what was
 * understood, up to three Best matches and the sections with **Show more**, the selected result's
 * preview and buttons, the empty state with three example searches, "Closest things" and "Nothing
 * close" with the Wishlist offer, and a polite live region.
 *
 * It wires nothing itself: it asks `props.query` (the search client's `query`: whole hits, or
 * `null` when a newer query replaced it), hands a chosen button to `props.onAction(hit, which)`
 * (B664 turns it into work), draws `props.preview(hit)` for the selected result (B665) and notes
 * the search with `rememberSearchText` when a result is chosen. The doors (B667) open it lazily:
 * the default export is the panel.
 *
 * Keys (D11), all in the field, which keeps focus: Down and Up move the selection, Page Down and
 * Page Up jump a section, Enter runs the main button (or Show more, the Wishlist, the AI helper),
 * Ctrl/Cmd+Enter the second, Tab goes into the preview's buttons, Escape closes. Reduced motion
 * stops the list's animation and smooth scrolling.
 *
 * @packageDocumentation
 */

import type { SearchAnswer, SearchHit, SearchMode, SearchRequest } from '@msm/search';
import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePreferences } from '../store/preferences';
import { ResultRow } from './ResultRow';
import { ScopeChips } from './ScopeChips';
import { SearchField } from './SearchField';
import { textWithout, UnderstoodChips } from './UnderstoodChips';
import {
  actionsFor,
  bestHeading,
  liveSentence,
  readPrefix,
  rowText,
  SCOPE_PREFIXES,
  SEARCH_MODE,
  type SearchActionKey,
  type SearchDoor,
  type SearchScope,
  searchWords,
  sectionHeading,
  showMoreLabel,
  takesName,
} from './wording';

/** Rows a section shows before Show more (the engine's `SECTION_ROWS`). */
export const SECTION_ROWS = 3;
/** Rows asked for once a section is opened (the engine's `MAX_SECTION_ROWS`). */
export const OPENED_ROWS = 50;

/** What `onAction` may carry besides the key. */
export interface SearchActionOptions {
  /** The name typed for a template (D9: **Add to my mod**, with a name field in the result). */
  readonly name?: string;
}

export interface SearchPanelProps {
  /** Asks the engine (the client's `query`); `null` when a newer query replaced it. */
  readonly query: (request: SearchRequest) => Promise<SearchAnswer | null>;
  /** The words' view; the app's one view by default (ADR 0130 D5). */
  readonly mode?: SearchMode;
  /** Where it was opened (default the toolbar). */
  readonly door?: SearchDoor;
  readonly initialText?: string;
  readonly initialScope?: SearchScope;
  /** Whether a mod is open (no mod: **Start a mod with this**). */
  readonly hasMod: boolean;
  /** A button of a result was chosen (B664). */
  readonly onAction: (
    hit: SearchHit,
    which: SearchActionKey,
    options?: SearchActionOptions,
  ) => void;
  /** The live picture of the selected result (B665). */
  readonly preview?: (hit: SearchHit) => ReactNode;
  /** Escape: the door puts focus back where it was. */
  readonly onClose?: () => void;
  /** **Add it to my Wishlist**, when nothing is close. */
  readonly onWishlist?: (text: string) => void;
  /** **Ask the AI helper**, the last row (B669). */
  readonly onAskAi?: (text: string, hits: readonly SearchHit[]) => void;
  /**
   * The one quiet line about the helper (D12): without a key it stands where **Ask the AI
   * helper** would, and after an ask that opened nothing it says why (`askAi`'s outcome).
   */
  readonly askAiLine?: string;
  /** A third-party plugin's name by its id, shown on its results (B670); `undefined` for built-ins. */
  readonly pluginName?: (id: string) => string | undefined;
  /** Whether Minecraft's own names are read from the user's jar (else the set-up line). */
  readonly minecraftNames?: boolean;
  /** Whether a Thing to fix has a one-step fix (**Fix it**). */
  readonly canFix?: (hit: SearchHit) => boolean;
  /** Reduced motion; default the system's `prefers-reduced-motion`. */
  readonly reducedMotion?: boolean | undefined;
  /** How long typing settles before asking, in ms (default 60; 0 asks at once). */
  readonly delayMs?: number;
  /** Notes a search when a result is chosen (default the preferences' `rememberSearchText`). */
  readonly rememberText?: (text: string) => void;
  readonly autoFocus?: boolean;
}

/** One option of the listbox. */
export type PanelOption =
  | { readonly kind: 'hit'; readonly id: string; readonly hit: SearchHit }
  | { readonly kind: 'more'; readonly id: string; readonly section: string; readonly more: number }
  | { readonly kind: 'wishlist'; readonly id: string }
  | { readonly kind: 'ask-ai'; readonly id: string };

/** A group of the listbox, with its heading. */
export interface PanelGroup {
  readonly id: string;
  readonly heading: string;
  readonly options: readonly PanelOption[];
}

/** The listbox's groups for an answer: Best matches, the sections, then the other rows. */
export function panelGroups(input: {
  readonly base: string;
  readonly answer: SearchAnswer | null;
  readonly mode: SearchMode;
  readonly opened: ReadonlySet<string>;
  readonly wishlist: boolean;
  readonly askAi: boolean;
}): PanelGroup[] {
  const { base, answer, opened } = input;
  if (answer === null) return [];
  const groups: PanelGroup[] = [];
  const optionId = (group: string, index: number | string) => `${base}-${group}-${index}`;
  if (answer.best.length > 0) {
    groups.push({
      id: 'best',
      heading: bestHeading(answer.best.length),
      options: answer.best.map((hit, i) => ({ kind: 'hit', id: optionId('best', i), hit })),
    });
  }
  for (const section of answer.sections) {
    const open = opened.has(section.id);
    const hits = open ? section.hits : section.hits.slice(0, SECTION_ROWS);
    const more = section.more + (section.hits.length - hits.length);
    const options: PanelOption[] = hits.map((hit, i) => ({
      kind: 'hit',
      id: optionId(section.id, i),
      hit,
    }));
    if (more > 0 && !open) {
      options.push({ kind: 'more', id: optionId(section.id, 'more'), section: section.id, more });
    }
    if (options.length > 0) {
      groups.push({ id: section.id, heading: sectionHeading(section.id), options });
    }
  }
  const nothing = groups.length === 0;
  const other: PanelOption[] = [];
  if (nothing && input.wishlist) other.push({ kind: 'wishlist', id: `${base}-other-wishlist` });
  if (input.askAi) other.push({ kind: 'ask-ai', id: `${base}-other-ask-ai` });
  if (other.length > 0) {
    groups.push({ id: 'other', heading: OTHER_HEADING, options: other });
  }
  return groups;
}

/** The heading of the Wishlist and AI helper rows. */
export const OTHER_HEADING = 'Other ways';

/** Every hit of an answer, Best matches first. */
function allHits(answer: SearchAnswer | null): SearchHit[] {
  if (answer === null) return [];
  return [...answer.best, ...answer.sections.flatMap((section) => section.hits)];
}

/** The number of results an answer holds (rows shown and those behind Show more). */
export function resultCount(answer: SearchAnswer | null): number {
  if (answer === null) return 0;
  return (
    answer.best.length +
    answer.sections.reduce((sum, section) => sum + section.hits.length + section.more, 0)
  );
}

function systemReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /mac/i.test(navigator.platform ?? '');
}

/** An answer with the words it answered. */
interface Answered {
  readonly words: string;
  readonly scope: SearchScope | undefined;
  readonly answer: SearchAnswer;
}

export function SearchPanel(props: SearchPanelProps) {
  const {
    query,
    mode = SEARCH_MODE,
    door = 'toolbar',
    hasMod,
    onAction,
    preview,
    onClose,
    onWishlist,
    onAskAi,
    askAiLine,
    pluginName,
    minecraftNames,
    canFix,
    delayMs = 60,
    autoFocus = true,
  } = props;
  const words = searchWords(mode);
  const base = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const listId = `${base}-list`;
  const hintId = `${base}-hint`;
  const fieldRef = useRef<HTMLInputElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(props.initialText ?? '');
  const [chosenScope, setChosenScope] = useState<SearchScope | undefined>(props.initialScope);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const [answered, setAnswered] = useState<Answered | null>(null);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [name, setName] = useState('');
  const [reduced] = useState(() => props.reducedMotion ?? systemReducedMotion());
  const reducedMotion = props.reducedMotion ?? reduced;
  const motion = !reducedMotion;
  const pendingActive = useRef<string | undefined>(undefined);

  const prefixed = readPrefix(text, mode);
  const scope = prefixed.scope ?? chosenScope;
  const asked = prefixed.text.trim();
  const openedKey = [...opened].sort().join(',');

  // Ask the engine as the words, the scope or the opened sections change; newest wins.
  useEffect(() => {
    if (asked === '') {
      setAnswered(null);
      return;
    }
    let live = true;
    const request: SearchRequest = {
      text: asked,
      mode,
      ...(scope !== undefined ? { scope } : {}),
      ...(openedKey !== '' ? { limit: OPENED_ROWS } : {}),
    };
    const ask = () => {
      query(request).then(
        (answer) => {
          if (live && answer !== null) setAnswered({ words: asked, scope, answer });
        },
        () => {
          // A failed query keeps the last answer; the next keystroke asks again.
        },
      );
    };
    if (delayMs <= 0) {
      ask();
      return () => {
        live = false;
      };
    }
    const timer = setTimeout(ask, delayMs);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [asked, scope, mode, openedKey, query, delayMs]);

  const answer = asked === '' ? null : (answered?.answer ?? null);
  const groups = useMemo(
    () =>
      panelGroups({
        base,
        answer,
        mode,
        opened,
        wishlist: onWishlist !== undefined,
        askAi: onAskAi !== undefined && asked !== '',
      }),
    [base, answer, mode, opened, onWishlist, onAskAi, asked],
  );
  const options = useMemo(() => groups.flatMap((group) => group.options), [groups]);

  // Keep the selection on a row that is still there; else the first; a Show more lands on its first new row.
  useEffect(() => {
    if (
      pendingActive.current !== undefined &&
      options.some((o) => o.id === pendingActive.current)
    ) {
      setActiveId(pendingActive.current);
      pendingActive.current = undefined;
      return;
    }
    setActiveId((current) =>
      current !== undefined && options.some((option) => option.id === current)
        ? current
        : options[0]?.id,
    );
  }, [options]);

  const active = options.find((option) => option.id === activeId);
  const activeHit = active?.kind === 'hit' ? active.hit : undefined;

  // A new selection starts with an empty name field.
  useEffect(() => {
    setName('');
  }, [activeHit?.entry.id]);

  // The selected row stays in view (no smooth scrolling with reduced motion).
  useEffect(() => {
    if (activeId === undefined || typeof document === 'undefined') return;
    const element = document.getElementById(activeId);
    if (element !== null && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest', behavior: motion ? 'smooth' : 'auto' });
    }
  }, [activeId, motion]);

  const remember = useCallback(
    (searched: string) => {
      if (searched === '') return;
      if (props.rememberText !== undefined) props.rememberText(searched);
      else usePreferences.getState().rememberSearchText(searched);
    },
    [props.rememberText],
  );

  const changeText = (next: string) => {
    setText(next);
    setOpened(new Set());
    setActiveId(undefined);
  };

  const act = (hit: SearchHit, which: SearchActionKey) => {
    remember(asked);
    const typedName = name.trim();
    if (takesName(hit.entry) && typedName !== '') onAction(hit, which, { name: typedName });
    else onAction(hit, which);
  };

  const buttonsOf = (hit: SearchHit) =>
    actionsFor(hit.entry, {
      mode,
      hasMod,
      ...(canFix !== undefined ? { canFix: canFix(hit) } : {}),
    });

  const run = (option: PanelOption | undefined, second: boolean) => {
    if (option === undefined) return;
    switch (option.kind) {
      case 'hit': {
        const button = buttonsOf(option.hit)[second ? 1 : 0];
        if (button !== undefined) act(option.hit, button.key);
        return;
      }
      case 'more': {
        if (second) return;
        pendingActive.current = `${base}-${option.section}-${SECTION_ROWS}`;
        setOpened((before) => new Set([...before, option.section]));
        return;
      }
      case 'wishlist':
        if (!second) onWishlist?.(asked);
        return;
      case 'ask-ai':
        if (!second) onAskAi?.(asked, allHits(answer));
        return;
    }
  };

  const move = (to: number) => {
    if (options.length === 0) return;
    const index = Math.max(0, Math.min(options.length - 1, to));
    setActiveId(options[index]?.id);
  };

  const jumpGroup = (direction: 1 | -1) => {
    if (groups.length === 0) return;
    const at = groups.findIndex((group) => group.options.some((o) => o.id === activeId));
    const next = groups[Math.max(0, Math.min(groups.length - 1, at + direction))];
    setActiveId(next?.options[0]?.id);
  };

  const onFieldKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const index = options.findIndex((option) => option.id === activeId);
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        move(index < 0 ? 0 : index + 1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        move(index < 0 ? 0 : index - 1);
        return;
      case 'PageDown':
        event.preventDefault();
        jumpGroup(1);
        return;
      case 'PageUp':
        event.preventDefault();
        jumpGroup(-1);
        return;
      case 'Enter':
        event.preventDefault();
        run(active, event.ctrlKey || event.metaKey);
        return;
      case 'Tab': {
        if (event.shiftKey) return;
        const first = actionsRef.current?.querySelector<HTMLElement>('button, input');
        if (first !== null && first !== undefined) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      default:
        return;
    }
  };

  const onPanelKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || onClose === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  const chooseScope = (next: SearchScope | undefined) => {
    // A typed prefix gives way to the chip.
    if (prefixed.scope !== undefined) setText(prefixed.text);
    setChosenScope(next);
    setOpened(new Set());
    fieldRef.current?.focus();
  };

  const removeChip = (chip: { text: string }) => {
    const prefix = prefixed.scope !== undefined ? `${SCOPE_PREFIXES[prefixed.scope]} ` : '';
    changeText(`${prefix}${textWithout(prefixed.text, chip.text)}`.trimEnd());
    fieldRef.current?.focus();
  };

  const pickExample = (example: string) => {
    changeText(example);
    fieldRef.current?.focus();
  };

  const count = resultCount(answer);
  const first = answer?.best[0] ?? answer?.sections[0]?.hits[0];
  const live =
    answer === null
      ? ''
      : liveSentence({
          mode,
          text: asked,
          count,
          confident: answer.confident,
          first,
          understood: answer.understood,
        });
  const nothingClose = answer !== null && count === 0;
  const showsMinecraft =
    minecraftNames === false &&
    (scope === 'minecraft' || allHits(answer).some((hit) => hit.entry.source === 'vanilla'));
  const secondKey = isMac() ? 'Cmd+Enter' : 'Ctrl+Enter';

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape anywhere in the panel closes it (D11).
    <div
      data-testid="search-panel"
      data-mode={mode}
      data-motion={motion ? 'full' : 'reduce'}
      className="flex min-h-0 w-full min-w-0 flex-col gap-2 text-text"
      onKeyDown={onPanelKey}
    >
      <SearchField
        ref={fieldRef}
        value={text}
        onChange={changeText}
        onKeyDown={onFieldKey}
        label={words.fieldLabel}
        placeholder={scope === 'commands' ? words.placeholder.palette : words.placeholder[door]}
        listId={listId}
        expanded={options.length > 0}
        activeId={activeId}
        describedBy={words.hint !== null ? hintId : undefined}
        size={door === 'start' ? 'large' : 'compact'}
        autoFocus={autoFocus}
      />
      {words.hint !== null && (
        <p id={hintId} className="text-muted text-xs">
          {words.hint}
        </p>
      )}
      <ScopeChips mode={mode} scope={scope} onScope={chooseScope} />
      {answer !== null && (
        <UnderstoodChips understood={answer.understood} mode={mode} onRemove={removeChip} />
      )}
      {asked === '' && (
        <div data-testid="search-empty" className="flex flex-col gap-1 text-sm">
          <p className="flex flex-wrap items-center gap-1" data-testid="search-examples">
            <span className="text-muted">{words.examplesLead}</span>
            {words.examples.map((example, i) => (
              <span key={example} className="inline-flex items-center gap-1">
                {i > 0 && (
                  <span aria-hidden="true" className="text-muted">
                    ·
                  </span>
                )}
                <button
                  type="button"
                  className="rounded px-1 text-accent underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  onClick={() => pickExample(example)}
                >
                  {example}
                </button>
              </span>
            ))}
          </p>
          <p className="text-muted text-xs">{words.privacy}</p>
        </div>
      )}
      {answer !== null && !answer.confident && count > 0 && (
        <p className="font-semibold text-sm" data-testid="search-closest">
          {words.closest}
        </p>
      )}
      {nothingClose && (
        <p className="text-sm" data-testid="search-nothing">
          {words.nothingClose}
        </p>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 md:flex-row">
        <div
          id={listId}
          role="listbox"
          aria-label={words.resultsLabel}
          aria-busy={asked !== '' && answered?.words !== asked ? true : undefined}
          data-testid="search-results"
          hidden={options.length === 0}
          className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto md:w-1/2 md:flex-1"
        >
          {groups.map((group) => (
            // biome-ignore lint/a11y/useSemanticElements: a group of options inside the listbox (the ARIA grouped listbox pattern), not a form fieldset.
            <div
              key={group.id}
              role="group"
              aria-labelledby={`${base}-${group.id}-heading`}
              data-testid={`search-group-${group.id}`}
              className="flex flex-col"
            >
              <div
                id={`${base}-${group.id}-heading`}
                role="presentation"
                className="px-2 pb-0.5 font-semibold text-muted text-xs uppercase tracking-wide"
              >
                {group.heading}
              </div>
              {group.options.map((option) =>
                option.kind === 'hit' ? (
                  <ResultRow
                    key={option.id}
                    id={option.id}
                    hit={option.hit}
                    understood={answer?.understood ?? { chips: [] }}
                    mode={mode}
                    pluginName={
                      option.hit.entry.plugin === undefined
                        ? undefined
                        : pluginName?.(option.hit.entry.plugin)
                    }
                    active={option.id === activeId}
                    motion={motion}
                    onHover={() => setActiveId(option.id)}
                    onPick={() => run(option, false)}
                  />
                ) : (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: keys reach rows through the field (combobox, aria-activedescendant).
                  <div
                    key={option.id}
                    id={option.id}
                    role="option"
                    tabIndex={-1}
                    aria-selected={option.id === activeId}
                    data-testid={
                      option.kind === 'more'
                        ? `search-show-more-${option.section}`
                        : `search-${option.kind}`
                    }
                    className={`cursor-pointer rounded px-2 py-1 text-accent text-sm ${
                      motion ? 'transition-colors duration-100' : ''
                    } ${option.id === activeId ? 'bg-bg font-semibold outline outline-1 outline-accent' : ''}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => {
                      if (option.id !== activeId) setActiveId(option.id);
                    }}
                    onClick={() => run(option, false)}
                  >
                    {option.kind === 'more'
                      ? showMoreLabel(mode, option.more)
                      : option.kind === 'wishlist'
                        ? words.wishlist
                        : words.askAi}
                  </div>
                ),
              )}
            </div>
          ))}
        </div>
        {activeHit !== undefined && answer !== null && (
          <ResultDetails
            hit={activeHit}
            answer={answer}
            mode={mode}
            buttons={buttonsOf(activeHit)}
            secondKey={secondKey}
            preview={preview}
            name={name}
            onName={setName}
            actionsRef={actionsRef}
            onButton={(key) => act(activeHit, key)}
          />
        )}
      </div>
      {askAiLine !== undefined && asked !== '' && (
        <p className="text-muted text-xs" data-testid="search-ask-ai-line">
          {askAiLine}
        </p>
      )}
      {showsMinecraft && (
        <p className="text-muted text-xs" data-testid="search-minecraft-folder">
          {words.minecraftFolder}
        </p>
      )}
      <div role="status" aria-live="polite" className="sr-only" data-testid="search-live">
        {live}
      </div>
    </div>
  );
}

interface ResultDetailsProps {
  readonly hit: SearchHit;
  readonly answer: SearchAnswer;
  readonly mode: SearchMode;
  readonly buttons: ReturnType<typeof actionsFor>;
  readonly secondKey: string;
  readonly preview: ((hit: SearchHit) => ReactNode) | undefined;
  readonly name: string;
  readonly onName: (name: string) => void;
  readonly actionsRef: RefObject<HTMLDivElement | null>;
  readonly onButton: (key: SearchActionKey) => void;
}

/** The selected result: its words, its live picture (B665), a name for a template, its buttons. */
function ResultDetails({
  hit,
  answer,
  mode,
  buttons,
  secondKey,
  preview,
  name,
  onName,
  actionsRef,
  onButton,
}: ResultDetailsProps) {
  const words = searchWords(mode);
  const text = rowText(hit, answer.understood, mode);
  const nameId = useId();
  return (
    <section
      aria-label={text.title}
      data-testid="search-preview"
      className="flex min-w-0 flex-col gap-2 rounded-md border border-border p-2 text-sm md:w-1/2 md:flex-1"
    >
      <h2 className="break-words font-semibold text-base">{text.title}</h2>
      {text.detail !== null && <p className="break-words">{text.detail}</p>}
      {text.behaviour !== null && <p className="break-words">{text.behaviour}</p>}
      {text.reason !== null && <p className="text-muted italic">{text.reason}</p>}
      {preview !== undefined && <div data-testid="search-preview-picture">{preview(hit)}</div>}
      <div ref={actionsRef} className="flex flex-col gap-2">
        {takesName(hit.entry) && (
          <label htmlFor={nameId} className="flex flex-col gap-1">
            <span className="text-muted text-xs">{words.nameLabel}</span>
            <input
              id={nameId}
              type="text"
              data-testid="search-name"
              value={name}
              placeholder={text.title}
              className="rounded border border-border bg-bg px-2 py-1 text-sm"
              onChange={(event) => onName(event.target.value)}
            />
          </label>
        )}
        {buttons.length > 0 && (
          <div className="flex flex-wrap gap-2" data-testid="search-actions">
            {buttons.map((button, i) => (
              <button
                key={button.key}
                type="button"
                data-testid={`search-action-${button.key}`}
                className={`rounded px-3 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                  i === 0 ? 'bg-accent font-semibold text-white' : 'border border-border'
                }`}
                onClick={() => onButton(button.key)}
              >
                {button.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {mode !== 'very-easy' && buttons.length > 0 && (
        <p className="text-muted text-xs" data-testid="search-keys">
          Enter: {buttons[0]?.label}
          {buttons[1] !== undefined ? ` · ${secondKey}: ${buttons[1].label}` : ''}
        </p>
      )}
    </section>
  );
}

export default SearchPanel;
