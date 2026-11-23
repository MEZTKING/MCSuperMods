/**
 * Lowering of a game's round (ADR 0132 D1, D2; B724, the spike's K1, K14 to K16): the state
 * machine every game type shares, as functions under `<ns>:msm_games/game/<path>/`. Names are in
 * `names.ts`; the state lives on scores, so `/reload` and a restart keep it (K15: `load` runs
 * again, and its guard `#<path>.made` keeps it from starting over).
 *
 * The states, on `#<path>.state`: 0 waiting (in the lobby, or simply not playing), 1 counting
 * down, 2 playing, 3 ending (the winners are shown for {@link ENDING_SECONDS} seconds). The
 * functions others call:
 *
 * - `start`: begins the countdown (or the round, with no countdown) while waiting. The round's
 *   `start` decides who calls it: a command or a Rules step, enough players in the lobby
 *   (checked each second; the countdown stops when too few are left, K16), or the world's start
 *   (once, when the first player is in the world: `start_world`);
 * - `stop`: stops a countdown, or a round with nobody winning; players go back to the lobby;
 * - `end`: ends the round now; the players tagged `winner` win (the win conditions tag them);
 * - `out` and `back`, run as a player: puts them out of the round (they watch as spectators) or
 *   back into it. The mechanics that put players out (hearts, elimination, falling out, a team
 *   base) call `out`.
 *
 * A round's start (`begin`): the hook `starting`; up to the most players, picked at random, take
 * part (tags `player` and `in`, the round's number on their score, deaths cleared); anyone over
 * the most watches; roles are dealt, then teams split; the win conditions' start lines; everyone
 * in goes to survival mode; the hook `player_in` as each player in; the hook `started`. While a
 * round is played, each tick: a player in whose `deathCount` rose died (hook `player_died`), a
 * dead player who is alive again respawned (hook `player_respawned`, role kits again), a player
 * whose round number is not this round's joined in the middle (in rounds they watch; in an
 * endless game they are dealt in), the hook `tick`, then the win conditions in order. Each second:
 * the hook `second` and the round's `length`. At the end (`ending`): the winners are named, the
 * hooks `won` and `ended` run, and after the ending the round's `after` applies: everyone to the
 * lobby, everyone where they are, or the next round's countdown.
 */
import type { OutputFile } from '@msm/plugin-api';
import { type SharedContribution, sharedFunctionFiles } from '../shared-functions';
import { type GameBuild, gameBuild } from './build';
import { keepsInLobby, lobbySecondLines, pickInfoLines, picksTeams } from './lobby';
import type { GameLoweringContext } from './mechanics/index';
import { ENDING_SECONDS, GAME_HOOKS, GAME_STATES, type GameModel } from './names';
import { restRole, roleKitLines } from './roles';
import { lowerWin, teamWonFiles, type WinLowering } from './win/index';

/** The win conditions of a game, lowered, with their index in `round.win`. */
export function gameWins(build: GameBuild): { index: number; win: WinLowering }[] {
  return build.game.wins.map((win, index) => ({ index, win: lowerWin(build, win, index) }));
}

/** The entity tags a round takes off every player when it ends (the `winner` tag stays). */
export const roundTags = (game: GameModel): string[] => [
  'player',
  'in',
  'out',
  'watching',
  'dead',
  'has_role',
  'own_kit',
  ...game.roles.map((role) => `role.${role.id}`),
];

/** The files of the game's round. */
export function roundFiles(context: GameLoweringContext): OutputFile[] {
  const build = gameBuild(context);
  const { game, names } = build;
  const objective = names.objective;
  const tag = names.tag;
  const wins = gameWins(build);
  const checked = wins.filter(({ win }) => win.check.length > 0);
  const timeUp = wins.find(({ win }) => win.timeUp !== undefined)?.win.timeUp;
  const winBegin = wins.flatMap(({ win }) => win.begin);
  const winEnd = wins.flatMap(({ win }) => win.end);
  const hasTeams = game.teams.length > 0;
  const holder = names.holder;
  const score = (
    form: 'score_add' | 'score_remove',
    name: string,
    value: number,
    holders = holder(name),
  ): string => build.form(form, { holders, objective, score: value });
  const ifHolder = (name: string, range: string, command: string): string =>
    build.form('if_score_run', { holder: holder(name), objective, range, command });
  const ifBoth = (
    first: string,
    firstRange: string,
    second: string,
    secondRange: string,
    command: string,
  ): string =>
    build.form('if_score_if_score_run', {
      holder: holder(first),
      objective,
      range: firstRange,
      holder_2: holder(second),
      objective_2: objective,
      range_2: secondRange,
      command,
    });
  const setTo = (holders: string, name: string): string =>
    build.form('score_operation', {
      holders,
      objective,
      score_operation: '=',
      holder_2: holder(name),
      objective_2: objective,
    });
  const tagSelf = (name: string): string =>
    build.form('tag_add', { entities: '@s', tag: tag(name) });
  const untagSelf = (name: string): string =>
    build.form('tag_remove', { entities: '@s', tag: tag(name) });
  const mode = (gameMode: string, players: string): string =>
    build.form('game_mode', { game_mode: gameMode, players });
  const lobbyBuilding = game.lobby?.building !== undefined;
  const buildLobby = lobbyBuilding
    ? [
        build.form('unless_score_run', {
          holder: holder('built'),
          objective,
          range: '1',
          command: build.run('lobby/build'),
        }),
      ]
    : [];
  const name = game.name;

  // Every load: the objectives, and the first time the world loads the game, its state.
  const load = [
    build.form('objective_add', { objective, criterion: 'dummy' }),
    build.form('objective_add', { objective: names.deaths, criterion: 'deathCount' }),
    build.form('objective_add', { objective: names.died, criterion: 'dummy' }),
    ...(picksTeams(game)
      ? [build.form('objective_add', { objective: names.pick, criterion: 'trigger' })]
      : []),
    build.form('unless_score_run', {
      holder: holder('made'),
      objective,
      range: '1',
      command: build.run('first_load'),
    }),
  ];
  const firstLoad = [
    build.setHolder('made', 1),
    build.setHolder('state', GAME_STATES.waiting),
    build.setHolder('round', 0),
    build.setHolder('time', 0),
    build.setHolder('ticks', 0),
    ...(game.start === 'world_start' ? [build.setHolder('autostart', 1)] : []),
  ];

  // Every tick: what each state does every tick, then the seconds.
  const tick = [score('score_add', 'ticks', 1)];
  if (game.lobby !== undefined) tick.push(build.ifState('0..1', build.run('state/waiting')));
  tick.push(
    build.ifState('playing', build.run('state/playing')),
    ifHolder('ticks', '20..', build.run('second')),
  );

  const waiting: string[] = [];
  if (game.lobby !== undefined) {
    // A player the game has not met yet (no round number) is brought to the lobby.
    waiting.push(
      build.form('as_unless_score_compare_run', {
        entities: '@a',
        holder: '@s',
        objective,
        comparison: '=',
        holder_2: '@s',
        objective_2: objective,
        command: build.run('lobby/arrive'),
      }),
    );
    if (keepsInLobby(game)) waiting.push(build.run('lobby/keep'));
  }

  const playing = [
    build.form('as_run', {
      entities: `@a[tag=${tag('in')},scores={${names.deaths}=1..}]`,
      command: build.run('died'),
    }),
    build.form('as_run', {
      entities: `@e[type=minecraft:player,tag=${tag('dead')}]`,
      command: build.run('respawned'),
    }),
    build.form('as_unless_score_compare_run', {
      entities: '@a',
      holder: '@s',
      objective,
      comparison: '=',
      holder_2: holder('round'),
      objective_2: objective,
      command: build.run('late'),
    }),
    build.hook('tick'),
    ...(checked.length > 0 ? [build.run('win/check')] : []),
  ];

  // Every second: what the state was at the second's start does (`second/<state>`, written
  // only for a state that does something each second).
  const secondStates = (): string[] =>
    (['waiting', 'countdown', 'playing', 'ending'] as const)
      .filter((state) => perSecond[state].length > 0)
      .map((state) => ifHolder('was', String(GAME_STATES[state]), build.run(`second/${state}`)));
  const enough = game.start === 'enough_players' ? build.count('waiting', '@a') : [];
  const secondWaiting = [...buildLobby, ...lobbySecondLines(build), ...enough];
  if (game.start === 'enough_players') {
    secondWaiting.push(ifHolder('waiting', `${game.min}..`, build.run('start')));
  } else if (game.start === 'world_start') {
    // The world's start: the first round starts once the first player is in the world (a round
    // begun with nobody there would end at once, or leave everyone watching).
    secondWaiting.push(
      ...build.count('waiting', '@a'),
      ifBoth('autostart', '1', 'waiting', '1..', build.run('start_world')),
    );
  }
  const countdownText = JSON.stringify([
    { text: `${name} starts in ` },
    { score: { name: holder('time'), objective } },
    { text: ' s' },
  ]);
  const secondCountdown = [
    ...buildLobby,
    ...lobbySecondLines(build),
    ...enough,
    ...(game.start === 'enough_players'
      ? [ifHolder('waiting', `..${game.min - 1}`, build.run('countdown/cancel'))]
      : []),
    score('score_remove', 'time', 1),
    ifBoth(
      'state',
      String(GAME_STATES.countdown),
      'time',
      '1..',
      build.form('actionbar', { players: '@a', text: countdownText }),
    ),
    ifBoth('state', String(GAME_STATES.countdown), 'time', '..0', build.run('begin')),
  ];
  const secondPlaying = [score('score_add', 'time', 1), build.hook('second')];
  if (game.length !== undefined) {
    secondPlaying.push(
      ifBoth(
        'state',
        String(GAME_STATES.playing),
        'time',
        `${game.length}..`,
        build.run('time_up'),
      ),
    );
  }
  const secondEnding = [
    score('score_remove', 'time', 1),
    ifHolder('time', '..0', build.run('finish')),
  ];
  const perSecond = {
    waiting: secondWaiting,
    countdown: secondCountdown,
    playing: secondPlaying,
    ending: secondEnding,
  };
  const second = [build.setHolder('ticks', 0), setTo(holder('was'), 'state'), ...secondStates()];

  // Starting: the countdown, then the round.
  const start = [
    build.ifState('waiting', build.run(game.countdown > 0 ? 'countdown/begin' : 'begin')),
  ];
  const countdownBegin = [
    build.setHolder('state', GAME_STATES.countdown),
    build.setHolder('time', game.countdown),
    build.setHolder('ticks', 0),
    build.say('@a', `${name} starts in ${game.countdown} seconds.`),
    ...pickInfoLines(build, '@a'),
    build.hook('countdown'),
  ];
  const countdownCancel = [
    build.setHolder('state', GAME_STATES.waiting),
    build.say('@a', `${name}: the countdown stopped.`),
    build.hook('lobby'),
  ];

  const begin = [
    build.setHolder('state', GAME_STATES.playing),
    build.setHolder('time', 0),
    build.setHolder('ticks', 0),
    score('score_add', 'round', 1),
    build.hook('starting'),
    ...[...roundTags(game), 'winner'].map((name) =>
      build.form('tag_remove', { entities: '@a', tag: tag(name) }),
    ),
    build.form('as_run', {
      entities: `@a[sort=random,limit=${game.max}]`,
      command: build.run('join'),
    }),
    build.form('as_run', { entities: `@a[tag=!${tag('player')}]`, command: build.run('watch') }),
    ...build.count('started', `@a[tag=${tag('in')}]`),
  ];
  if (game.roles.length > 0) begin.push(build.run('roles/deal'));
  if (game.splitTeams.length > 0) begin.push(build.run('teams/split'));
  if (hasTeams) begin.push(build.run('teams/count'), setTo(holder('teams_started'), 'teams'));
  begin.push(
    ...winBegin,
    mode('survival', `@a[tag=${tag('in')}]`),
    build.form('as_run', { entities: `@a[tag=${tag('in')}]`, command: build.hook('player_in') }),
    build.say('@a', `${name}: the round has started.`),
    build.hook('started'),
  );

  const join = [
    tagSelf('player'),
    tagSelf('in'),
    setTo('@s', 'round'),
    build.form('score_set', { holders: '@s', objective: names.deaths, score: 0 }),
    build.form('score_set', { holders: '@s', objective: names.died, score: 0 }),
    ...(hasTeams ? [build.form('team_leave', { members: '@s' })] : []),
  ];
  const watch = [
    tagSelf('watching'),
    setTo('@s', 'round'),
    mode('spectator', '@s'),
    build.say('@s', `The round of ${name} is full: you can watch until it ends.`),
  ];
  const late: string[] = [];
  if (game.endless) {
    const rest = restRole(game.roles);
    late.push(build.run('join'));
    if (rest !== undefined) late.push(build.run(`role/${rest.id}/give`));
    if (game.splitTeams.length > 0) {
      late.push(
        build.form('if_entity_run', {
          entities: '@s[team=]',
          command: build.run('teams/smallest'),
        }),
      );
    }
    late.push(mode('survival', '@s'), build.hook('player_in'));
  } else {
    late.push(
      tagSelf('watching'),
      setTo('@s', 'round'),
      mode('spectator', '@s'),
      build.say('@s', `A round of ${name} is being played: you can watch until it ends.`),
    );
  }
  late.push(build.hook('player_joined'));

  const died = [
    build.form('score_set', { holders: '@s', objective: names.deaths, score: 0 }),
    build.form('score_add', { holders: '@s', objective: names.died, score: 1 }),
    tagSelf('dead'),
    build.hook('player_died'),
  ];
  const respawned = [untagSelf('dead'), ...roleKitLines(build), build.hook('player_respawned')];

  const out = [
    build.form('if_entity_run', {
      entities: `@s[tag=${tag('in')}]`,
      command: build.run('out/now'),
    }),
  ];
  const outNow = [
    untagSelf('in'),
    tagSelf('out'),
    mode('spectator', '@s'),
    build.hook('player_out'),
  ];
  const back = [
    build.form('if_entity_run', {
      entities: `@s[tag=${tag('out')}]`,
      command: build.run('back/now'),
    }),
  ];
  const backNow = [
    untagSelf('out'),
    tagSelf('in'),
    mode('survival', '@s'),
    build.hook('player_back'),
  ];

  // Ending: the winners are named, then what comes after.
  const end = [build.ifState('playing', build.run('ending'))];
  const winnerSelector = `@a[tag=${tag('winner')}]`;
  const ending = [
    build.setHolder('state', GAME_STATES.ending),
    build.setHolder('time', ENDING_SECONDS),
    build.setHolder('ticks', 0),
    ...winEnd,
    ...build.count('count', winnerSelector),
    ifHolder(
      'count',
      '1..',
      build.form('tellraw', {
        players: '@a',
        text: JSON.stringify([
          { selector: winnerSelector },
          { text: ` won the round of ${name}!` },
        ]),
      }),
    ),
    ifHolder('count', '0', build.say('@a', `Nobody won the round of ${name}.`)),
    ifHolder('count', '1..', build.hook('won')),
    build.hook('ended'),
  ];
  const reset = [
    mode('survival', `@a[tag=${tag('out')}]`),
    mode('survival', `@a[tag=${tag('watching')}]`),
    ...(hasTeams ? [build.form('team_leave', { members: `@a[tag=${tag('player')}]` })] : []),
    ...roundTags(game).map((name) => build.form('tag_remove', { entities: '@a', tag: tag(name) })),
    build.setHolder('state', GAME_STATES.waiting),
  ];
  const toLobby = game.lobby !== undefined ? [build.run('lobby/send')] : [];
  const finish = [build.run('reset')];
  if (game.after === 'next_round') finish.push(build.run('start'));
  else finish.push(...(game.after === 'lobby' ? toLobby : []), build.hook('lobby'));

  const stop = [
    build.ifState('countdown', build.run('stop/countdown')),
    build.ifState('2..3', build.run('stop/round')),
  ];
  const stopCountdown = [build.run('countdown/cancel'), build.hook('stopped')];
  const stopRound = [
    ...winEnd,
    build.run('reset'),
    ...toLobby,
    build.say('@a', `${name}: the round was stopped.`),
    build.hook('stopped'),
    build.hook('lobby'),
  ];

  const contributions: SharedContribution[] = [
    { phase: 'load', path: names.path('load'), lines: load },
    { phase: 'tick', path: names.path('tick'), lines: tick },
  ];
  const files: OutputFile[] = [
    ...sharedFunctionFiles(build.target, game.namespace, contributions),
    build.file('first_load', firstLoad),
    build.file('second', second),
    ...Object.entries(perSecond)
      .filter(([, lines]) => lines.length > 0)
      .map(([state, lines]) => build.file(`second/${state}`, lines)),
    build.file('state/playing', playing),
    build.file('start', start),
    build.file('stop', stop),
    build.file('stop/countdown', stopCountdown),
    build.file('stop/round', stopRound),
    build.file('end', end),
    build.file('countdown/cancel', countdownCancel),
    build.file('begin', begin),
    build.file('join', join),
    build.file('watch', watch),
    build.file('late', late),
    build.file('died', died),
    build.file('respawned', respawned),
    build.file('out', out),
    build.file('out/now', outNow),
    build.file('back', back),
    build.file('back/now', backNow),
    build.file('ending', ending),
    build.file('finish', finish),
    build.file('reset', reset),
  ];
  if (game.countdown > 0) files.push(build.file('countdown/begin', countdownBegin));
  if (game.start === 'world_start') {
    files.push(build.file('start_world', [build.setHolder('autostart', 0), build.run('start')]));
  }
  if (game.lobby !== undefined) files.push(build.file('state/waiting', waiting));
  if (checked.length > 0) {
    files.push(
      build.file(
        'win/check',
        checked.map(({ index }) => build.ifState('playing', build.run(`win/${index}`))),
      ),
      ...checked.map(({ index, win }) => build.file(`win/${index}`, win.check)),
    );
  }
  if (game.length !== undefined) {
    files.push(build.file('time_up', [build.run(timeUp ?? 'end')]));
  }
  for (const { win } of wins) files.push(...win.files);
  if (wins.some(({ win }) => win.teamWins === true)) files.push(...teamWonFiles(build));
  files.push(...GAME_HOOKS.map((hook) => build.hookFile(hook)));
  return files;
}
