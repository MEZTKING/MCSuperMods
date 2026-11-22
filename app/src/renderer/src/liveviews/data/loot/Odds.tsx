/**
 * The odds (B609; ADR 0120 D3, limit 2L1): for every item that can drop, how often and how many,
 * out of 1,000 seeded rolls made in the live views worker. The first step arrives after 100 rolls
 * and every later one replaces it, so the list draws at once and sharpens. These numbers are the
 * checked part of Roll it (within 2 points of the game's own rolls on MSM's test tables, B605);
 * the line says how close they are by the weakest part used. Rows a part only the game knows
 * touched are marked, rows an addition brought are marked "Added".
 */

import type { LootPart, OddsStep } from '@msm/sim';
import { FIDELITY_LABELS } from '../../frame/fidelity';
import { ItemSlot } from '../../frame/ItemSlot';
import {
  enchantmentLine,
  type ItemPictureSource,
  itemName,
  type LangTable,
  wordsOfPath,
} from '../../frame/item-picture';
import {
  addedBy,
  fromAddedPool,
  howMany,
  ODDS_ROWS_SHOWN,
  ODDS_WORDS,
  oddsFidelity,
  percent,
} from './loot-model';

/** Which pools an addition brought (the "With" side of With and without). */
export interface AddedPools {
  /** The table's own pool count: pools at this index and after were added. */
  readonly ownPools: number;
  readonly added: readonly { readonly addition: string; readonly pools: readonly number[] }[];
}

/** A small tag beside a row. */
export function RowTag({ children, testId }: { children: string; testId: string }) {
  return (
    <span
      data-testid={testId}
      className="rounded border border-border px-1 text-[0.65rem] uppercase tracking-wide text-muted"
    >
      {children}
    </span>
  );
}

/** Props of {@link OddsSection}. */
export interface OddsSectionProps {
  /** The latest step, or `null` before the first. */
  readonly step: OddsStep | null;
  readonly pending: boolean;
  readonly error: string | null;
  /** Rolls in all. */
  readonly rolls: number;
  readonly pictures: ItemPictureSource;
  readonly lang: LangTable | null;
  /** Marks rows an addition brought. */
  readonly added?: AddedPools;
  /** The heading (default "The odds"). */
  readonly title?: string;
  /** A test id for the section (default `odds`). */
  readonly testId?: string;
}

/** The parts the odds used, by level, ids inside a closed box (no ids in plain sight). */
export function PartsUsed({ parts, testId }: { parts: readonly LootPart[]; testId: string }) {
  if (parts.length === 0) return null;
  const levels = ['checked', 'about_right', 'only_in_game'] as const;
  return (
    <details data-testid={testId} className="text-xs text-muted">
      <summary className="cursor-pointer">What MSM used to work this out</summary>
      <ul className="flex flex-col gap-0.5 pt-1 [overflow-wrap:anywhere]">
        {levels.map((level) => {
          const names = parts
            .filter((part) => part.fidelity === level)
            .map((part) => part.type)
            .sort();
          if (names.length === 0) return null;
          return (
            <li key={level} data-fidelity={level}>
              {`${FIDELITY_LABELS[level]}: ${names.join(', ')}`}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** The odds as a list, the likeliest first. */
export function OddsSection(props: OddsSectionProps) {
  const { step, pending, error, rolls, pictures, lang, added } = props;
  const testId = props.testId ?? 'odds';
  const fidelity = oddsFidelity(step?.parts);
  const rows = step?.rows ?? [];
  const shown = rows.slice(0, ODDS_ROWS_SHOWN);
  const done = step?.done ?? 0;
  return (
    <section
      aria-label={props.title ?? 'The odds'}
      data-testid={testId}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-sm font-medium">{props.title ?? 'The odds'}</h4>
        <span className="text-xs text-muted">{`out of ${rolls.toLocaleString('en-GB')} rolls`}</span>
        <span
          data-testid={`${testId}-fidelity`}
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
      {step === null && error === null && (
        <p className="text-xs text-muted" data-testid={`${testId}-waiting`}>
          Rolling…
        </p>
      )}
      {step !== null && pending && done < rolls && (
        <p className="text-xs text-muted" data-testid={`${testId}-done`} data-done={done}>
          {`${done.toLocaleString('en-GB')} of ${rolls.toLocaleString('en-GB')} rolls so far…`}
        </p>
      )}
      {step !== null && rows.length === 0 && (
        <p className="text-xs text-muted" data-testid={`${testId}-none`}>
          Nothing drops in this situation.
        </p>
      )}
      {shown.length > 0 && (
        <ul aria-label="Items and how often" className="flex flex-col gap-1">
          {shown.map((row, index) => {
            const isAdded = added !== undefined && fromAddedPool(row.pools, added.ownPools);
            const by = added === undefined ? [] : addedBy(row.pools, added.added);
            const enchantments = Object.entries(row.enchantments ?? {}).map(([id, level]) =>
              enchantmentLine(id, level, lang),
            );
            return (
              <li
                key={`${row.item}|${JSON.stringify(row.enchantments ?? {})}|${row.damage ?? ''}`}
                data-testid={`${testId}-row-${index}`}
                data-item={row.item}
                data-chance={row.chance}
                data-added={isAdded ? 'true' : undefined}
                data-uncertain={row.uncertain === true ? 'true' : undefined}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <ItemSlot
                  item={{
                    id: row.item,
                    count: 1,
                    ...(row.enchantments === undefined ? {} : { enchantments: row.enchantments }),
                    ...(row.damage === undefined ? {} : { damage: row.damage }),
                  }}
                  pictures={pictures}
                  lang={lang}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="[overflow-wrap:anywhere]">{itemName(row.item, lang)}</span>
                  {enchantments.length > 0 && (
                    <span className="text-xs text-muted">{enchantments.join(', ')}</span>
                  )}
                  {row.damage !== undefined && (
                    <span className="text-xs text-muted">{`${Math.round(row.damage * 100)}% durability left`}</span>
                  )}
                </span>
                <span className="flex w-28 flex-col gap-0.5">
                  <span className="tabular-nums" data-testid={`${testId}-row-${index}-chance`}>
                    {percent(row.chance)}
                  </span>
                  <span
                    aria-hidden
                    className="h-1 rounded bg-accent"
                    style={{ width: `${Math.max(2, Math.round(row.chance * 100))}%` }}
                  />
                </span>
                <span className="w-32 text-xs text-muted" title="How many when it drops">
                  {`How many: ${howMany(row)}`}
                </span>
                {row.uncertain === true && (
                  <RowTag testId={`${testId}-row-${index}-uncertain`}>Only the game knows</RowTag>
                )}
                {isAdded && (
                  <span
                    title={by.length > 0 ? `Added by ${by.map(wordsOfPath).join(', ')}` : undefined}
                  >
                    <RowTag testId={`${testId}-row-${index}-added`}>Added</RowTag>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > shown.length && (
        <p className="text-xs text-muted">{`and ${rows.length - shown.length} more`}</p>
      )}
      <PartsUsed parts={step?.parts ?? []} testId={`${testId}-parts`} />
    </section>
  );
}
