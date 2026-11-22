/**
 * What the Roll it views share (B609): the files in the worker, pictures and words
 * ({@link useLootBasics}), and one roll's stacks as slots ({@link RollSection}).
 */

import type { LootStack } from '@msm/sim';
import { useMemo } from 'react';
import { ItemSlot } from '../../frame/ItemSlot';
import {
  type ItemPictureSource,
  type LangTable,
  resourceFoldersOf,
  useVanillaLang,
} from '../../frame/item-picture';
import { useLiveViewData } from '../../frame/live-data';
import type { LiveViewProps } from '../../registry';
import { fromAddedPool, LOOT_FOLDERS, ONE_ROLL_WORDS, ROLL_DIFFERS } from './loot-model';
import { type AddedPools, RowTag } from './Odds';

/** What every Roll it view needs: the files in the worker, pictures and words. */
export function useLootBasics(props: LiveViewProps): {
  /** The files' hash once they are in the worker, else `null`. */
  readonly data: string | null;
  /** Vanilla's folders: `ready` or `not_set_up` (`null` while loading). */
  readonly vanillaStatus: 'ready' | 'not_set_up' | null;
  /** Why the files could not be read, or `null`. */
  readonly error: string | null;
  readonly pictures: ItemPictureSource;
  readonly lang: LangTable | null;
} {
  const { project, vanilla, vanillaAssets } = props;
  const live = useLiveViewData(project, vanilla, LOOT_FOLDERS);
  const folders = useMemo(() => resourceFoldersOf(project), [project]);
  const pictures = useMemo<ItemPictureSource>(
    () => ({ vanillaAssets, folders }),
    [vanillaAssets, folders],
  );
  const lang = useVanillaLang(vanillaAssets, folders);
  return {
    data: live.status === 'ready' ? live.data : null,
    vanillaStatus:
      live.status !== 'ready' ? null : live.vanilla === 'not_set_up' ? 'not_set_up' : 'ready',
    error: live.status === 'error' ? live.message : null,
    pictures,
    lang,
  };
}

/** Props of {@link RollSection}. */
export interface RollSectionProps {
  /** The stacks of the roll, or `null` before it arrives. */
  readonly stacks: readonly LootStack[] | null;
  readonly error: string | null;
  readonly pictures: ItemPictureSource;
  readonly lang: LangTable | null;
  /** Marks stacks an addition brought. */
  readonly added?: AddedPools;
  /** The heading (default "Roll it"). */
  readonly title?: string;
  /** A test id (default `roll-it`). */
  readonly testId?: string;
}

/** One roll's stacks as slots. */
export function RollSection(props: RollSectionProps) {
  const { stacks, error, pictures, lang, added } = props;
  const testId = props.testId ?? 'roll-it';
  return (
    <section
      aria-label={props.title ?? 'Roll it'}
      data-testid={testId}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-sm font-medium">{props.title ?? 'Roll it'}</h4>
        <span
          data-testid={`${testId}-fidelity`}
          data-fidelity="about_right"
          className="text-xs text-muted"
        >
          {ONE_ROLL_WORDS}
        </span>
      </div>
      {error !== null && (
        <p role="alert" className="text-xs text-error">
          {`The roll could not be worked out: ${error}`}
        </p>
      )}
      {stacks === null && error === null && <p className="text-xs text-muted">Rolling…</p>}
      {stacks !== null && stacks.length === 0 && (
        <p className="text-xs text-muted" data-testid={`${testId}-empty`}>
          Nothing this time.
        </p>
      )}
      {stacks !== null && stacks.length > 0 && (
        <ul
          aria-label="What this roll gave"
          data-testid={`${testId}-stacks`}
          className="flex flex-wrap gap-2"
        >
          {stacks.map((stack, index) => {
            const isAdded =
              added !== undefined &&
              stack.pool !== undefined &&
              fromAddedPool([stack.pool], added.ownPools);
            return (
              <li
                // Stacks have no identity of their own; a new roll draws a new list.
                key={index}
                className="flex flex-col items-center gap-0.5"
                data-added={isAdded ? 'true' : undefined}
                data-uncertain={stack.uncertain === true ? 'true' : undefined}
              >
                <ItemSlot
                  item={stack}
                  pictures={pictures}
                  lang={lang}
                  testId={`${testId}-stack-${index}`}
                />
                {stack.uncertain === true && (
                  <RowTag testId={`${testId}-stack-${index}-uncertain`}>Only the game knows</RowTag>
                )}
                {isAdded && <RowTag testId={`${testId}-stack-${index}-added`}>Added</RowTag>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted">{ROLL_DIFFERS}</p>
    </section>
  );
}
