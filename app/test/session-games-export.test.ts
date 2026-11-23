/**
 * B551b: a project with every games kind (ADR 0113) exports its data pack from the app with no
 * false "Unknown ... id" warning and no mcfunction problem: the registry view and the checker
 * know the functions, function tags, predicates, objectives, teams, entity tags and boss bars
 * the games lowering writes (`gamesGeneratedIds`).
 */
import { createMemoryFileSystem, type Json, type Problem, type ResourceLocation } from '@msm/core';
import { piecesTemplates, worldSetupTemplates } from '@msm/plugin-games';
import { beforeAll, describe, expect, it } from 'vitest';
import type { McfunctionChecker } from '../src/renderer/src/session/mcfunction-problems';
import { mcfunctionProjectIds } from '../src/renderer/src/session/mcfunction-problems';
import { dataRegistryIds, gamesCheckerIds } from '../src/renderer/src/session/schema-context';
import { newSession, nodeMcfunctionChecker } from './session-fixture';

let checker: McfunctionChecker;

beforeAll(async () => {
  checker = await nodeMcfunctionChecker();
});

const templateData = async (id: string): Promise<Json> => {
  const template = [...piecesTemplates, ...worldSetupTemplates].find((entry) => entry.id === id);
  if (template === undefined) throw new Error(`no template ${id}`);
  return (await template.data({ namespace: 'demo', path: 'x' } as never)) as Json;
};

/** Every games kind once (the timer twice: with and without a boss bar), from the templates. */
async function gamesSession() {
  const fs = createMemoryFileSystem();
  const { session, calls } = newSession(fs, {}, { mcfunction: checker, validationDelay: 0 });
  await session.newProject();
  session.addElement({
    id: 'demo:island',
    kind: 'minecraft:structure_template',
    data: { size: [5, 3, 5], palette: ['minecraft:grass_block'], blocks: [[0, 0, 0, 0]] },
  });
  const setup = (await templateData('world_setup_empty_sky')) as Record<string, Json>;
  session.addElement({
    id: 'demo:skyblock',
    kind: 'msm:world_setup',
    data: { ...setup, start: { structure: 'demo:island', at: [0, 64, 0], spawn: [2, 3, 2] } },
  });
  const pieces: [ResourceLocation, string, string][] = [
    ['demo:islands/classic', 'msm:one_block', 'msm_games_one_block_classic'],
    ['demo:teams/red', 'msm:team', 'msm_games_team_red'],
    ['demo:points', 'msm:objective', 'msm_games_objective_points'],
    ['demo:countdown', 'msm:timer', 'msm_games_timer_countdown'],
    ['demo:stopwatch', 'msm:timer', 'msm_games_timer_stopwatch'],
    ['demo:arena', 'msm:area', 'msm_games_area_arena'],
  ];
  for (const [id, kind, template] of pieces) {
    session.addElement({ id, kind, data: await templateData(template) });
  }
  // A function of the project that runs the hooks and uses the generated names.
  session.addElement({
    id: 'demo:use_games',
    kind: 'minecraft:function',
    data: {
      lines: [
        'function demo:msm_games/timer/countdown/start',
        'function #demo:msm_games/area/arena/entered',
        'execute if predicate demo:msm_games/area/arena run say inside',
        'scoreboard players add @s demo.points 1',
        'team join demo.teams.red @s',
        'execute as @a[tag=demo.area.arena] run say in the arena',
      ],
    },
  });
  await session.flushValidation();
  return { session, calls };
}

const notInfo = (problems: readonly Problem[]) =>
  problems.filter((problem) => problem.severity !== 'info');

describe('ProjectSession: exporting the games kinds', () => {
  it('knows the ids the games lowering writes', async () => {
    const { session } = await gamesSession();
    const project = session.snapshot.project;
    if (project === null) throw new Error('no project');
    const ids = dataRegistryIds(project);
    expect(ids.function).toContain('demo:msm_games/world_setup/load');
    expect(ids.function).toContain('demo:msm_games/timer/countdown/start');
    expect(ids['tag/function']).toContain('demo:msm_games/area/arena/entered');
    expect(ids.predicate).toEqual(['demo:msm_games/area/arena']);
    expect(ids.objective).toBeUndefined();
    const names = gamesCheckerIds(project);
    expect(names.team).toEqual(['demo.teams.red']);
    expect(names.objective).toEqual(['demo.msm_one_block', 'demo.msm_timers', 'demo.points']);
    const checkerIds = mcfunctionProjectIds(project);
    expect(checkerIds.objective).toEqual(names.objective);
    expect(checkerIds.tag).toEqual(['demo.area.arena', 'demo.area.arena.now']);
    expect(checkerIds.bossbar).toContain('demo:msm_games/timer/countdown');
    expect(session.snapshot.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
  });

  it('exports the data pack with no unknown id and no mcfunction problem', async () => {
    const { session, calls } = await gamesSession();
    const result = await session.exportPack('data', 'zip');
    const found = notInfo(result.problems).map(
      (problem) => `${problem.file ?? problem.elementId}: ${problem.code} ${problem.message}`,
    );
    expect(found).toEqual([]);
    expect(result.ok).toBe(true);
    expect(calls.saved).toHaveLength(1);
  }, 120_000);
});
