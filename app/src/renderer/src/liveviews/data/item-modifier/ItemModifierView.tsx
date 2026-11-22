/**
 * **Try it on** for an item modifier (B610; ADR 0120 D6): an item you pick, **Before** and
 * **After**, as slots with their tooltips drawn beside them. The modifier runs as a `modify` job
 * in the live views worker (`@msm/sim`'s `applyItemModifier`, B605: names, lore and set
 * components kept as JSON, `set_damage` as the share of durability left, a book's enchantments
 * turning it into an enchanted book), in the situation you choose, 150 ms after an edit. Each
 * function it used is listed with how close it is; what only the game can do is named.
 */

import type { Json } from '@msm/plugin-api';
import { useId, useMemo } from 'react';
import type { LiveViewClient, LiveViewJob } from '../../client';
import { FIDELITY_LABELS, type Fidelity, weakest } from '../../frame/fidelity';
import { ItemSlot } from '../../frame/ItemSlot';
import { resourceFoldersOf, useVanillaLang } from '../../frame/item-picture';
import { LiveViewFrame, needsSetUpBanner } from '../../frame/LiveViewFrame';
import { factsOf, useLiveViewData, useLiveViewJob } from '../../frame/live-data';
import { SeedBox } from '../../frame/SeedBox';
import { SituationPicker, useSituationChoice } from '../../frame/SituationPicker';
import { Tooltip } from '../../frame/Tooltip';
import type { LiveViewProps } from '../../registry';
import { useCurses, useEnchantmentInfo } from '../enchantment/hooks';
import { fullId, type ShownStack, stackLines } from '../enchantment/words';
import { namesVanillaFile } from '../predicate/predicate-model';

/** The folders a modifier reads. */
export const MODIFIER_FOLDERS = [
  'item_modifier',
  'predicate',
  'enchantment',
  'tags/enchantment',
  'tags/item',
  'tags/block',
  'tags/entity_type',
] as const;

/** The item tried when none is picked. */
export const DEFAULT_SAMPLE_ITEM = 'minecraft:diamond_sword';

/** Items the picker suggests (any id can be typed). */
export const SAMPLE_ITEMS: readonly string[] = [
  'minecraft:diamond_sword',
  'minecraft:diamond_pickaxe',
  'minecraft:iron_axe',
  'minecraft:book',
  'minecraft:stone',
  'minecraft:apple',
  'minecraft:paper',
];

/** Props: the registry's, and a client for tests. */
export interface ItemModifierViewProps extends LiveViewProps {
  readonly client?: LiveViewClient;
}

/** The view. */
export default function ItemModifierView(props: ItemModifierViewProps) {
  const { project, element, vanilla, vanillaAssets, preferences, onPreferences, onSetup, client } =
    props;
  const data = element.data as Json;
  const folders = useMemo(() => resourceFoldersOf(project), [project]);
  const pictures = useMemo(() => ({ vanillaAssets, folders }), [vanillaAssets, folders]);
  const lang = useVanillaLang(vanillaAssets, folders);
  const facts = useMemo(() => factsOf(project), [project]);
  const files = useLiveViewData(project, vanilla, MODIFIER_FOLDERS, client);
  const hash = files.status === 'ready' ? files.data : null;
  const choice = useSituationChoice(preferences, onPreferences);
  const info = useEnchantmentInfo(project, vanilla, lang);
  const curses = useCurses(hash, client);
  const sampleItem = fullId(
    preferences.sampleItem.trim() === '' ? DEFAULT_SAMPLE_ITEM : preferences.sampleItem.trim(),
  );
  const before: ShownStack = useMemo(() => ({ id: sampleItem, count: 1 }), [sampleItem]);
  const job = useMemo<Extract<LiveViewJob, { kind: 'modify' }>>(
    () => ({
      kind: 'modify',
      modifier: data,
      item: before,
      situation: choice.situation,
      seed: preferences.seed,
    }),
    [data, before, choice.situation, preferences.seed],
  );
  const state = useLiveViewJob(hash, job, client);
  const result = state.result;
  const after = (result?.item ?? null) as ShownStack | null;
  const parts = result?.parts ?? [];
  const vanillaState =
    files.status === 'ready'
      ? files.vanilla === 'none'
        ? null
        : files.vanilla
      : files.status === 'loading'
        ? 'loading'
        : null;
  const fidelity: Fidelity = weakest(['about_right', ...parts.map((part) => part.fidelity)]);
  const lineOptions = { lang, enchantments: info, curses, facts };
  const itemId = useId();
  const itemList = useId();
  const projectItems = useMemo(
    () =>
      project.namespaces.flatMap((namespace) =>
        namespace.elements.filter((e) => e.kind === 'msm:item').map((e) => fullId(e.id)),
      ),
    [project],
  );

  return (
    <LiveViewFrame
      title="Try it on"
      fidelity={fidelity}
      needsSetUp={needsSetUpBanner(vanillaState, namesVanillaFile(data, result?.unsupported))}
      onSetup={onSetup}
      unsupported={result?.unsupported ?? []}
      notes={[
        'The tooltip is drawn by MSM from the item’s data; the game draws it in its own font and may add lines.',
        'Each try is one sample: a function that goes by chance can come out differently next time.',
      ]}
      controls={
        <div className="flex flex-col gap-2">
          <label htmlFor={itemId} className="flex flex-wrap items-center gap-2 text-sm">
            Try it on this item
            <input
              id={itemId}
              data-testid="modifier-sample-item"
              list={itemList}
              placeholder={DEFAULT_SAMPLE_ITEM}
              defaultValue={preferences.sampleItem}
              className="min-w-0 rounded border border-border bg-bg px-1"
              onBlur={(event) => onPreferences({ sampleItem: event.target.value.trim() })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  onPreferences({ sampleItem: event.currentTarget.value.trim() });
                }
              }}
            />
            <datalist id={itemList}>
              {[...SAMPLE_ITEMS, ...projectItems].map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </label>
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
      <div className="flex flex-wrap items-start gap-6">
        <figure data-testid="modifier-before" className="flex flex-col gap-1">
          <figcaption className="text-sm font-medium">Before</figcaption>
          <ItemSlot
            item={before}
            pictures={pictures}
            lang={lang}
            lines={stackLines(before, lineOptions)}
            testId="modifier-before-slot"
          />
          <Tooltip inline lines={stackLines(before, lineOptions)} />
        </figure>
        <figure data-testid="modifier-after" className="flex flex-col gap-1">
          <figcaption className="text-sm font-medium">After</figcaption>
          {after === null ? (
            <p className="text-sm text-muted">Trying it…</p>
          ) : after.count <= 0 ? (
            <>
              <ItemSlot item={null} testId="modifier-after-slot" />
              <p data-testid="modifier-gone" className="text-sm">
                The item is gone.
              </p>
            </>
          ) : (
            <>
              <ItemSlot
                item={after}
                pictures={pictures}
                lang={lang}
                lines={stackLines(after, lineOptions)}
                testId="modifier-after-slot"
              />
              <Tooltip inline lines={stackLines(after, lineOptions)} />
            </>
          )}
        </figure>
      </div>
      {parts.length > 0 && (
        <ul
          aria-label="What it used"
          data-testid="modifier-parts"
          className="flex flex-col gap-1 text-xs"
        >
          {parts.map((part) => (
            <li
              key={`${part.kind}|${part.type}`}
              data-type={part.type}
              data-fidelity={part.fidelity}
            >
              <code>{part.type}</code>
              <span className="text-muted">{`: ${FIDELITY_LABELS[part.fidelity]}`}</span>
            </li>
          ))}
        </ul>
      )}
    </LiveViewFrame>
  );
}
