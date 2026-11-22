/**
 * With and without (B609; ADR 0060 D3, ADR 0120 D3): extra drops (`msm:loot_addition`) rolled on
 * the table they add to, side by side, without the project's additions and with them. The table
 * is the project's own of that id or Minecraft's from the user's jar cache; "with" lays every
 * addition of the project that names it after the table's own pools, in the project's order, as
 * the runtime does (`withLootAdditions`). Both sides roll at the same seed, so the table's own
 * drops match and the added ones stand out; rows and stacks from an added pool say "Added".
 */

import type { Json } from '@msm/plugin-api';
import { withLootAdditions } from '@msm/sim';
import { useEffect, useId, useMemo, useState } from 'react';
import { stableKey } from '../../../terrain/client';
import { ODDS_FIRST_STEP, ODDS_ROLLS } from '../../client';
import { LiveViewFrame, needsSetUpBanner } from '../../frame/LiveViewFrame';
import { LIVE_VIEW_DEBOUNCE_MS, useLiveViewJob } from '../../frame/live-data';
import { SeedBox } from '../../frame/SeedBox';
import { SituationPicker, useSituationChoice } from '../../frame/SituationPicker';
import type { LiveViewProps } from '../../registry';
import { RollSection, useLootBasics } from './LootParts';
import {
  additionTables,
  allParts,
  allUnsupported,
  lootAdditions,
  namesMissingFile,
  ODDS_SEED,
  oddsFidelity,
  projectTable,
  tableContexts,
  tableSubject,
  tableWords,
  useDebounced,
} from './loot-model';
import { OddsSection } from './Odds';

/** Where the table rolled stands. */
type BaseTable =
  | { readonly id: string; readonly status: 'loading' | 'missing' | 'not_set_up' }
  | { readonly id: string; readonly status: 'ready'; readonly json: Json };

/** The table an addition names, the project's own first, else Minecraft's. */
function useBaseTable(props: LiveViewProps, id: string | null): BaseTable | null {
  const own = id === null ? undefined : projectTable(props.project, id);
  const hasOwn = own !== undefined;
  const [read, setRead] = useState<BaseTable | null>(null);
  const { vanilla } = props;
  useEffect(() => {
    if (id === null || hasOwn) return;
    let live = true;
    setRead({ id, status: 'loading' });
    void vanilla.file('loot_table', id).then(
      (answer) => {
        if (!live) return;
        setRead(
          answer.status === 'ready'
            ? { id, status: 'ready', json: answer.json }
            : { id, status: answer.status },
        );
      },
      () => {
        if (live) setRead({ id, status: 'missing' });
      },
    );
    return () => {
      live = false;
    };
  }, [id, hasOwn, vanilla]);
  if (id === null) return null;
  if (own !== undefined) return { id, status: 'ready', json: own };
  return read !== null && read.id === id ? read : { id, status: 'loading' };
}

/** The view of extra drops. */
export function WithAndWithout(props: LiveViewProps) {
  const { project, element, preferences, onPreferences, onSetup } = props;
  const basics = useLootBasics(props);
  const tables = additionTables(element.data);
  const [chosen, setChosen] = useState('');
  const tableId = tables.includes(chosen) ? chosen : (tables[0] ?? null);
  const base = useBaseTable(props, tableId);
  const baseJson = base?.status === 'ready' ? base.json : undefined;
  const contexts = useMemo(() => tableContexts(baseJson), [baseJson]);
  const subject = useMemo(() => (tableId === null ? {} : tableSubject(tableId)), [tableId]);
  const choice = useSituationChoice(preferences, onPreferences, contexts, subject);
  const seed = preferences.seed;
  const pickId = useId();

  // The additions follow an edit 150 ms after it, as the files do.
  const now = lootAdditions(project);
  const additions = useDebounced(now, LIVE_VIEW_DEBOUNCE_MS, stableKey(now));
  const combined = useMemo(
    () =>
      tableId === null || baseJson === undefined
        ? null
        : withLootAdditions(tableId, baseJson, additions),
    [tableId, baseJson, additions],
  );
  const ready = basics.data !== null && tableId !== null;
  const situation = choice.situation;
  const odds = { rolls: ODDS_ROLLS, step: ODDS_FIRST_STEP } as const;
  const withoutRoll = useLiveViewJob(
    basics.data,
    ready ? ({ kind: 'roll', table: tableId, situation, seed } as const) : null,
  );
  const withoutOdds = useLiveViewJob(
    basics.data,
    ready ? ({ kind: 'odds', table: tableId, situation, seed: ODDS_SEED, ...odds } as const) : null,
  );
  const withRoll = useLiveViewJob(
    basics.data,
    ready && combined !== null
      ? ({ kind: 'roll', table: combined.table, situation, seed } as const)
      : null,
  );
  const withOdds = useLiveViewJob(
    basics.data,
    ready && combined !== null
      ? ({ kind: 'odds', table: combined.table, situation, seed: ODDS_SEED, ...odds } as const)
      : null,
  );
  const unsupported = allUnsupported(
    withoutRoll.result?.unsupported,
    withoutOdds.result?.unsupported,
    withRoll.result?.unsupported,
    withOdds.result?.unsupported,
  );
  const parts = allParts(withoutOdds.result?.parts, withOdds.result?.parts);
  const namesVanilla =
    (tableId !== null && projectTable(project, tableId) === undefined) ||
    namesMissingFile(unsupported);
  const added =
    combined === null ? undefined : { ownPools: combined.ownPools, added: combined.added };
  const notSetUp = base?.status === 'not_set_up' || basics.vanillaStatus === 'not_set_up';

  return (
    <LiveViewFrame
      title="Extra drops"
      fidelity={withOdds.result === null ? 'about_right' : oddsFidelity(parts)}
      notes={basics.error === null ? [] : [`The files could not be read: ${basics.error}`]}
      needsSetUp={needsSetUpBanner(notSetUp ? 'not_set_up' : 'ready', namesVanilla)}
      onSetup={onSetup}
      unsupported={unsupported}
      controls={
        <div className="flex flex-col gap-2">
          {tables.length > 1 && (
            <label htmlFor={pickId} className="flex flex-wrap items-center gap-2 text-sm">
              Which table?
              <select
                id={pickId}
                data-testid="with-and-without-table"
                className="min-w-0 rounded border border-border bg-bg px-1"
                value={tableId ?? ''}
                onChange={(event) => setChosen(event.target.value)}
              >
                {tables.map((id) => (
                  <option key={id} value={id}>
                    {tableWords(id)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <SituationPicker choice={choice} onChoose={choice.choose} contexts={contexts} />
          <SeedBox seed={seed} onSeed={(next) => onPreferences({ seed: next })} />
        </div>
      }
    >
      {tableId === null && (
        <p data-testid="with-and-without-no-table" className="text-sm text-muted">
          Pick a loot table under Loot tables to see your drops rolled on it.
        </p>
      )}
      {base?.status === 'missing' && (
        <p role="status" data-testid="with-and-without-missing" className="text-sm text-muted">
          {`${tableWords(base.id)}: Minecraft has no loot table by this name, so nothing is added to it.`}
        </p>
      )}
      {tableId !== null && base?.status !== 'missing' && base?.status !== 'not_set_up' && (
        <div data-testid="with-and-without" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div data-testid="with-and-without-without" className="flex min-w-0 flex-col gap-3">
            <h4 className="text-sm font-medium">Without your additions</h4>
            <RollSection
              stacks={withoutRoll.result?.stacks ?? null}
              error={withoutRoll.error}
              pictures={basics.pictures}
              lang={basics.lang}
              testId="without-roll"
            />
            <OddsSection
              step={withoutOdds.result}
              pending={withoutOdds.pending}
              error={withoutOdds.error}
              rolls={ODDS_ROLLS}
              pictures={basics.pictures}
              lang={basics.lang}
              testId="without-odds"
            />
          </div>
          <div data-testid="with-and-without-with" className="flex min-w-0 flex-col gap-3">
            <h4 className="text-sm font-medium">With your additions</h4>
            <RollSection
              stacks={withRoll.result?.stacks ?? null}
              error={withRoll.error}
              pictures={basics.pictures}
              lang={basics.lang}
              testId="with-roll"
              {...(added === undefined ? {} : { added })}
            />
            <OddsSection
              step={withOdds.result}
              pending={withOdds.pending}
              error={withOdds.error}
              rolls={ODDS_ROLLS}
              pictures={basics.pictures}
              lang={basics.lang}
              testId="with-odds"
              {...(added === undefined ? {} : { added })}
            />
          </div>
        </div>
      )}
    </LiveViewFrame>
  );
}
