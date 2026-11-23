/**
 * B557 follow-up: Rules on games kinds (ADR 0115 D5). A rule book listening to an area, a timer
 * and a one block lowers B553's function bridge: the signal command `msm_signal_<ns>` (a command
 * of the project's own, added by the mod jar) and the functions
 * `<ns>:msm_rules/signal/<kind>/<path>/<hook>[/<phase>]` named as optional entries of the games
 * hook tags. The export's mcfunction checker must know the command and the registry view the
 * functions, read from the expanded project (the rules expander's own output), so the data pack
 * and the content jar export with no problem above info; the vanilla data pack keeps the
 * optional tag entries, so the hook tags still load where the game skips the function.
 */
import { createMemoryFileSystem, type Json, type Problem, type ResourceLocation } from '@msm/core';
import { piecesTemplates } from '@msm/plugin-games';
import { unzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import { createScriptingService } from '../src/main/platform/scripting';
import type { McfunctionChecker } from '../src/renderer/src/session/mcfunction-problems';
import {
  maskProjectCommands,
  mcfunctionProjectIds,
  projectCommandLiterals,
} from '../src/renderer/src/session/mcfunction-problems';
import { dataRegistryIds, withExpandedRuleBooks } from '../src/renderer/src/session/schema-context';
import type { ScriptingChecker } from '../src/renderer/src/session/scripting-problems';
import { newSession, nodeMcfunctionChecker } from './session-fixture';

let checker: McfunctionChecker;
const scripting: ScriptingChecker = createScriptingService();

beforeAll(async () => {
  checker = await nodeMcfunctionChecker();
});

const templateData = async (id: string): Promise<Json> => {
  const template = piecesTemplates.find((entry) => entry.id === id);
  if (template === undefined) throw new Error(`no template ${id}`);
  return (await template.data({ namespace: 'demo', path: 'x' } as never)) as Json;
};

const runtimeBytes = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 1, 2, 3]);

/** An area, a timer and a one block, and a rule book listening to each. */
async function rulesSession() {
  const fs = createMemoryFileSystem();
  const { session, platform, calls } = newSession(
    fs,
    {},
    { mcfunction: checker, scripting, validationDelay: 0 },
  );
  platform.exports = { ...platform.exports, runtimeJar: async () => runtimeBytes };
  await session.newProject();
  const pieces: [ResourceLocation, string, string][] = [
    ['demo:arena', 'msm:area', 'msm_games_area_arena'],
    ['demo:round', 'msm:timer', 'msm_games_timer_countdown'],
    ['demo:magic_block', 'msm:one_block', 'msm_games_one_block_classic'],
  ];
  for (const [id, kind, template] of pieces) {
    session.addElement({ id, kind, data: await templateData(template) });
  }
  const weather = (kind: string): Json => [{ seconds: 30, step: 'set_weather', weather: kind }];
  session.addElement({
    id: 'demo:game_rules',
    kind: 'msm:rules',
    data: {
      counters: [],
      format: 1,
      rules: [
        {
          do: [{ step: 'show_message', text: ['In the arena'] }],
          key: 'a',
          when: { subject: 'demo:arena', trigger: 'area_entered' },
        },
        { do: weather('rain'), key: 'b', when: { subject: 'demo:round', trigger: 'timer_ended' } },
        {
          do: weather('clear'),
          key: 'c',
          when: { subject: 'demo:magic_block', trigger: 'one_block_broken' },
        },
      ],
    },
  });
  await session.flushValidation();
  return { session, calls };
}

const aboveInfo = (problems: readonly Problem[]) =>
  problems
    .filter((problem) => problem.severity !== 'info')
    .map((problem) => `${problem.file ?? problem.elementId}: ${problem.code} ${problem.message}`);

const SIGNAL_FUNCTIONS = [
  'demo:msm_rules/signal/area/arena/entered',
  'demo:msm_rules/signal/one_block/magic_block/broken',
  'demo:msm_rules/signal/timer/round/ended',
];

describe('ProjectSession: Rules on areas, timers and one blocks (B557)', () => {
  it('tells the registry view and the checker about the bridge, from the expanded books', async () => {
    const { session } = await rulesSession();
    const project = session.snapshot.project;
    if (project === null) throw new Error('no project');
    expect(aboveInfo(session.snapshot.problems)).toEqual([]);
    // The saved book carries no bridge; its expanded copy does.
    expect(dataRegistryIds(project).function ?? []).not.toContain(SIGNAL_FUNCTIONS[0]);
    const book = project.namespaces
      .flatMap((ns) => ns.elements)
      .find((element) => element.id === 'demo:game_rules');
    if (book === undefined) throw new Error('no book');
    const expanded = {
      ...project,
      namespaces: project.namespaces.map((ns) => ({
        ...ns,
        elements: ns.elements.map((element) =>
          element === book
            ? {
                ...book,
                data: {
                  ...(book.data as Record<string, Json>),
                  generated_signal: {
                    namespace: 'demo',
                    signals: [
                      { on: 'enter', subject: 'demo:arena' },
                      { on: 'end', subject: 'demo:round' },
                      { on: 'break', subject: 'demo:magic_block' },
                    ],
                  },
                },
              }
            : element,
        ),
      })),
    };
    const known = withExpandedRuleBooks(project, expanded);
    expect(withExpandedRuleBooks(project, project)).toBe(project);
    expect(dataRegistryIds(known).function).toEqual(expect.arrayContaining(SIGNAL_FUNCTIONS));
    expect(mcfunctionProjectIds(known).function).toEqual(expect.arrayContaining(SIGNAL_FUNCTIONS));
    expect(projectCommandLiterals(known)).toEqual(['msm_signal_demo']);
    expect(projectCommandLiterals(project)).toEqual([]);
  });

  it('masks calls of the project commands for the checker, keeping what comes before', async () => {
    const source = [
      'msm_signal_demo enter+demo+arena',
      'execute if score #a demo.x matches 1 run msm_signal_demo break2+demo+b',
      '# msm_signal_demo in a comment',
      'msm_signal_demo',
      'say msm_signal_demo is a word here',
    ].join('\n');
    const masked = maskProjectCommands(source, ['msm_signal_demo']).split('\n');
    expect(masked[0]).toBe(`say ${'x'.repeat(28)}`);
    expect(masked[1]).toMatch(/^execute if score #a demo\.x matches 1 run say x+$/);
    expect(masked[1]?.length).toBe(source.split('\n')[1]?.length);
    expect(masked[2]).toBe('# msm_signal_demo in a comment');
    expect(masked[3]).toBe('list');
    expect(masked[4]).toBe('say msm_signal_demo is a word here');
    for (const line of masked) {
      const problems = await checker.check(line, {
        uri: 'file:///msm/data/demo/function/t.mcfunction',
        projectIds: { objective: ['demo.x'] },
      });
      expect(problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    }
  });

  it('exports the data pack with no problem above info', async () => {
    const { session, calls } = await rulesSession();
    const result = await session.exportPack('data', 'zip');
    expect(aboveInfo(result.problems)).toEqual([]);
    expect(result.ok).toBe(true);
    const saved = calls.saved.at(-1);
    if (saved === undefined) throw new Error('nothing saved');
    const entries = unzipSync(saved.data);
    // The optional entries keep each hook tag loading where the game skips the function.
    const tag = JSON.parse(
      new TextDecoder().decode(
        entries['data/demo/tags/function/msm_games/area/arena/entered.json'] as Uint8Array,
      ),
    ) as { values: Json[] };
    expect(tag.values).toContainEqual({
      id: 'demo:msm_rules/signal/area/arena/entered',
      required: false,
    });
  }, 120_000);

  it('exports the content jar with no problem above info, the signal command inside', async () => {
    const { session, calls } = await rulesSession();
    const result = await session.exportFabricJar();
    expect(aboveInfo(result.problems)).toEqual([]);
    expect(result.ok).toBe(true);
    const saved = calls.saved.at(-1);
    if (saved === undefined) throw new Error('nothing saved');
    const entries = unzipSync(saved.data);
    const paths = Object.keys(entries);
    expect(paths.some((path) => path.endsWith('/command/msm_signal.json'))).toBe(true);
    expect(paths).toContain('data/demo/function/msm_rules/signal/area/arena/entered.mcfunction');
  }, 120_000);
});
