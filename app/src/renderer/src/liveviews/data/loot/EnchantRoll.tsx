/**
 * Roll it on an item (B609; ADR 0120 D3): an enchantment provider tried on a chosen item, once at
 * the seed (the item with the enchantments it gave), and the odds of each enchantment and level
 * out of 1,000 rolls. The rolls run in the live views worker (`enchant` and `enchant_odds` jobs,
 * `@msm/sim`'s `rollEnchantmentProvider` and `enchantmentProviderOdds`). The sample item is a
 * view choice kept with the view preferences (`sampleItem`), never in the project.
 *
 * An item whose enchantability MSM does not know (vanilla armour and fishing rods: the target
 * gives only the tools' numbers) rolls as a book would, marked as only the game knowing.
 */

import type { EnchantmentOdds, ItemSample, OddsStep, Situation } from '@msm/sim';
import { useEffect, useId, useState } from 'react';
import { ODDS_FIRST_STEP, ODDS_ROLLS } from '../../client';
import { ItemSlot } from '../../frame/ItemSlot';
import {
  enchantmentLine,
  type ItemPictureSource,
  itemName,
  type LangTable,
} from '../../frame/item-picture';
import { LiveViewFrame, needsSetUpBanner } from '../../frame/LiveViewFrame';
import { useLiveViewJob } from '../../frame/live-data';
import { SeedBox } from '../../frame/SeedBox';
import { fullId } from '../../frame/situations';
import type { LiveViewProps } from '../../registry';
import { RollSection, useLootBasics } from './LootParts';
import {
  allParts,
  allUnsupported,
  namesMissingFile,
  ODDS_SEED,
  ODDS_WORDS,
  oddsFidelity,
  percent,
} from './loot-model';
import { PartsUsed } from './Odds';

/** The item a provider is tried on when none was chosen (a sample, not a version fact). */
export const DEFAULT_SAMPLE_ITEM = 'minecraft:diamond_sword';

/** Items offered in the box (any other id can be typed). */
export const SAMPLE_ITEMS: readonly string[] = Object.freeze([
  'minecraft:diamond_sword',
  'minecraft:diamond_pickaxe',
  'minecraft:iron_axe',
  'minecraft:book',
]);

/** A provider is rolled without a place, a killer or a tool. */
const NO_SITUATION: Situation = Object.freeze({ context: 'minecraft:empty' });

/** The share of rolls that gave no enchantment at all. */
export function noEnchantmentShare(step: OddsStep): number {
  return step.rows
    .filter((row) => Object.keys(row.enchantments ?? {}).length === 0)
    .reduce((sum, row) => sum + row.chance, 0);
}

/** The odds of each enchantment and level, the likeliest first. */
function EnchantmentOddsList(props: {
  readonly step: OddsStep | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly lang: LangTable | null;
}) {
  const { step, pending, error, lang } = props;
  const fidelity = oddsFidelity(step?.parts);
  const levels: readonly EnchantmentOdds[] = [...(step?.enchantments ?? [])].sort(
    (a, b) =>
      b.chance - a.chance || a.enchantment.localeCompare(b.enchantment) || a.level - b.level,
  );
  const done = step?.done ?? 0;
  return (
    <section aria-label="The odds" data-testid="enchant-odds" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-sm font-medium">The odds</h4>
        <span className="text-xs text-muted">{`out of ${ODDS_ROLLS.toLocaleString('en-GB')} rolls`}</span>
        <span
          data-testid="enchant-odds-fidelity"
          data-fidelity={fidelity}
          className="text-xs text-muted"
        >
          {ODDS_WORDS[fidelity]}
        </span>
      </div>
      {error !== null && (
        <p role="alert" className="text-xs text-error">
          {`The odds could not be worked out: ${error}`}
        </p>
      )}
      {step === null && error === null && <p className="text-xs text-muted">Rolling…</p>}
      {step !== null && pending && done < ODDS_ROLLS && (
        <p className="text-xs text-muted" data-testid="enchant-odds-done" data-done={done}>
          {`${done.toLocaleString('en-GB')} of ${ODDS_ROLLS.toLocaleString('en-GB')} rolls so far…`}
        </p>
      )}
      {step !== null && (
        <ul aria-label="Enchantments and how often" className="flex flex-col gap-1 text-sm">
          {levels.map((entry, index) => (
            <li
              key={`${entry.enchantment}|${entry.level}`}
              data-testid={`enchant-odds-row-${index}`}
              data-enchantment={entry.enchantment}
              data-level={entry.level}
              data-chance={entry.chance}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                {enchantmentLine(entry.enchantment, entry.level, lang)}
              </span>
              <span className="w-16 tabular-nums">{percent(entry.chance)}</span>
              <span
                aria-hidden
                className="h-1 w-24 rounded bg-accent"
                style={{ width: `${Math.max(2, Math.round(entry.chance * 96))}px` }}
              />
            </li>
          ))}
          <li
            data-testid="enchant-odds-none"
            className="flex flex-wrap items-center gap-2 text-muted"
          >
            <span className="min-w-0 flex-1">No enchantment</span>
            <span className="w-16 tabular-nums">{percent(noEnchantmentShare(step))}</span>
          </li>
        </ul>
      )}
      <PartsUsed parts={step?.parts ?? []} testId="enchant-odds-parts" />
    </section>
  );
}

/** The sample item box: an id with suggestions, kept when Enter is pressed or the box is left. */
function SampleItemBox(props: {
  readonly item: string;
  onItem(item: string): void;
  readonly pictures: ItemPictureSource;
  readonly lang: LangTable | null;
}) {
  const { item, onItem, pictures, lang } = props;
  const [text, setText] = useState(item);
  useEffect(() => setText(item), [item]);
  const list = useId();
  const commit = (): void => {
    const next = fullId(text.trim());
    if (next !== '' && next !== item) onItem(next);
    else setText(item);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <ItemSlot item={{ id: item, count: 1 }} pictures={pictures} lang={lang} />
      <label className="flex flex-wrap items-center gap-2">
        On which item?
        <input
          data-testid="enchant-item"
          list={list}
          className="w-56 min-w-0 max-w-full rounded border border-border bg-bg px-1"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') setText(item);
          }}
        />
      </label>
      <datalist id={list}>
        {SAMPLE_ITEMS.map((id) => (
          <option key={id} value={id}>
            {itemName(id, lang)}
          </option>
        ))}
      </datalist>
    </div>
  );
}

/** The view of an enchantment provider. */
export function EnchantRoll(props: LiveViewProps) {
  const { element, preferences, onPreferences, onSetup } = props;
  const basics = useLootBasics(props);
  const [itemChoice, setItemChoice] = useState(preferences.sampleItem);
  useEffect(() => setItemChoice(preferences.sampleItem), [preferences.sampleItem]);
  const itemId = itemChoice === '' ? DEFAULT_SAMPLE_ITEM : itemChoice;
  const item: ItemSample = { id: itemId, count: 1 };
  const seed = preferences.seed;
  const base = { provider: element.id, item, situation: NO_SITUATION, seed } as const;
  const roll = useLiveViewJob(
    basics.data,
    basics.data === null ? null : ({ kind: 'enchant', ...base } as const),
  );
  const odds = useLiveViewJob(
    basics.data,
    basics.data === null
      ? null
      : ({
          kind: 'enchant_odds',
          ...base,
          seed: ODDS_SEED,
          rolls: ODDS_ROLLS,
          step: ODDS_FIRST_STEP,
        } as const),
  );
  const unsupported = allUnsupported(roll.result?.unsupported, odds.result?.unsupported);
  const parts = allParts(odds.result?.parts);
  return (
    <LiveViewFrame
      title="Enchantment provider"
      fidelity={odds.result === null ? 'about_right' : oddsFidelity(parts)}
      notes={basics.error === null ? [] : [`The files could not be read: ${basics.error}`]}
      needsSetUp={needsSetUpBanner(basics.vanillaStatus, namesMissingFile(unsupported))}
      onSetup={onSetup}
      unsupported={unsupported}
      controls={
        <div className="flex flex-col gap-2">
          <SampleItemBox
            item={itemId}
            onItem={(next) => {
              setItemChoice(next);
              onPreferences({ sampleItem: next });
            }}
            pictures={basics.pictures}
            lang={basics.lang}
          />
          <SeedBox seed={seed} onSeed={(next) => onPreferences({ seed: next })} />
        </div>
      }
    >
      <RollSection
        stacks={roll.result === null ? null : [roll.result.item]}
        error={roll.error}
        pictures={basics.pictures}
        lang={basics.lang}
        testId="enchant-roll"
      />
      {roll.result !== null && (
        <p data-testid="enchant-roll-lines" className="text-sm">
          {Object.keys(roll.result.item.enchantments ?? {}).length === 0
            ? 'This roll gave no enchantment.'
            : Object.entries(roll.result.item.enchantments ?? {})
                .map(([id, level]) => enchantmentLine(id, level, basics.lang))
                .join(', ')}
        </p>
      )}
      <EnchantmentOddsList
        step={odds.result}
        pending={odds.pending}
        error={odds.error}
        lang={basics.lang}
      />
    </LiveViewFrame>
  );
}
