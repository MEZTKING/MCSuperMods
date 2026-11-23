/**
 * Functions in Try it's area (B613, ADR 0120 D8): Run in Try it's request is taken with the next
 * files and run at the next tick, after the load functions (a paused clock steps once); the chat
 * box's /function runs the project's function; vanilla's block tags reach the functions once the
 * area has read them from the jar cache.
 */
import type { OutputFile } from '@msm/plugin-api';
import { holderOf, PLAYER } from '@msm/sim';
import { afterEach, describe, expect, it } from 'vitest';
import {
  runInTryIt,
  takeFunctionRuns,
} from '../../../src/renderer/src/components/function-editor/run-in-tryit';
import type { VanillaDataReader } from '../../../src/renderer/src/liveviews/vanilla-data';
import {
  TRY_IT_VANILLA_FOLDERS,
  TryItArea,
  toSimFiles,
} from '../../../src/renderer/src/tryit/session-source';
import { useTryItStore } from '../../../src/renderer/src/tryit/tryit-store';
import { demoOutputs, NS, TARGET } from './tryit-fixture';

afterEach(() => {
  takeFunctionRuns();
  useTryItStore.getState().close();
});

const functionFolder = TARGET.folders.data.function as string;
const tagsFolder = TARGET.folders.data.tags as string;

function fn(path: string, lines: readonly string[]): OutputFile {
  return {
    path: `data/${NS}/${functionFolder}/${path}.mcfunction`,
    contents: new TextEncoder().encode(`${lines.join('\n')}\n`),
    layer: 'datapack',
  } as OutputFile;
}

function outputs(): OutputFile[] {
  return [
    ...demoOutputs(),
    fn('setup', ['scoreboard objectives add lv dummy']),
    fn('count', ['scoreboard players add @s lv 1', 'tag @s add counted']),
    fn('greet', ['$tag @s add $(word)']),
    fn('logs', ['execute if block 3 0 3 #minecraft:logs run tag @s add on_logs']),
    {
      path: `data/minecraft/${tagsFolder}/${functionFolder}/load.json`,
      contents: { values: [`${NS}:setup`] },
      layer: 'datapack',
    } as OutputFile,
  ];
}

const tags = (made: TryItArea) => made.source.functions.state.tags.get(holderOf(PLAYER));
const score = (made: TryItArea) => made.source.functions.state.score(holderOf(PLAYER), 'lv');

/** Try it's own area, which takes Run in Try it's requests. */
const tryItArea = () =>
  new TryItArea({
    files: toSimFiles(outputs()),
    target: TARGET,
    vanillaData: null,
    takesFunctionRuns: true,
  });

describe('Run in Try it', () => {
  it('runs the function at the next tick, after the load functions of a new area', () => {
    runInTryIt(`${NS}:count`);
    const made = tryItArea();
    // A new area: the request is taken, the run waits for the tick (the load tag first).
    expect(takeFunctionRuns()).toEqual([]);
    expect(tags(made)?.has('counted') ?? false).toBe(false);
    made.clock.step();
    expect(score(made)).toBe(1);
    expect(tags(made)?.has('counted')).toBe(true);
    expect(made.whatHappened.map((line) => line.text)).toContain(
      `Ran 2 commands from function ${NS}:count.`,
    );
    made.dispose();
  });

  it('runs on an existing area with its next files, stepping a paused clock, with macro values', () => {
    const made = tryItArea();
    made.clock.step();
    made.clock.pause();
    runInTryIt(`${NS}:greet`, '{word:"hello"}');
    runInTryIt(`${NS}:count`);
    made.setFiles(toSimFiles(outputs()));
    expect(tags(made)?.has('hello')).toBe(true);
    expect(score(made)).toBe(1);
    made.dispose();
  });

  it('says so when the function is not in the project', () => {
    const made = tryItArea();
    runInTryIt(`${NS}:nope`);
    made.setFiles(toSimFiles(outputs()));
    made.clock.step();
    expect(made.whatHappened.map((line) => line.text)).toContain(
      `There is no function ${NS}:nope in the project.`,
    );
    made.dispose();
  });

  it('is left for Try it by any other area, such as a Showcase clip or a land still', () => {
    runInTryIt(`${NS}:count`);
    // A clip's silent area made while the request waits (the gallery's land stills do, at any
    // time): it neither takes nor runs the request.
    const clip = new TryItArea({ files: toSimFiles(outputs()), target: TARGET, vanillaData: null });
    clip.setFiles(toSimFiles(outputs()));
    clip.clock.step();
    expect(score(clip)).toBeUndefined();
    clip.dispose();
    // Try it's own area made afterwards still runs it.
    const made = tryItArea();
    made.clock.step();
    expect(score(made)).toBe(1);
    expect(made.whatHappened.map((line) => line.text)).toContain(
      `Ran 2 commands from function ${NS}:count.`,
    );
    made.dispose();
  });
});

describe('the chat box', () => {
  it('runs /function with the project’s function', () => {
    const made = new TryItArea({ files: toSimFiles(outputs()), target: TARGET, vanillaData: null });
    made.clock.step();
    const line = made.source.chat(`/function ${NS}:count`);
    expect(line.result).toBe('ran');
    expect(score(made)).toBe(1);
    made.dispose();
  });
});

describe('vanilla data', () => {
  it('reads vanilla’s tags for the functions once the area has them', async () => {
    const asked: string[][] = [];
    const reader: VanillaDataReader = {
      mcVersion: TARGET.mcVersion,
      folders: async () => ({ status: 'not_set_up' }),
      folder: async () => ({ status: 'not_set_up' }),
      file: async () => ({ status: 'not_set_up' }),
      lookup: async (folders) => {
        asked.push([...folders]);
        return {
          status: 'ready',
          version: TARGET.mcVersion,
          lookup: (folder, id) =>
            folder === 'tags/block' && id === 'minecraft:logs'
              ? { values: ['minecraft:oak_log'] }
              : undefined,
        };
      },
      forget: () => {},
    };
    const made = new TryItArea({
      files: toSimFiles(outputs()),
      target: TARGET,
      vanillaData: reader,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(asked).toEqual([[...TRY_IT_VANILLA_FOLDERS]]);
    made.clock.step();
    expect(made.source.chat('/setblock 3 0 3 minecraft:oak_log').result).toBe('ran');
    made.source.runFunction(`${NS}:logs`);
    expect(tags(made)?.has('on_logs')).toBe(true);
    made.dispose();
  });

  it('reads nothing without a reader (no Minecraft folder, no bridge)', () => {
    const made = new TryItArea({ files: toSimFiles(outputs()), target: TARGET });
    made.clock.step();
    expect(made.source.chat('/setblock 3 0 3 minecraft:oak_log').result).toBe('ran');
    made.source.runFunction(`${NS}:logs`);
    expect(tags(made)?.has('on_logs') ?? false).toBe(false);
    made.dispose();
  });
});
