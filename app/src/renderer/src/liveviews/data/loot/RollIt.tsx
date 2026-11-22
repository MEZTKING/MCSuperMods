/**
 * Roll it (B609; ADR 0120 D3, limits 2L1 and 2L2): the live view of a loot table, extra drops
 * (`msm:loot_addition`, With and without), an enchantment provider and a trial spawner. This
 * file is the registry's entry (`liveviews/data/index.ts`): it picks the view by the element's
 * kind (what they share is in `LootParts.tsx` and `loot-model.ts`).
 *
 * A loot table gets **Roll it** (the stacks of one roll at the seed; "Roll again" picks a new
 * seed) and **The odds** (out of 1,000 rolls, in steps). Both run in the live views worker over
 * the project's files laid over vanilla's from the user's jar cache, 150 ms after the last edit.
 * One roll is MSM's own random sequence ("Your roll in the game will differ; the odds are the
 * same."); the odds are checked. What could not be worked out is named in the frame, never
 * dropped; rows it touched say "Only the game knows".
 */

import { useMemo } from 'react';
import { ODDS_FIRST_STEP, ODDS_ROLLS } from '../../client';
import { LiveViewFrame, needsSetUpBanner } from '../../frame/LiveViewFrame';
import { useLiveViewJob } from '../../frame/live-data';
import { SeedBox } from '../../frame/SeedBox';
import { SituationPicker, useSituationChoice } from '../../frame/SituationPicker';
import type { LiveViewProps } from '../../registry';
import { EnchantRoll } from './EnchantRoll';
import { RollSection, useLootBasics } from './LootParts';
import {
  allParts,
  allUnsupported,
  namesMissingFile,
  ODDS_SEED,
  oddsFidelity,
  tableContexts,
  tableSubject,
} from './loot-model';
import { OddsSection } from './Odds';
import { TrialSpawner } from './TrialSpawner';
import { WithAndWithout } from './WithAndWithout';

/** A loot table: Roll it and The odds. */
function LootTableView(props: LiveViewProps) {
  const { element, preferences, onPreferences, onSetup } = props;
  const basics = useLootBasics(props);
  const contexts = useMemo(() => tableContexts(element.data), [element.data]);
  const subject = useMemo(() => tableSubject(element.id), [element.id]);
  const choice = useSituationChoice(preferences, onPreferences, contexts, subject);
  const seed = preferences.seed;
  const rollJob =
    basics.data === null
      ? null
      : ({ kind: 'roll', table: element.id, situation: choice.situation, seed } as const);
  const oddsJob =
    basics.data === null
      ? null
      : ({
          kind: 'odds',
          table: element.id,
          situation: choice.situation,
          seed: ODDS_SEED,
          rolls: ODDS_ROLLS,
          step: ODDS_FIRST_STEP,
        } as const);
  const roll = useLiveViewJob(basics.data, rollJob);
  const odds = useLiveViewJob(basics.data, oddsJob);
  const unsupported = allUnsupported(roll.result?.unsupported, odds.result?.unsupported);
  const parts = allParts(roll.result?.parts, odds.result?.parts);
  return (
    <LiveViewFrame
      title="Loot table"
      fidelity={odds.result === null ? 'about_right' : oddsFidelity(parts)}
      notes={basics.error === null ? [] : [`The files could not be read: ${basics.error}`]}
      needsSetUp={needsSetUpBanner(basics.vanillaStatus, namesMissingFile(unsupported))}
      onSetup={onSetup}
      unsupported={unsupported}
      controls={
        <div className="flex flex-col gap-2">
          <SituationPicker choice={choice} onChoose={choice.choose} contexts={contexts} />
          <SeedBox seed={seed} onSeed={(next) => onPreferences({ seed: next })} />
        </div>
      }
    >
      <RollSection
        stacks={roll.result?.stacks ?? null}
        error={roll.error}
        pictures={basics.pictures}
        lang={basics.lang}
      />
      <OddsSection
        step={odds.result}
        pending={odds.pending}
        error={odds.error}
        rolls={ODDS_ROLLS}
        pictures={basics.pictures}
        lang={basics.lang}
      />
    </LiveViewFrame>
  );
}

/** The registry's entry: the view for the element's kind. */
export default function RollIt(props: LiveViewProps) {
  switch (props.element.kind) {
    case 'msm:loot_addition':
      return <WithAndWithout {...props} />;
    case 'minecraft:enchantment_provider':
      return <EnchantRoll {...props} />;
    case 'minecraft:trial_spawner':
      return <TrialSpawner {...props} />;
    default:
      return <LootTableView {...props} />;
  }
}
