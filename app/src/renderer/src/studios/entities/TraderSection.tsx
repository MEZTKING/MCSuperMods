/**
 * The Mob Studio's "Trader" section (ADR 0098 D1, ADR 0101 D1), loaded lazily: `msm:trader` on
 * or off, the number of levels, levelling up and restocking, the trade sound and the on-trade
 * event, and per level where its trades come from: the mob's own trades, edited in the trade
 * editor (ADR 0060's villager trade, trade set and tag elements, `trade-model.ts`), or a
 * villager's trade set picked from the target's list. Switching the trader on, changing the
 * number of levels and every trade edit are one undo step each through the host's
 * `applyChanges`.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import type { Target } from '@msm/plugin-api';
import { useId, useState } from 'react';
import { inputClass } from '../../forms';
import { useBlocksItemsStudioHost } from '../blocks-items/host';
import { EventSelect, ProblemsAt } from '../blocks-items/parts';
import { IdField, NumberField } from '../structures/pickers';
import { Section } from '../worldgen/parts';
import { ChoiceField, componentTools, DefaultCheck, FieldProblems } from './MobKindSection';
import { baseOf, type MobSectionProps } from './mob-kinds';
import { TradeEditor } from './TradeEditor';
import {
  elementOf,
  isOwnLevel,
  levelCountChange,
  levelSetOf,
  levelSourceChange,
  MAX_TRADE_LEVELS,
  TRADE_LEVEL_LABELS,
  TRADE_SET_KIND,
  TRADER_COMPONENT,
  traderLevelLayout,
  traderLevelsOf,
  traderOnChange,
  tradeSetWords,
} from './trade-model';

type JsonObject = { [key: string]: Json };

const FIELDS = ['trade_sets', 'levels', 'restock', 'trade_sound', 'on_trade'] as const;
const RESTOCKS = ['twice_a_day', 'never'] as const;
const RESTOCK_LABELS: Readonly<Record<string, string>> = {
  twice_a_day: 'Twice a day',
  never: 'Never',
};
/** The value of the "Trades from" picker meaning the mob's own trades. */
const OWN = '';

/** Props of {@link TraderSection}. */
export interface TraderSectionProps extends MobSectionProps {
  /** The target, for vanilla's trade sets and the default trade sound. */
  target: Target;
}

/** The "Trader" section. */
export default function TraderSection(props: TraderSectionProps) {
  const { project, target } = props;
  const host = useBlocksItemsStudioHost();
  const apply = host?.applyChanges;
  const tools = componentTools(props, TRADER_COMPONENT);
  const [shown, setShown] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const levelsId = useId();
  const sourceId = useId();
  const mob = elementOf(project, props.elementId);
  const levels = traderLevelsOf(props.data);
  const level = Math.min(Math.max(1, shown), Math.max(1, levels.length));
  const entry = levels[level - 1];
  const vanillaSets = target.entities?.vanillaTradeSets ?? {};
  const projectSets = project.namespaces.flatMap((namespace) =>
    namespace.elements
      .filter((element) => element.kind === TRADE_SET_KIND)
      .map((element) => element.id),
  );
  const run = (items: Parameters<NonNullable<typeof apply>>[0], label: string) => {
    if (apply === undefined || items.length === 0) return;
    setError(null);
    apply(items, label, []).catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : String(cause)),
    );
  };
  const toggle = (checked: boolean) => {
    if (!checked) {
      tools.toggle(false, () => ({}));
      return;
    }
    const remembered = props.remembered(TRADER_COMPONENT);
    if (mob === undefined || apply === undefined) {
      tools.toggle(true, () => ({
        trade_sets: [{ trade_set: traderLevelLayout(props.elementId, 1).setId as string }],
      }));
      return;
    }
    run(
      traderOnChange(
        project,
        mob,
        remembered === undefined ? undefined : (remembered as JsonObject),
      ),
      'Trades with players',
    );
  };
  const own = isOwnLevel(props.elementId, level, entry);
  const setId = levelSetOf(entry);
  const vanilla = vanillaSets[setId];
  const sourceChoices = [
    ...projectSets.filter((id) => id !== traderLevelLayout(props.elementId, level).setId),
    ...Object.keys(vanillaSets).sort(),
  ];
  const sound = typeof tools.value.trade_sound === 'string' ? tools.value.trade_sound : '';
  return (
    <Section title="Trader" testId="entity-trader">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          data-testid="entity-trader-on"
          checked={tools.on}
          onChange={(event) => toggle(event.target.checked)}
        />
        Trades with players
      </label>
      {tools.on ? (
        <>
          <p className="text-muted text-xs">
            Using the mob with an empty hand opens the villager trading screen. Babies, angry mobs
            and ridden mobs do not trade.
          </p>
          {baseOf(props.data) === 'monster' && (
            <p className="text-muted text-xs" data-testid="entity-trader-monster">
              A monster does not trade at night.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-0 flex-col gap-0.5 text-xs">
              <label htmlFor={levelsId} className="text-muted">
                Levels
              </label>
              <select
                id={levelsId}
                className={inputClass}
                data-testid="entity-trader-levels"
                value={levels.length}
                disabled={apply === undefined || mob === undefined}
                onChange={(event) => {
                  if (mob === undefined) return;
                  run(levelCountChange(project, mob, Number(event.target.value)), 'Trader levels');
                }}
              >
                {Array.from({ length: MAX_TRADE_LEVELS }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {index + 1}
                  </option>
                ))}
              </select>
            </div>
            <ChoiceField
              label="Restocks"
              value={typeof tools.value.restock === 'string' ? tools.value.restock : 'twice_a_day'}
              choices={RESTOCKS}
              labels={RESTOCK_LABELS}
              testId="entity-trader-restock"
              onChange={(next) =>
                tools.setField('restock', next === 'twice_a_day' ? undefined : next)
              }
            />
            <EventSelect
              label="On trade"
              value={tools.value.on_trade}
              events={props.events}
              testId="entity-trader-on-trade"
              onChange={(next) => tools.setField('on_trade', next)}
            />
          </div>
          <DefaultCheck
            label="Gets better with trading (unlocks the next level)"
            value={tools.value.levels}
            fallback
            testId="entity-trader-levels-on"
            onChange={(next) => tools.setField('levels', next)}
          />
          <IdField
            label="Trade sound"
            value={sound}
            registry="sound_event"
            suggest={props.suggest}
            testId="entity-trader-sound"
            onCommit={(text) => tools.setField('trade_sound', text === '' ? undefined : text)}
          />
          {sound === '' && <p className="text-muted text-xs">Empty plays the villager's “yes”.</p>}
          {levels.length > 1 && (
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Trading level">
              {levels.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  role="tab"
                  aria-selected={index + 1 === level}
                  data-testid={`entity-trader-level-${index + 1}`}
                  className={`rounded border px-2 py-0.5 text-xs ${
                    index + 1 === level ? 'border-accent' : 'border-border'
                  }`}
                  onClick={() => setShown(index + 1)}
                >
                  {TRADE_LEVEL_LABELS[index]}
                </button>
              ))}
            </div>
          )}
          <p className="font-medium text-xs" data-testid="entity-trader-level-title">
            {TRADE_LEVEL_LABELS[level - 1]}
          </p>
          <div className="flex min-w-0 flex-col gap-0.5 text-xs">
            <label htmlFor={sourceId} className="text-muted">
              Trades from
            </label>
            <select
              id={sourceId}
              className={inputClass}
              data-testid="entity-trader-source"
              value={own ? OWN : setId}
              disabled={apply === undefined || mob === undefined}
              onChange={(event) => {
                if (mob === undefined) return;
                const value = event.target.value;
                run(
                  levelSourceChange(project, mob, level, value === OWN ? undefined : value),
                  'Trades from',
                );
              }}
            >
              <option value={OWN}>Its own trades</option>
              {!own && setId !== '' && !sourceChoices.includes(setId) && (
                <option value={setId}>{tradeSetWords(setId)}</option>
              )}
              {sourceChoices.map((id) => (
                <option key={id} value={id}>
                  {vanillaSets[id] === undefined
                    ? tradeSetWords(id)
                    : `A villager: ${tradeSetWords(id)}`}
                </option>
              ))}
            </select>
          </div>
          {own ? (
            <TradeEditor
              project={project}
              layout={traderLevelLayout(props.elementId, level)}
              suggest={props.suggest}
              apply={apply}
              testId="entity-trader-trades"
            />
          ) : (
            <p className="text-muted text-xs" data-testid="entity-trader-borrowed">
              Offers what {tradeSetWords(setId)} offers.
              {vanilla?.villagerOnly === true &&
                ` ${vanilla.villagerOnlyTrades} of its ${vanilla.trades} trades are only for villagers, so this mob offers fewer.`}
            </p>
          )}
          {level < levels.length && (
            <NumberField
              label="Trading XP to reach the next level"
              value={typeof entry?.xp_to_next === 'number' ? entry.xp_to_next : undefined}
              integer
              allowEmpty
              testId="entity-trader-xp-to-next"
              onCommit={(next) =>
                tools.setField(['trade_sets', level - 1, 'xp_to_next'], next, true)
              }
            />
          )}
          {error !== null && (
            <p role="alert" className="text-error text-xs" data-testid="entity-trader-error">
              {error}
            </p>
          )}
        </>
      ) : (
        <p className="text-muted text-xs">The mob does not trade.</p>
      )}
      <FieldProblems problems={props.problems} component={TRADER_COMPONENT} keys={FIELDS} />
      {levels.map((_, index) => (
        <ProblemsAt
          key={index}
          problems={props.problems}
          pointer={tools.pointer('trade_sets', index, 'trade_set')}
        />
      ))}
    </Section>
  );
}
