/**
 * Creative Tab Studio (ADR 0096 D2, ADR 0101 D1) for `msm:creative_tab` element data, loaded
 * lazily:
 *
 * - "Preview": the tab as a page of the creative inventory, its icon on the tab and its things in
 *   their order (the look of ADR 0121 D7, B625), over the title, icon and member summary.
 * - "Tab": the title (`/display_name`), the icon (an item, the project's own offered first) and
 *   the order (`/order`: as the mod adds them, by name, or in your own order).
 * - "Your own order" (ADR 0111 D7, B538), with `order` `by_hand`: the hand order (`/items`), any
 *   items of the project or of Minecraft, moved up and down or taken out; picking "In your own
 *   order" starts it from the tab's members, one undo step. Things in the tab but not listed
 *   follow after.
 * - "What is in it": the project's items, block items and spawn eggs whose `creative_tab` names
 *   this tab, in the order the game shows them. "Add" and "Take out" set or clear the thing's
 *   `creative_tab` through the host as one undo step; "Add everything without a tab" adds every
 *   such thing in one step too.
 *
 * Split in one mode (ADR 0130 D3, B705): every section is common
 * (`CREATIVE_TAB_COMMON_SECTIONS`); the order choice sits in the Tab section's More options.
 *
 * Everything else is in "Every setting".
 *
 * @packageDocumentation
 */

import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { lazy, Suspense, useId, useState } from 'react';
import { thingName, thingWords } from '../../components/thing-picker/thing-sources';
import { Button, iconButtonClass } from '../../components/ui/Button';
import { inputClass } from '../../forms';
import { typingKey } from '../../forms/context';
import { useHostProjectReader } from '../../liveviews/looks/particle/host-reader';
import { IdField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { Section } from '../worldgen/parts';
import { asObject, pathSetter, pointerOf, withProjectIds } from './blocks-items-model';
import {
  handOrderOf,
  movedItem,
  TAB_ORDER_LABELS,
  TAB_ORDERS,
  type TabCandidate,
  type TabOrder,
  tabCandidates,
  tabMembers,
  tabMembershipItems,
  tabMembershipLabel,
  tabNonMembers,
  tabOrderOf,
  withHandOrder,
  withTabOrder,
} from './creative-tab-model';
import { useBlocksItemsStudioHost } from './host';
import { ProblemsAt, TextField } from './parts';

/** The tab as a page (B625), a chunk of its own. */
const CreativeTabPage = lazy(() =>
  import('../../liveviews/looks/tab/CreativeTabView').then((module) => ({
    default: module.CreativeTabPage,
  })),
);

/** Words for the kind of thing a member is. */
const KIND_WORDS: Readonly<Record<string, string>> = {
  'msm:item': 'Item',
  'msm:block': 'Block',
  'msm:entity': 'Spawn egg',
};

/** The Creative Tab Studio. */
export default function CreativeTabStudio(props: StudioProps) {
  const { project, element, problems, suggest, onChange } = props;
  const host = useBlocksItemsStudioHost();
  const readProject = useHostProjectReader(host);
  const [picked, setPicked] = useState('');
  const [error, setError] = useState<string | null>(null);
  const orderId = useId();
  const addId = useId();
  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  const at = (path: readonly (string | number)[]) => (
    <ProblemsAt problems={problems} pointer={pointerOf(path)} />
  );

  const order = tabOrderOf(element.data);
  const handOrder = handOrderOf(element.data);
  const members = tabMembers(project, element.id, order, handOrder);
  const others = tabNonMembers(project, element.id);
  const loose = others.filter((candidate) => candidate.tab === undefined);
  const ownItems = tabCandidates(project).map((candidate) => candidate.itemId);
  const apply = host?.applyChanges;
  const title =
    typeof data.display_name === 'string' && data.display_name.trim() !== ''
      ? data.display_name
      : thingWords(element.id);
  const icon = typeof data.icon === 'string' ? data.icon : '';

  const move = (candidates: readonly TabCandidate[], tabId: string | undefined): void => {
    if (apply === undefined) return;
    const items = tabMembershipItems(
      project,
      candidates.map((candidate) => candidate.elementId),
      tabId,
    );
    if (items.length === 0) return;
    setError(null);
    apply(items, tabMembershipLabel(items.length, tabId !== undefined), []).then(
      () => setPicked(''),
      (cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)),
    );
  };

  const preview = (
    <Section title="Preview" testId="creative-tab-preview">
      <Suspense fallback={<p className="text-muted text-xs">Loading the page…</p>}>
        <CreativeTabPage
          project={project}
          element={element}
          vanillaAssets={host?.modelPreview?.vanilla ?? null}
          readProject={readProject}
        />
      </Suspense>
      <div className="flex flex-col gap-1 rounded border border-border bg-bg p-2">
        <p className="font-medium text-sm" data-testid="creative-tab-preview-title">
          {title}
        </p>
        <p className="text-muted text-xs" data-testid="creative-tab-preview-icon">
          Icon: {icon === '' ? 'none yet' : thingName(project, icon, 'item')}
        </p>
        <p className="text-xs" data-testid="creative-tab-preview-count">
          {members.length === 0
            ? 'Empty: add things below.'
            : `${members.length} ${members.length === 1 ? 'thing' : 'things'}: ${members
                .map((member) => member.name)
                .join(', ')}`}
        </p>
      </div>
    </Section>
  );

  const general = (
    <Section
      title="Tab"
      testId="creative-tab-general"
      more={
        <>
          <div className="flex min-w-0 flex-col gap-0.5 text-xs">
            <label htmlFor={orderId} className="text-muted">
              Order of the things in it
            </label>
            <select
              id={orderId}
              className={inputClass}
              data-testid="creative-tab-order"
              value={order}
              onChange={(event) =>
                onChange(
                  '',
                  withTabOrder(project, element.id, element.data, event.target.value as TabOrder),
                )
              }
            >
              {TAB_ORDERS.map((value) => (
                <option key={value} value={value}>
                  {TAB_ORDER_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <p className="text-muted text-xs">
            The order the mod adds them follows the order you made your things in; your own order
            lets you list them one by one.
          </p>
        </>
      }
    >
      <TextField
        label="Title"
        value={data.display_name}
        testId="creative-tab-title"
        placeholder="My mod"
        onCommit={(value) => set(['display_name'], value, typingKey('/display_name'))}
      />
      {at(['display_name'])}
      <IdField
        label="Icon (an item)"
        value={icon}
        registry="item"
        suggest={withProjectIds(suggest, 'item', ownItems)}
        testId="creative-tab-icon"
        onCommit={(value) => set(['icon'], value)}
      />
      {at(['icon'])}
      {at(['order'])}
      {at(['items'])}
    </Section>
  );

  const setHandOrder = (next: readonly string[]) => onChange('', withHandOrder(element.data, next));
  const unlisted = members.filter((member) => !handOrder.includes(member.itemId));
  const handSection = order === 'by_hand' && (
    <Section title="Your own order" testId="creative-tab-hand-order">
      <p className="text-muted text-xs">
        The tab shows these first, in this order. Anything you name here joins the tab, even
        Minecraft's own items.
      </p>
      {handOrder.length === 0 ? (
        <p className="text-muted text-xs" data-testid="creative-tab-hand-empty">
          Nothing listed yet. Add the things in the order you want.
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {handOrder.map((id, index) => {
            const label = thingName(project, id, 'item');
            return (
              <li
                key={`${id}:${index}`}
                className="flex items-center gap-2 text-sm"
                data-testid={`creative-tab-hand-${index}`}
              >
                <span className="min-w-0 flex-1 truncate">
                  {index + 1}. {label}
                </span>
                <button
                  type="button"
                  aria-label={`Move ${label} up`}
                  className={iconButtonClass}
                  disabled={index === 0}
                  data-testid={`creative-tab-hand-${index}-up`}
                  onClick={() => setHandOrder(movedItem(handOrder, index, index - 1))}
                >
                  <ArrowUp size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${label} down`}
                  className={iconButtonClass}
                  disabled={index === handOrder.length - 1}
                  data-testid={`creative-tab-hand-${index}-down`}
                  onClick={() => setHandOrder(movedItem(handOrder, index, index + 1))}
                >
                  <ArrowDown size={12} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Take ${label} out of the order`}
                  className={iconButtonClass}
                  data-testid={`creative-tab-hand-${index}-remove`}
                  onClick={() => setHandOrder(handOrder.filter((_, at) => at !== index))}
                >
                  <X size={12} aria-hidden />
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <IdField
        label="Add an item to the order"
        value=""
        registry="item"
        suggest={withProjectIds(suggest, 'item', ownItems)}
        testId="creative-tab-hand-add"
        onCommit={(value) => {
          if (value !== '') setHandOrder([...handOrder, value]);
        }}
      />
      {unlisted.length > 0 && (
        <p className="text-muted text-xs" data-testid="creative-tab-hand-after">
          Then, in the order the mod adds them: {unlisted.map((member) => member.name).join(', ')}.
        </p>
      )}
      {handOrder.map((_, index) => (
        <ProblemsAt key={index} problems={problems} pointer={pointerOf(['items', index])} />
      ))}
    </Section>
  );

  const pickedCandidate = others.find((candidate) => candidate.elementId === picked);
  const membersSection = (
    <Section title="What is in it" testId="creative-tab-members">
      {members.length === 0 ? (
        <p className="text-muted text-xs" data-testid="creative-tab-empty">
          Nothing yet. Add your items, blocks and spawn eggs below.
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {members.map((member) => (
            <li
              key={member.elementId}
              className="flex items-center gap-2 text-sm"
              data-testid={`creative-tab-member-${member.elementId}`}
            >
              <span className="min-w-0 flex-1 truncate">{member.name}</span>
              <span className="text-muted text-xs">{KIND_WORDS[member.kind] ?? ''}</span>
              <button
                type="button"
                aria-label={`Take ${member.name} out of the tab`}
                data-testid={`creative-tab-remove-${member.elementId}`}
                className={iconButtonClass}
                disabled={apply === undefined}
                onClick={() => move([member], undefined)}
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      )}
      {apply === undefined ? (
        <p className="text-muted text-xs" data-testid="creative-tab-read-only">
          Open each item to choose its tab.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-48 flex-col gap-0.5 text-xs">
              <label htmlFor={addId} className="text-muted">
                Add
              </label>
              <select
                id={addId}
                className={inputClass}
                data-testid="creative-tab-add-pick"
                value={picked}
                onChange={(event) => setPicked(event.target.value)}
              >
                <option value="">(choose a thing)</option>
                {others.map((candidate) => (
                  <option key={candidate.elementId} value={candidate.elementId}>
                    {candidate.name}
                    {candidate.tab === undefined
                      ? ''
                      : ` (now in ${thingName(project, candidate.tab)})`}
                  </option>
                ))}
              </select>
            </div>
            <Button
              className="text-xs"
              data-testid="creative-tab-add"
              disabled={pickedCandidate === undefined}
              onClick={() => {
                if (pickedCandidate !== undefined) move([pickedCandidate], element.id);
              }}
            >
              <Plus size={12} aria-hidden />
              Add to the tab
            </Button>
          </div>
          <Button
            className="self-start text-xs"
            data-testid="creative-tab-add-loose"
            disabled={loose.length === 0}
            onClick={() => move(loose, element.id)}
          >
            <Plus size={12} aria-hidden />
            Add everything without a tab ({loose.length})
          </Button>
          <p className="text-muted text-xs">Each change here is one step you can undo.</p>
        </>
      )}
      {error !== null && (
        <p role="alert" className="text-error text-xs" data-testid="creative-tab-error">
          {error}
        </p>
      )}
    </Section>
  );

  return (
    <section
      aria-label="Creative Tab Studio"
      data-testid="creative-tab-studio"
      className="flex flex-col gap-4"
    >
      <ProblemsAt problems={problems} pointer="" />
      {preview}
      {general}
      {handSection}
      {membersSection}
    </section>
  );
}
