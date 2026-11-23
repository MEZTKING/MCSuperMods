import type { PlanDecision } from '@msm/ai';
import type { Project } from '@msm/core';
import type { ContentBundle } from '@msm/plugin-api';
import { Check, Circle } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { displayName } from '../../preview/bundle-source';
import { findProjectElement, wordsOfId } from '../../session/plain-problems';
import {
  type AiCheckpointState,
  type AiConversation,
  type AiPlanState,
  useAiStore,
} from '../../store/ai-store';
import { usePreferences } from '../../store/preferences';
import { useUiStore } from '../../store/ui-store';
import { GROUP_LABELS } from '../ElementSidebar';
import { fieldClass } from '../NewElementDialog';
import { Button } from '../ui/Button';
import { tickedLines } from './ai-status';
import {
  closedPlanWords,
  planLineWords,
  proposedName,
  THING_KIND_WORDS,
  type UiMode,
  wordsFor,
} from './ai-words';

/**
 * The plan's own words that `ai-words.ts` does not hold yet (ADR 0125 D13): the line under a
 * plan that has been answered while its run goes on, the ticks' labels and the fallback for what
 * a line makes. Plain in every mode; `ai-plan.test.tsx` sweeps them for Very easy's forbidden
 * words.
 */
export const PLAN_VIEW_WORDS = Object.freeze({
  decided: Object.freeze({
    build_all: 'Making all of it.',
    step: 'Making it one at a time.',
    revise: 'Changing the plan.',
  } satisfies Record<PlanDecision['decision'], string>),
  cancelled: 'Stopped before you chose.',
  done: 'Made',
  notDone: 'Not made yet',
  /** What a line makes when its kind has no word of its own. */
  something: 'part of your mod',
  mod: 'mod',
  tool: 'tool',
  weapon: 'weapon',
  portal: 'portal',
});

/**
 * The primary button's extra classes (one per view; `data-primary` marks it for tests).
 * Important (Tailwind's `!`): `Button`'s own `bg-panel` comes later in the built CSS and would win
 * (B690).
 */
const PRIMARY_CLASS = 'border-accent! bg-accent! text-white!';

/** One line of the plan as the user reads it. */
export interface AiPlanLine {
  itemId: string;
  elementId: string;
  kind: string;
  /** The display name ("Ruby Pickaxe"). */
  name: string;
  /** What it is, in words ("tool"). */
  what: string;
  /** The line in the mode's words ("Ruby Pickaxe, a tool"; Advanced adds kind and id). */
  text: string;
  /** The model's sentence about the line. */
  summary: string;
  /** Made and real (`tickedLines`, never the model's word alone). */
  ticked: boolean;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** "Items" to "item", "Status effects" to "status effect"; words without a plural stay. */
function singular(label: string): string {
  const lower = label.toLowerCase();
  return /[^s]s$/.test(lower) ? lower.slice(0, -1) : lower;
}

/**
 * What a plan line makes, in words: My things' word for the kind, the tool or weapon an item's
 * `msm:tool` makes it, a portal block, else the sidebar's heading for the kind in the singular.
 */
export function planWhat(kind: string, data: unknown): string {
  if (kind === 'msm:mod') return PLAN_VIEW_WORDS.mod;
  if (kind === 'msm:block' && asObject(data)?.type === 'portal') return PLAN_VIEW_WORDS.portal;
  if (kind === 'msm:item') {
    const tool = asObject(asObject(asObject(data)?.components)?.['msm:tool']);
    if (tool !== undefined) {
      return tool.type === 'sword' ? PLAN_VIEW_WORDS.weapon : PLAN_VIEW_WORDS.tool;
    }
  }
  const word = THING_KIND_WORDS.find((entry) => entry.kind === kind)?.word;
  if (word !== undefined) return word.toLowerCase();
  const heading = GROUP_LABELS[kind];
  return heading === undefined ? PLAN_VIEW_WORDS.something : singular(heading);
}

/**
 * The plan's lines in `mode`'s words (ADR 0125 wording table): each named by the proposed
 * element (its language entry or own name), else the project's element, else words of its id,
 * with what it is and whether it is ticked.
 */
export function planLines(
  plan: AiPlanState,
  conversation: AiConversation | undefined,
  project: Project | null,
  mode: UiMode,
  items: AiPlanState['plan']['items'] = plan.plan.items,
): AiPlanLine[] {
  const changes = conversation?.changesetItems ?? [];
  const bundle: ContentBundle = {
    elements: [
      ...changes.flatMap((item) =>
        item.elementId === undefined || item.kind === undefined || item.after === undefined
          ? []
          : [{ id: item.elementId, kind: item.kind, data: item.after }],
      ),
      ...(project?.namespaces.flatMap((namespace) =>
        namespace.elements.map((element) => ({
          id: element.id,
          kind: element.kind,
          data: element.data,
        })),
      ) ?? []),
    ],
    assets: [],
  };
  const ticked =
    conversation === undefined ? new Set<string>() : tickedLines(plan, conversation, project);
  return items.map((item) => {
    const change = changes.find((entry) => entry.elementId === item.elementId);
    const element = findProjectElement(project, item.elementId);
    const data = change?.after ?? change?.before ?? element?.data;
    const type =
      item.kind === 'msm:block' ? 'block' : item.kind === 'msm:item' ? 'item' : undefined;
    const name =
      (type === undefined ? undefined : displayName(bundle, item.elementId, type)) ??
      (data === undefined ? wordsOfId(item.elementId) : proposedName({ id: item.elementId, data }));
    const what = planWhat(item.kind, data);
    return {
      itemId: item.itemId,
      elementId: item.elementId,
      kind: item.kind,
      name,
      what,
      text: planLineWords({ name, what, kind: item.kind, elementId: item.elementId }, mode),
      summary: item.summary,
      ticked: ticked.has(item.itemId),
    };
  });
}

/** A picture the plan needs, in words: its purpose, else words of its path (Advanced: the id). */
export function planPictureWords(
  asset: { namespace: string; path: string; purpose: string },
  mode: UiMode,
): string {
  if (mode === 'advanced') return `${asset.namespace}:${asset.path}`;
  if (asset.purpose.trim() !== '') return asset.purpose.trim();
  const last = asset.path.split('/').pop() ?? asset.path;
  return wordsOfId(`${asset.namespace}:${last}`);
}

/**
 * The plan `propose_plan` showed (ADR 0041 D6, ADR 0125 D1, D2): "Here is my plan", its title,
 * one line per thing ("Ruby Pickaxe, a tool"; Advanced adds kind and id) with **Leave this out**
 * while it waits, the pictures and notes, and **Make all of it** (the one primary button),
 * **One at a time** and **Change the plan** (which opens "What should be different?"). Lines
 * tick only when the thing is really proposed or in the project (`tickedLines`). A step that
 * waits shows **Keep going** and **Stop**. Once its run has ended a decided plan closes to one
 * line (`closed`).
 *
 * `mode`, `conversation` and `project` default to the stores (the preference, the open
 * project's conversation and project).
 */
export function AiPlanView(props: {
  plan: AiPlanState;
  checkpoint: AiCheckpointState | null;
  onDecide(decision: PlanDecision): void;
  onCheckpoint(decision: 'continue' | 'stop'): void;
  mode?: UiMode;
  conversation?: AiConversation;
  project?: Project | null;
  /** The transcript entry's `closed`: a decided plan whose run has ended. */
  closed?: boolean;
}) {
  const { plan } = props;
  const preferred = usePreferences((state) => state.mode);
  const snapshot = useUiStore((state) => state.snapshot);
  const stored = useAiStore((state) =>
    snapshot === null || snapshot.root === null ? undefined : state.conversations[snapshot.root],
  );
  const mode = props.mode ?? preferred;
  const conversation = props.conversation ?? stored;
  const project = props.project === undefined ? (snapshot?.project ?? null) : props.project;
  const words = wordsFor(mode).plan;
  const pending = plan.status === 'pending';
  const [items, setItems] = useState(plan.plan.items);
  const [changing, setChanging] = useState(false);
  const [comments, setComments] = useState('');
  const commentsId = useId();
  // A new plan (or the decided one) replaces the local edits.
  useEffect(() => setItems(plan.plan.items), [plan.plan.items]);
  const shownItems = pending ? items : (plan.decision?.items ?? plan.plan.items);
  const lines = useMemo(
    () => planLines(plan, conversation, project, mode, shownItems),
    [plan, conversation, project, mode, shownItems],
  );
  const decide = (decision: PlanDecision['decision']) =>
    props.onDecide({ decision, items, comments: comments.trim() });

  if (props.closed === true) {
    const decided = plan.status === 'decided' && plan.decision?.decision !== 'revise';
    return (
      <p
        className="text-xs text-muted"
        data-testid="ai-plan"
        data-status={plan.status}
        data-closed="true"
      >
        {closedPlanWords(
          plan.plan.title,
          lines.filter((line) => line.ticked).length,
          lines.length,
          decided,
        )}
      </p>
    );
  }

  const assets = plan.plan.assets ?? [];
  return (
    <section
      className="flex flex-col gap-1.5 rounded border border-border p-2 text-sm"
      aria-label={words.heading}
      data-testid="ai-plan"
      data-status={plan.status}
      data-mode={mode}
    >
      <h3 className="font-semibold">{words.heading}</h3>
      <p className="font-medium" data-testid="ai-plan-title">
        {plan.plan.title}
      </p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {lines.map((line) => (
          <li
            key={line.itemId}
            className="flex items-start gap-1.5"
            data-testid={`ai-plan-item-${line.itemId}`}
            data-done={line.ticked ? 'true' : 'false'}
          >
            {line.ticked ? (
              <Check
                size={14}
                aria-label={PLAN_VIEW_WORDS.done}
                className="mt-0.5 shrink-0 text-accent"
              />
            ) : (
              <Circle
                size={14}
                aria-label={PLAN_VIEW_WORDS.notDone}
                className="mt-0.5 shrink-0 text-muted"
              />
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span
                className="[overflow-wrap:anywhere]"
                data-testid={`ai-plan-item-${line.itemId}-name`}
              >
                {line.text}
              </span>
              <span className="text-xs text-muted">{line.summary}</span>
            </span>
            {pending && (
              <button
                type="button"
                className="shrink-0 cursor-pointer text-xs text-muted underline hover:text-text"
                data-testid={`ai-plan-item-${line.itemId}-remove`}
                aria-label={`${words.leaveOut}: ${line.name}`}
                onClick={() =>
                  setItems((current) => current.filter((entry) => entry.itemId !== line.itemId))
                }
              >
                {words.leaveOut}
              </button>
            )}
          </li>
        ))}
      </ul>
      {assets.length > 0 && (
        <p className="text-xs text-muted" data-testid="ai-plan-pictures">
          {words.pictures}: {assets.map((asset) => planPictureWords(asset, mode)).join(', ')}
        </p>
      )}
      {plan.plan.notes !== undefined && plan.plan.notes !== '' && (
        <p className="text-xs whitespace-pre-wrap text-muted">{plan.plan.notes}</p>
      )}
      {pending ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            <Button
              data-testid="ai-plan-build-all"
              data-primary="true"
              className={PRIMARY_CLASS}
              disabled={items.length === 0}
              onClick={() => decide('build_all')}
            >
              {words.makeAll}
            </Button>
            <Button
              data-testid="ai-plan-step"
              disabled={items.length === 0}
              onClick={() => decide('step')}
            >
              {words.oneAtATime}
            </Button>
            <Button
              data-testid="ai-plan-revise"
              aria-expanded={changing}
              onClick={() => setChanging((open) => !open)}
            >
              {words.change}
            </Button>
          </div>
          {changing && (
            <div className="flex flex-col gap-1" data-testid="ai-plan-change">
              <label htmlFor={commentsId} className="text-xs">
                {words.changePrompt}
              </label>
              <textarea
                id={commentsId}
                className={`${fieldClass} min-h-12`}
                data-testid="ai-plan-comments"
                value={comments}
                // biome-ignore lint/a11y/noAutofocus: the box opens on the user's click to type in.
                autoFocus
                onChange={(event) => setComments(event.target.value)}
              />
              <div className="flex gap-1.5">
                <Button
                  data-testid="ai-plan-revise-send"
                  disabled={comments.trim() === ''}
                  onClick={() => decide('revise')}
                >
                  {wordsFor(mode).send}
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-xs text-muted" data-testid="ai-plan-state">
          {plan.decision === undefined
            ? PLAN_VIEW_WORDS.cancelled
            : PLAN_VIEW_WORDS.decided[plan.decision.decision]}
        </p>
      )}
      {props.checkpoint !== null && (
        <div className="flex flex-col gap-1 rounded bg-bg p-1.5" data-testid="ai-checkpoint">
          <p className="text-xs">{props.checkpoint.input.summary}</p>
          <div className="flex gap-1.5">
            <Button
              data-testid="ai-checkpoint-continue"
              data-primary="true"
              className={PRIMARY_CLASS}
              onClick={() => props.onCheckpoint('continue')}
            >
              {words.keepGoing}
            </Button>
            <Button data-testid="ai-checkpoint-stop" onClick={() => props.onCheckpoint('stop')}>
              {words.stop}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
