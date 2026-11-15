/**
 * "Copy as my own script" (ADR 0082 D7 (d)): the book's events become hand-made events on its
 * subjects, its script a normal `msm:script`, and its rules are turned off. Lowered through
 * `@msm/core` before and after, the mod behaves the same: every trigger of every definition
 * runs the same actions (with `trigger_event` followed), the same handlers are defined, and the
 * Rules script is gone while the copied script holds the same code.
 *
 * `@msm/core` and `@msm/plugin-blocks-items` are read from source by relative path, as in
 * `end-to-end.test.ts`. `msm:script` is a stand-in kind that lowers its lines to
 * `msm/<ns>/script/<path>.ts` as `@msm/plugin-scripting` does (that plugin is not a dependency
 * here; the app's `copy-as-script.test.ts` runs the real one through the session).
 */
import {
  definePlugin,
  type Element,
  type Json,
  type JsonObject,
  type OutputFile,
  type Project,
} from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { ElementKindRegistry, lowerProjectAsync, registerPlugin } from '../../../core/src/index';
import blocksItems from '../../blocks-items/src/index';
import rules, { copyRuleBookAsScript, ruleEventId } from '../src/index';
import { book, element, PROJECT as SUPPORT_PROJECT } from './support';

const BLOCK = element('msm:block', 'demo:ruby_block', {
  components: { 'msm:on_interact': { event: 'demo:ruby_block_use' } },
  display_name: 'Ruby Block',
  events: {
    'demo:ruby_block_use': {
      actions: [{ sound: 'minecraft:block.amethyst_block.chime', type: 'play_sound' }],
    },
  },
  format: 1,
  model: 'minecraft:block/stone',
});
const WAND = element('msm:item', 'demo:wand', { display_name: 'Wand', format: 1 });
const RUBY = element('msm:item', 'demo:ruby', { display_name: 'Ruby', format: 1 });

const RULES: Json[] = [
  {
    do: [{ count: 1, item: 'demo:ruby', step: 'give_item' }],
    key: 'ruby_gift',
    when: { subject: 'demo:ruby_block', trigger: 'block_used' },
  },
  {
    do: [{ amount: 1, counter: 'uses', scope: 'player', step: 'add_to_counter' }],
    key: 'count_uses',
    only_if: { conditions: [{ condition: 'player_sneaking' }], match: 'all' },
    when: { options: { cooldown_seconds: 1 }, subject: 'demo:wand', trigger: 'item_used' },
  },
  {
    do: [{ step: 'show_message', text: ['Welcome'] }],
    key: 'welcome',
    when: { trigger: 'player_joined' },
  },
  {
    do: [{ step: 'show_message', text: ['Off'] }],
    enabled: false,
    key: 'off',
    when: { trigger: 'player_joined' },
  },
];

const BOOK = book(RULES, [{ name: 'uses', scope: 'player', start: 0 }]);

const projectOf = (elements: readonly Element[]): Project => ({
  formatVersion: 1,
  name: 'Demo',
  namespaces: [{ name: 'demo', elements: [...elements], assets: [] }],
  targets: [],
  plugins: ['msm.blocks-items', 'msm.rules', 'msm.scripting'],
  settings: {},
});

/** A stand-in for `@msm/plugin-scripting`'s `msm:script`: its lines as one TypeScript file. */
const scripting = definePlugin({
  id: 'msm.scripting',
  apiVersion: '^1.0.0',
  contributes: {
    elementKinds: [
      {
        id: 'msm:script',
        schema: 'msm:script',
        folder: 'script',
        defaultData: { lines: [] },
        lower: (script) => {
          const colon = script.id.indexOf(':');
          const lines = (script.data as { lines: string[] }).lines;
          return [
            {
              path: `msm/${script.id.slice(0, colon)}/script/${script.id.slice(colon + 1)}.ts`,
              contents: new TextEncoder().encode(`${lines.join('\n')}\n`),
              layer: 'msm',
              language: 'typescript',
            },
          ];
        },
      },
    ],
  },
});

const registry = new ElementKindRegistry();
registerPlugin(registry, blocksItems);
registerPlugin(registry, rules);
registerPlugin(registry, scripting);

const decode = (file: OutputFile): string =>
  file.contents instanceof Uint8Array
    ? new TextDecoder().decode(file.contents)
    : JSON.stringify(file.contents);

/** The actions an event runs, with `trigger_event` to an event of the same file followed. */
function flatten(events: JsonObject, id: string, depth = 0): Json[] {
  if (depth > 16) throw new Error(`event loop at ${id}`);
  const actions = (events[id] as JsonObject | undefined)?.actions;
  if (!Array.isArray(actions)) return [];
  return actions.flatMap((action) => {
    const object = action as JsonObject;
    if (object.type === 'trigger_event' && typeof object.event === 'string') {
      return flatten(events, object.event, depth + 1);
    }
    return [action];
  });
}

/**
 * A definition with every event reference replaced by the actions it runs and `events` left
 * out: what the game does, whatever the events are called.
 */
function behaviour(value: JsonObject): JsonObject {
  const events = (value.events as JsonObject | undefined) ?? {};
  const walk = (node: Json): Json => {
    if (typeof node === 'string' && Object.hasOwn(events, node)) {
      return { runs: flatten(events, node) };
    }
    if (Array.isArray(node)) return node.map(walk);
    if (typeof node === 'object' && node !== null) {
      return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, walk(child)]));
    }
    return node;
  };
  const { events: _events, ...rest } = value;
  return walk(rest) as JsonObject;
}

/** Applies a copy to the project's elements. */
function applyCopy(
  elements: readonly Element[],
  bookId: string,
  target: Parameters<typeof copyRuleBookAsScript>[2],
) {
  const copy = copyRuleBookAsScript(bookId, elements, target);
  if (!copy.ok) throw new Error(copy.reason);
  const subjects = new Map(copy.subjects.map((subject) => [subject.elementId as string, subject]));
  const next = elements.map((original) => {
    if (original.id === bookId) return { ...original, data: copy.book };
    const subject = subjects.get(original.id);
    return subject === undefined ? original : { ...original, data: subject.data };
  });
  if (copy.scriptLines !== null) {
    next.push(element('msm:script', copy.scriptId, { lines: copy.scriptLines }));
  }
  return { copy, elements: next };
}

describe('copyRuleBookAsScript', () => {
  for (const bundle of builtInTargets) {
    const { target } = bundle;
    it(`keeps the mod doing the same on ${target.id}`, async () => {
      const elements = [BLOCK, WAND, RUBY, BOOK];
      const { copy, elements: after } = applyCopy(elements, BOOK.id, target);
      expect(copy.scriptId).toBe('demo:rules_script');
      expect(copy.warnings).toEqual([]);
      expect(copy.subjects.map((subject) => [subject.elementId, subject.events])).toEqual([
        [
          'demo:ruby_block',
          [{ eventId: 'demo:ruby_block_script_block_used', trigger: 'block_used' }],
        ],
        ['demo:wand', [{ eventId: 'demo:wand_script_item_used', trigger: 'item_used' }]],
      ]);
      // Every rule is off; the one that was already off stays off.
      expect((copy.book.rules as JsonObject[]).map((rule) => rule.enabled)).toEqual([
        false,
        false,
        false,
        false,
      ]);
      // The cooldown in force is written onto the component, since the rule no longer gives it.
      const wand = copy.subjects[1]?.data.components as JsonObject;
      expect(wand['msm:on_use']).toEqual({
        cooldown_ticks: 20,
        event: 'demo:wand_script_item_used',
      });

      const lowerAll = (list: readonly Element[]) =>
        lowerProjectAsync(projectOf(list), registry, target, {
          plugins: [blocksItems, rules, scripting],
        });
      const before = await lowerAll(elements);
      const lowered = await lowerAll(after);
      expect(before.problems.filter((p) => p.severity === 'error')).toEqual([]);
      expect(lowered.problems.filter((p) => p.severity === 'error')).toEqual([]);

      const rulesScript = 'msm/demo/script/rules/rules.ts';
      const ownScript = 'msm/demo/script/rules_script.ts';
      const map = (files: readonly OutputFile[]) => new Map(files.map((f) => [f.path, f]));
      const was = map(before.files);
      const now = map(lowered.files);
      expect(was.has(rulesScript)).toBe(true);
      expect(now.has(rulesScript)).toBe(false);
      const wasLines = decode(was.get(rulesScript) as OutputFile).split('\n');
      const nowLines = decode(now.get(ownScript) as OutputFile).split('\n');
      expect(nowLines[0]).toContain('Copied from the rule book demo:rules');
      expect(nowLines.slice(1)).toEqual(wasLines.slice(1));
      expect(nowLines.join('\n')).toContain('msm.actions.define("demo:rules/rules/wand/item_used"');
      expect(nowLines.join('\n')).toContain('msm.events.on("player.join"');

      // Every other file says the same, definitions by what their triggers run.
      const rest = (files: Map<string, OutputFile>) =>
        [...files.keys()].filter((path) => path !== rulesScript && path !== ownScript).sort();
      expect(rest(now)).toEqual(rest(was));
      for (const path of rest(was)) {
        const a = decode(was.get(path) as OutputFile);
        const b = decode(now.get(path) as OutputFile);
        if (/^msm\/demo\/(block|item|entity|effect)\/.+\.json$/.test(path)) {
          expect(behaviour(JSON.parse(b)), path).toEqual(behaviour(JSON.parse(a)));
        } else {
          expect(b, path).toBe(a);
        }
      }
      // The run_script action is kept, so the copied handler is still called.
      const item = JSON.parse(decode(now.get('msm/demo/item/wand.json') as OutputFile));
      expect(item.events['demo:wand_script_item_used'].actions).toEqual([
        { handler: 'demo:rules/rules/wand/item_used', type: 'run_script' },
      ]);
    });
  }

  const target = builtInTargets[0]?.target;
  if (target === undefined) throw new Error('no target');

  it('takes a free script id and free event ids', () => {
    const taken = element('msm:script', 'demo:rules_script', { lines: [] });
    const block = element('msm:block', 'demo:ruby_block', {
      ...(BLOCK.data as JsonObject),
      events: {
        ...((BLOCK.data as JsonObject).events as JsonObject),
        'demo:ruby_block_script_block_used': { actions: [] },
      },
    });
    const copy = copyRuleBookAsScript(BOOK.id, [block, WAND, RUBY, BOOK, taken], target);
    if (!copy.ok) throw new Error(copy.reason);
    expect(copy.scriptId).toBe('demo:rules_script_2');
    expect(copy.subjects[0]?.events[0]?.eventId).toBe('demo:ruby_block_script_block_used_2');
  });

  it('copies a book of plain rules as events only', () => {
    const plain = book([RULES[0] as Json]);
    const copy = copyRuleBookAsScript(plain.id, [BLOCK, RUBY, plain], target);
    if (!copy.ok) throw new Error(copy.reason);
    expect(copy.scriptLines).toBeNull();
    expect(copy.subjects[0]?.data.events).toMatchObject({
      'demo:ruby_block_script_block_used': {
        actions: [
          { event: 'demo:ruby_block_use', type: 'trigger_event' },
          { count: 1, item: 'demo:ruby', type: 'give_item' },
        ],
      },
    });
  });

  it('keeps another book on the same thing working, and says when the order changes', () => {
    const other = (id: string) =>
      book(
        [
          {
            do: [{ sound: 'minecraft:block.note_block.bell', step: 'play_sound' }],
            key: 'bell',
            when: { subject: 'demo:ruby_block', trigger: 'block_used' },
          },
        ],
        [],
        id,
      );
    const later = other('demo:zz_rules');
    const first = copyRuleBookAsScript(BOOK.id, [BLOCK, WAND, RUBY, BOOK, later], target);
    if (!first.ok) throw new Error(first.reason);
    expect(first.warnings).toEqual([]);
    // The copied event holds only this book's part; the other book keeps its own event.
    expect(
      ((first.subjects[0]?.data.events ?? {}) as JsonObject)['demo:ruby_block_script_block_used'],
    ).toEqual({
      actions: [
        { event: 'demo:ruby_block_use', type: 'trigger_event' },
        { count: 1, item: 'demo:ruby', type: 'give_item' },
      ],
    });
    const earlier = other('demo:aa_rules');
    const second = copyRuleBookAsScript(BOOK.id, [BLOCK, WAND, RUBY, BOOK, earlier], target);
    if (!second.ok) throw new Error(second.reason);
    expect(second.warnings).toHaveLength(1);
    expect(ruleEventId('demo:ruby_block', 'block_used')).toBe('demo:ruby_block_rules_block_used');
  });

  it('is not offered for a book with nothing on, or with errors', () => {
    const off = book([{ ...(RULES[0] as JsonObject), enabled: false }]);
    expect(copyRuleBookAsScript(off.id, [BLOCK, RUBY, off], target)).toMatchObject({ ok: false });
    const broken = book([
      { do: [], key: 'x', when: { subject: 'demo:nothing', trigger: 'block_used' } },
    ]);
    expect(copyRuleBookAsScript(broken.id, [BLOCK, broken], target)).toEqual({
      ok: false,
      reason: 'Fix the problems in this rule book first.',
    });
    expect(copyRuleBookAsScript('demo:missing', [BLOCK], target)).toMatchObject({ ok: false });
  });
});

describe('copy as my own script, key binds and vehicles (B424)', () => {
  const facts = builtInTargets[0]?.target;
  const CHIME = { sound: 'minecraft:block.note_block.chime', step: 'play_sound' };

  it('points the key bind, the weapons and on_tick at the copied events, with the options in force', () => {
    if (facts === undefined) return;
    const keys = book([
      {
        do: [CHIME],
        key: 'press',
        when: { options: { cooldown_seconds: 2 }, subject: 'demo:dash', trigger: 'key_pressed' },
      },
      { do: [CHIME], key: 'fire', when: { subject: 'demo:tank', trigger: 'vehicle_fired' } },
      {
        do: [CHIME],
        key: 'drive',
        when: { options: { interval_seconds: 3 }, subject: 'demo:tank', trigger: 'vehicle_every' },
      },
    ]);
    const copy = copyRuleBookAsScript('demo:rules', [...SUPPORT_PROJECT, keys], facts);
    if (!copy.ok) throw new Error(copy.reason);
    expect(copy.scriptLines).toBeNull();
    const dash = copy.subjects.find((subject) => subject.elementId === 'demo:dash')?.data ?? {};
    expect(dash['msm:on_press']).toBe('demo:dash_script_key_pressed');
    expect(dash.cooldown_ticks).toBe(40);
    const tank = copy.subjects.find((subject) => subject.elementId === 'demo:tank')?.data ?? {};
    expect((tank.weapons as JsonObject[]).map((weapon) => weapon.on_fire)).toEqual([
      'demo:tank_script_vehicle_fired',
      'demo:tank_script_vehicle_fired',
    ]);
    expect(tank.on_tick).toEqual({ event: 'demo:tank_script_vehicle_every', interval: 60 });
    expect(Object.keys(tank.events as JsonObject).sort()).toEqual([
      'demo:tank_script_vehicle_every',
      'demo:tank_script_vehicle_fired',
    ]);
    expect(ruleEventId('demo:tank', 'vehicle_fired')).toBe('demo:tank_rules_vehicle_fired');
  });
});
