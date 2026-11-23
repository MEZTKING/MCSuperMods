/**
 * The AI review's cards (ADR 0125 D3, B688): one card per thing of the proposal
 * ({@link proposalThings}) with its picture, its name, what it is and **Keep**, which ticks every
 * file behind the thing. Its problems read as Things to fix says them; a file that no longer
 * fits reads "Not added: …". The files themselves are in the review's More options (ADR 0130).
 *
 * Test ids: `ai-thing-<n>` (from 1) with `-keep`, `-picture`, `-problems` and `-conflict`.
 *
 * @packageDocumentation
 */

import { TriangleAlert } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { pngDataUrl } from '../../preview/bundle-source';
import { listOf, wordsFor } from './ai-words';
import {
  CARD_WORDS,
  keptState,
  notAddedWords,
  type ProposalThing,
  problemWords,
} from './proposal-things';

function KeepBox(props: {
  testId: string;
  label: string;
  word: string;
  state: 'all' | 'none' | 'mixed';
  onChange(accepted: boolean): void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current !== null) ref.current.indeterminate = props.state === 'mixed';
  }, [props.state]);
  return (
    <label className="flex shrink-0 items-center gap-1 text-xs">
      <input
        ref={ref}
        type="checkbox"
        data-testid={props.testId}
        aria-label={props.label}
        checked={props.state === 'all'}
        onChange={() => props.onChange(props.state !== 'all')}
      />
      {props.word}
    </label>
  );
}

function unique(texts: readonly string[]): string[] {
  return [...new Set(texts)];
}

function ThingCard(props: {
  thing: ProposalThing;
  index: number;
  onToggle(itemId: string, accepted: boolean): void;
}) {
  const { thing } = props;
  const words = wordsFor().review;
  const testId = `ai-thing-${props.index + 1}`;
  const state = keptState(thing);
  const problems = unique(
    thing.items.flatMap((item) =>
      item.problems
        .filter((problem) => problem.severity !== 'info')
        .map((problem) => `${problem.severity}\u0000${problemWords(problem, thing.name)}`),
    ),
  ).map((entry) => {
    const [severity, text] = entry.split('\u0000') as [string, string];
    return { severity, text };
  });
  const conflicts = unique(
    thing.items.flatMap((item) => {
      const text = notAddedWords(item);
      return text === undefined ? [] : [text];
    }),
  );
  const what = thing.other ? CARD_WORDS.filesCount(thing.items.length) : thing.what;
  return (
    <li
      className="flex flex-col gap-1 rounded border border-border p-1.5"
      data-testid={testId}
      data-thing-op={thing.op}
      data-kept={state}
    >
      <div className="flex items-center gap-2">
        {thing.picture === undefined ? (
          <span
            className="size-8 shrink-0 rounded bg-black/10"
            role="img"
            aria-label={CARD_WORDS.noPicture}
          />
        ) : (
          <img
            alt={thing.name}
            src={pngDataUrl(thing.picture)}
            data-testid={`${testId}-picture`}
            className="size-8 shrink-0 [image-rendering:pixelated]"
          />
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium [overflow-wrap:anywhere]">{thing.name}</span>
          <span className="text-xs text-muted">
            {what} · {CARD_WORDS.op[thing.op]}
          </span>
          {thing.parts.length > 0 && (
            <span className="text-xs text-muted">
              {CARD_WORDS.with}: {listOf(thing.parts)}
            </span>
          )}
        </span>
        <KeepBox
          testId={`${testId}-keep`}
          label={`${words.keep} ${thing.name}`}
          word={words.keep}
          state={state}
          onChange={(accepted) => {
            for (const item of thing.items) {
              if (item.accepted !== accepted) props.onToggle(item.itemId, accepted);
            }
          }}
        />
      </div>
      {conflicts.map((text) => (
        <p
          key={text}
          className="flex items-start gap-1 text-xs text-warning"
          data-testid={`${testId}-conflict`}
        >
          <TriangleAlert size={12} aria-hidden className="mt-0.5 shrink-0" />
          {text}
        </p>
      ))}
      {problems.length > 0 && (
        <ul className="m-0 list-none p-0 text-xs" data-testid={`${testId}-problems`}>
          {problems.map((problem) => (
            <li
              key={`${problem.severity}:${problem.text}`}
              className={problem.severity === 'error' ? 'text-error' : 'text-muted'}
            >
              {problem.text}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** The cards; see the module comment. */
export function AiProposalCards(props: {
  things: readonly ProposalThing[];
  onToggle(itemId: string, accepted: boolean): void;
}) {
  if (props.things.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="ai-things">
      {props.things.map((thing, index) => (
        <ThingCard key={thing.key} thing={thing} index={index} onToggle={props.onToggle} />
      ))}
    </ul>
  );
}
