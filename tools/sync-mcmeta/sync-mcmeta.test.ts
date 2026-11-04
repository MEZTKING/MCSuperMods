import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  type FetchFile,
  MCMETA_FILES,
  mcmetaRefs,
  REPOSITORY,
  syncMcmeta,
  validateBlocks,
  validateCommands,
} from './index.ts';

const VERSION = '1.0';

function commandTree(names: readonly string[]): unknown {
  const children: Record<string, unknown> = {};
  for (const name of names) children[name] = { type: 'literal', executable: true };
  return { type: 'root', children };
}

const COMMAND_NAMES = [
  'execute',
  'function',
  'give',
  ...Array.from({ length: 60 }, (_, i) => `c${i}`),
];

function blockStates(extra = 600): Record<string, unknown> {
  const blocks: Record<string, unknown> = {
    stone: [{}, {}],
    oak_stairs: [{ facing: ['north', 'south'] }, { facing: 'north' }],
  };
  for (let i = 0; i < extra; i++) blocks[`b${i}`] = [{}, {}];
  return blocks;
}

function registries(): Record<string, string[]> {
  const value: Record<string, string[]> = {
    item: ['stone'],
    block: ['stone'],
    recipe_serializer: [],
  };
  for (let i = 0; i < 120; i++) value[`r${i}`] = [];
  return value;
}

/** A fake download keyed by summary path; records every request. */
function fakeFetch(files: Record<string, unknown>, requests: string[]): FetchFile {
  return async (repository, ref, path) => {
    requests.push(`${repository}@${ref}/${path}`);
    if (!(path in files)) throw new Error(`unexpected path ${path}`);
    return { text: JSON.stringify(files[path]), url: `mock://${path}` };
  };
}

function upstream(): Record<string, unknown> {
  return {
    'version.json': { id: VERSION, data_pack_version: 1 },
    'registries/data.min.json': registries(),
    'commands/data.min.json': commandTree(COMMAND_NAMES),
    'blocks/data.min.json': blockStates(),
  };
}

describe('validateCommands', () => {
  it('accepts a root node with enough commands', () => {
    expect(validateCommands(commandTree(COMMAND_NAMES))).toEqual([]);
  });

  it('rejects the wrong shape', () => {
    expect(validateCommands([])).toEqual(['commands.json: expected a JSON object']);
    expect(validateCommands({ type: 'literal', children: {} })[0]).toMatch(/expected "root"/);
    expect(validateCommands({ type: 'root' })).toEqual([
      'commands.json: expected a "children" object',
    ]);
  });

  it('reports too few commands and missing required ones', () => {
    expect(validateCommands(commandTree(['say']))).toEqual([
      'commands.json: 1 commands, expected at least 50',
      'commands.json: missing command "execute"',
      'commands.json: missing command "function"',
      'commands.json: missing command "give"',
    ]);
  });
});

describe('validateBlocks', () => {
  it('accepts [properties, defaults] pairs', () => {
    expect(validateBlocks(blockStates())).toEqual([]);
  });

  it('reports missing and malformed blocks', () => {
    const blocks = blockStates();
    delete blocks.stone;
    blocks.oak_stairs = { facing: 'north' };
    expect(validateBlocks(blocks)).toEqual([
      'blocks.json: missing block "stone"',
      'blocks.json: block "oak_stairs" is not a [properties, defaults] pair',
    ]);
    expect(validateBlocks(blockStates(0))[0]).toMatch(/2 blocks, expected at least 500/);
    expect(validateBlocks(null)).toEqual(['blocks.json: expected a JSON object']);
  });
});

describe('syncMcmeta', () => {
  let out: string | undefined;
  afterEach(async () => {
    if (out !== undefined) await rm(out, { recursive: true, force: true });
    out = undefined;
  });

  it('downloads every file from the summary tag and writes them sorted', async () => {
    out = await mkdtemp(join(tmpdir(), 'msm-sync-mcmeta-'));
    const requests: string[] = [];
    const source = await syncMcmeta({
      version: VERSION,
      out,
      fetchFile: fakeFetch(upstream(), requests),
    });

    const ref = mcmetaRefs(VERSION).summary;
    expect(requests).toEqual(MCMETA_FILES.map((file) => `${REPOSITORY}@${ref}/${file.path}`));
    expect((await readdir(out)).sort()).toEqual([
      'SOURCE.json',
      'blocks.json',
      'commands.json',
      'registries.json',
      'version.json',
    ]);

    const commands = await readFile(join(out, 'commands.json'), 'utf8');
    expect(commands.startsWith('{\n  "children": {\n    "c0": {')).toBe(true);
    expect(commands.endsWith('\n  "type": "root"\n}\n')).toBe(true);
    const blocks = JSON.parse(await readFile(join(out, 'blocks.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(blocks.oak_stairs).toEqual([{ facing: ['north', 'south'] }, { facing: 'north' }]);

    const written = JSON.parse(await readFile(join(out, 'SOURCE.json'), 'utf8')) as unknown;
    expect(written).toEqual(source);
    expect(source.files).toEqual([
      { name: 'blocks.json', path: 'blocks/data.min.json' },
      { name: 'commands.json', path: 'commands/data.min.json' },
      { name: 'registries.json', path: 'registries/data.min.json' },
      { name: 'version.json', path: 'version.json' },
    ]);
    expect(source.refs).toEqual(mcmetaRefs(VERSION));
  });

  it('writes nothing when a downloaded file is invalid', async () => {
    out = await mkdtemp(join(tmpdir(), 'msm-sync-mcmeta-'));
    const files = upstream();
    files['commands/data.min.json'] = { type: 'root', children: {} };
    await expect(
      syncMcmeta({ version: VERSION, out, fetchFile: fakeFetch(files, []) }),
    ).rejects.toThrow(/commands\.json: missing command "give"/);
    expect(await readdir(out)).toEqual([]);
  });

  it('rejects a malformed version before downloading', async () => {
    const requests: string[] = [];
    await expect(
      syncMcmeta({ version: '../x', out: '.', fetchFile: fakeFetch(upstream(), requests) }),
    ).rejects.toThrow(/--version/);
    expect(requests).toEqual([]);
  });
});
