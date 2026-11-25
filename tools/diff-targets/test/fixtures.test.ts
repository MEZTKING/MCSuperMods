/**
 * A made pair of targets (`test/fixtures/mc-98.0` and `mc-99.0`, invented data) with a rename,
 * a field move, a moved registry, command and block state changes, diffed as expected; and the
 * command line, `--check` included. `UPDATE_GOLDENS=1` rewrites the expected files.
 */
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { additionsPath, main, parseArgs } from '../cli.ts';
import { commandReportFormat, diffCommands, flattenCommands } from '../commands.ts';
import { diffTargets, readTarget, type TargetDiff } from '../diff.ts';
import type { TargetChange } from '../types.ts';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const FROM = join(fixtures, 'mc-98.0');
const TO = join(fixtures, 'mc-99.0');
const EXPECTED = join(fixtures, 'expected.json');
const EXPECTED_DRAFT = join(fixtures, 'expected-draft.md');

let diff: TargetDiff;
const find = (id: string): TargetChange | undefined =>
  diff.changeSet.changes.find((c) => c.id === id);
let scratch: string;

beforeAll(async () => {
  diff = diffTargets(await readTarget(FROM), await readTarget(TO));
  scratch = await mkdtemp(join(tmpdir(), 'diff-targets-'));
  if (process.env.UPDATE_GOLDENS === '1') {
    const code = await main(
      ['--from', FROM, '--to', TO, '--out', EXPECTED, '--draft', EXPECTED_DRAFT],
      () => {},
    );
    expect(code).toBe(0);
  }
});

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('diff-targets on a made pair', () => {
  it('finds the invented rename, with the same shape and still registered elsewhere', () => {
    expect(find('ids:worldgen/feature_type/ore')).toEqual({
      id: 'ids:worldgen/feature_type/ore',
      area: 'ids',
      what: 'member-removed',
      registry: 'worldgen/feature_type',
      subject: 'worldgen/feature_type/ore',
      from: 'ore',
      stillIn: ['worldgen/feature'],
      handling: 'manual',
      source: 'registries',
      candidate: { kind: 'rename', to: 'mineral_vein', name: 0, shape: 'same' },
    });
    expect(find('ids:rule_test')).toMatchObject({ what: 'registry-moved', to: 'rule_test_type' });
    expect(find('ids:fluid/flowing_water')?.candidate).toBeUndefined();
  });

  it('finds the invented field move as a candidate on the removed field', () => {
    expect(find('formats:minecraft:resource/worldgen/noise_settings#/sea_level')).toMatchObject({
      what: 'field-removed',
      candidate: { kind: 'field-move', to: '/sea_height', name: 0.33, shape: 'same' },
    });
    expect(find('formats:minecraft:resource/worldgen/noise_settings#/sea_height')?.what).toBe(
      'field-addedRequired',
    );
    expect(
      find('formats:minecraft:resource/worldgen/noise_settings#/legacy')?.candidate,
    ).toBeUndefined();
    expect(find('formats:minecraft:feature_config/spike#/height')?.what).toBe('field-madeOptional');
    expect(find('formats:minecraft:feature_config/spike#/base')?.what).toBe('field-addedRequired');
  });

  it('finds the invented command and block state changes', () => {
    expect(find('commands:give <targets> <item> <count>')).toMatchObject({
      what: 'argument-changed',
      from: 'brigadier:integer exec',
      to: 'brigadier:integer{"min":1} exec',
    });
    expect(find('commands:oldcmd')?.what).toBe('root-removed');
    expect(diff.additions.map((a) => a.id)).toContain('commands:newcmd');
    expect(find('block-states:lamp#lit')?.what).toBe('property-added');
    expect(find('block-states:slab#type')).toMatchObject({
      what: 'values-changed',
      handling: 'manual',
    });
    expect(find('block-states:door#open')).toMatchObject({
      what: 'default-changed',
      from: 'false',
      to: 'true',
    });
    expect(diff.changeSet.additions).toEqual({
      'commands:(paths)': 1,
      'ids:(registries)': 1,
      'ids:block': 1,
      'ids:block_sound_set': 1,
      'ids:item': 1,
      'ids:worldgen/feature_type': 1,
    });
  });

  it('gives the same changes by the two refs as by the gated tree', async () => {
    const refs = diffTargets(await readTarget(FROM), await readTarget(TO), { mcdoc: 'refs' });
    expect(refs.mcdocMode).toBe('refs');
    expect(refs.changeSet.changes).toEqual(diff.changeSet.changes);
  });

  it('writes files equal to the expected ones, and --check agrees', async () => {
    const out = join(scratch, 'generated.json');
    const draft = join(scratch, 'CHANGES-draft.md');
    const lines: string[] = [];
    const args = ['--from', FROM, '--to', TO, '--out', out, '--draft', draft];
    expect(await main(args, (l) => lines.push(l))).toBe(0);
    expect(await readFile(out, 'utf8')).toBe(await readFile(EXPECTED, 'utf8'));
    expect(await readFile(additionsPath(out), 'utf8')).toBe(
      await readFile(additionsPath(EXPECTED), 'utf8'),
    );
    expect(await readFile(draft, 'utf8')).toBe(await readFile(EXPECTED_DRAFT, 'utf8'));
    expect(await main([...args, '--check'], () => {})).toBe(0);
    await writeFile(out, '{}\n');
    const report: string[] = [];
    expect(await main([...args, '--check'], (l) => report.push(l))).toBe(1);
    expect(report[0]).toBe(`out of date: ${out}`);
  });

  it('fails with code 2 on bad arguments and unreadable folders', async () => {
    expect(() => parseArgs(['--from', FROM])).toThrow(/both target folders/);
    expect(() => parseArgs(['--from', FROM, '--to', TO, '--check'])).toThrow(/--check needs/);
    expect(() => parseArgs(['--from', FROM, '--to', TO, '--mcdoc', 'x'])).toThrow(/gated or refs/);
    expect(await main(['--bogus'], () => {})).toBe(2);
    const empty = join(scratch, 'empty');
    await cp(FROM, empty, { recursive: true });
    await rm(join(empty, 'vendor', 'mcmeta', 'version.json'));
    expect(await main(['--from', empty, '--to', TO], () => {})).toBe(2);
  });
});

describe('the command report formats', () => {
  /** `tp <target>` in the format of every vendored target. */
  const parserProperties = {
    type: 'root',
    children: {
      tp: {
        type: 'literal',
        children: {
          target: {
            type: 'argument',
            parser: 'minecraft:entity',
            properties: { amount: 'single' },
            executable: true,
          },
        },
      },
    },
  };
  /** The same in mcmeta's format from 26.4-snapshot-8 (argument nested, permissions). */
  const nestedArgument = {
    type: 'root',
    children: {
      tp: {
        type: 'literal',
        permissions: { level: 2 },
        children: {
          target: {
            type: 'argument',
            argument: { type: 'minecraft:entity', amount: 'single' },
            executable: true,
          },
        },
      },
    },
  };

  it('tells the two formats apart', () => {
    expect(commandReportFormat(parserProperties)).toBe('parser-properties');
    expect(commandReportFormat(nestedArgument)).toBe('nested-argument');
  });

  it('flattens a nested argument to its parser and properties, so the shape alone is no change', () => {
    expect([...flattenCommands(nestedArgument)]).toEqual([
      ['tp', 'literal'],
      ['tp <target>', 'minecraft:entity{"amount":"single"} exec'],
    ]);
    const diff = diffCommands(parserProperties, nestedArgument);
    expect(diff.changes).toEqual([]);
    expect(diff.formats).toEqual({ before: 'parser-properties', after: 'nested-argument' });
  });

  it('maps the nested format renames, so only what Mojang changed is a change (B831)', () => {
    const before = {
      type: 'root',
      children: {
        recipe: {
          type: 'literal',
          children: {
            count: { type: 'argument', parser: 'brigadier:integer', properties: { min: 1 } },
            name: { type: 'argument', parser: 'brigadier:string', properties: { type: 'word' } },
            who: {
              type: 'argument',
              parser: 'minecraft:entity',
              properties: { amount: 'single', type: 'players' },
            },
            recipe: {
              type: 'argument',
              parser: 'minecraft:resource_key',
              properties: { registry: 'minecraft:recipe' },
            },
          },
        },
      },
    };
    const after = {
      type: 'root',
      children: {
        recipe: {
          type: 'literal',
          permissions: { type: 'minecraft:always_pass' },
          children: {
            count: { type: 'argument', argument: { type: 'minecraft:integer', min: 1 } },
            name: { type: 'argument', argument: { type: 'minecraft:word' } },
            who: {
              type: 'argument',
              argument: { type: 'minecraft:entity', players_only: true, single_result: true },
            },
            recipe: {
              type: 'argument',
              argument: { type: 'minecraft:resource', registry: 'minecraft:recipe' },
              custom_suggestion: { type: 'minecraft:ask_server' },
            },
          },
        },
      },
    };
    const diff = diffCommands(before, after);
    expect(diff.changes.map((c) => [c.subject, c.from, c.to])).toEqual([
      [
        'recipe <recipe>',
        'minecraft:resource_key{"registry":"minecraft:recipe"}',
        'minecraft:resource{"registry":"minecraft:recipe"}',
      ],
    ]);
    expect(diff.additions).toEqual([]);
  });
});
