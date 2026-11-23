// @vitest-environment happy-dom
import {
  type AiRunLimits,
  type AiUsage,
  DEFAULT_AI_SETTINGS,
  type PlanDecision,
  type ProposePlanInput,
} from '@msm/ai';
import type { Project } from '@msm/core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AiLimitsPopover,
  LIMITS_WORDS,
} from '../../src/renderer/src/components/ai/AiLimitsPopover';
import {
  AiPlanView,
  PLAN_VIEW_WORDS,
  planLines,
  planPictureWords,
  planWhat,
} from '../../src/renderer/src/components/ai/AiPlanView';
import {
  AiUsageLine,
  usageDetail,
  usageText,
} from '../../src/renderer/src/components/ai/AiUsageLine';
import { costDetails, forbiddenIn, wordsFor } from '../../src/renderer/src/components/ai/ai-words';
import {
  type AiConversation,
  type AiPlanState,
  addUserMessage,
  decidePlan,
  latestPlan,
  newConversation,
  reachCheckpoint,
  showPlan,
  startRun,
} from '../../src/renderer/src/store/ai-store';

afterEach(cleanup);

const PLAN: ProposePlanInput = {
  title: 'Ruby tools',
  items: [
    { itemId: 'sword', kind: 'msm:item', elementId: 'demo:ruby_sword', summary: 'A sword.' },
    { itemId: 'pick', kind: 'msm:item', elementId: 'demo:ruby_pickaxe', summary: 'A pickaxe.' },
    { itemId: 'ore', kind: 'msm:block', elementId: 'demo:ruby_ore', summary: 'An ore.' },
  ],
  assets: [
    { namespace: 'demo', path: 'item/ruby_sword', purpose: 'The sword' },
    { namespace: 'demo', path: 'block/ruby_ore', purpose: '' },
  ],
  notes: 'Red throughout.',
};

/** A conversation whose plan waits, with the sword and the pickaxe proposed. */
function planned(): AiConversation {
  const state = showPlan(
    startRun(addUserMessage(newConversation('c'), 'Make ruby tools'), 'r', 'chat', 0),
    PLAN,
    'r',
  );
  state.changeset.add({
    op: 'create',
    elementId: 'demo:ruby_sword',
    kind: 'msm:item',
    after: { display_name: 'Ruby Sword', components: { 'msm:tool': { type: 'sword' } } },
  });
  state.changeset.add({
    op: 'create',
    elementId: 'demo:ruby_pickaxe',
    kind: 'msm:item',
    after: { display_name: 'Ruby Pickaxe', components: { 'msm:tool': { type: 'pickaxe' } } },
  });
  return { ...state, changesetItems: state.changeset.items };
}

/** A project that holds only `elements`. */
function projectOf(elements: { id: string; kind: string; data: unknown }[]): Project {
  return { namespaces: [{ name: 'demo', elements }] } as unknown as Project;
}

function renderPlan(
  conversation: AiConversation,
  extra: { closed?: boolean; project?: Project | null; plan?: AiPlanState } = {},
) {
  const onDecide = vi.fn<(decision: PlanDecision) => void>();
  const onCheckpoint = vi.fn<(decision: 'continue' | 'stop') => void>();
  const plan = extra.plan ?? latestPlan(conversation);
  if (plan === null) throw new Error('The conversation has no plan.');
  render(
    <AiPlanView
      plan={plan}
      checkpoint={conversation.checkpoint}
      onDecide={onDecide}
      onCheckpoint={onCheckpoint}
      conversation={conversation}
      project={extra.project ?? null}
      {...(extra.closed === undefined ? {} : { closed: extra.closed })}
    />,
  );
  return { onDecide, onCheckpoint, user: userEvent.setup() };
}

/** Every text a user reads in `root`: its text and every label and title. */
function readable(root: HTMLElement): string[] {
  const texts = [root.textContent ?? ''];
  for (const element of root.querySelectorAll('*')) {
    for (const name of ['aria-label', 'title', 'placeholder']) {
      const value = element.getAttribute(name);
      if (value !== null) texts.push(value);
    }
  }
  return texts;
}

describe('the plan (ADR 0125 wording table)', () => {
  it('draws the waiting plan', () => {
    renderPlan(planned());
    const plan = screen.getByTestId('ai-plan');
    const words = wordsFor().plan;
    expect(plan.textContent).toContain(words.heading);
    expect(screen.getByTestId('ai-plan-title').textContent).toBe('Ruby tools');
    const sword = screen.getByTestId('ai-plan-item-sword-name').textContent;
    const pick = screen.getByTestId('ai-plan-item-pick-name').textContent;
    const ore = screen.getByTestId('ai-plan-item-ore-name').textContent;
    expect(sword).toBe('Ruby Sword, a weapon');
    expect(pick).toBe('Ruby Pickaxe, a tool');
    expect(ore).toBe('Ruby ore, a block');
    expect(screen.getByTestId('ai-plan-build-all').textContent).toBe('Make all of it');
    expect(screen.getByTestId('ai-plan-step').textContent).toBe('One at a time');
    expect(screen.getByTestId('ai-plan-revise').textContent).toBe('Change the plan');
    expect(screen.getByTestId('ai-plan-item-ore-remove').textContent).toBe('Leave this out');
    expect(plan.querySelectorAll('[data-primary="true"]')).toHaveLength(1);
    expect(screen.getByTestId('ai-plan-build-all').dataset.primary).toBe('true');
    expect(plan.textContent?.toLowerCase()).not.toContain('placeholder');
    expect(plan.textContent).not.toContain('Build all');
    // The comments box opens only with Change the plan.
    expect(screen.queryByTestId('ai-plan-comments')).toBeNull();
    // Every button has words.
    for (const button of plan.querySelectorAll('button')) {
      expect((button.textContent ?? '').trim() || button.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('shows no id or forbidden word', () => {
    renderPlan(planned());
    const found = readable(screen.getByTestId('ai-plan')).flatMap((text) => forbiddenIn(text));
    expect(found).toEqual([]);
  });

  it('names the pictures by purpose', () => {
    renderPlan(planned());
    expect(screen.getByTestId('ai-plan-pictures').textContent).toBe(
      'Pictures: The sword, Ruby ore',
    );
    expect(planPictureWords({ namespace: 'a', path: 'x/blue_gem', purpose: ' ' })).toBe('Blue gem');
  });

  it('answers Make all of it with the lines left in', async () => {
    const s = renderPlan(planned());
    await s.user.click(screen.getByTestId('ai-plan-item-ore-remove'));
    expect(screen.queryByTestId('ai-plan-item-ore')).toBeNull();
    await s.user.click(screen.getByTestId('ai-plan-build-all'));
    expect(s.onDecide).toHaveBeenCalledTimes(1);
    const decision = s.onDecide.mock.calls[0]?.[0];
    expect(decision?.decision).toBe('build_all');
    expect(decision?.items.map((item) => item.itemId)).toEqual(['sword', 'pick']);
    expect(decision?.comments).toBe('');
  });

  it('answers One at a time', async () => {
    const s = renderPlan(planned());
    await s.user.click(screen.getByTestId('ai-plan-step'));
    expect(s.onDecide.mock.calls[0]?.[0].decision).toBe('step');
    expect(s.onDecide.mock.calls[0]?.[0].items).toHaveLength(3);
  });

  it('opens "What should be different?" with Change the plan and sends the comments', async () => {
    const s = renderPlan(planned());
    await s.user.click(screen.getByTestId('ai-plan-revise'));
    expect(screen.getByTestId('ai-plan-change').textContent).toContain('What should be different?');
    const send = screen.getByTestId('ai-plan-revise-send') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    expect(s.onDecide).not.toHaveBeenCalled();
    await s.user.type(screen.getByTestId('ai-plan-comments'), 'Use blue');
    await s.user.click(send);
    expect(s.onDecide.mock.calls[0]?.[0]).toMatchObject({
      decision: 'revise',
      comments: 'Use blue',
    });
    // Still one primary button while the box is open.
    expect(screen.getByTestId('ai-plan').querySelectorAll('[data-primary="true"]')).toHaveLength(1);
  });

  it('disables Make all of it and One at a time when every line is left out', async () => {
    const s = renderPlan(planned());
    for (const id of ['sword', 'pick', 'ore']) {
      await s.user.click(screen.getByTestId(`ai-plan-item-${id}-remove`));
    }
    expect((screen.getByTestId('ai-plan-build-all') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('ai-plan-step') as HTMLButtonElement).disabled).toBe(true);
  });

  it('ticks a line only when the thing is proposed or in the project (F6)', () => {
    const decided = decidePlan(planned(), {
      decision: 'step',
      items: PLAN.items,
      comments: '',
    });
    // The model reports all three built; only the sword and pickaxe are proposed.
    const stepping = reachCheckpoint(
      decided,
      { completedItemIds: ['sword', 'pick', 'ore'], summary: 'The tools are made.' },
      'r',
    );
    renderPlan(stepping);
    expect(screen.getByTestId('ai-plan-item-sword').dataset.done).toBe('true');
    expect(screen.getByTestId('ai-plan-item-pick').dataset.done).toBe('true');
    expect(screen.getByTestId('ai-plan-item-ore').dataset.done).toBe('false');
    expect(screen.getByTestId('ai-plan-state').textContent).toBe(PLAN_VIEW_WORDS.decided.step);
    cleanup();
    // The project has the ore: now it ticks too, named by the project.
    const project = projectOf([
      { id: 'demo:ruby_ore', kind: 'msm:block', data: { display_name: 'Ruby Rock' } },
    ]);
    renderPlan(stepping, { project });
    expect(screen.getByTestId('ai-plan-item-ore').dataset.done).toBe('true');
    expect(screen.getByTestId('ai-plan-item-ore-name').textContent).toBe('Ruby Rock, a block');
  });

  it('never ticks on the model word alone', () => {
    const stepping = reachCheckpoint(
      decidePlan(showPlan(startRun(newConversation('c'), 'r', 'chat', 0), PLAN, 'r'), {
        decision: 'step',
        items: PLAN.items,
        comments: '',
      }),
      { completedItemIds: ['sword', 'pick', 'ore'], summary: 'Done.' },
      'r',
    );
    const plan = latestPlan(stepping);
    if (plan === null) throw new Error('No plan.');
    expect(plan.completed).toEqual(['sword', 'pick', 'ore']);
    expect(planLines(plan, stepping, null).map((line) => line.ticked)).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('asks Keep going or Stop at a step', async () => {
    const stepping = reachCheckpoint(
      decidePlan(planned(), { decision: 'step', items: PLAN.items, comments: '' }),
      { completedItemIds: ['sword'], summary: 'The sword is made.' },
      'r',
    );
    const s = renderPlan(stepping);
    expect(screen.queryByTestId('ai-plan-build-all')).toBeNull();
    const step = screen.getByTestId('ai-checkpoint');
    expect(step.textContent).toContain('The sword is made.');
    expect(screen.getByTestId('ai-checkpoint-continue').textContent).toBe('Keep going');
    expect(screen.getByTestId('ai-checkpoint-stop').textContent).toBe('Stop');
    expect(screen.getByTestId('ai-plan').querySelectorAll('[data-primary="true"]')).toHaveLength(1);
    await s.user.click(screen.getByTestId('ai-checkpoint-continue'));
    await s.user.click(screen.getByTestId('ai-checkpoint-stop'));
    expect(s.onCheckpoint.mock.calls.map((call) => call[0])).toEqual(['continue', 'stop']);
  });

  it('closes a decided plan to one line with the honest count', () => {
    const decided = reachCheckpoint(
      decidePlan(planned(), { decision: 'build_all', items: PLAN.items, comments: '' }),
      { completedItemIds: ['sword', 'ore'], summary: 'Made.' },
      'r',
    );
    renderPlan(decided, { closed: true });
    const line = screen.getByTestId('ai-plan');
    expect(line.dataset.closed).toBe('true');
    expect(line.textContent).toBe('Plan: Ruby tools. 1 of 3 made.');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('closes a plan that was never answered as not started', () => {
    const conversation = planned();
    const plan = latestPlan(conversation);
    if (plan === null) throw new Error('No plan.');
    renderPlan(conversation, {
      closed: true,
      plan: { ...plan, status: 'cancelled' },
    });
    expect(screen.getByTestId('ai-plan').textContent).toBe('Plan: Ruby tools. Not started.');
  });

  it('says a cancelled plan in words while it is still open', () => {
    const conversation = planned();
    const plan = latestPlan(conversation);
    if (plan === null) throw new Error('No plan.');
    renderPlan(conversation, { plan: { ...plan, status: 'cancelled' } });
    expect(screen.getByTestId('ai-plan-state').textContent).toBe(PLAN_VIEW_WORDS.cancelled);
  });

  it('words what each kind is', () => {
    expect(planWhat('msm:item', {})).toBe('item');
    expect(planWhat('msm:item', { components: { 'msm:tool': { type: 'axe' } } })).toBe('tool');
    expect(planWhat('msm:block', { type: 'portal' })).toBe('portal');
    expect(planWhat('msm:entity', {})).toBe('mob');
    expect(planWhat('msm:mod', {})).toBe('mod');
    expect(planWhat('minecraft:recipe', {})).toBe('recipe');
    expect(planWhat('minecraft:loot_table', {})).toBe('loot table');
    expect(planWhat('minecraft:lang', {})).toBe('names and text');
    expect(planWhat('example:unknown', {})).toBe(PLAN_VIEW_WORDS.something);
  });

  it('keeps the words of its own plain', () => {
    const own = [
      ...Object.values(PLAN_VIEW_WORDS.decided),
      PLAN_VIEW_WORDS.cancelled,
      PLAN_VIEW_WORDS.done,
      PLAN_VIEW_WORDS.notDone,
      PLAN_VIEW_WORDS.something,
    ];
    expect(own.flatMap((text) => forbiddenIn(text))).toEqual([]);
  });
});

const ZERO: AiUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  requests: 0,
};

const TINY: AiUsage = {
  inputTokens: 10,
  outputTokens: 5,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  requests: 1,
};

const NORMAL: AiUsage = {
  inputTokens: 12431,
  outputTokens: 3210,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  requests: 4,
};

function renderCost(usage: AiUsage) {
  return render(<AiUsageLine usage={usage} model="claude-opus-5-5" checkedOn="2026-11-22" />);
}

describe('the cost line (ADR 0125 D8)', () => {
  it('shows nothing before the first message', () => {
    const { container } = renderCost(ZERO);
    expect(container.textContent).toBe('');
    expect(screen.queryByTestId('ai-usage')).toBeNull();
  });

  it('says the cost as one sentence', () => {
    renderCost(TINY);
    expect(screen.getByTestId('ai-usage').textContent).toBe(
      'This chat has cost less than $0.01 so far.',
    );
    expect(screen.getByTestId('ai-usage').getAttribute('title')).toBeNull();
    cleanup();
    renderCost(NORMAL);
    const line = screen.getByTestId('ai-usage');
    expect(line.textContent).toBe('This chat has cost about $0.11 so far.');
    expect(readable(line).flatMap((text) => forbiddenIn(text))).toEqual([]);
  });

  it('gives the tokens, requests and model for the More options', () => {
    expect(costDetails(TINY, 'claude-opus-5-5')).toBe('10 in / 5 out, 1 request, Opus 5.5.');
    expect(usageDetail(NORMAL, '2026-11-22')).toContain('prices checked on 2026-11-22');
  });

  it('formats the usage in figures', () => {
    expect(usageText(NORMAL, 'claude-opus-5-5')).toBe(
      '12,431 in / 3,210 out, 4 requests, about $0.11, Opus 5.5',
    );
  });
});

describe('the run limits (ADR 0125 D10)', () => {
  const limits: AiRunLimits = DEFAULT_AI_SETTINGS.limits.chat;

  it('say that Settings holds the defaults and a stopped run carries on', async () => {
    const onChange = vi.fn<(limits: AiRunLimits) => void>();
    const onReset = vi.fn();
    render(
      <AiLimitsPopover limits={limits} overridden={true} onChange={onChange} onReset={onReset} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('ai-limits'));
    expect(screen.getByTestId('ai-limits-defaults').textContent).toBe(LIMITS_WORDS.forNextRun);
    expect(screen.getByTestId('ai-limits-defaults').textContent).toContain(
      'Default limits in Settings',
    );
    expect(screen.getByTestId('ai-limits-continue').textContent).toContain('Keep going');
    const popover = screen.getByTestId('ai-limits-popover');
    expect(popover.textContent).not.toContain('per mode');
    expect(popover.textContent).not.toContain('Raise the limit');
    const turns = screen.getByTestId('ai-limit-tool-turns');
    await user.clear(turns);
    await user.type(turns, '5');
    expect(onChange).toHaveBeenLastCalledWith({ ...limits, maxToolTurns: 5 });
    await user.click(screen.getByTestId('ai-limit-task-budget'));
    expect(onChange).toHaveBeenLastCalledWith({ ...limits, taskBudget: !limits.taskBudget });
    await user.click(screen.getByTestId('ai-limits-reset'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
