import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { ALL_TARGETS, checkProject, unmentionedMedia } from './check.ts';
import { formatCheck, parseArgs } from './cli.ts';
import {
  type FolderFile,
  fileProblems,
  MAX_FILE_BYTES,
  MAX_FOLDER_BYTES,
  MAX_SOUND_BYTES,
  projectFiles,
} from './files.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const examples = join(repoRoot, 'examples');
const run = promisify(execFile);

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const OGG = Uint8Array.from([0x4f, 0x67, 0x67, 0x53, 0, 2]);
const file = (path: string, bytes: Uint8Array = new Uint8Array(4)): FolderFile => ({ path, bytes });
const project = file('msm.project.json', new TextEncoder().encode('{}'));

const temps: string[] = [];
async function copyExample(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'msm-check-project-'));
  temps.push(root);
  const folder = join(root, 'project');
  await cp(join(examples, name), folder, { recursive: true });
  return folder;
}

afterAll(async () => {
  for (const root of temps) await rm(root, { recursive: true, force: true });
});

describe('fileProblems', () => {
  it('accepts a project with its sharing files and hidden app files', () => {
    expect(
      fileProblems([
        project,
        file('README.md'),
        file('LICENSE'),
        file('picture.png', PNG),
        file('content/demo/function/hello.json'),
        file('assets/demo/textures/item/ruby.png', PNG),
        file('assets/demo/textures/item/ruby.png.mcmeta'),
        file('assets/demo/sounds/hum.ogg', OGG),
        file('.msm/msm-runtime.d.ts'),
      ]),
    ).toEqual([]);
  });

  it('needs the project file', () => {
    expect(fileProblems([file('README.md')]).map((problem) => problem.path)).toEqual([
      'msm.project.json',
    ]);
  });

  it('refuses files that are not part of a project', () => {
    const paths = fileProblems([
      project,
      file('run.bat'),
      file('build/mod.jar'),
      file('content/demo/notes.txt'),
      file('assets/demo/textures/item/ruby.exe'),
    ]).map((problem) => problem.path);
    expect(paths).toEqual([
      'run.bat',
      'build/mod.jar',
      'content/demo/notes.txt',
      'assets/demo/textures/item/ruby.exe',
    ]);
  });

  it("refuses every file under Minecraft's own asset namespace", () => {
    const problems = fileProblems([
      project,
      file('assets/minecraft/textures/block/stone.png', PNG),
      file('assets/minecraft/sounds/ambient/cave.ogg', OGG),
    ]);
    expect(problems.map((problem) => problem.path)).toEqual([
      'assets/minecraft/textures/block/stone.png',
      'assets/minecraft/sounds/ambient/cave.ogg',
    ]);
    expect(problems[0]?.message).toContain('Mojang');
  });

  it('refuses pictures and sounds that are not what their name says', () => {
    const paths = fileProblems([
      project,
      file('assets/demo/textures/item/ruby.png', OGG),
      file('assets/demo/sounds/hum.ogg', PNG),
    ]).map((problem) => problem.path);
    expect(paths).toEqual(['assets/demo/textures/item/ruby.png', 'assets/demo/sounds/hum.ogg']);
  });

  it('caps files, sounds and the whole folder', () => {
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big.set(PNG);
    const sound = new Uint8Array(MAX_FILE_BYTES + 1);
    sound.set(OGG);
    const tooLoud = new Uint8Array(MAX_SOUND_BYTES + 1);
    tooLoud.set(OGG);
    expect(fileProblems([project, file('assets/demo/sounds/song.ogg', sound)])).toEqual([]);
    expect(
      fileProblems([
        project,
        file('assets/demo/textures/item/huge.png', big),
        file('assets/demo/sounds/long.ogg', tooLoud),
      ]).map((problem) => problem.path),
    ).toEqual(['assets/demo/textures/item/huge.png', 'assets/demo/sounds/long.ogg']);
    const many = Array.from(
      { length: Math.ceil(MAX_FOLDER_BYTES / MAX_FILE_BYTES) + 1 },
      (_, index) => file(`content/demo/function/f${index}.json`, new Uint8Array(MAX_FILE_BYTES)),
    );
    expect(fileProblems([project, ...many]).map((problem) => problem.path)).toEqual(['.']);
  });

  it('opens only the project file, content/ and assets/', () => {
    expect(
      projectFiles([project, file('README.md'), file('content/a.json'), file('.msm/x')]).map(
        (entry) => entry.path,
      ),
    ).toEqual(['msm.project.json', 'content/a.json']);
  });
});

describe('unmentionedMedia', () => {
  it('lists pictures and sounds whose name nothing mentions', () => {
    const files = [
      file('assets/demo/textures/item/ruby.png', PNG),
      file('assets/demo/textures/item/stone.png', PNG),
      file('assets/demo/sounds/hum.ogg', OGG),
      file('assets/demo/models/thing.json'),
    ];
    expect(unmentionedMedia(files, '{"layer0":"demo:item/ruby"} demo:hum')).toEqual([
      'assets/demo/textures/item/stone.png',
    ]);
  });
});

describe('parseArgs', () => {
  it('checks every built-in target unless told', () => {
    expect(parseArgs(['a', 'b'])).toEqual({
      folders: ['a', 'b'],
      targets: [...ALL_TARGETS],
      json: false,
    });
    const one = ALL_TARGETS[1] as string;
    expect(parseArgs(['a', '--target', one, '--json'])).toEqual({
      folders: ['a'],
      targets: [one],
      json: true,
    });
    expect(parseArgs(['a', '--target=all']).targets).toEqual([...ALL_TARGETS]);
  });

  it('refuses unknown targets and options, and no folder', () => {
    expect(() => parseArgs(['a', '--target', 'mc-1.0'])).toThrow('Unknown target mc-1.0');
    expect(() => parseArgs(['a', '--fast'])).toThrow('Unknown option --fast');
    expect(() => parseArgs([])).toThrow('Name at least one project folder');
  });
});

describe('checkProject', () => {
  it('opens, upgrades and exports a mirror example on every target', async () => {
    const result = await checkProject(join(examples, 'starters', 'simple-block'));
    expect(result.fileProblems).toEqual([]);
    expect(result.targets.map((target) => [target.targetId, target.ok, target.errors])).toEqual(
      ALL_TARGETS.map((id) => [id, true, []]),
    );
    expect(result.targets.map((target) => target.upgraded)).toEqual(
      ALL_TARGETS.map((id) => id !== result.sourceTarget),
    );
    for (const target of result.targets) {
      expect(target.exports.map((entry) => [entry.name, entry.ok, entry.needed])).toEqual([
        ['resource pack', true, true],
        ['data pack', true, true],
        ['Fabric mod jar', true, true],
      ]);
    }
    expect(result.ok).toBe(true);
    expect(formatCheck(result)).toContain('needs: resource pack, data pack, Fabric mod jar');
  }, 120_000);

  it('says a pack-only project does not need the mod jar', async () => {
    const result = await checkProject(join(examples, 'starters', 'recipe_pack'), {
      targets: [ALL_TARGETS[0] as string],
    });
    expect(result.ok).toBe(true);
    expect(
      result.targets[0]?.exports.find((entry) => entry.name === 'Fabric mod jar')?.needed,
    ).toBe(false);
  }, 120_000);

  it('fails a project with a broken function, naming the element', async () => {
    const folder = await copyExample('starters/function_starter');
    const path = join(folder, 'content', 'msm_starter', 'function', 'greet.json');
    const element = JSON.parse(await readFile(path, 'utf8')) as { data: { lines: string[] } };
    element.data.lines.push('summonx zombie');
    await writeFile(path, JSON.stringify(element));
    const result = await checkProject(folder, { targets: [ALL_TARGETS[0] as string] });
    expect(result.ok).toBe(false);
    const target = result.targets[0];
    expect(target?.errors.some((problem) => problem.where === 'msm_starter:greet')).toBe(true);
    expect(target?.exports.find((entry) => entry.name === 'data pack')?.ok).toBe(false);
  }, 120_000);

  it('fails a project with a picture nothing uses', async () => {
    const folder = await copyExample('starters/simple-block');
    await mkdir(join(folder, 'assets', 'msm_starter', 'textures', 'item'), { recursive: true });
    await cp(
      join(
        examples,
        'popular',
        'glowshard',
        'assets',
        'msm_examples',
        'textures',
        'item',
        'glowshard.png',
      ),
      join(folder, 'assets', 'msm_starter', 'textures', 'item', 'gravel_dust.png'),
    );
    const result = await checkProject(folder, { targets: [ALL_TARGETS[0] as string] });
    expect(result.targets[0]?.ok).toBe(true);
    expect(result.fileProblems.map((problem) => problem.path)).toEqual([
      'assets/msm_starter/textures/item/gravel_dust.png',
    ]);
    expect(result.ok).toBe(false);
  }, 120_000);
});

describe('the command line', () => {
  it('runs under plain Node and prints JSON', async () => {
    const { stdout } = await run(
      process.execPath,
      [
        join(here, 'index.ts'),
        join(examples, 'starters', 'simple-block'),
        '--target',
        ALL_TARGETS[0] as string,
        '--json',
      ],
      { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 },
    );
    const report = JSON.parse(stdout) as { passed: number; failed: number };
    expect([report.passed, report.failed]).toEqual([1, 0]);
  }, 120_000);

  it('exits 1 when a project fails', async () => {
    const folder = await copyExample('starters/simple-block');
    await writeFile(join(folder, 'notes.exe'), 'x');
    const failed = await run(
      process.execPath,
      [join(here, 'index.ts'), folder, '--target', ALL_TARGETS[0] as string],
      {
        cwd: repoRoot,
      },
    ).then(
      () => 0,
      (error: { code?: number }) => error.code,
    );
    expect(failed).toBe(1);
  }, 120_000);
});
