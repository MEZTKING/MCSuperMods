/**
 * Rules for games (ADR 0115, B553): every command the new steps, conditions and values write
 * passes the offline function checker on both targets; the function bridge (D5) is made by one
 * book, lowered to the signal command, a function per signal and B552's hook tags; and the
 * compiler's own checks of the games slots.
 */
import { readFile } from 'node:fs/promises';
import type { Element, Json, JsonObject, OutputFile, TargetFacts } from '@msm/plugin-api';
import { createMcfunctionService, defaultFunctionUri } from '@msm/schemas/mcfunction';
import { builtInTargets, readVendoredJson } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  CONDITIONS,
  commandForm,
  compileRuleBook,
  compileRuleBooks,
  copyRuleBookAsScript,
  expandRules,
  fillForm,
  lowerRuleBook,
  piecesText,
  RULES_ENTRY_FORMS,
  RULES_SIGNAL_FIELD,
  rulesGeneratedIds,
  STEPS,
  signalLiteral,
  VALUES,
} from '../src/index';
import { SAMPLES } from './samples';
import { applyPatches, book, PROJECT } from './support';

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

/** A value for every placeholder the forms Rules writes have. */
const SAMPLE_VALUES: Readonly<Record<string, string>> = {
  players: '@s',
  members: '@s',
  holders: '@s',
  holder: '#round',
  entities: '@s[team=demo.red]',
  loot_table: 'demo:lucky',
  template: 'demo:island',
  x: '1',
  y: '64',
  z: '-3',
  rotation: 'clockwise_90',
  mirror: 'left_right',
  team: 'demo.red',
  objective: 'demo.points',
  score: '5',
  width: '50',
  seconds: '60',
  range: '1',
  command: 'say hi',
  ticks: '100',
};

const PROJECT_IDS = {
  objective: ['demo.points', 'demo.msm_timers', 'demo.msm_one_block', 'kills'],
  team: ['demo.red', 'blue'],
  loot_table: ['demo:lucky'],
  structure: ['demo:island'],
};

/** Every command text that is all literal words in the generated scripts of the samples. */
function literalCommands(target: TargetFacts): string[] {
  const out = new Set<string>();
  for (const sample of SAMPLES) {
    const result = compileRuleBook(book(sample.rules, sample.counters ?? []), PROJECT, target);
    for (const line of result.script ?? []) {
      for (const match of line.matchAll(/runCommand\("((?:[^"\\]|\\.)*)"[,)]/g)) {
        out.add(JSON.parse(`"${match[1] ?? ''}"`) as string);
      }
    }
  }
  return [...out].sort();
}

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'game commands on %s',
  (_id, bundle) => {
    const { target } = bundle;
    const service = (async () => {
      const [commands, blocks, registries, mcdocSymbols] = await Promise.all([
        readVendoredJson(bundle, 'mcmetaCommands', nodeReadFile),
        readVendoredJson(bundle, 'mcmetaBlocks', nodeReadFile),
        readVendoredJson(bundle, 'mcmetaRegistries', nodeReadFile),
        readVendoredJson(bundle, 'vanillaMcdocSymbols', nodeReadFile),
      ]);
      return createMcfunctionService(
        { commands, blocks, registries: registries as Record<string, string[]> } as never,
        { mcVersion: target.mcVersion, mcdocSymbols },
      );
    })();
    const uri = defaultFunctionUri('demo', 'rules_check', target.folders.data.function);
    const check = async (line: string) =>
      (await service).check(line, { uri, projectIds: PROJECT_IDS });

    it('has every form the new entries write', () => {
      for (const forms of Object.values(RULES_ENTRY_FORMS)) {
        for (const name of forms) expect(commandForm(target, name), name).toBeDefined();
      }
    });

    for (const [entry, forms] of Object.entries(RULES_ENTRY_FORMS)) {
      for (const name of forms) {
        it(`fills ${name} of ${entry} into a line the checker accepts`, async () => {
          const pieces = fillForm(
            commandForm(target, name) ?? '',
            Object.fromEntries(Object.entries(SAMPLE_VALUES).map(([key, text]) => [key, { text }])),
          );
          const line = pieces === undefined ? undefined : piecesText(pieces);
          expect(line).toBeDefined();
          expect(await check(line ?? '')).toEqual([]);
        }, 60_000);
      }
    }

    it('accepts every literal command of the generated sample scripts', async () => {
      const lines = literalCommands(target).filter((line) => !line.startsWith('say '));
      expect(lines.length).toBeGreaterThan(8);
      for (const line of lines) expect(await check(line), line).toEqual([]);
    }, 60_000);
  },
);

describe('the forms of the new entries', () => {
  it('cover every step, condition and value that writes a command', () => {
    const commandEntries = [
      'drop_loot',
      'give_loot',
      'place_structure',
      'join_team',
      'leave_team',
      'set_score',
      'add_to_score',
      'set_world_spawn',
      'set_spawn_point',
      'set_on_fire',
      'set_world_border',
      'in_area',
      'on_team',
      'score_at_least',
      'timer_running',
      'score',
      'timer_left',
      'team_size',
      'one_block_broken',
    ];
    expect(Object.keys(RULES_ENTRY_FORMS).sort()).toEqual([...commandEntries].sort());
    const ids = new Set([...STEPS, ...CONDITIONS, ...VALUES].map((entry) => entry.id));
    for (const id of commandEntries.filter((id) => id !== 'one_block_broken')) {
      expect(ids, id).toContain(id);
    }
  });

  it('keeps optional parts in order and leaves them out with their space', () => {
    const form = 'place template <template> <x> <y> <z> [rotation] [mirror]';
    const text = (values: Record<string, string>) =>
      piecesText(
        fillForm(
          form,
          Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { text: value }])),
        ) ?? [],
      );
    expect(text({ template: 'a:b', x: '1', y: '2', z: '3' })).toBe('place template a:b 1 2 3');
    expect(text({ template: 'a:b', x: '1', y: '2', z: '3', rotation: '180' })).toBe(
      'place template a:b 1 2 3 180',
    );
    expect(fillForm(form, { template: { text: 'a:b' } })).toBeUndefined();
  });
});

const [first] = builtInTargets;
if (first === undefined) throw new Error('no built-in target');
const target = first.target;

const areaRule = (key: string, trigger = 'area_entered'): Json => ({
  do: [{ step: 'show_message', text: ['Hi'] }],
  key,
  when: { subject: 'demo:arena', trigger },
});

const bridgeOf = (elements: readonly Element[], id: string): Json | undefined =>
  (
    applyPatches(elements, expandRules({ elements, target }).patches).find((e) => e.id === id)
      ?.data as JsonObject | undefined
  )?.[RULES_SIGNAL_FIELD];

const text = (file: OutputFile | undefined): string =>
  file === undefined ? '' : new TextDecoder().decode(file.contents as Uint8Array);

describe('the function bridge (ADR 0115 D5)', () => {
  it('is made once, by the first book with a signal rule', () => {
    const a = book([areaRule('a')], [], 'demo:a_rules');
    const b = book(
      [
        areaRule('b', 'area_left'),
        {
          do: [{ seconds: 1, step: 'set_weather', weather: 'clear' }],
          key: 'c',
          when: { options: { phase: 2 }, subject: 'demo:magic_block', trigger: 'one_block_broken' },
        },
      ],
      [],
      'demo:b_rules',
    );
    const elements = [...PROJECT, b, a];
    expect(bridgeOf(elements, 'demo:a_rules')).toEqual({
      namespace: 'demo',
      signals: [
        { on: 'enter', subject: 'demo:arena' },
        { on: 'leave', subject: 'demo:arena' },
        { on: 'break', phase: 2, subject: 'demo:magic_block' },
      ],
    });
    expect(bridgeOf(elements, 'demo:b_rules')).toBeUndefined();
  });

  it('lowers to the signal command, a function per signal and the hook tags', () => {
    const rules = book([
      areaRule('a'),
      {
        do: [{ seconds: 1, step: 'set_weather', weather: 'clear' }],
        key: 'b',
        when: { options: { phase: 2 }, subject: 'demo:magic_block', trigger: 'one_block_broken' },
      },
      {
        do: [{ seconds: 1, step: 'set_weather', weather: 'rain' }],
        key: 'c',
        when: { subject: 'demo:round', trigger: 'timer_ended' },
      },
    ]);
    const elements = [...PROJECT, rules];
    const expanded = applyPatches(elements, expandRules({ elements, target }).patches).find(
      (e) => e.id === 'demo:rules',
    );
    if (expanded === undefined) throw new Error('no book');
    const files = lowerRuleBook(expanded, target);
    const byPath = new Map(files.map((file) => [file.path, file]));
    expect([...byPath.keys()].sort()).toEqual([
      'data/demo/function/msm_rules/signal/area/arena/entered.mcfunction',
      'data/demo/function/msm_rules/signal/one_block/magic_block/broken/2.mcfunction',
      'data/demo/function/msm_rules/signal/timer/round/ended.mcfunction',
      'data/demo/tags/function/msm_games/area/arena/entered.json',
      'data/demo/tags/function/msm_games/one_block/magic_block/broken.json',
      'data/demo/tags/function/msm_games/timer/round/ended.json',
      'msm/demo/command/msm_signal.json',
      'msm/demo/script/rules/rules.ts',
    ]);
    expect(byPath.get('msm/demo/command/msm_signal.json')).toMatchObject({
      contents: {
        arguments: [{ name: 'signal', type: 'word' }],
        format: 1,
        name: 'msm_signal_demo',
        permission: 2,
      },
      layer: 'msm',
    });
    expect(
      text(byPath.get('data/demo/function/msm_rules/signal/area/arena/entered.mcfunction')),
    ).toBe('msm_signal_demo enter+demo+arena\n');
    expect(
      text(
        byPath.get('data/demo/function/msm_rules/signal/one_block/magic_block/broken/2.mcfunction'),
      ),
    ).toBe(
      'execute if score #magic_block.phase demo.msm_one_block matches 1 run msm_signal_demo break2+demo+magic_block\n',
    );
    expect(byPath.get('data/demo/tags/function/msm_games/timer/round/ended.json')).toMatchObject({
      contents: {
        values: [{ id: 'demo:msm_rules/signal/timer/round/ended', required: false }],
      },
      merge: 'tag',
      schema: 'tag:function',
      layer: 'datapack',
    });
    const script = text(byPath.get('msm/demo/script/rules/rules.ts'));
    expect(script).toContain('"enter+demo+arena"');
    expect(script).toContain('"break2+demo+magic_block"');
    expect(script).toContain('e.id !== "demo:msm_signal"');
  });

  it('names the functions and the command it adds for the host (B557 follow-up)', () => {
    const rules = book([
      areaRule('a'),
      areaRule('b'),
      {
        do: [{ seconds: 1, step: 'set_weather', weather: 'clear' }],
        key: 'c',
        when: { options: { phase: 2 }, subject: 'demo:magic_block', trigger: 'one_block_broken' },
      },
    ]);
    const elements = [...PROJECT, rules];
    const expanded = applyPatches(elements, expandRules({ elements, target }).patches).find(
      (e) => e.id === 'demo:rules',
    );
    if (expanded === undefined) throw new Error('no book');
    const ids = rulesGeneratedIds(expanded.data);
    expect(ids).toEqual({
      function: [
        'demo:msm_rules/signal/area/arena/entered',
        'demo:msm_rules/signal/one_block/magic_block/broken/2',
      ],
      command: ['msm_signal_demo'],
    });
    // Every function the bridge lowers is named, and nothing else.
    const lowered = lowerRuleBook(expanded, target)
      .map((file) => /^data\/([^/]+)\/function\/(.+)\.mcfunction$/.exec(file.path))
      .flatMap((match) => (match === null ? [] : [`${match[1]}:${match[2]}`]))
      .sort();
    expect(lowered).toEqual(ids.function);
    expect(rulesGeneratedIds(rules.data)).toEqual({ function: [], command: [] });
  });

  it('makes nothing without a script runtime or a signal rule', () => {
    const plainOnly = [...PROJECT, book([areaRule('a')])];
    const noFabric = { ...target, fabric: undefined } as unknown as TargetFacts;
    expect(compileRuleBooks([book([areaRule('a')])], plainOnly, noFabric).signals).toBeUndefined();
    const other = [
      ...PROJECT,
      book([
        {
          do: [{ step: 'show_message', text: ['Hi'] }],
          key: 'a',
          when: { trigger: 'player_joined' },
        },
      ]),
    ];
    expect(bridgeOf(other, 'demo:rules')).toBeUndefined();
  });

  it('names a literal in the command alphabet', () => {
    expect(signalLiteral('my-pack.v2')).toBe('msm_signal_my_pack_v2');
  });

  it('cannot be copied as a script', () => {
    const elements = [...PROJECT, book([areaRule('a')])];
    expect(copyRuleBookAsScript('demo:rules', elements, target)).toMatchObject({ ok: false });
  });
});

describe('the compiler on games slots', () => {
  const codes = (rules: Json[], facts: TargetFacts = target): string[] =>
    compileRuleBook(book(rules), PROJECT, facts).problems.map((problem) => problem.code);

  it('needs a project area, timer or one block, and a phase it has', () => {
    expect(
      codes([
        {
          ...(areaRule('a') as JsonObject),
          when: { subject: 'demo:nowhere', trigger: 'area_entered' },
        },
      ]),
    ).toEqual(['rules.unknown-subject']);
    expect(
      codes([
        {
          do: [{ seconds: 1, step: 'set_weather', weather: 'clear' }],
          key: 'a',
          when: { options: { phase: 3 }, subject: 'demo:magic_block', trigger: 'one_block_broken' },
        },
      ]),
    ).toEqual(['rules.no-such-phase']);
    expect(
      codes([
        {
          do: [{ step: 'start_timer', timer: 'demo:arena' }],
          key: 'a',
          when: { trigger: 'player_joined' },
        },
      ]),
    ).toEqual(['rules.unknown-subject']);
  });

  it('takes a team or objective by name, or a project one by id', () => {
    const join = (team: string): Json[] => [
      { do: [{ step: 'join_team', team }], key: 'a', when: { trigger: 'player_joined' } },
    ];
    expect(codes(join('blue'))).toEqual([]);
    expect(codes(join('demo:red'))).toEqual([]);
    expect(codes(join('demo:points'))).toEqual(['rules.unknown-subject']);
  });

  it('reads the score of one someone, not every player', () => {
    expect(
      codes([
        {
          do: [{ step: 'show_message', text: ['Hi'] }],
          key: 'a',
          only_if: {
            conditions: [
              { condition: 'score_at_least', number: 1, objective: 'kills', who: 'every_player' },
            ],
            match: 'all',
          },
          when: { trigger: 'player_joined' },
        },
      ]),
    ).toEqual(['rules.no-such-actor']);
  });

  it('refuses a command step on a target without the forms', () => {
    const facts = {
      ...target,
      commands: { ...target.commands, forms: undefined },
    } as unknown as TargetFacts;
    expect(
      codes(
        [{ do: [{ step: 'leave_team' }], key: 'a', when: { trigger: 'player_joined' } }],
        facts,
      ),
    ).toEqual(['rules.no-command-form']);
  });
});
