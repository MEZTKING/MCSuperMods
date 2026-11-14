/**
 * B371: the session uses the expanded project everywhere (ADR 0082 D9, D10): rule events on
 * their subjects and the generated rule script in the content jar, problems in patched data and
 * in generated scripts on the rule that made them, the `rules.needs-jar` note on vanilla packs,
 * `rules.not-in-eject` on the Java eject, and the read-only Rules view for the Studios.
 */
import { createMemoryFileSystem, type Json, type JsonObject, type Problem } from '@msm/core';
import { SEPARATE_RUNTIME_OPTION } from '@msm/exporters';
import { ruleEventId } from '@msm/plugin-rules';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createScriptingService } from '../src/main/platform/scripting';
import { createToolExecutor, type DecisionHost } from '../src/renderer/src/ai/tool-executor';
import { PendingChangeset } from '../src/renderer/src/changeset/changeset';
import { createRulesView, RulesSessionProblemCodes } from '../src/renderer/src/session/rules-view';
import type { ScriptingChecker } from '../src/renderer/src/session/scripting-problems';
import type { ExportTreeFile, GradleWrapperFiles } from '../src/shared/platform';
import { newSession } from './session-fixture';

const realScripting: ScriptingChecker = createScriptingService();

const wrapper: GradleWrapperFiles = {
  jar: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
  gradlew: '#!/bin/sh\n',
  gradlewBat: '@echo off\r\n',
};

const BLOCK_EVENT = ruleEventId('demo:ruby_block', 'block_used');
const WAND_EVENT = ruleEventId('demo:wand', 'item_used');

/** A plain rule (on the block) and a rule with a condition (on the wand, so a script). */
const RULES: Json[] = [
  {
    do: [
      { count: 1, item: 'demo:ruby', step: 'give_item' },
      { sound: 'minecraft:block.note_block.chime', step: 'play_sound' },
    ],
    key: 'ruby_gift',
    name: 'Ruby gift',
    when: { subject: 'demo:ruby_block', trigger: 'block_used' },
  },
  {
    do: [{ amount: 1, counter: 'uses', scope: 'player', step: 'add_to_counter' }],
    key: 'count_uses',
    only_if: { conditions: [{ condition: 'player_sneaking' }], match: 'all' },
    when: { subject: 'demo:wand', trigger: 'item_used' },
  },
];

function book(rules: Json[] = RULES): JsonObject {
  return { counters: [{ name: 'uses', scope: 'player', start: 0 }], format: 1, rules };
}

async function openSession(
  options: { scripting?: ScriptingChecker; rules?: Json[]; handMade?: boolean } = {},
) {
  const fs = createMemoryFileSystem();
  const { session, platform, calls } = newSession(
    fs,
    {},
    { scripting: options.scripting ?? realScripting, validationDelay: 0 },
  );
  const trees: { folder: string; files: ExportTreeFile[] }[] = [];
  const written: { folder: string; files: { name: string; data: Uint8Array }[] }[] = [];
  platform.exports = {
    ...platform.exports,
    runtimeJar: async () => new Uint8Array([0x50, 0x4b, 0x05, 0x06, 1, 2, 3]),
    gradleWrapper: async () => wrapper,
    pickFolder: async () => '/exports/out',
    writeTree: async (folder, files) => {
      trees.push({ folder, files });
      const root = files[0]?.path.split('/')[0] ?? '';
      return { ok: true, root: `${folder}/${root}`, count: files.length };
    },
    writeFiles: async (folder, files) => {
      written.push({ folder, files });
      return { paths: files.map((file) => `${folder}/${file.name}`) };
    },
  };
  await session.newProject();
  session.addElement({
    id: 'demo:ruby_block',
    kind: 'msm:block',
    data: {
      display_name: 'Ruby Block',
      format: 1,
      model: 'minecraft:block/stone',
      ...(options.handMade === true
        ? {
            components: { 'msm:on_interact': { event: 'demo:ruby_block_use' } },
            events: {
              'demo:ruby_block_use': {
                actions: [{ handler: 'demo:nowhere', type: 'run_script' }],
              },
            },
          }
        : {}),
    },
  });
  session.addElement({
    id: 'demo:wand',
    kind: 'msm:item',
    data: { display_name: 'Wand', format: 1 },
  });
  session.addElement({
    id: 'demo:ruby',
    kind: 'msm:item',
    data: { display_name: 'Ruby', format: 1 },
  });
  session.addElement({ id: 'demo:rules', kind: 'msm:rules', data: book(options.rules) });
  await session.flushValidation();
  return { session, calls, trees, written };
}

const decode = (bytes: Uint8Array | undefined): string =>
  bytes === undefined ? '' : new TextDecoder().decode(bytes);

const codes = (problems: readonly Problem[]) => problems.map((problem) => problem.code);

/** The single jar entry whose path ends with `suffix`. */
function entry(entries: Record<string, Uint8Array>, suffix: string): [string, Uint8Array] {
  const found = Object.entries(entries).filter(([path]) => path.endsWith(suffix));
  expect(found.map(([path]) => path)).toHaveLength(1);
  return found[0] as [string, Uint8Array];
}

describe('the content jar of a project with a rule book (B371 exit criterion)', () => {
  it('holds the rule event on the block and the transpiled rule script', async () => {
    const { session } = await openSession();
    const built = await session.buildContentJar({ [SEPARATE_RUNTIME_OPTION]: true });
    expect(built.report.ok, JSON.stringify(built.report.problems)).toBe(true);
    if (built.data === undefined) throw new Error('no jar');
    const entries = unzipSync(built.data);

    const [, blockBytes] = entry(entries, 'demo/block/ruby_block.json');
    const block = JSON.parse(decode(blockBytes)) as JsonObject;
    expect((block.components as JsonObject)['msm:on_interact']).toEqual({ event: BLOCK_EVENT });
    expect((block.events as JsonObject)[BLOCK_EVENT]).toEqual({
      actions: [
        { count: 1, item: 'demo:ruby', type: 'give_item' },
        { sound: 'minecraft:block.note_block.chime', type: 'play_sound' },
      ],
    });
    const [, itemBytes] = entry(entries, 'demo/item/wand.json');
    const item = JSON.parse(decode(itemBytes)) as JsonObject;
    expect((item.events as JsonObject)[WAND_EVENT]).toEqual({
      actions: [{ handler: 'demo:rules/rules/wand/item_used', type: 'run_script' }],
    });

    const [scriptPath, scriptBytes] = entry(entries, 'script/rules/rules.js');
    expect(scriptPath).toBe('msm/demo/script/rules/rules.js');
    const js = decode(scriptBytes);
    expect(js).toContain('msm.actions.define("demo:rules/rules/wand/item_used"');
    expect(js).not.toContain(': void'); // transpiled to JavaScript
    expect(Object.keys(entries).some((path) => path.endsWith('.ts'))).toBe(false);

    // The saved project is untouched: no generated event, no generated script.
    const saved = session.snapshot.project;
    const elements = saved?.namespaces.flatMap((namespace) => namespace.elements) ?? [];
    const savedBlock = elements.find((element) => element.id === 'demo:ruby_block');
    expect((savedBlock?.data as JsonObject | undefined)?.events).toBeUndefined();
    const savedBook = elements.find((element) => element.id === 'demo:rules');
    expect((savedBook?.data as JsonObject | undefined)?.generated_script).toBeUndefined();
  });

  it('blocks the jar on a rule error but not a vanilla pack', async () => {
    const { session } = await openSession({
      rules: [
        ...RULES,
        { do: [], key: 'broken', when: { subject: 'demo:wand', trigger: 'no_such_trigger' } },
      ],
    });
    const live = session.problemsFor('demo:rules');
    expect(live).toContainEqual(
      expect.objectContaining({
        code: 'rules.unknown-trigger',
        elementId: 'demo:rules',
        path: '/rules/2/when/trigger',
      }),
    );
    const jar = await session.buildContentJar({ [SEPARATE_RUNTIME_OPTION]: true });
    expect(jar.report.ok).toBe(false);
    expect(codes(jar.report.problems)).toContain('rules.unknown-trigger');
    expect(jar.data).toBeUndefined();

    const pack = await session.exportPack('resource', 'zip');
    expect(pack.ok, JSON.stringify(pack.problems)).toBe(true);
  });
});

describe('problems on the expanded project', () => {
  it('reports no schema or unknown-handler problems for what Rules generate', async () => {
    const { session } = await openSession();
    const problems = session.snapshot.problems;
    expect(problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(codes(problems)).not.toContain('scripting.unknown-handler');
    expect(problems.some((problem) => problem.path?.startsWith('/generated_script'))).toBe(false);
    // The full check (the AI helper's run_checks) agrees.
    const project = session.snapshot.project;
    if (project === null) throw new Error('no project');
    const checked = await session.checkProject(project);
    expect(checked.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(codes(checked)).not.toContain('scripting.unknown-handler');
  });

  it('still warns about a hand-made run_script with no handler, on the subject', async () => {
    const { session } = await openSession({ handMade: true });
    const unknown = session.snapshot.problems.filter(
      (problem) => problem.code === 'scripting.unknown-handler',
    );
    expect(unknown).toEqual([
      expect.objectContaining({
        elementId: 'demo:ruby_block',
        path: '/events/demo:ruby_block_use/actions/0/handler',
      }),
    ]);
  });

  it('moves a problem in a generated event to the rule that made it', async () => {
    // The generated give_item names an item id the definition schema refuses; the problem is
    // found on the block's expanded copy and shown on the rule.
    const { session } = await openSession({
      rules: [
        {
          do: [{ count: 1, item: 'demo:Ruby', step: 'give_item' }],
          key: 'odd',
          when: { subject: 'demo:ruby_block', trigger: 'block_used' },
        },
      ],
    });
    const onBlock = session.problemsFor('demo:ruby_block');
    const onBook = session.problemsFor('demo:rules');
    expect(onBlock.filter((problem) => problem.path?.startsWith('/events'))).toEqual([]);
    // The book's own schema finds it at the chip; the block's expanded copy at the rule.
    expect(onBook).toContainEqual(
      expect.objectContaining({ code: 'schema.unknown-id', path: '/rules/0/do/0/item' }),
    );
    expect(onBook).toContainEqual(
      expect.objectContaining({ code: 'schema.unknown-id', path: '/rules/0' }),
    );
  });

  it('puts generated script problems on the rule by its marker', async () => {
    const fake: ScriptingChecker = {
      transpile: async () => ({ js: '' }),
      check: async (source, name) => {
        if (!name.includes('/script/rules/')) return [];
        const line = source.split('\n').findIndex((text) => text.endsWith('// rule:count_uses'));
        return [
          {
            severity: 'warning',
            code: 'typescript.semantic',
            tsCode: 2339,
            message: 'Property does not exist.',
            line,
            start: 0,
            end: 1,
            offset: { start: 0, end: 1 },
          },
        ];
      },
    };
    const { session } = await openSession({ scripting: fake });
    const found = session
      .problemsFor('demo:rules')
      .filter((problem) => problem.code === 'typescript.semantic');
    expect(found).toEqual([
      expect.objectContaining({
        elementId: 'demo:rules',
        path: '/rules/1',
        file: 'msm/demo/script/rules/rules.ts',
      }),
    ]);
    expect(found[0]?.message).toContain('Property does not exist. (TS2339)');
  });

  it('checks the real generated script with no problems', async () => {
    const { session } = await openSession();
    expect(
      session.problemsFor('demo:rules').filter((problem) => problem.code.startsWith('typescript')),
    ).toEqual([]);
  });
});

describe('vanilla packs and the Java eject (ADR 0082 D10)', () => {
  it('notes rules.needs-jar once on vanilla pack exports', async () => {
    const { session } = await openSession();
    const data = await session.exportPack('data', 'zip');
    expect(data.ok, JSON.stringify(data.problems)).toBe(true);
    expect(data.problems.filter((p) => p.code === RulesSessionProblemCodes.needsJar)).toEqual([
      expect.objectContaining({ severity: 'info', elementId: 'demo:rules' }),
    ]);
    const resources = await session.exportPack('resource', 'zip');
    expect(codes(resources.problems)).toContain(RulesSessionProblemCodes.needsJar);
    const both = await session.exportPack('data', 'combined');
    expect(both.ok).toBe(true);
    expect(codes(both.problems).filter((code) => code === 'rules.needs-jar')).toHaveLength(1);
    const jar = await session.buildContentJar({ [SEPARATE_RUNTIME_OPTION]: true });
    expect(codes(jar.report.problems)).not.toContain(RulesSessionProblemCodes.needsJar);
  });

  it('ejects plain rules as events and lists the others as rules.not-in-eject', async () => {
    const { session, trees } = await openSession();
    const result = await session.exportJavaProject();
    expect(result.ok, JSON.stringify(result.problems)).toBe(true);
    const notInEject = result.problems.filter(
      (problem) => problem.code === RulesSessionProblemCodes.notInEject,
    );
    expect(notInEject).toEqual([
      expect.objectContaining({ severity: 'warning', elementId: 'demo:rules', path: '/rules/1' }),
    ]);
    const files = trees[0]?.files ?? [];
    const sources = files.map((file) => decode(file.data)).join('\n');
    expect(sources).toContain(BLOCK_EVENT);
  });
});

describe('the Rules view (B375)', () => {
  it('lists the rules and the generated events of a subject', async () => {
    const { session } = await openSession();
    const view = await session.rulesViewNow();
    expect(view.books.map((element) => element.id)).toEqual(['demo:rules']);
    expect(view.rulesFor('demo:ruby_block')).toEqual([
      expect.objectContaining({
        bookId: 'demo:rules',
        index: 0,
        key: 'ruby_gift',
        name: 'Ruby gift',
        pointer: '/rules/0',
        trigger: 'block_used',
        enabled: true,
      }),
    ]);
    expect(view.rulesFor('demo:ruby')).toEqual([]);
    expect(view.ruleEventsFor('demo:ruby_block')).toEqual([
      {
        eventId: BLOCK_EVENT,
        trigger: 'block_used',
        event: {
          actions: [
            { count: 1, item: 'demo:ruby', type: 'give_item' },
            { sound: 'minecraft:block.note_block.chime', type: 'play_sound' },
          ],
        },
        origin: { elementId: 'demo:rules', pointer: '/rules/0' },
      },
    ]);
    expect([...view.scriptRuleKeys('demo:rules')]).toEqual(['count_uses']);
    // Without an expansion only the saved rules are known.
    const bare = createRulesView(session.snapshot.project);
    expect(bare.rulesFor('demo:wand')).toHaveLength(1);
    expect(bare.ruleEventsFor('demo:wand')).toEqual([]);
  });

  it('follows edits to the book', async () => {
    const { session } = await openSession();
    session.setElementData('demo:rules', book([RULES[1] as Json]));
    const view = await session.rulesViewNow();
    expect(view.ruleEventsFor('demo:ruby_block')).toEqual([]);
    expect(view.ruleEventsFor('demo:wand').map((entry) => entry.eventId)).toEqual([WAND_EVENT]);
  });
});

describe('the AI helper run_checks (ADR 0082 D10)', () => {
  it('checks the expanded scratch project and reports rule problems on the pending book', async () => {
    const { session } = await openSession();
    const changeset = new PendingChangeset();
    const host: DecisionHost = {
      proposePlan: async () => ({ approved: true }) as never,
      checkpoint: async () => 'continue',
    };
    const execute = createToolExecutor(session, changeset, host);
    const [item] = changeset.add({
      op: 'create',
      elementId: 'demo:more_rules',
      kind: 'msm:rules',
      after: book([
        {
          do: [{ step: 'no_such_step' }],
          key: 'odd',
          when: { subject: 'demo:wand', trigger: 'item_used' },
        },
      ]),
    });
    const result = await execute(
      { requestId: 'r1', toolUseId: 'toolu_1', name: 'run_checks', input: { scope: 'pending' } },
      new AbortController().signal,
    );
    const value = JSON.parse(result.content) as {
      elements: { elementId: string; itemId?: string; problems: { code: string }[] }[];
    };
    const group = value.elements.find((entry) => entry.elementId === 'demo:more_rules');
    expect(group?.itemId).toBe(item?.itemId);
    expect(group?.problems.map((problem) => problem.code)).toContain('rules.unknown-step');
    // The live project still has no rule problem: nothing was applied.
    expect(codes(session.problemsFor('demo:more_rules'))).toEqual([]);
  });
});
