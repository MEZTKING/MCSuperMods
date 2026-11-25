/**
 * Rules 4 for games (B729; ADR 0132, the B720 spike's K21): "A player dies" names the kill
 * credit, "The game starts" and "The game ends" come through the function bridge from B724's
 * hook tags, and the steps and condition run the games plugin's own functions. Rules may not
 * import `@msm/plugin-games`, so the names it repeats (`compile/games.ts`) are checked here
 * against what the games plugin really lowers (loaded by path, as its own tests load the sim).
 */
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Element, ElementKind, Json, JsonObject, OutputFile } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  compileRuleBook,
  expandRules,
  gameFunction,
  gameTag,
  heartsObjective,
  kitGiveFunction,
  lowerRuleBook,
  RULES_SIGNAL_FIELD,
  ruleSentence,
} from '../src/index';
import { applyPatches, book, PROJECT } from './support';

const [first] = builtInTargets;
if (first === undefined) throw new Error('no built-in target');
const target = first.target;

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

const byId = (id: string): Element => {
  const found = PROJECT.find((element) => element.id === id);
  if (found === undefined) throw new Error(`no ${id}`);
  return found;
};

const text = (file: OutputFile | undefined): string =>
  file === undefined
    ? ''
    : typeof file.contents === 'string'
      ? file.contents
      : file.contents instanceof Uint8Array
        ? new TextDecoder().decode(file.contents)
        : JSON.stringify(file.contents);

const codes = (rules: Json[]): string[] =>
  compileRuleBook(book(rules), PROJECT, target).problems.map((problem) => problem.code);

const scriptOf = (rules: Json[]): string =>
  (compileRuleBook(book(rules), PROJECT, target).script ?? []).join('\n');

describe('the names Rules shares with the games plugin (B724, B725)', () => {
  let files = new Map<string, OutputFile>();

  beforeAll(async () => {
    const games = (await import(
      pathToFileURL(join(REPO_ROOT, 'packages/plugins/games/src/kinds/index.ts')).href
    )) as { gamesKinds: readonly ElementKind[] };
    const out = new Map<string, OutputFile>();
    for (const element of [byId('demo:lifesteal'), byId('demo:starter')]) {
      const kind = games.gamesKinds.find((entry) => entry.id === element.kind);
      if (kind === undefined) throw new Error(`no kind ${element.kind}`);
      for (const file of await kind.lower(element, target)) out.set(file.path, file);
    }
    files = out;
  }, 120_000);

  const functionFile = (id: string): string => {
    const [namespace, path] = id.split(':') as [string, string];
    return `data/${namespace}/function/${path}.mcfunction`;
  };

  it('has every function the steps run', () => {
    for (const id of [
      gameFunction('demo:lifesteal', 'start'),
      gameFunction('demo:lifesteal', 'end'),
      gameFunction('demo:lifesteal', 'out'),
      gameFunction('demo:lifesteal', 'hearts/apply'),
      kitGiveFunction('demo:starter'),
    ]) {
      expect([...files.keys()], id).toContain(functionFile(id));
    }
  });

  it('has the hook tags the game triggers fill', () => {
    for (const hook of ['started', 'ended']) {
      const path = `data/demo/tags/function/msm_games/game/lifesteal/${hook}.json`;
      expect(files.get(path)?.merge, path).toBe('tag');
    }
  });

  it('uses the tags and the hearts objective the steps and condition read', () => {
    const all = [...files.values()].map(text).join('\n');
    expect(all).toContain(gameTag('demo:lifesteal', 'in'));
    expect(all).toContain(gameTag('demo:lifesteal', 'winner'));
    expect(all).toContain(`scoreboard objectives add ${heartsObjective('demo:lifesteal')} dummy`);
    expect(text(files.get(functionFile(gameFunction('demo:lifesteal', 'hearts/apply'))))).toContain(
      heartsObjective('demo:lifesteal'),
    );
  });
});

describe('A player dies (K21)', () => {
  const rules: Json[] = [
    {
      do: [{ step: 'show_message', text: ['Got you'], who: 'other' }],
      key: 'a',
      when: { trigger: 'player_died' },
    },
  ];

  it('listens to entity.death for players only, with the kill credit as the killer', () => {
    const script = scriptOf(rules);
    expect(script).toContain('msm.events.on("entity.death"');
    expect(script).toContain('const player: Player | undefined = e.entity.asPlayer();');
    expect(script).toContain('if (player === undefined) return;');
    expect(script).toContain('const other: Entity | undefined = e.killer;');
    expect(script).not.toContain('if (e.entity.isPlayer) return;');
  });

  it('keeps "Any mob dies" for mobs only', () => {
    const script = scriptOf([
      { do: [{ step: 'show_message', text: ['Hi'] }], key: 'a', when: { trigger: 'any_mob_died' } },
    ]);
    expect(script).toContain('if (e.entity.isPlayer) return;');
    expect(script).toContain('const other: Entity | undefined = e.attacker;');
  });

  it('reads in plain words', () => {
    expect(ruleSentence(rules[0] as JsonObject)).toBe(
      'When a player dies, show the killer the message "Got you".',
    );
  });
});

describe('The game starts and ends (through the function bridge)', () => {
  const gameRule = (key: string, trigger: string): Json => ({
    do: [{ seconds: 1, step: 'set_weather', weather: 'clear' }],
    key,
    when: { subject: 'demo:lifesteal', trigger },
  });

  it('lowers a function per hook into the game hook tags', () => {
    const rulesBook = book([gameRule('a', 'game_started'), gameRule('b', 'game_ended')]);
    const elements = [...PROJECT, rulesBook];
    const expanded = applyPatches(elements, expandRules({ elements, target }).patches).find(
      (element) => element.id === 'demo:rules',
    );
    if (expanded === undefined) throw new Error('no book');
    expect((expanded.data as JsonObject)[RULES_SIGNAL_FIELD]).toEqual({
      namespace: 'demo',
      signals: [
        { on: 'game_end', subject: 'demo:lifesteal' },
        { on: 'game_start', subject: 'demo:lifesteal' },
      ],
    });
    const byPath = new Map(lowerRuleBook(expanded, target).map((file) => [file.path, file]));
    expect(
      text(byPath.get('data/demo/function/msm_rules/signal/game/lifesteal/started.mcfunction')),
    ).toBe('msm_signal_demo game_start+demo+lifesteal\n');
    expect(
      text(byPath.get('data/demo/function/msm_rules/signal/game/lifesteal/ended.mcfunction')),
    ).toBe('msm_signal_demo game_end+demo+lifesteal\n');
    expect(
      byPath.get('data/demo/tags/function/msm_games/game/lifesteal/started.json'),
    ).toMatchObject({
      contents: {
        values: [{ id: 'demo:msm_rules/signal/game/lifesteal/started', required: false }],
      },
      merge: 'tag',
    });
  });

  it('needs one of the project games', () => {
    expect(
      codes([
        {
          ...(gameRule('a', 'game_started') as JsonObject),
          when: { subject: 'demo:arena', trigger: 'game_started' },
        },
      ]),
    ).toEqual(['rules.unknown-subject']);
  });
});

describe('the steps and the condition of Rules 4', () => {
  const on = (trigger: string, steps: Json[], onlyIf?: JsonObject): Json[] => [
    {
      do: steps,
      key: 'a',
      ...(onlyIf === undefined ? {} : { only_if: onlyIf }),
      when: { trigger },
    },
  ];

  it('gives a kit and takes a player out, as that player', () => {
    const script = scriptOf(
      on('player_respawned', [
        { kit: 'demo:starter', step: 'give_kit' },
        { game: 'demo:lifesteal', step: 'take_out_of_game' },
      ]),
    );
    expect(script).toContain(
      'players([player]).forEach((target) => target.runCommand("function demo:msm_games/kit/starter/give"));',
    );
    expect(script).toContain(
      'players([player]).forEach((target) => target.runCommand("function demo:msm_games/game/lifesteal/out"));',
    );
  });

  it('starts a round, and ends it with winners or without', () => {
    const script = scriptOf(
      on('world_started', [
        { game: 'demo:duel', step: 'start_game' },
        { game: 'demo:duel', step: 'end_game' },
        { game: 'demo:duel', step: 'end_game', winners: 'every_player' },
      ]),
    );
    expect(script).toContain('world.runCommand("function demo:msm_games/game/duel/start");');
    expect(script).toContain('world.runCommand("function demo:msm_games/game/duel/end");');
    expect(script).toContain(
      'msm.players().forEach((target) => target.runCommand("tag @s add demo.game.duel.winner"));',
    );
    // "won by" may be left out on a trigger without a player.
    expect(codes(on('world_started', [{ game: 'demo:duel', step: 'end_game' }]))).toEqual([]);
  });

  it('counts the players still in the round for "Only one is left"', () => {
    const script = scriptOf(
      on('player_died', [{ game: 'demo:duel', step: 'end_game' }], {
        conditions: [{ condition: 'only_one_left', game: 'demo:duel' }],
        match: 'all',
      }),
    );
    expect(script).toContain(
      'world.runCommand("execute if entity @a[tag=demo.game.duel.in]") === 1',
    );
  });

  it("refuses a kit or game that is not the project's, and hearts in a game without them", () => {
    expect(codes(on('player_joined', [{ kit: 'demo:lifesteal', step: 'give_kit' }]))).toEqual([
      'rules.unknown-subject',
    ]);
    expect(codes(on('player_joined', [{ game: 'demo:starter', step: 'start_game' }]))).toEqual([
      'rules.unknown-subject',
    ]);
    const problems = compileRuleBook(
      book(on('player_joined', [{ game: 'demo:duel', hearts: 5, step: 'set_most_hearts' }])),
      PROJECT,
      target,
    ).problems;
    expect(problems.map((problem) => [problem.code, problem.path])).toEqual([
      ['rules.unknown-subject', '/rules/0/do/0/game'],
    ]);
    expect(problems[0]?.message).toContain('keeps no hearts');
  });

  it('sets most health at once without a game, two points to a heart, at most 1024', () => {
    const script = scriptOf(on('player_joined', [{ hearts: 600, step: 'set_most_hearts' }]));
    expect(script).toContain(
      'target.runCommand("attribute @s minecraft:max_health base set 1024")',
    );
  });
});
