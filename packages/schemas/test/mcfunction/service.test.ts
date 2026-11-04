import { beforeAll, describe, expect, it } from 'vitest';
import {
  createMcfunctionService,
  DEFAULT_COMPLETION_LIMIT,
  defaultFunctionUri,
  MAX_SOURCE_LENGTH,
  type McfunctionData,
  type McfunctionService,
} from '../../src/mcfunction/index';

/** A tiny hand-written Brigadier tree in the misode/mcmeta shape. */
const commands = {
  type: 'root',
  children: {
    say: {
      type: 'literal',
      children: {
        message: {
          type: 'argument',
          parser: 'brigadier:string',
          properties: { type: 'greedy' },
          executable: true,
        },
      },
    },
    add: {
      type: 'literal',
      children: {
        a: {
          type: 'argument',
          parser: 'brigadier:integer',
          children: {
            b: { type: 'argument', parser: 'brigadier:integer', executable: true },
          },
        },
      },
    },
    function: {
      type: 'literal',
      children: { name: { type: 'argument', parser: 'minecraft:function', executable: true } },
    },
  },
};

const data: McfunctionData = { commands, blocks: {}, registries: { item: ['stone'] } };
// A fictional version string: the service only compares it with Spyglass's release gates.
const mcVersion = '99.1';
const uri = defaultFunctionUri('demo', 'main', 'function');

describe('mcfunction service (hand-written command tree)', () => {
  let service: McfunctionService;

  beforeAll(async () => {
    service = await createMcfunctionService(data, { mcVersion });
  });

  it('exposes its version and builds function URIs', () => {
    expect(service.mcVersion).toBe(mcVersion);
    expect(defaultFunctionUri('ns', 'a/b', 'function')).toBe(
      'file:///msm/data/ns/function/a/b.mcfunction',
    );
  });

  it('accepts an empty source and a comment-only source', async () => {
    expect(await service.check('', { uri })).toEqual([]);
    expect(await service.check('# just a comment\n\n# another', { uri })).toEqual([]);
  });

  it('accepts valid commands', async () => {
    expect(await service.check('say hello world\nadd 1 2', { uri })).toEqual([]);
  });

  it('reports parse errors with line-relative positions', async () => {
    const problems = await service.check('say ok\nadd 1 x', { uri });
    expect(problems.length).toBeGreaterThan(0);
    for (const p of problems) {
      expect(p.severity).toBe('error');
      expect(p.code).toBe('mcfunction.parse');
      expect(p.line).toBe(1);
      expect(p.start).toBe(p.offset.start - 7);
      expect(p.end).toBeGreaterThanOrEqual(p.start);
    }
    expect(problems.some((p) => p.start === 6)).toBe(true);
  });

  it('reports an unknown command as an error', async () => {
    const problems = await service.check('bogus command', { uri });
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.every((p) => p.severity === 'error')).toBe(true);
  });

  it('parses a macro line and a line continuation', async () => {
    expect(await service.check('$say $(name)', { uri })).toEqual([]);
    expect(await service.check('add 1 \\\n    2', { uri })).toEqual([]);
  });

  it('warns on an unknown function and accepts a declared project id', async () => {
    const source = 'function demo:missing';
    const unknown = await service.check(source, { uri });
    expect(unknown).toHaveLength(1);
    expect(unknown[0]).toMatchObject({
      severity: 'warning',
      code: 'mcfunction.lint.undeclaredSymbol',
      line: 0,
      start: 9,
      end: 21,
    });
    expect(
      await service.check(source, { uri, projectIds: { function: ['demo:missing'] } }),
    ).toEqual([]);
    expect(await service.check(source, { uri })).toHaveLength(1);
  });

  it('serialises concurrent calls', async () => {
    const results = await Promise.all([
      service.check('function demo:a', { uri, projectIds: { function: ['demo:a'] } }),
      service.check('function demo:a', { uri }),
      service.check('function demo:a', { uri, projectIds: { function: ['demo:a'] } }),
    ]);
    expect(results.map((r) => r.length)).toEqual([0, 1, 0]);
  });

  it('completes root commands, filtered by the typed prefix', async () => {
    const all = await service.complete('', 0);
    expect(all.map((c) => c.label)).toEqual(['add', 'function', 'say']);
    expect(all[0]).toMatchObject({ insertText: 'add', kind: 'keyword' });
    const filtered = await service.complete('sa', 2);
    expect(filtered.map((c) => c.label)).toEqual(['say']);
  });

  it('completes project ids and caps the result', async () => {
    const ids = Array.from({ length: 300 }, (_, i) => `demo:f${String(i).padStart(3, '0')}`);
    const source = 'function demo:f';
    const capped = await service.complete(source, source.length, {
      projectIds: { function: ids },
    });
    expect(capped).toHaveLength(DEFAULT_COMPLETION_LIMIT);
    expect(capped.every((c) => c.label.startsWith('demo:f'))).toBe(true);
    const few = await service.complete(source, source.length, {
      projectIds: { function: ids },
      limit: 5,
    });
    expect(few.map((c) => c.label)).toEqual(ids.slice(0, 5));
    const narrowed = await service.complete('function demo:f29', 17, {
      projectIds: { function: ids },
    });
    expect(narrowed.map((c) => c.label)).toEqual(ids.slice(290, 300));
  });

  it('refuses to parse a source over the size limit', async () => {
    const big = 'say x\n'.repeat(Math.ceil((MAX_SOURCE_LENGTH + 1) / 6));
    const problems = await service.check(big, { uri });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ severity: 'error', code: 'mcfunction.parse', line: 0 });
    expect(await service.complete(big, 0)).toEqual([]);
  });
});
