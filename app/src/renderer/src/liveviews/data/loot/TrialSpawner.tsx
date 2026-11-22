/**
 * A trial spawner (B609; ADR 0120 D3; fields per the spike's 2S12): the waves as a strip, one
 * column a player count (mobs in all and at once), the mobs it picks from with their shares, and
 * Roll it on each reward table it ejects (every `loot_tables_to_eject` entry, and the ominous
 * drops), each rolled once and over 1,000 rolls in the live views worker.
 *
 * About right: the numbers per player count follow the file's fields (a base and an amount for
 * each player after the first), as `@msm/sim`'s `trialSpawnerSummary` reads them, not a
 * measurement; a field left out takes the game's own default, which MSM does not guess and
 * names instead.
 */

import type { Json } from '@msm/plugin-api';
import { type Situation, trialSpawnerSummary, type Unsupported } from '@msm/sim';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { stableKey } from '../../../terrain/client';
import { ODDS_FIRST_STEP, ODDS_ROLLS } from '../../client';
import { weakest } from '../../frame/fidelity';
import type { ItemPictureSource, LangTable } from '../../frame/item-picture';
import { LiveViewFrame, needsSetUpBanner } from '../../frame/LiveViewFrame';
import { useLiveViewJob } from '../../frame/live-data';
import { SeedBox } from '../../frame/SeedBox';
import { SituationPicker, useSituationChoice } from '../../frame/SituationPicker';
import type { LiveViewProps } from '../../registry';
import { RollSection, useLootBasics } from './LootParts';
import {
  allParts,
  allUnsupported,
  entityName,
  namesMissingFile,
  ODDS_SEED,
  oddsFidelity,
  percent,
  tableWords,
} from './loot-model';
import { OddsSection } from './Odds';

/** The player counts the strip shows. */
export const TRIAL_PLAYERS = 4;

/** A field name in plain words: `total_mobs_added_per_player` is "total mobs added per player". */
export function fieldWords(field: string): string {
  return field.replaceAll('_', ' ');
}

type Report = {
  readonly unsupported: readonly Unsupported[];
  readonly fidelity: ReturnType<typeof oddsFidelity>;
};

/** One reward table: its share, a roll and the odds. */
function RewardTable(props: {
  readonly id: string;
  readonly index: number;
  /** The share of ejections that pick it, or `null` for the ominous drops. */
  readonly share: number | null;
  readonly data: string | null;
  readonly situation: Situation;
  readonly seed: string;
  readonly pictures: ItemPictureSource;
  readonly lang: LangTable | null;
  onReport(key: string, report: Report): void;
}) {
  const { id, index, share, data, situation, seed, pictures, lang, onReport } = props;
  const testId = share === null ? 'trial-ominous' : `trial-reward-${index}`;
  const roll = useLiveViewJob(
    data,
    data === null ? null : ({ kind: 'roll', table: id, situation, seed } as const),
  );
  const odds = useLiveViewJob(
    data,
    data === null
      ? null
      : ({
          kind: 'odds',
          table: id,
          situation,
          seed: ODDS_SEED,
          rolls: ODDS_ROLLS,
          step: ODDS_FIRST_STEP,
        } as const),
  );
  const unsupported = allUnsupported(roll.result?.unsupported, odds.result?.unsupported);
  const fidelity = oddsFidelity(allParts(roll.result?.parts, odds.result?.parts));
  const key = stableKey({ unsupported, fidelity });
  useEffect(() => onReport(testId, { unsupported, fidelity }), [key, testId, onReport]);
  return (
    <section
      aria-label={tableWords(id)}
      data-testid={testId}
      data-table={id}
      className="flex flex-col gap-2 rounded border border-border p-2"
    >
      <h4 className="text-sm font-medium">
        {share === null
          ? `When ominous, it also drops: ${tableWords(id)}`
          : `Reward: ${tableWords(id)}, picked ${percent(share)} of the time`}
      </h4>
      <RollSection
        stacks={roll.result?.stacks ?? null}
        error={roll.error}
        pictures={pictures}
        lang={lang}
        testId={`${testId}-roll`}
      />
      <OddsSection
        step={odds.result}
        pending={odds.pending}
        error={odds.error}
        rolls={ODDS_ROLLS}
        pictures={pictures}
        lang={lang}
        testId={`${testId}-odds`}
      />
    </section>
  );
}

/** The view of a trial spawner. */
export function TrialSpawner(props: LiveViewProps) {
  const { element, preferences, onPreferences, onSetup } = props;
  const basics = useLootBasics(props);
  const summary = useMemo(
    () => trialSpawnerSummary(element.data as Json, () => undefined, TRIAL_PLAYERS),
    [element.data],
  );
  const choice = useSituationChoice(preferences, onPreferences);
  const seed = preferences.seed;
  const [reports, setReports] = useState<Readonly<Record<string, Report>>>({});
  const onReport = useCallback((key: string, report: Report) => {
    setReports((before) =>
      stableKey(before[key] ?? null) === stableKey(report) ? before : { ...before, [key]: report },
    );
  }, []);
  const rewards = summary.rewards.filter((reward) => reward.id !== '');
  const shown = new Set(['trial-ominous', ...rewards.map((_, index) => `trial-reward-${index}`)]);
  const live = Object.entries(reports).filter(([key]) => shown.has(key));
  const unsupported = allUnsupported(...live.map(([, report]) => report.unsupported));
  const notes = [
    'The numbers per player count follow the file’s fields: a base, and an amount for each player after the first.',
    ...(summary.defaults.length === 0
      ? []
      : [`Left to the game’s own default: ${summary.defaults.map(fieldWords).join(', ')}.`]),
    ...(basics.error === null ? [] : [`The files could not be read: ${basics.error}`]),
  ];
  return (
    <LiveViewFrame
      title="Trial spawner"
      fidelity={weakest(['about_right', ...live.map(([, report]) => report.fidelity)])}
      notes={notes}
      needsSetUp={needsSetUpBanner(basics.vanillaStatus, namesMissingFile(unsupported))}
      onSetup={onSetup}
      unsupported={unsupported}
      controls={
        <div className="flex flex-col gap-2">
          <SituationPicker choice={choice} onChoose={choice.choose} />
          <SeedBox seed={seed} onSeed={(next) => onPreferences({ seed: next })} />
        </div>
      }
    >
      <section aria-label="The waves" data-testid="trial-waves" className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">The waves</h4>
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {summary.waves.map((wave) => (
            <li
              key={wave.players}
              data-testid={`trial-wave-${wave.players}`}
              data-total={wave.totalMobs}
              data-at-once={wave.simultaneousMobs}
              className="flex flex-col rounded border border-border p-2 text-sm"
            >
              <span className="font-medium">
                {wave.players === 1 ? '1 player' : `${wave.players} players`}
              </span>
              <span>
                {wave.totalMobs === undefined
                  ? 'In all: the game’s default'
                  : `${wave.totalMobs} in all`}
              </span>
              <span>
                {wave.simultaneousMobs === undefined
                  ? 'At once: the game’s default'
                  : `${wave.simultaneousMobs} at once`}
              </span>
            </li>
          ))}
        </ol>
        {(summary.spawnRange !== undefined || summary.ticksBetweenSpawn !== undefined) && (
          <p className="text-xs text-muted">
            {[
              summary.spawnRange === undefined
                ? null
                : `Mobs appear up to ${summary.spawnRange} blocks away.`,
              summary.ticksBetweenSpawn === undefined
                ? null
                : `One every ${(summary.ticksBetweenSpawn / 20).toFixed(1)} seconds at most.`,
            ]
              .filter((line) => line !== null)
              .join(' ')}
          </p>
        )}
      </section>
      <section aria-label="The mobs" data-testid="trial-mobs" className="flex flex-col gap-1">
        <h4 className="text-sm font-medium">The mobs</h4>
        {summary.mobs.length === 0 ? (
          <p className="text-xs text-muted">No mobs are named: the game’s default.</p>
        ) : (
          <ul className="flex flex-col gap-0.5 text-sm">
            {summary.mobs.map((mob, index) => (
              <li
                key={index}
                data-testid={`trial-mob-${index}`}
                data-entity={mob.id}
                data-share={mob.share}
              >
                {`${mob.id === '' ? 'A mob the file does not name' : entityName(mob.id, basics.lang)}: ${percent(mob.share)}`}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="The rewards" className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">The rewards</h4>
        {rewards.length === 0 && (
          <p className="text-xs text-muted" data-testid="trial-no-rewards">
            No reward tables are named: the game’s default.
          </p>
        )}
        {rewards.map((reward, index) => (
          <RewardTable
            key={index}
            id={reward.id}
            index={index}
            share={reward.share}
            data={basics.data}
            situation={choice.situation}
            seed={seed}
            pictures={basics.pictures}
            lang={basics.lang}
            onReport={onReport}
          />
        ))}
        {summary.ominousItems !== undefined && (
          <RewardTable
            id={summary.ominousItems}
            index={-1}
            share={null}
            data={basics.data}
            situation={choice.situation}
            seed={seed}
            pictures={basics.pictures}
            lang={basics.lang}
            onReport={onReport}
          />
        )}
      </section>
    </LiveViewFrame>
  );
}
