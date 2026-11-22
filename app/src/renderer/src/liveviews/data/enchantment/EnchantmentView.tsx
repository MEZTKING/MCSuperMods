/**
 * An enchantment's live view (B610; ADR 0120): its tooltip line on a chosen item at each level,
 * the level table (cost windows, the costs at which an enchanting table gives each level, the
 * weight), what it goes on (the tag opened up), what it cannot be combined with, its effects in
 * plain words (limit 2L10: described, not played) and the enchanting table's chances at a cost
 * you choose (an `odds` job in the live views worker over `enchant_with_levels`, the table's own
 * pool `#minecraft:in_enchanting_table`). The level table follows an edit at once; the rest 150 ms
 * after it.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import type { OddsStep } from '@msm/sim';
import { type ReactNode, useId, useMemo, useState } from 'react';
import type { LiveViewClient, LiveViewJob } from '../../client';
import { FIDELITY_LABELS, type Fidelity, weakest } from '../../frame/fidelity';
import { ItemSlot } from '../../frame/ItemSlot';
import { resourceFoldersOf, useVanillaLang } from '../../frame/item-picture';
import { LiveViewFrame, needsSetUpBanner } from '../../frame/LiveViewFrame';
import { factsOf, useLiveViewData, useLiveViewJob } from '../../frame/live-data';
import { Tooltip } from '../../frame/Tooltip';
import type { LiveViewProps } from '../../registry';
import { effectLines } from './effects';
import { useCurses, useEnchantmentInfo, useIdSet } from './hooks';
import {
  costFieldsOf,
  levelTable,
  MAX_SHELVES,
  rangesText,
  slotCosts,
  TABLE_MAX_COST,
} from './table-model';
import { enchantabilityOf, enchantmentInfoOf, enchantmentWords, fullId, stackLines } from './words';

/** The folders the view reads. */
export const ENCHANTMENT_FOLDERS = ['enchantment', 'tags/enchantment', 'tags/item'] as const;
/** Tries of the table's chances. */
export const TABLE_TRIES = 2000;
/** Levels drawn as slots (an enchantment may have up to 255). */
export const LEVELS_SHOWN = 10;
/** Items shown of what it goes on. */
export const ITEMS_SHOWN = 24;

const TABLE_POOL = '#minecraft:in_enchanting_table';

const percent = (value: number): string =>
  value > 0 && value < 0.001 ? 'under 0.1%' : `${Math.round(value * 1000) / 10}%`;

/** Props: the registry's, and a client for tests. */
export interface EnchantmentViewProps extends LiveViewProps {
  readonly client?: LiveViewClient;
}

function Section(props: {
  title: string;
  fidelity?: Fidelity;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={props.title} data-testid={props.testId} className="flex flex-col gap-2">
      <h4 className="flex flex-wrap items-baseline gap-2 text-sm font-medium">
        {props.title}
        {props.fidelity !== undefined && (
          <span data-fidelity={props.fidelity} className="text-xs font-normal text-muted">
            {FIDELITY_LABELS[props.fidelity]}
          </span>
        )}
      </h4>
      {props.children}
    </section>
  );
}

/** The view. */
export default function EnchantmentView(props: EnchantmentViewProps) {
  const { project, element, vanilla, vanillaAssets, preferences, onPreferences, onSetup, client } =
    props;
  const data = element.data as Json;
  const file: JsonObject =
    typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as JsonObject) : {};
  const id = fullId(element.id);
  const folders = useMemo(() => resourceFoldersOf(project), [project]);
  const pictures = useMemo(() => ({ vanillaAssets, folders }), [vanillaAssets, folders]);
  const lang = useVanillaLang(vanillaAssets, folders);
  const facts = useMemo(() => factsOf(project), [project]);
  const files = useLiveViewData(project, vanilla, ENCHANTMENT_FOLDERS, client);
  const hash = files.status === 'ready' ? files.data : null;
  const vanillaState =
    files.status === 'ready'
      ? files.vanilla === 'none'
        ? null
        : files.vanilla
      : files.status === 'loading'
        ? 'loading'
        : null;
  const vanillaReady = files.status === 'ready' && files.vanilla === 'ready';
  const info = useEnchantmentInfo(project, vanilla, lang);
  const curses = useCurses(hash, client);
  const supported = useIdSet(hash, 'item', file.supported_items, client);
  const primary = useIdSet(hash, 'item', file.primary_items ?? file.supported_items, client);
  const exclusive = useIdSet(hash, 'enchantment', file.exclusive_set, client);
  const tablePool = useIdSet(hash, 'enchantment', TABLE_POOL, client);

  const fields = costFieldsOf(data);
  const sampleItem = fullId(
    preferences.sampleItem.trim() !== ''
      ? preferences.sampleItem.trim()
      : (supported.ids?.[0] ?? 'minecraft:book'),
  );
  const known = enchantabilityOf(sampleItem, facts);
  const enchantability = known ?? 1;
  const rows = levelTable(fields, enchantability);
  const ownInfo = enchantmentInfoOf(data, lang);
  const infoOf = (other: string) => (fullId(other) === id ? ownInfo : info(other));

  const [shelves, setShelves] = useState(MAX_SHELVES);
  const [cost, setCost] = useState(TABLE_MAX_COST);
  const inTable = tablePool.ids === null ? null : tablePool.ids.includes(id);
  const forItem =
    sampleItem === 'minecraft:book' || primary.ids === null
      ? true
      : primary.ids.includes(sampleItem);
  const job = useMemo<Extract<LiveViewJob, { kind: 'odds' }> | null>(() => {
    if (!vanillaReady || inTable !== true || !forItem) return null;
    return {
      kind: 'odds',
      table: {
        pools: [
          {
            rolls: 1,
            entries: [
              {
                type: 'minecraft:item',
                name: sampleItem,
                modifier: {
                  type: 'minecraft:enchant_with_levels',
                  levels: cost,
                  options: TABLE_POOL,
                },
              },
            ],
          },
        ],
      },
      situation: { context: 'minecraft:empty' },
      seed: preferences.seed,
      rolls: TABLE_TRIES,
      step: 500,
    };
  }, [vanillaReady, inTable, forItem, sampleItem, cost, preferences.seed]);
  const odds = useLiveViewJob(hash, job, client);
  const step = odds.result as OddsStep | null;
  const chances = (step?.enchantments ?? []).filter((row) => fullId(row.enchantment) === id);
  const oddsFidelity = weakest((step?.parts ?? []).map((part) => part.fidelity));

  const levelsShown = Math.min(fields.maxLevel, LEVELS_SHOWN);
  const effects = effectLines(file.effects);
  const sampleId = useId();
  const itemList = useId();
  const lineOptions = { lang, enchantments: infoOf, curses, facts };

  const notes = [
    'The tooltip is drawn by MSM; the game also shows the item’s attribute lines under it.',
    'What it does in a fight is described, not played: Play is the real check.',
    'The enchanting table’s costs and choices are MSM’s model of the cost fields (about right).',
  ];
  if (fields.maxLevel > LEVELS_SHOWN)
    notes.push(`Only the first ${LEVELS_SHOWN} levels are drawn as items.`);
  if (known === undefined) {
    notes.push(`How well ${sampleItem} takes enchantments is not known here; a book’s is used.`);
  }
  const fidelity = weakest(['about_right', ...(job === null ? [] : [oddsFidelity])]);

  return (
    <LiveViewFrame
      title="Enchantment"
      fidelity={fidelity}
      notes={notes}
      needsSetUp={needsSetUpBanner(vanillaState, true)}
      onSetup={onSetup}
      unsupported={step?.unsupported ?? []}
      controls={
        <label htmlFor={sampleId} className="flex flex-wrap items-center gap-2 text-sm">
          On this item
          <input
            id={sampleId}
            data-testid="enchantment-sample-item"
            list={itemList}
            className="min-w-0 rounded border border-border bg-bg px-1"
            placeholder={supported.ids?.[0] ?? 'minecraft:book'}
            defaultValue={preferences.sampleItem}
            onBlur={(event) => onPreferences({ sampleItem: event.target.value.trim() })}
            onKeyDown={(event) => {
              if (event.key === 'Enter')
                onPreferences({ sampleItem: event.currentTarget.value.trim() });
            }}
          />
          <datalist id={itemList}>
            {['minecraft:book', ...(supported.ids ?? []).slice(0, 40)].map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </label>
      }
    >
      <Section title="On an item" fidelity="about_right" testId="enchantment-on-item">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: levelsShown }, (_, i) => i + 1).map((level) => {
            const stack = {
              id: sampleItem === 'minecraft:book' ? 'minecraft:enchanted_book' : sampleItem,
              count: 1,
              enchantments: { [id]: level },
            };
            return (
              <ItemSlot
                key={level}
                item={stack}
                pictures={pictures}
                lang={lang}
                lines={stackLines(stack, lineOptions)}
                testId={`enchantment-slot-${level}`}
              />
            );
          })}
        </div>
        <div data-testid="enchantment-lines">
          <Tooltip
            inline
            lines={Array.from({ length: levelsShown }, (_, i) => ({
              text: enchantmentWords(id, i + 1, ownInfo, lang),
              tone: curses.has(id) ? ('curse' as const) : ('enchantment' as const),
            }))}
          />
        </div>
      </Section>

      <Section title="Levels" fidelity="about_right" testId="enchantment-levels">
        <p className="text-xs text-muted">
          {`Weight ${fields.weight} (how often the table picks it against others), anvil cost ${fields.anvilCost} per level.`}
        </p>
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pr-3 font-normal">Level</th>
                <th className="pr-3 font-normal">Cost from</th>
                <th className="pr-3 font-normal">Cost to</th>
                <th className="font-normal">{`The table gives it at costs (on ${sampleItem})`}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.level} data-testid={`enchantment-level-${row.level}`}>
                  <td className="pr-3">{row.level}</td>
                  <td className="pr-3 tabular-nums" data-testid="enchantment-min-cost">
                    {row.minCost}
                  </td>
                  <td className="pr-3 tabular-nums" data-testid="enchantment-max-cost">
                    {row.maxCost}
                  </td>
                  <td className="tabular-nums" data-testid="enchantment-table-costs">
                    {row.tableCosts.length === 0 ? 'never' : rangesText(row.tableCosts)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="What it goes on" fidelity="about_right" testId="enchantment-items">
        {supported.tag !== null && (
          <p className="text-xs text-muted">
            {supported.dropped
              ? `${supported.tag} is not found or the game would drop it${supported.missing.length > 0 ? ` (not found: ${supported.missing.join(', ')})` : ''}.`
              : `Everything in ${supported.tag}`}
          </p>
        )}
        {supported.ids === null ? (
          <p className="text-xs text-muted">Opening the tag…</p>
        ) : supported.ids.length === 0 ? (
          <p className="text-sm">Nothing.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {supported.ids.slice(0, ITEMS_SHOWN).map((item) => (
              <ItemSlot key={item} item={{ id: item, count: 1 }} pictures={pictures} lang={lang} />
            ))}
            {supported.ids.length > ITEMS_SHOWN && (
              <span className="self-center text-xs text-muted">{`and ${supported.ids.length - ITEMS_SHOWN} more`}</span>
            )}
          </div>
        )}
      </Section>

      <Section title="Cannot be combined with" testId="enchantment-exclusive">
        {exclusive.ids === null ? (
          <p className="text-xs text-muted">Opening the tag…</p>
        ) : exclusive.ids.filter((other) => other !== id).length === 0 ? (
          <p className="text-sm">Nothing: it goes with any other enchantment.</p>
        ) : (
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
            {exclusive.ids
              .filter((other) => other !== id)
              .map((other) => (
                <li key={other} title={other}>
                  {infoOf(other)?.name ?? enchantmentWords(other, 1, { maxLevel: 1 }, lang)}
                </li>
              ))}
          </ul>
        )}
      </Section>

      <Section title="What it does" fidelity="about_right" testId="enchantment-effects">
        {effects.length === 0 ? (
          <p className="text-sm">No effects: it is only a name on the item.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {effects.map((line) => (
              <li key={line.id} data-effect={line.id}>
                {line.words}
                {line.details.length > 0 && (
                  <span className="text-muted">{`: ${line.details.join('; ')}`}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="The enchanting table"
        {...(job === null ? {} : { fidelity: oddsFidelity })}
        testId="enchantment-table"
      >
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            Bookshelves
            <input
              type="number"
              min={0}
              max={MAX_SHELVES}
              value={shelves}
              data-testid="enchantment-shelves"
              className="w-16 rounded border border-border bg-bg px-1"
              onChange={(event) =>
                setShelves(Math.min(MAX_SHELVES, Math.max(0, Number(event.target.value) || 0)))
              }
            />
          </label>
          <label className="flex items-center gap-2">
            Cost (levels)
            <input
              type="number"
              min={1}
              max={TABLE_MAX_COST}
              value={cost}
              data-testid="enchantment-cost"
              className="w-16 rounded border border-border bg-bg px-1"
              onChange={(event) =>
                setCost(Math.min(TABLE_MAX_COST, Math.max(1, Number(event.target.value) || 1)))
              }
            />
          </label>
        </div>
        <p data-testid="enchantment-slot-costs" className="text-xs text-muted">
          {(() => {
            const [top, middle, bottom] = slotCosts(shelves);
            const range = (slot: { min: number; max: number } | undefined) =>
              slot === undefined
                ? ''
                : slot.min === slot.max
                  ? `${slot.min}`
                  : `${slot.min} to ${slot.max}`;
            return `With ${shelves} bookshelves the top slot costs ${range(top)}, the middle ${range(middle)} and the bottom ${range(bottom)} levels.`;
          })()}
        </p>
        <div data-testid="enchantment-table-chances" className="text-sm">
          {inTable === false ? (
            <p>{`The enchanting table never offers it: it is not in ${TABLE_POOL}.`}</p>
          ) : !forItem ? (
            <p>{`The enchanting table never offers it for ${sampleItem}.`}</p>
          ) : !vanillaReady ? (
            <p className="text-muted">The table’s chances need Minecraft’s own enchantments.</p>
          ) : step === null ? (
            <p className="text-muted">Trying it…</p>
          ) : (
            <>
              <p>
                {`At cost ${cost} on ${sampleItem}, out of ${step.done.toLocaleString('en-GB')} tries: `}
                <span data-testid="enchantment-table-total">
                  {percent(chances.reduce((sum, row) => sum + row.chance, 0))}
                </span>
              </p>
              <ul className="flex flex-wrap gap-x-3">
                {chances
                  .slice()
                  .sort((a, b) => a.level - b.level)
                  .map((row) => (
                    <li key={row.level} data-level={row.level}>
                      {`${enchantmentWords(id, row.level, ownInfo, lang)}: ${percent(row.chance)}`}
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>
      </Section>
    </LiveViewFrame>
  );
}
