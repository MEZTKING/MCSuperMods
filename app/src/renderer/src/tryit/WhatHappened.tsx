/**
 * The "What happened" panel of Try it (ADR 0085 D8, B398): newest first, what the simulation did
 * and why, in words and by display name. A trigger's line ("You used Chime Block, so rule "Ring
 * the chime" ran.") comes before its actions' lines in time, so newest first shows the actions
 * above it, indented. "Only in Minecraft" lines are always shown, never folded away.
 *
 * Each line links to where it came from: the rule card (the rule book with the rule focused),
 * the event in its Studio, or the Studio of the thing. The "Run every time" option makes every
 * chance come up (B396 `always`).
 *
 * Part of the lazy Try it chunk.
 */

import type { Element, JsonObject, Project } from '@msm/core';
import type { SimOrigin } from '@msm/sim';
import type { WhatHappenedEntry } from './session-source';

/** The panel's heading. */
export const WHAT_HAPPENED_TITLE = 'What happened';
/** The words before an "Only in Minecraft" line (ADR 0085 D5). */
export const ONLY_IN_MINECRAFT = 'Only in Minecraft:';
/** The label of the option that makes every chance come up. */
export const RUN_EVERY_TIME_LABEL = 'Run every time';
/** The most lines drawn at once. */
export const WHAT_HAPPENED_SHOWN = 200;

/** Where a line's link goes. */
export interface WhatHappenedLink {
  /** What it opens, in plain words: `Rule`, `Event` or `Studio`. */
  readonly label: 'Rule' | 'Rule book' | 'Event' | 'Studio';
  /** The element to open. */
  readonly elementId: string;
  /** The field to focus, or `null` for the Studio's top. */
  readonly pointer: string | null;
}

/** One line in words, as the panel shows it. */
export function entryText(entry: Pick<WhatHappenedEntry, 'kind' | 'text'>): string {
  return entry.kind === 'onlyInMinecraft' ? `${ONLY_IN_MINECRAFT} ${entry.text}` : entry.text;
}

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function findElement(project: Project | null, id: string): Element | undefined {
  for (const namespace of project?.namespaces ?? []) {
    const found = namespace.elements.find((element) => element.id === id);
    if (found !== undefined) return found;
  }
  return undefined;
}

const escapeKey = (key: string): string => key.replaceAll('~', '~0').replaceAll('/', '~1');

/** Whether a JSON pointer names a value inside `data`. */
function resolves(data: unknown, pointer: string): boolean {
  if (pointer === '') return true;
  if (!pointer.startsWith('/')) return false;
  let at: unknown = data;
  for (const raw of pointer.slice(1).split('/')) {
    const key = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    if (Array.isArray(at)) at = at[Number(key)];
    else if (isObject(at)) at = at[key];
    else return false;
    if (at === undefined) return false;
  }
  return true;
}

/**
 * Where a line's origin links to in the open project: the rule card when the rule is known
 * (`/rules/<index>` of its book), the rule book, the event the line is about when the element
 * saves it, else the thing's Studio (at the field when the saved element has it). `null` when
 * the project has none of them (a vanilla block, a generated script).
 */
export function linkFor(
  origin: SimOrigin | undefined,
  project: Project | null,
): WhatHappenedLink | null {
  if (origin === undefined) return null;
  if (origin.ruleBook !== undefined) {
    const book = findElement(project, origin.ruleBook);
    if (book !== undefined) {
      const rules = isObject(book.data) && Array.isArray(book.data.rules) ? book.data.rules : [];
      const index =
        origin.ruleKey === undefined
          ? -1
          : rules.findIndex((rule) => isObject(rule) && rule.key === origin.ruleKey);
      return index < 0
        ? { label: 'Rule book', elementId: book.id, pointer: null }
        : { label: 'Rule', elementId: book.id, pointer: `/rules/${index}` };
    }
  }
  if (origin.elementId === undefined) return null;
  const element = findElement(project, origin.elementId);
  if (element === undefined) return null;
  if (origin.eventId !== undefined) {
    const pointer = `/events/${escapeKey(origin.eventId)}`;
    if (resolves(element.data, pointer)) {
      return { label: 'Event', elementId: element.id, pointer };
    }
  }
  const pointer =
    origin.pointer !== undefined && resolves(element.data, origin.pointer) ? origin.pointer : null;
  return { label: 'Studio', elementId: element.id, pointer };
}

/** The words of a link button for screen readers. */
function linkWords(link: WhatHappenedLink): string {
  switch (link.label) {
    case 'Rule':
      return 'Show the rule';
    case 'Rule book':
      return 'Show the rule book';
    case 'Event':
      return 'Show the event';
    case 'Studio':
      return 'Open it in its Studio';
  }
}

/** Props of {@link WhatHappened}. */
export interface WhatHappenedProps {
  /** The lines, oldest first. */
  entries: readonly WhatHappenedEntry[];
  /** The open project, for the links. */
  project: Project | null;
  /** Opens an element at a field. */
  onOpen(elementId: string, pointer: string | null): void;
  /** Whether "Run every time" is on. */
  runEveryTime: boolean;
  onRunEveryTime(on: boolean): void;
}

const KIND_CLASS: Readonly<Record<WhatHappenedEntry['kind'], string>> = {
  trigger: 'font-medium',
  action: 'pl-3',
  skipped: 'pl-3 text-muted',
  onlyInMinecraft: 'text-warning',
  info: '',
};

/** The panel; see the module comment. */
export function WhatHappened(props: WhatHappenedProps) {
  const { entries, project } = props;
  const shown = entries.slice(-WHAT_HAPPENED_SHOWN).reverse();
  return (
    <section aria-label={WHAT_HAPPENED_TITLE} className="flex flex-none flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{WHAT_HAPPENED_TITLE}</h3>
        <label
          className="ml-auto flex items-center gap-1 text-xs"
          title="Every chance comes up, so rules with a chance always run"
        >
          <input
            type="checkbox"
            data-testid="tryit-always"
            checked={props.runEveryTime}
            onChange={(event) => props.onRunEveryTime(event.target.checked)}
          />
          {RUN_EVERY_TIME_LABEL}
        </label>
      </div>
      <ol
        data-testid="tryit-log"
        className="flex max-h-80 min-h-24 flex-col gap-0.5 overflow-auto rounded border border-border bg-bg p-1 text-xs"
      >
        {shown.length === 0 && <li className="text-muted">Nothing yet.</li>}
        {shown.map((entry) => {
          const link = linkFor(entry.origin, project);
          return (
            <li
              key={entry.serial}
              data-testid={entry.kind === 'onlyInMinecraft' ? 'tryit-log-only' : 'tryit-log-line'}
              data-kind={entry.kind}
              className={`flex items-start gap-1 ${KIND_CLASS[entry.kind]}`}
            >
              <span className="min-w-0 flex-1">{entryText(entry)}</span>
              {link !== null && (
                <button
                  type="button"
                  data-testid="tryit-log-link"
                  data-element={link.elementId}
                  aria-label={`${linkWords(link)}: ${entry.text}`}
                  title={linkWords(link)}
                  className="shrink-0 cursor-pointer rounded px-1 text-accent underline hover:bg-panel"
                  onClick={() => props.onOpen(link.elementId, link.pointer)}
                >
                  {link.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
