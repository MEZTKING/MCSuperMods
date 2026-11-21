/**
 * The trade editor (ADR 0098 D1, D2, ADR 0101 D1) of the Mob Studio's Trader section and the
 * Profession Studio: one trading level's trades, each a line "price (and second price) for
 * product, uses, XP" with Change and Remove, and a form for a new or changed trade (Price,
 * Second price, Product, Uses before restocking, Trading XP). Every action goes through the
 * host's `applyChanges` as one undo step (`trade-model.ts`); without a host the trades are
 * shown read-only.
 *
 * @packageDocumentation
 */

import type { Project } from '@msm/core';
import { Pencil, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ChangeItem } from '../../changeset/changeset';
import { thingName } from '../../components/thing-picker/thing-sources';
import { Button, iconButtonClass } from '../../components/ui/Button';
import { withProjectIds } from '../blocks-items/blocks-items-model';
import type { BlocksItemsStudioHost } from '../blocks-items/host';
import { CheckField } from '../blocks-items/parts';
import { IdField, NumberField } from '../structures/pickers';
import {
  addTradeChange,
  itemIdOf,
  levelTrades,
  newTradeDraft,
  removeTradeChange,
  type TradeDraft,
  type TradeLevelLayout,
  type TradeStack,
  tradeDraftProblem,
  updateTradeChange,
} from './trade-model';

/** The host's one-step apply (`BlocksItemsStudioHost.applyChanges`). */
export type ApplyChanges = NonNullable<BlocksItemsStudioHost['applyChanges']>;

/** The project's items (and block items) to offer first in the item pickers. */
function projectItems(project: Project): string[] {
  return project.namespaces.flatMap((namespace) =>
    namespace.elements
      .filter((element) => element.kind === 'msm:item' || element.kind === 'msm:block')
      .map((element) => element.id),
  );
}

/** "3 Emerald" in words. */
export function stackWords(project: Project, stack: TradeStack): string {
  const id = itemIdOf(stack.item);
  const name = id === '' ? 'nothing yet' : thingName(project, id, 'item');
  return `${stack.count} ${name}`;
}

/** One trade in words: "2 Emerald and 1 Book for 1 Map (12 uses, 5 XP)". */
export function tradeWords(project: Project, draft: TradeDraft): string {
  const price =
    draft.second === undefined || itemIdOf(draft.second.item) === ''
      ? stackWords(project, draft.price)
      : `${stackWords(project, draft.price)} and ${stackWords(project, draft.second)}`;
  const uses = `${draft.uses} ${draft.uses === 1 ? 'use' : 'uses'}`;
  return `${price} for ${stackWords(project, draft.product)} (${uses}, ${draft.xp} XP)`;
}

/** Item and count fields of one stack. */
function StackFields(props: {
  label: string;
  stack: TradeStack;
  testId: string;
  suggest(registry: string, prefix: string): string[];
  onChange(next: TradeStack): void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <IdField
        label={props.label}
        value={props.stack.item}
        registry="item"
        suggest={props.suggest}
        testId={`${props.testId}-item`}
        onCommit={(text) => props.onChange({ ...props.stack, item: text })}
      />
      <NumberField
        label="How many"
        value={props.stack.count}
        integer
        testId={`${props.testId}-count`}
        onCommit={(next) => props.onChange({ ...props.stack, count: next ?? 1 })}
      />
    </div>
  );
}

/** Props of {@link TradeEditor}. */
export interface TradeEditorProps {
  project: Project;
  /** Where the level's trades live. */
  layout: TradeLevelLayout;
  suggest(registry: string, prefix: string): string[];
  /** The host's one-step apply; absent: read-only. */
  apply: ApplyChanges | undefined;
  /** Test id prefix, for example `trader-trades`. */
  testId: string;
}

/** The trades of one level and the form for a new or changed trade. */
export function TradeEditor(props: TradeEditorProps) {
  const { project, layout, apply, testId } = props;
  const [draft, setDraft] = useState<TradeDraft>(newTradeDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A different level starts a fresh form.
  useEffect(() => {
    void layout.tagId;
    setDraft(newTradeDraft());
    setEditing(null);
    setError(null);
  }, [layout.tagId]);
  const rows = levelTrades(project, layout);
  const suggest = withProjectIds(props.suggest, 'item', projectItems(project));
  const problem = tradeDraftProblem(draft);

  const run = (items: readonly ChangeItem[], label: string, after?: () => void) => {
    if (apply === undefined || items.length === 0) return;
    setError(null);
    apply(items, label, []).then(
      () => after?.(),
      (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
    );
  };
  const reset = () => {
    setDraft(newTradeDraft());
    setEditing(null);
  };
  const save = () => {
    if (problem !== undefined) return;
    if (editing === null) {
      run(addTradeChange(project, layout, draft).items, 'Add a trade', reset);
    } else {
      run(updateTradeChange(project, editing, draft), 'Change a trade', reset);
    }
  };

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      {rows.length === 0 ? (
        <p className="text-muted text-xs" data-testid={`${testId}-empty`}>
          No trades at this level yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-2 text-sm"
              data-testid={`${testId}-row-${row.id}`}
            >
              <span className="min-w-0 flex-1">
                {row.element === undefined
                  ? `${thingName(project, row.id)} (not in this mod)`
                  : tradeWords(project, row.draft)}
              </span>
              {row.element !== undefined && apply !== undefined && (
                <button
                  type="button"
                  aria-label="Change this trade"
                  title="Change this trade"
                  className={iconButtonClass}
                  data-testid={`${testId}-change-${row.id}`}
                  onClick={() => {
                    setDraft(row.draft);
                    setEditing(row.id);
                  }}
                >
                  <Pencil size={12} aria-hidden />
                </button>
              )}
              {apply !== undefined && (
                <button
                  type="button"
                  aria-label="Remove this trade"
                  title="Remove this trade"
                  className={iconButtonClass}
                  data-testid={`${testId}-remove-${row.id}`}
                  onClick={() => {
                    if (editing === row.id) reset();
                    run(removeTradeChange(project, layout, row.id), 'Remove a trade');
                  }}
                >
                  <X size={12} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {apply === undefined ? (
        <p className="text-muted text-xs" data-testid={`${testId}-read-only`}>
          Trades can be added here in the full app.
        </p>
      ) : (
        <div
          className="flex flex-col gap-2 rounded border border-border p-2"
          data-testid={`${testId}-form`}
        >
          <p className="font-medium text-xs">{editing === null ? 'New trade' : 'Change trade'}</p>
          <StackFields
            label="Price"
            stack={draft.price}
            testId="trade-price"
            suggest={suggest}
            onChange={(price) => setDraft({ ...draft, price })}
          />
          <CheckField
            label="Also costs a second item"
            checked={draft.second !== undefined}
            testId="trade-second-on"
            onChange={(checked) => {
              const { second: _, ...rest } = draft;
              setDraft(checked ? { ...rest, second: { item: '', count: 1 } } : rest);
            }}
          />
          {draft.second !== undefined && (
            <StackFields
              label="Second price"
              stack={draft.second}
              testId="trade-second"
              suggest={suggest}
              onChange={(second) => setDraft({ ...draft, second })}
            />
          )}
          <StackFields
            label="Product"
            stack={draft.product}
            testId="trade-product"
            suggest={suggest}
            onChange={(product) => setDraft({ ...draft, product })}
          />
          <div className="flex flex-wrap items-end gap-2">
            <NumberField
              label="Uses before restocking"
              value={draft.uses}
              integer
              testId="trade-uses"
              onCommit={(next) => setDraft({ ...draft, uses: next ?? 1 })}
            />
            <NumberField
              label="Trading XP"
              value={draft.xp}
              integer
              testId="trade-xp"
              onCommit={(next) => setDraft({ ...draft, xp: next ?? 0 })}
            />
          </div>
          {problem !== undefined && (
            <p className="text-muted text-xs" data-testid="trade-form-hint">
              {problem}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              className="text-xs"
              data-testid={editing === null ? 'trade-add' : 'trade-save'}
              disabled={problem !== undefined}
              onClick={save}
            >
              {editing === null ? <Plus size={12} aria-hidden /> : null}
              {editing === null ? 'Add the trade' : 'Save the trade'}
            </Button>
            {editing !== null && (
              <Button className="text-xs" data-testid="trade-cancel" onClick={reset}>
                Cancel
              </Button>
            )}
          </div>
          <p className="text-muted text-xs">
            Price changes with demand, as a villager's do. Each change here is one step you can
            undo.
          </p>
        </div>
      )}
      {error !== null && (
        <p role="alert" className="text-error text-xs" data-testid={`${testId}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
