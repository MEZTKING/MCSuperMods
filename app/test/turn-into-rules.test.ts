/**
 * B375 (ADR 0082 D7 (b), (c)): which book new rules on a thing go into, the first trigger of a
 * new rule, and "Turn into rules": a hand-made event whose actions all map to steps becomes
 * rules (the event removed, its trigger and options left to the rules) only when the rules
 * compile back to the same actions; through the session it is one undo step, and Undo leaves
 * the saved project byte-identical.
 */
import {
  createMemoryFileSystem,
  type Element,
  type Json,
  type MemoryFileSystem,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import { ruleEventId } from '@msm/plugin-rules';
import { describe, expect, it } from 'vitest';
import {
  bookForSubject,
  firstTriggerFor,
  planTurnIntoRules,
  sameActions,
  stepOfAction,
  triggersFor,
} from '../src/renderer/src/studios/rules/turn-into-rules';
import { newSession } from './session-fixture';

const NOW = '2026-01-01T00:00:00.000Z';

function element(id: string, kind: string, data: Json): Element {
  return { formatVersion: 1, id: id as ResourceLocation, kind, data, meta: { createdAt: NOW } };
}

function project(...elements: Element[]): Project {
  return {
    formatVersion: 1,
    name: 'Demo',
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [{ name: 'demo', elements, assets: [] }],
  } as unknown as Project;
}

const USE_ACTIONS: Json[] = [
  { count: 2, item: 'demo:ruby', type: 'give_item' },
  { sound: 'minecraft:block.note_block.chime', type: 'play_sound', volume: 0.5 },
  { amount: 4, type: 'heal' },
  { offset: [0, 1, 0], state: 'minecraft:stone', type: 'set_block_state' },
];

const block = (extra: Record<string, Json> = {}): Element =>
  element('demo:ruby_block', 'msm:block', {
    components: { 'msm:on_interact': { event: 'demo:ruby_block_use' } },
    display_name: 'Ruby Block',
    events: { 'demo:ruby_block_use': { actions: USE_ACTIONS } },
    format: 1,
    model: 'minecraft:block/stone',
    ...extra,
  });

describe('bookForSubject and firstTriggerFor', () => {
  it('uses the book holding the thing’s rules, else the default book, created on demand', () => {
    expect(bookForSubject(project(block()), 'demo:ruby_block')).toEqual({
      id: 'demo:rules',
      data: undefined,
    });
    const other = element('demo:a_rules', 'msm:rules', {
      counters: [],
      format: 1,
      rules: [{ do: [], key: 'r', when: { subject: 'demo:ruby_block', trigger: 'block_broken' } }],
    });
    const fallback = element('demo:rules', 'msm:rules', { counters: [], format: 1, rules: [] });
    expect(bookForSubject(project(block(), fallback), 'demo:ruby_block').id).toBe('demo:rules');
    expect(bookForSubject(project(block(), fallback, other), 'demo:ruby_block').id).toBe(
      'demo:a_rules',
    );
  });

  it('starts a new rule with the first trigger the thing can have', () => {
    expect(firstTriggerFor('msm:block', {})?.id).toBe('block_used');
    expect(firstTriggerFor('msm:block', { type: 'portal' })?.id).toBe('portal_travelled');
    expect(firstTriggerFor('msm:item', {})?.id).toBe('item_used');
    expect(firstTriggerFor('msm:entity', {})?.id).toBe('mob_hurt');
    expect(firstTriggerFor('msm:effect', {})?.id).toBe('effect_started');
    // A container trigger needs its component; a machine's too.
    const ids = triggersFor('msm:block', {}).map((trigger) => trigger.id);
    expect(ids).not.toContain('container_opened');
    expect(
      triggersFor('msm:block', { components: { 'msm:container': {} } }).map((t) => t.id),
    ).toContain('container_opened');
  });
});

describe('stepOfAction and sameActions', () => {
  it('reads absent optional fields as their defaults', () => {
    expect(
      sameActions([{ type: 'damage', amount: 1 }], [{ type: 'damage', amount: 1, target: 'self' }]),
    ).toBe(true);
    expect(sameActions([{ type: 'damage', amount: 1 }], [{ type: 'damage', amount: 2 }])).toBe(
      false,
    );
  });

  it('has no step for run_script or trigger_event', () => {
    const trigger = triggersFor('msm:block', {})[0];
    if (trigger === undefined) throw new Error('no trigger');
    expect(stepOfAction({ handler: 'demo:h', type: 'run_script' }, trigger)).toBeUndefined();
    expect(stepOfAction({ event: 'demo:x', type: 'trigger_event' }, trigger)).toBeUndefined();
  });
});

describe('planTurnIntoRules', () => {
  it('turns an event into a rule in a new default book and leaves the trigger to the rules', () => {
    const subject = block();
    const plan = planTurnIntoRules(project(subject), subject, 'demo:ruby_block_use');
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.bookId).toBe('demo:rules');
    expect(plan.items.map((item) => [item.op, item.elementId])).toEqual([
      ['update', 'demo:ruby_block'],
      ['create', 'demo:rules'],
    ]);
    const after = plan.items[0]?.after as Record<string, Json>;
    expect(after.events).toBeUndefined();
    expect(after.components).toBeUndefined();
    const book = plan.items[1]?.after as { rules: Json[] };
    expect(book.rules).toEqual([
      {
        do: [
          { count: 2, item: 'demo:ruby', step: 'give_item' },
          { sound: 'minecraft:block.note_block.chime', step: 'play_sound', volume: 0.5 },
          { amount: 4, step: 'heal' },
          { block: 'minecraft:stone', step: 'place_block', where: 'above_here' },
        ],
        key: 'ruby_block_use',
        name: 'Ruby block use',
        when: { subject: 'demo:ruby_block', trigger: 'block_used' },
      },
    ]);
  });

  it('moves trigger options onto the rule and keeps other component fields', () => {
    const subject = element('demo:pad', 'msm:block', {
      components: { 'msm:on_step': { cooldown_ticks: 40, event: 'demo:pad_step' } },
      events: {
        'demo:pad_step': { actions: [{ strength: 2, target: 'other', type: 'launch', up: 1 }] },
      },
      format: 1,
    });
    const plan = planTurnIntoRules(project(subject), subject, 'demo:pad_step');
    if (!plan.ok) throw new Error(plan.reason);
    const book = plan.items[1]?.after as { rules: { when: Json; do: Json }[] };
    expect(book.rules[0]?.when).toEqual({
      options: { cooldown_seconds: 2 },
      subject: 'demo:pad',
      trigger: 'block_stepped_on',
    });
    // `other` on a step trigger is whoever stepped on it.
    expect(book.rules[0]?.do).toEqual([{ step: 'launch', strength: 2, up: 1, who: 'other' }]);
  });

  it('puts the rules first among the rules already on the same thing and trigger', () => {
    const subject = block();
    const book = element('demo:rules', 'msm:rules', {
      counters: [],
      format: 1,
      rules: [
        { do: [], key: 'other', when: { trigger: 'player_joined' } },
        { do: [], key: 'later', when: { subject: 'demo:ruby_block', trigger: 'block_used' } },
      ],
    });
    const plan = planTurnIntoRules(project(subject, book), subject, 'demo:ruby_block_use');
    if (!plan.ok) throw new Error(plan.reason);
    const rules = (plan.items[1]?.after as { rules: { key: string }[] } | undefined)?.rules ?? [];
    expect(rules.map((rule) => rule.key)).toEqual(['other', 'ruby_block_use', 'later']);
    expect(plan.items[1]?.op).toBe('update');
    expect(plan.ruleIndexes).toEqual([1]);
  });

  it('is not offered when the rules could not do exactly what the event does', () => {
    const script = block({
      events: { 'demo:ruby_block_use': { actions: [{ handler: 'demo:h', type: 'run_script' }] } },
    });
    expect(planTurnIntoRules(project(script), script, 'demo:ruby_block_use').ok).toBe(false);
    // Spawn particle with motion has no rule step field.
    const motion = block({
      events: {
        'demo:ruby_block_use': {
          actions: [{ motion: [0, 1, 0], particle: 'minecraft:flame', type: 'spawn_particle' }],
        },
      },
    });
    expect(planTurnIntoRules(project(motion), motion, 'demo:ruby_block_use').ok).toBe(false);
    // Give item on a trigger without a player.
    const tick = element('demo:tick', 'msm:block', {
      components: { 'msm:on_random_tick': { event: 'demo:t' } },
      events: { 'demo:t': { actions: [{ item: 'demo:ruby', type: 'give_item' }] } },
      format: 1,
    });
    expect(planTurnIntoRules(project(tick), tick, 'demo:t').ok).toBe(false);
    // No trigger names it, or another event runs it.
    const loose = block({
      components: {},
      events: { 'demo:ruby_block_use': { actions: USE_ACTIONS } },
    });
    expect(planTurnIntoRules(project(loose), loose, 'demo:ruby_block_use').ok).toBe(false);
    const chained = block({
      events: {
        'demo:first': { actions: [{ event: 'demo:ruby_block_use', type: 'trigger_event' }] },
        'demo:ruby_block_use': { actions: USE_ACTIONS },
      },
    });
    expect(planTurnIntoRules(project(chained), chained, 'demo:ruby_block_use').ok).toBe(false);
  });
});

async function readAll(fs: MemoryFileSystem): Promise<Map<string, string>> {
  const decoder = new TextDecoder();
  const out = new Map<string, string>();
  for (const path of fs.list().sort()) out.set(path, decoder.decode(await fs.readFile(path)));
  return out;
}

describe('Turn into rules through the session', () => {
  it('is one undo step: the rule event replaces the hand-made one, and Undo is byte-identical', async () => {
    const fs = createMemoryFileSystem();
    const { session } = newSession(fs, {}, { validationDelay: 0 });
    await session.newProject();
    const subject = block();
    session.addElement({ id: subject.id, kind: subject.kind, data: subject.data });
    session.addElement({
      id: 'demo:ruby' as ResourceLocation,
      kind: 'msm:item',
      data: { display_name: 'Ruby', format: 1 },
    });
    await session.save();
    const before = await readAll(fs);
    expect(before.size).toBeGreaterThan(0);

    const current = session.snapshot.project as Project;
    const saved = current.namespaces
      .flatMap((namespace) => namespace.elements)
      .find((entry) => entry.id === 'demo:ruby_block') as Element;
    const plan = planTurnIntoRules(current, saved, 'demo:ruby_block_use');
    if (!plan.ok) throw new Error(plan.reason);
    const result = await session.applyChangeset(plan.items, plan.label);
    expect(result.skipped).toEqual([]);
    expect(session.snapshot.undoLabel).toBe('Turn demo:ruby_block_use into rules');

    const view = await session.rulesViewNow();
    const events = view.ruleEventsFor('demo:ruby_block');
    expect(events.map((entry) => entry.eventId)).toEqual([
      ruleEventId('demo:ruby_block', 'block_used'),
    ]);
    expect(
      sameActions(
        (events[0]?.event as { actions: Json[] } | undefined)?.actions ?? [],
        USE_ACTIONS,
      ),
    ).toBe(true);
    expect(view.rulesFor('demo:ruby_block').map((entry) => entry.key)).toEqual(['ruby_block_use']);
    const rulesProblems = session.snapshot.problems.filter(
      (problem) => problem.severity === 'error' && problem.code.startsWith('rules.'),
    );
    expect(rulesProblems).toEqual([]);
    await session.save();
    expect(fs.list()).toContain('content/demo/rules/rules.json');

    expect(session.undo()).toBe(true);
    await session.save();
    expect(await readAll(fs)).toEqual(before);
  });
});
