/**
 * **Try it on** for a predicate (B610; ADR 0120 D4): the situation you choose, the answer (Yes,
 * No or Only the game knows) and, beside every part of the predicate, that part's answer, where it
 * is in the data and how likely yes is. Each try is one sample (B604): a random part draws from the
 * seed, so "Try again" draws anew and the likelihood stays. Unknown is shown as unknown, never as
 * no. The answer comes from a `predicate` job in the live views worker, 150 ms after an edit.
 */

import type { Json } from '@msm/plugin-api';
import { unsupportedWords } from '@msm/sim';
import { useMemo } from 'react';
import type { LiveViewClient, LiveViewJob } from '../../client';
import { FIDELITY_LABELS, weakest } from '../../frame/fidelity';
import { LiveViewFrame, needsSetUpBanner } from '../../frame/LiveViewFrame';
import { factsOf, useLiveViewData, useLiveViewJob } from '../../frame/live-data';
import { SeedBox } from '../../frame/SeedBox';
import { SituationPicker, useSituationChoice } from '../../frame/SituationPicker';
import type { LiveViewProps } from '../../registry';
import {
  ANSWER_WORDS,
  chanceWords,
  conditionWords,
  namesVanillaFile,
  partRows,
  pathWords,
} from './predicate-model';

/** The folders a predicate reads: predicates named by id, and the tags its parts may name. */
export const PREDICATE_FOLDERS = [
  'predicate',
  'enchantment',
  'tags/item',
  'tags/block',
  'tags/entity_type',
  'tags/fluid',
  'tags/damage_type',
  'tags/enchantment',
] as const;

/** The colours of the answers (theme tokens). */
const ANSWER_CLASS = {
  yes: 'border-accent text-accent',
  no: 'border-error text-error',
  unknown: 'border-warning text-warning',
} as const;

/** Props: the registry's, and a client for tests. */
export interface PredicateViewProps extends LiveViewProps {
  readonly client?: LiveViewClient;
}

/** The view. */
export default function PredicateView(props: PredicateViewProps) {
  const { project, element, vanilla, preferences, onPreferences, onSetup, client } = props;
  const data = element.data as Json;
  const files = useLiveViewData(project, vanilla, PREDICATE_FOLDERS, client);
  const hash = files.status === 'ready' ? files.data : null;
  const choice = useSituationChoice(preferences, onPreferences);
  const facts = useMemo(() => factsOf(project), [project]);
  const job = useMemo<Extract<LiveViewJob, { kind: 'predicate' }>>(
    () => ({
      kind: 'predicate',
      predicate: data,
      situation: choice.situation,
      seed: preferences.seed,
    }),
    [data, choice.situation, preferences.seed],
  );
  const state = useLiveViewJob(hash, job, client);
  const result = state.result;
  const rows = result === null ? [] : partRows(result.parts, result.unsupported);
  const vanillaState =
    files.status === 'ready'
      ? files.vanilla === 'none'
        ? null
        : files.vanilla
      : files.status === 'loading'
        ? 'loading'
        : null;
  const fidelity = result === null ? 'about_right' : weakest(rows.map((row) => row.fidelity));
  const root = result?.parts;

  return (
    <LiveViewFrame
      title="Try it on"
      fidelity={fidelity}
      needsSetUp={needsSetUpBanner(vanillaState, namesVanillaFile(data, result?.unsupported))}
      onSetup={onSetup}
      unsupported={result?.unsupported ?? []}
      notes={[
        'Each try is one sample: a part that goes by chance can answer differently next time. How likely yes is stands beside it.',
        'A situation is a sample, not a world: parts about the world around it answer “Only the game knows”.',
        ...(facts === null ? ['The project’s Minecraft version is not known.'] : []),
      ]}
      controls={
        <div className="flex flex-col gap-2">
          <SituationPicker choice={choice} onChoose={choice.choose} />
          <SeedBox
            seed={preferences.seed}
            onSeed={(seed) => onPreferences({ seed })}
            rollLabel="Try again"
          />
        </div>
      }
    >
      {files.status === 'error' && (
        <p role="alert" className="text-sm text-error">
          {files.message}
        </p>
      )}
      {state.error !== null && (
        <p role="alert" className="text-sm text-error">
          {state.error}
        </p>
      )}
      {root === undefined ? (
        <p className="text-sm text-muted">Trying it…</p>
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
            <span>The answer:</span>
            <span
              data-testid="predicate-answer"
              data-answer={root.answer}
              className={`rounded border px-2 py-0.5 font-medium ${ANSWER_CLASS[root.answer]}`}
            >
              {ANSWER_WORDS[root.answer]}
            </span>
            {root.chance !== undefined && (
              <span data-testid="predicate-chance" className="text-muted">
                {`Yes in ${chanceWords(root.chance)} of tries`}
              </span>
            )}
            {state.pending && <span className="text-xs text-muted">Updating…</span>}
          </p>
          <ul aria-label="Every part" data-testid="predicate-parts" className="flex flex-col gap-1">
            {rows.map((row) => (
              <li
                key={row.path}
                data-testid="predicate-part"
                data-path={row.path}
                data-answer={row.answer}
                data-fidelity={row.fidelity}
                style={{ paddingLeft: `${row.depth * 1.25}rem` }}
                className="flex flex-col gap-0.5 text-sm"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded border px-1.5 text-xs font-medium ${ANSWER_CLASS[row.answer]}`}
                  >
                    {ANSWER_WORDS[row.answer]}
                  </span>
                  <span>{conditionWords(row.type)}</span>
                  <code className="text-xs text-muted [overflow-wrap:anywhere]">
                    {row.depth === 0 ? pathWords('') : pathWords(row.path)}
                  </code>
                  {row.chance !== undefined && row.chance > 0 && row.chance < 1 && (
                    <span className="text-xs text-muted">{`yes ${chanceWords(row.chance)}`}</span>
                  )}
                  <span className="text-xs text-muted">{FIDELITY_LABELS[row.fidelity]}</span>
                </span>
                {row.unknown.map((note) => (
                  <span
                    key={`${note.kind}|${note.type}|${note.path}`}
                    data-testid="predicate-part-unknown"
                    className="text-xs text-muted [overflow-wrap:anywhere]"
                  >
                    {unsupportedWords(note)}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </LiveViewFrame>
  );
}
