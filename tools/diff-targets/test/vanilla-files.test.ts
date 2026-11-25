/**
 * The vanilla files list (B823): the made pair's file indexes (`test/fixtures/mc-98.0` and
 * `mc-99.0`, invented paths and hashes) compared into added, removed, moved and changed, and the
 * command line writing it beside the change set and checking it. `UPDATE_GOLDENS=1` rewrites
 * `expected.vanilla-files.json`.
 */

import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as Api from '@msm/plugin-api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { main } from '../cli.ts';
import {
  diffVanillaFiles,
  FILE_INDEX,
  type FileIndex,
  readFileIndex,
  type VanillaFileChanges,
  vanillaFilesPath,
} from '../vanilla-files.ts';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const FROM = join(fixtures, 'mc-98.0');
const TO = join(fixtures, 'mc-99.0');
const EXPECTED = join(fixtures, 'expected.vanilla-files.json');

const toApi = (files: VanillaFileChanges): Api.VanillaFileChanges => files;
const toLocal = (files: Api.VanillaFileChanges): VanillaFileChanges => files;

let scratch: string;
let before: FileIndex;
let after: FileIndex;

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'diff-targets-files-'));
  before = (await readFileIndex(FROM, '98.0')) as FileIndex;
  after = (await readFileIndex(TO, '99.0')) as FileIndex;
  if (process.env.UPDATE_GOLDENS === '1') {
    const out = join(scratch, 'golden', 'expected.json');
    expect(await main(['--from', FROM, '--to', TO, '--out', out], () => {})).toBe(0);
    await writeFile(EXPECTED, await readFile(vanillaFilesPath(out), 'utf8'));
  }
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('diffVanillaFiles', () => {
  it('lists paths added, removed, moved and changed, sorted', () => {
    const files = diffVanillaFiles('mc-98.0', 'mc-99.0', before, after);
    expect(files).toEqual({
      from: 'mc-98.0',
      to: 'mc-99.0',
      refs: { from: '98.0', to: '99.0' },
      leftOut: ['data/<namespace>/structure/<path>.nbt'],
      added: [
        'assets/minecraft/lang/yy_yy.json',
        'assets/minecraft/lang/zz_zz.json',
        'data/minecraft/loot_table/blocks/new_block.json',
        'data/minecraft/recipe/new_block.json',
      ],
      // The same contents under two new paths is not a move.
      removed: ['assets/minecraft/lang/xx_xx.json', 'assets/minecraft/models/block/cube_top.json'],
      moved: {
        'assets/minecraft/textures/gui/old_button.png':
          'assets/minecraft/textures/gui/new_button.png',
      },
      changed: [
        'data/minecraft/loot_table/chests/igloo_chest.json',
        'data/minecraft/tags/block/mineable/pickaxe.json',
      ],
    });
    // The local type is the plugin API's.
    expect(toLocal(toApi(files))).toBe(files);
  });

  it('finds nothing between a version and itself', () => {
    const files = diffVanillaFiles('mc-99.0', 'mc-99.0', after, after);
    expect([files.added, files.removed, files.changed, files.moved]).toEqual([[], [], [], {}]);
  });
});

describe('readFileIndex', () => {
  it('reads nothing for a folder without an index or with another version’s', async () => {
    const folder = join(scratch, 'copied');
    await cp(TO, folder, { recursive: true });
    // A folder copied from another target and not re-synced: its index is for 99.0.
    expect(await readFileIndex(folder, '100.0')).toBeUndefined();
    await rm(join(folder, FILE_INDEX));
    expect(await readFileIndex(folder, '99.0')).toBeUndefined();
  });

  it('refuses a file that is not an index', async () => {
    const folder = join(scratch, 'broken');
    await cp(TO, folder, { recursive: true });
    await writeFile(join(folder, FILE_INDEX), '{"files": [], "version": "99.0"}');
    await expect(readFileIndex(folder, '99.0')).rejects.toThrow(/not a file index/);
  });
});

describe('the command line', () => {
  it('writes the list beside the change set, equal to the expected one', async () => {
    const out = join(scratch, 'run', 'generated.json');
    const lines: string[] = [];
    expect(await main(['--from', FROM, '--to', TO, '--out', out], (l) => lines.push(l))).toBe(0);
    expect(vanillaFilesPath(out)).toBe(join(scratch, 'run', 'generated.vanilla-files.json'));
    expect(await readFile(vanillaFilesPath(out), 'utf8')).toBe(await readFile(EXPECTED, 'utf8'));
    expect(lines).toContain('Vanilla files: 4 added, 2 removed, 1 moved, 2 changed.');
  });

  it('rebuilds it with --check: a stale list fails, a fresh one passes', async () => {
    const out = join(scratch, 'check', 'generated.json');
    expect(await main(['--from', FROM, '--to', TO, '--out', out], () => {})).toBe(0);
    expect(await main(['--from', FROM, '--to', TO, '--out', out, '--check'], () => {})).toBe(0);
    const list = vanillaFilesPath(out);
    const stale = JSON.parse(await readFile(list, 'utf8')) as VanillaFileChanges;
    stale.changed.pop();
    await writeFile(list, `${JSON.stringify(stale, null, 2)}\n`);
    const lines: string[] = [];
    expect(
      await main(['--from', FROM, '--to', TO, '--out', out, '--check'], (l) => lines.push(l)),
    ).toBe(1);
    expect(lines).toContain(`out of date: ${list}`);
  });

  it('writes no list when a target has no file index', async () => {
    const folder = join(scratch, 'no-index');
    await cp(TO, folder, { recursive: true });
    await rm(join(folder, FILE_INDEX));
    const out = join(scratch, 'no-index-out', 'generated.json');
    const lines: string[] = [];
    expect(await main(['--from', FROM, '--to', folder, '--out', out], (l) => lines.push(l))).toBe(
      0,
    );
    await expect(readFile(vanillaFilesPath(out), 'utf8')).rejects.toThrow();
    expect(lines.some((l) => l.startsWith('No file index for both targets'))).toBe(true);
  });
});
