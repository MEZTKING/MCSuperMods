/**
 * The search's actions (ADR 0124 D9; B664): each action key run on a result against a real
 * project session with a fake host. Every action that writes is one undo step with a label, and
 * one Undo gives the starting project back; a flow is made with a behaviour's rule and with a
 * companion flow and undone; with no mod open the mod's name is asked first.
 */

import { createMemoryFileSystem, type Element, type Json, type Project } from '@msm/core';
import type { SearchEntry, SearchHit } from '@msm/search';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MAKING_PREVIEWS,
  type SearchActionHost,
  type SearchCreatorStart,
  type SearchMakeChoice,
  type SearchNotice,
  type SearchStartMod,
} from '../../src/renderer/src/search/actions';
import {
  addSearchWish,
  canFixSearchHit,
  modNameFor,
  pathFromName,
  runSearchAction,
} from '../../src/renderer/src/search/run-action';
import {
  asAction,
  asPreview,
  type SearchActionDescriptor,
  type VanillaSort,
} from '../../src/renderer/src/search/sources/shared';
import { vanillaUses, wholeId } from '../../src/renderer/src/search/vanilla-uses';
import type { SearchActionKey } from '../../src/renderer/src/search/wording';
import type { ProjectSession } from '../../src/renderer/src/session/project-session';
import {
  partLabel,
  planAddRule,
  subjectChoices,
  triggerForPart,
} from '../../src/renderer/src/studios/rules/add-rule';
import { newSession } from '../session-fixture';
import { builtInPlugins, registriesOf } from './fixtures';

// Fixtures ----------------------------------------------------------------------------------

/** A hit with this descriptor (and the understood answers or behaviour). */
function hitOf(
  action: SearchActionDescriptor,
  extra: Partial<Pick<SearchHit, 'answers' | 'behaviour'>> & Partial<SearchEntry> = {},
): SearchHit {
  const { answers, behaviour, ...entry } = extra;
  return {
    entry: {
      id: `test:${action.type}`,
      source: 'flow',
      title: 'Blue Tiles',
      available: true,
      action: asAction(action),
      preview: asPreview(action),
      ...entry,
    },
    score: 1,
    why: [],
    ...(answers !== undefined ? { answers } : {}),
    ...(behaviour !== undefined ? { behaviour } : {}),
  };
}

/** Every host call, by name. */
type Calls = Record<string, unknown[][]>;

/** A fake host over a real session: records calls, answers questions as told. */
function fakeHost(session: ProjectSession, sortOf?: (id: string) => VanillaSort | undefined) {
  const calls: Calls = {};
  const record =
    (name: string) =>
    (...args: unknown[]): void => {
      const list = calls[name] ?? [];
      list.push(args);
      calls[name] = list;
    };
  const notices: SearchNotice[] = [];
  const answers = {
    startMod: true,
    subject: 'first' as 'first' | 'cancel',
    make: 'first' as 'first' | 'cancel',
  };
  let started: Project | null = null;
  const host: SearchActionHost = {
    session,
    mode: 'very-easy',
    plugins: () => builtInPlugins,
    ...(sortOf !== undefined ? { vanillaSort: sortOf } : {}),
    rememberChoice: record('rememberChoice'),
    notify: (notice) => {
      notices.push(notice);
    },
    startMod: async (request: SearchStartMod) => {
      record('startMod')(request);
      if (!answers.startMod) return false;
      const folder = `/projects/${request.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
      const outcome = await session.newProject({
        folder,
        ...(request.from !== undefined
          ? {
              bundle: request.from.source,
              ...(request.from.values !== undefined
                ? { values: { ...request.from.values } as Record<string, Json> }
                : {}),
            }
          : {}),
      });
      started = session.snapshot.project;
      return outcome.ok;
    },
    openCreator: record('openCreator'),
    chooseFlows: record('chooseFlows'),
    chooseMake: async (request) => {
      record('chooseMake')(request);
      return answers.make === 'cancel' ? null : (request.choices[0] as SearchMakeChoice);
    },
    chooseSubject: async (request) => {
      record('chooseSubject')(request);
      return answers.subject === 'cancel' ? null : (request.choices[0]?.id ?? null);
    },
    newElement: record('newElement'),
    showMine: record('showMine'),
    openElement: record('openElement'),
    renameElement: record('renameElement'),
    findUsages: record('findUsages'),
    editInCreator: record('editInCreator'),
    openAsset: record('openAsset'),
    openRule: record('openRule'),
    seeExample: record('seeExample'),
    openSettings: record('openSettings'),
    runCommand: record('runCommand'),
    openGuide: record('openGuide'),
    showProblem: record('showProblem'),
    paintMissing: record('paintMissing'),
    surprise: record('surprise'),
    openRuleBook: record('openRuleBook'),
    paint: record('paint'),
    askAi: record('askAi'),
    copyText: record('copyText'),
  };
  return { host, calls, notices, answers, started: () => started };
}

async function openSession(): Promise<ProjectSession> {
  const { session } = newSession(createMemoryFileSystem(), {}, { validationDelay: 0 });
  await session.newProject();
  await session.schemas();
  await session.flushValidation();
  return session;
}

const projectOf = (session: ProjectSession) => session.snapshot.project as Project;

const elementsOf = (session: ProjectSession): Element[] =>
  projectOf(session).namespaces.flatMap((namespace) => namespace.elements);

const elementOf = (session: ProjectSession, id: string) =>
  elementsOf(session).find((entry) => entry.id === id);

/** An element's data as `T` (an empty object when it is missing). */
const dataOf = <T>(session: ProjectSession, id: string): T =>
  (elementOf(session, id)?.data ?? {}) as T;

/** The first argument of a host call. */
const argOf = <T>(calls: Calls, name: string, index = 0): T => (calls[name] ?? [])[index]?.[0] as T;

/** The sort of a vanilla id by the default target's registries. */
function sortsOf(targetId: string): (id: string) => VanillaSort | undefined {
  const registries = registriesOf(targetId);
  const has = (registry: string, id: string): boolean => {
    const path = id.slice(id.indexOf(':') + 1);
    return (registries[registry] ?? []).some((entry) => entry === path || entry === id);
  };
  return (id) => {
    if (has('item', id) || has('block', id)) return 'thing';
    if (has('entity_type', id)) return 'mob';
    return undefined;
  };
}

// The session -------------------------------------------------------------------------------

let session: ProjectSession;
let start: Project;
let fake: ReturnType<typeof fakeHost>;

beforeAll(async () => {
  session = await openSession();
  start = projectOf(session);
});

beforeEach(() => {
  // Every test leaves the session at its starting project (a failed one is wound back).
  while (session.snapshot.canUndo) session.undo();
  expect(projectOf(session)).toEqual(start);
  fake = fakeHost(session, sortsOf(session.target.id));
});

/** Runs an action that writes; checks the one undo step and Undo back to the start. */
async function writes(
  hit: SearchHit,
  which: SearchActionKey,
  label: string,
  check?: () => void,
  name?: string,
) {
  const before = projectOf(session);
  const outcome = await runSearchAction(fake.host, hit, which, name === undefined ? {} : { name });
  expect(fake.notices.filter((notice) => notice.kind === 'error')).toEqual([]);
  expect(outcome).toEqual({ status: 'written', label });
  expect(session.snapshot.undoLabel).toBe(label);
  expect(projectOf(session)).not.toEqual(before);
  check?.();
  expect(session.undo()).toBe(true);
  expect(projectOf(session)).toEqual(before);
}

/** Runs an action that only opens something: nothing is written. */
async function opens(hit: SearchHit, which: SearchActionKey, call: string, args?: unknown[]) {
  const before = projectOf(session);
  const earlier = fake.calls[call]?.length ?? 0;
  const outcome = await runSearchAction(fake.host, hit, which);
  expect(outcome).toEqual({ status: 'opened' });
  expect(projectOf(session)).toBe(before);
  expect(fake.calls[call]).toHaveLength(earlier + 1);
  if (args !== undefined) expect(fake.calls[call]?.[earlier]).toEqual(args);
}

// Flows -------------------------------------------------------------------------------------

describe('a flow (B664)', () => {
  it('Make this opens the Creator with the understood answers and writes nothing', async () => {
    const hit = hitOf(
      { type: 'flow', starter: 'simple-block' },
      { answers: { block_name: 'Blue Tiles', colour: '#3355ff', nope: 1 } },
    );
    await opens(hit, 'make', 'openCreator');
    const startArg = argOf<SearchCreatorStart>(fake.calls, 'openCreator');
    expect(startArg.flowId).toBe('simple-block');
    expect(startArg.values).toEqual({ block_name: 'Blue Tiles', colour: '#3355ff' });
    expect(startArg.note).toMatch(/^Filled in from your words: /);
    expect(fake.calls.rememberChoice).toEqual([['test:flow']]);
  });

  it('Make this merges a behaviour that answers the flow', async () => {
    const hit = hitOf(
      { type: 'flow', starter: 'simple-block' },
      { behaviour: { id: 'glows', sentence: 'It gives off light at level 15.' } },
    );
    await opens(hit, 'make', 'openCreator');
    expect(argOf<SearchCreatorStart>(fake.calls, 'openCreator').values).toEqual({
      light_level: 15,
    });
  });

  it('Add to my mod makes a block that drops xp with its rule book, one step, and Undo', async () => {
    const hit = hitOf(
      { type: 'flow', starter: 'simple-block' },
      {
        answers: { block_name: 'Blue Tiles', colour: '#3355ff' },
        behaviour: { id: 'block-drops-xp', sentence: 'It gives experience when broken.' },
      },
    );
    await writes(hit, 'add', 'Make Blue Tiles', () => {
      expect(elementOf(session, 'demo:blue_tiles')?.meta.creator?.flowId).toBe('simple-block');
      const book = elementOf(session, 'demo:blue_tiles_rules');
      expect(book?.kind).toBe('msm:rules');
      const rule = dataOf<{ rules: { when: { subject: string } }[] }>(
        session,
        'demo:blue_tiles_rules',
      ).rules[0];
      expect(rule?.when.subject).toBe('demo:blue_tiles');
      expect(fake.notices.at(-1)?.text).toMatch(/^Made Blue Tiles\. .*Undo takes it back\.$/);
    });
  });

  it('Add to my mod makes a sword with the Enchantment flow beside it, one step, and Undo', async () => {
    const hit = hitOf(
      { type: 'flow', starter: 'weapon' },
      {
        title: 'Weapon',
        answers: { weapon_name: 'Fire Blade' },
        behaviour: { id: 'sets-on-fire', sentence: 'An enchantment for it.' },
      },
    );
    await writes(hit, 'add', 'Make Fire Blade', () => {
      const flows = new Set(elementsOf(session).map((entry) => entry.meta.creator?.flowId));
      expect(flows.has('weapon')).toBe(true);
      expect(flows.has('enchantment')).toBe(true);
    });
  });

  it('Start a mod with this, with an open mod, adds the flow as Add to my mod does', async () => {
    const hit = hitOf(
      { type: 'flow', starter: 'simple-block' },
      { answers: { block_name: 'Red Tiles' } },
    );
    await writes(hit, 'start', 'Make Red Tiles');
    expect(fake.calls.startMod).toBeUndefined();
  });
});

// Starters, examples, templates, kinds ----------------------------------------------------------

describe('library things (B664)', () => {
  it('a starter that is not a flow is added with its answers as one step', async () => {
    await writes(hitOf({ type: 'starter', starter: 'custom-sword' }), 'add', 'Add Custom sword');
  });

  it('an example is added as one step, or opened to look at', async () => {
    const example = session.library.examples.find((entry) => entry.id === 'example_recipe');
    expect(example).toBeDefined();
    await writes(
      hitOf({ type: 'example', example: 'example_recipe' }),
      'add',
      `Add ${example?.title}`,
    );
    await opens(
      hitOf({ type: 'example', example: 'example_recipe' }),
      'see-example',
      'seeExample',
      ['example_recipe'],
    );
  });

  it('a template is added with the typed name as one step "Add <name>"', async () => {
    const hit = hitOf({ type: 'template', template: 'item_model', kind: 'minecraft:model' });
    await writes(
      hit,
      'add',
      'Add Ruby Wand',
      () => {
        const made = elementsOf(session).filter(
          (entry) => !start.namespaces[0]?.elements.some((e) => e.id === entry.id),
        );
        expect(made).toHaveLength(1);
        expect(made[0]?.id).toMatch(/ruby_wand$/);
        expect(made[0]?.kind).toBe('minecraft:model');
      },
      'Ruby Wand',
    );
    expect(pathFromName(' Ruby Wand! ')).toBe('ruby_wand');
  });

  it('a template with no name opens the New element dialog', async () => {
    await opens(
      hitOf({ type: 'template', template: 'item_model', kind: 'minecraft:model' }),
      'add',
      'newElement',
      [{ kind: 'minecraft:model', template: 'item_model' }],
    );
  });

  it('a kind makes a new one or shows mine', async () => {
    await opens(hitOf({ type: 'kind', kind: 'msm:item' }), 'new', 'newElement', [
      { kind: 'msm:item' },
    ]);
    await opens(hitOf({ type: 'kind', kind: 'msm:item' }), 'show-mine', 'showMine', ['msm:item']);
  });

  it('a tile with several flows opens the chooser; the other tiles open theirs', async () => {
    await opens(
      hitOf({ type: 'flows', flows: ['weapon', 'gear-set'], tile: 'gear' }),
      'make',
      'chooseFlows',
      [{ flows: ['weapon', 'gear-set'], tile: 'gear' }],
    );
    await opens(hitOf({ type: 'surprise' }), 'surprise', 'surprise');
    await opens(hitOf({ type: 'rules-book' }), 'open', 'openRuleBook');
    await opens(hitOf({ type: 'paint' }), 'open', 'paint');
    await opens(hitOf({ type: 'ai' }), 'ask-ai', 'askAi');
  });
});

// The mod's things ---------------------------------------------------------------------------

describe("the mod's things (B664)", () => {
  it('open, rename and find usages go to the host; Edit in Creator opens one not made there', async () => {
    const pack = hitOf({ type: 'element', element: 'demo:pack' });
    await opens(pack, 'open', 'openElement', ['demo:pack']);
    await opens(pack, 'rename', 'renameElement', ['demo:pack']);
    await opens(pack, 'find-usages', 'findUsages', ['demo:pack']);
    await opens(pack, 'edit-in-creator', 'openElement');
    expect(fake.calls.editInCreator).toBeUndefined();
  });

  it('Edit in Creator reopens a thing the Creator made', async () => {
    const add = hitOf(
      { type: 'flow', starter: 'simple-block' },
      { answers: { block_name: 'Mint' } },
    );
    expect(await runSearchAction(fake.host, add, 'add')).toEqual({
      status: 'written',
      label: 'Make Mint',
    });
    await runSearchAction(
      fake.host,
      hitOf({ type: 'element', element: 'demo:mint' }),
      'edit-in-creator',
    );
    expect(fake.calls.editInCreator).toEqual([['demo:mint']]);
    expect(session.undo()).toBe(true);
  });

  it('a thing no longer in the mod says so', async () => {
    const outcome = await runSearchAction(
      fake.host,
      hitOf({ type: 'element', element: 'demo:gone' }),
      'open',
    );
    expect(outcome.status).toBe('failed');
    expect(fake.calls.openElement).toBeUndefined();
  });

  it('a picture and a rule open where they are', async () => {
    await opens(
      hitOf({ type: 'asset', namespace: 'demo', path: 'textures/item/a.png' }),
      'open',
      'openAsset',
      ['demo', 'textures/item/a.png'],
    );
    const outcome = await runSearchAction(
      fake.host,
      hitOf({ type: 'rule', book: 'demo:nothing', index: 0 }),
      'open',
    );
    expect(outcome.status).toBe('failed');
  });
});

// Vanilla things ------------------------------------------------------------------------------

describe('Make something with it (B664)', () => {
  it('offers the flows that take the thing, answered, and opens the chosen one', async () => {
    const hit = hitOf(
      { type: 'vanilla', id: 'minecraft:emerald', sort: 'thing' },
      { title: 'Emerald', source: 'vanilla' },
    );
    await opens(hit, 'make-with', 'openCreator');
    const offered = argOf<{ choices: SearchMakeChoice[] }>(fake.calls, 'chooseMake').choices;
    const ids = offered.map((choice) => choice.flowId);
    expect(ids).toContain('weapon');
    expect(ids).toContain('extra-drop');
    expect(ids).not.toContain('custom-sword');
    const weapon = offered.find((choice) => choice.flowId === 'weapon');
    expect(weapon?.values).toEqual({ ingredient: 'minecraft:emerald' });
    const opened = argOf<SearchCreatorStart>(fake.calls, 'openCreator');
    expect(opened.flowId).toBe(offered[0]?.flowId);
    expect(opened.values).toEqual(offered[0]?.values);
    expect(opened.note).toContain('Emerald');
  });

  it('free-text questions take only a thing of their own sort', () => {
    const uses = vanillaUses({
      id: 'minecraft:pig',
      sort: 'mob',
      starters: session.library.starters,
      target: session.target,
      isKnownKind: (kind) => session.registry.get(kind) !== undefined,
      sortOf: sortsOf(session.target.id),
    });
    expect(uses.map((use) => use.flowId)).not.toContain('extra-drop');
    expect(uses.length).toBeGreaterThan(0);
    for (const use of uses) {
      const answers = Object.values(use.values)
        .flat()
        .map((value) => wholeId(String(value)));
      expect(answers).toContain('minecraft:pig');
    }
  });

  it('nothing that takes it says so; Copy id copies it', async () => {
    const nothing = await runSearchAction(
      fake.host,
      hitOf({ type: 'vanilla', id: 'minecraft:no_such_thing', sort: 'thing' }, { title: 'Nope' }),
      'make-with',
    );
    expect(nothing.status).toBe('failed');
    await opens(
      hitOf({ type: 'vanilla', id: 'minecraft:emerald', sort: 'thing' }),
      'copy-id',
      'copyText',
      ['minecraft:emerald'],
    );
  });

  it('a cancelled choice writes and opens nothing', async () => {
    fake.answers.make = 'cancel';
    const outcome = await runSearchAction(
      fake.host,
      hitOf({ type: 'vanilla', id: 'minecraft:emerald', sort: 'thing' }),
      'make-with',
    );
    expect(outcome).toEqual({ status: 'cancelled' });
    expect(fake.calls.openCreator).toBeUndefined();
  });
});

// Rules ----------------------------------------------------------------------------------------

describe('Add this rule (B664)', () => {
  const part = (kind: 'trigger' | 'step' | 'condition' | 'value', id: string) =>
    hitOf({ type: 'rule-part', part: kind, id }, { title: id, source: 'rule' });

  it('a step: a new book holding a rule with the step, one step, the Rule book on it', async () => {
    await writes(
      part('step', 'give_effect'),
      'add-rule',
      `Add a rule: ${partLabel('step', 'give_effect')}`,
      () => {
        const book = elementOf(session, 'demo:rules');
        const rules = dataOf<{ rules: { do: { step: string }[] }[] }>(session, 'demo:rules').rules;
        expect(book?.kind).toBe('msm:rules');
        expect(rules).toHaveLength(1);
        expect(rules[0]?.do[0]?.step).toBe('give_effect');
        expect(fake.calls.openRule).toEqual([['demo:rules', 0]]);
      },
    );
  });

  it('a condition, a number and a trigger with no subject each add a rule', async () => {
    const condition = triggerForPart('condition', 'player_sneaking');
    expect(condition).toBeDefined();
    for (const [kind, id] of [
      ['condition', 'player_sneaking'],
      ['value', 'random'],
      ['trigger', 'player_joined'],
    ] as const) {
      const plan = planAddRule(projectOf(session), { part: kind, id });
      fake = fakeHost(session);
      await writes(part(kind, id), 'add-rule', plan.label);
    }
  });

  it("a trigger that needs a subject asks for it, and adds to the mod's own book", async () => {
    // A block and a rule book first, then the rule: three steps, three undos.
    await runSearchAction(
      fake.host,
      hitOf({ type: 'flow', starter: 'simple-block' }, { answers: { block_name: 'Mint' } }),
      'add',
    );
    await runSearchAction(fake.host, part('trigger', 'player_joined'), 'add-rule');
    const trigger = triggerForPart('trigger', 'block_broken');
    expect(subjectChoices(projectOf(session), trigger).map((choice) => choice.id)).toEqual([
      'demo:mint',
    ]);
    await writes(
      part('trigger', 'block_broken'),
      'add-rule',
      'Add a rule: A player breaks the block',
      () => {
        expect(fake.calls.chooseSubject?.[0]?.[0]).toMatchObject({
          choices: [{ id: 'demo:mint', name: 'Mint' }],
        });
        const rules = dataOf<{ rules: { when: { trigger: string; subject?: string } }[] }>(
          session,
          'demo:rules',
        ).rules;
        expect(rules).toHaveLength(2);
        expect(rules[1]?.when).toEqual({ subject: 'demo:mint', trigger: 'block_broken' });
      },
    );
    fake.answers.subject = 'cancel';
    expect(await runSearchAction(fake.host, part('trigger', 'block_broken'), 'add-rule')).toEqual({
      status: 'cancelled',
    });
    expect(session.undo()).toBe(true);
    expect(session.undo()).toBe(true);
  });

  it('with nothing it can be about, the rule is added with a line saying what is left', async () => {
    await writes(
      part('trigger', 'block_broken'),
      'add-rule',
      'Add a rule: A player breaks the block',
      () => {
        expect(fake.calls.chooseSubject).toBeUndefined();
        expect(fake.notices.at(-1)?.text).toContain('Choose what');
      },
    );
  });
});

// Settings, commands, the guide ---------------------------------------------------------------

describe('settings, commands and the guide (B664)', () => {
  it('open Settings at the line, run the command, open the guide at the heading', async () => {
    await opens(hitOf({ type: 'setting', setting: 'remember-searches' }), 'open', 'openSettings', [
      'remember-searches',
    ]);
    await opens(hitOf({ type: 'command', command: 'save' }), 'run', 'runCommand', ['save']);
    await opens(
      hitOf({ type: 'guide', page: 'rules.md', anchor: 'add-a-rule' }),
      'show-me-how',
      'openGuide',
      ['rules.md', 'add-a-rule'],
    );
  });
});

// Things to fix ------------------------------------------------------------------------------

describe('Things to fix (B664)', () => {
  it('Fix it removes an unknown step as one step "Remove this step", and Undo', async () => {
    const book = {
      counters: [],
      format: 1,
      rules: [
        { do: [{ step: 'no_such_step' }], key: 'broken', when: { trigger: 'player_joined' } },
      ],
    };
    await session.applyChangeset(
      [
        {
          itemId: 'b-1',
          op: 'create',
          elementId: 'demo:broken_rules',
          kind: 'msm:rules',
          after: book,
          accepted: true,
          problems: [],
        },
      ],
      'Add broken',
    );
    await session.flushValidation();
    const problem = session.snapshot.problems.find((entry) => entry.code === 'rules.unknown-step');
    expect(problem).toBeDefined();
    const hit = hitOf({
      type: 'problem',
      code: 'rules.unknown-step',
      element: 'demo:broken_rules',
      ...(problem?.path !== undefined ? { path: problem.path } : {}),
    });
    expect(canFixSearchHit(session, hit)).toBe(true);
    await opens(hit, 'show-me', 'showProblem');
    await writes(hit, 'fix', 'Remove this step', () => {
      const rules = dataOf<{ rules: { do: Json[] }[] }>(session, 'demo:broken_rules').rules;
      expect(rules[0]?.do).toEqual([]);
    });
    expect(session.undo()).toBe(true);
  });

  it('a problem with no one-step fix shows it', async () => {
    const hit = hitOf({ type: 'problem', code: 'schema.whatever', element: 'demo:pack' });
    expect(canFixSearchHit(session, hit)).toBe(false);
    await opens(hit, 'fix', 'showProblem');
  });
});

// No mod open --------------------------------------------------------------------------------

describe('with no mod open (B664)', () => {
  it('asks for the mod first, then makes the flow in it as one step, and Undo', async () => {
    const { session: empty } = newSession(createMemoryFileSystem(), {}, { validationDelay: 0 });
    const host = fakeHost(empty);
    const hit = hitOf(
      { type: 'flow', starter: 'simple-block' },
      { answers: { block_name: 'Blue Tiles' } },
    );
    const outcome = await runSearchAction(host.host, hit, 'start');
    expect(outcome).toEqual({ status: 'written', label: 'Make Blue Tiles' });
    expect(host.calls.startMod).toEqual([[{ name: 'Blue Tiles Mod' }]]);
    expect(empty.undo()).toBe(true);
    expect(empty.snapshot.project).toEqual(host.started());
    expect(empty.undo()).toBe(false);
  });

  it('Start a mod with this makes the mod from the starter; nothing to undo', async () => {
    const { session: empty } = newSession(createMemoryFileSystem(), {}, { validationDelay: 0 });
    const host = fakeHost(empty);
    const outcome = await runSearchAction(
      host.host,
      hitOf({ type: 'starter', starter: 'custom-sword' }, { title: 'Custom sword' }),
      'start',
    );
    expect(outcome).toEqual({ status: 'opened' });
    const asked = host.calls.startMod?.[0]?.[0] as SearchStartMod;
    expect(asked.name).toBe('Custom Sword Mod');
    expect(asked.from?.source.title).toBe('Custom sword');
    expect(empty.snapshot.project?.namespaces.some((ns) => ns.elements.length > 1)).toBe(true);
    expect(empty.snapshot.canUndo).toBe(false);
  });

  it('a cancelled name writes nothing', async () => {
    const { session: empty } = newSession(createMemoryFileSystem(), {}, { validationDelay: 0 });
    const host = fakeHost(empty);
    host.answers.startMod = false;
    const outcome = await runSearchAction(
      host.host,
      hitOf({ type: 'rule-part', part: 'step', id: 'give_effect' }),
      'add-rule',
    );
    expect(outcome).toEqual({ status: 'cancelled' });
    expect(empty.snapshot.project).toBeNull();
  });

  it('names the mod from the name answer, else the title', () => {
    expect(modNameFor(hitOf({ type: 'surprise' }, { title: 'Weapon' }))).toBe('Weapon Mod');
    expect(
      modNameFor(hitOf({ type: 'surprise' }, { title: 'Weapon', answers: { name: 'fire blade' } })),
    ).toBe('Fire Blade Mod');
    expect(modNameFor(hitOf({ type: 'surprise' }, { title: 'Lucky mod' }))).toBe('Lucky Mod');
  });
});

// Others ---------------------------------------------------------------------------------------

describe('the rest (B664)', () => {
  it('a result the target cannot make does nothing and is not remembered', async () => {
    const hit = hitOf(
      { type: 'flow', starter: 'simple-block' },
      { available: false, unavailableReason: 'Not on this Minecraft version.' },
    );
    const outcome = await runSearchAction(fake.host, hit, 'add');
    expect(outcome).toEqual({ status: 'failed', message: 'Not on this Minecraft version.' });
    expect(fake.calls.rememberChoice).toBeUndefined();
  });

  it('adds the words to the Wishlist (not an undo step)', async () => {
    const outcome = await addSearchWish(fake.host, 'a pig that knits');
    expect(outcome).toEqual({ status: 'opened' });
    const wishes = await session.readWishlist();
    expect(wishes.map((wish) => wish.title)).toContain('a pig that knits');
    expect(session.snapshot.canUndo).toBe(false);
  });
});

describe('the previews of the making actions (B664)', () => {
  it('names one for every descriptor that makes something', () => {
    for (const type of [
      'flow',
      'flows',
      'starter',
      'example',
      'template',
      'vanilla',
      'rule-part',
    ]) {
      expect(MAKING_PREVIEWS[type as keyof typeof MAKING_PREVIEWS]).toBeDefined();
    }
    expect(MAKING_PREVIEWS.setting).toBeUndefined();
  });
});
