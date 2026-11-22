import * as core from '@spyglassmc/core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  createMcfunctionService,
  type McfunctionData,
  type McfunctionService,
} from '../../src/mcfunction/index';

/** `get <holder> <objective>` and `say <message>`, in the misode/mcmeta shape. */
const commands = {
  type: 'root',
  children: {
    get: {
      type: 'literal',
      children: {
        holder: {
          type: 'argument',
          parser: 'minecraft:score_holder',
          properties: { amount: 'single' },
          children: {
            objective: { type: 'argument', parser: 'minecraft:objective', executable: true },
          },
        },
      },
    },
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
  },
};

const data: McfunctionData = { commands, blocks: {}, registries: {} };
const uri = 'file:///msm/data/demo/function/holders.mcfunction';
const projectIds = { objective: ['points'] };

describe('mcfunction service: score holders and a checker that throws', () => {
  let service: McfunctionService;
  const lint = core.VanillaConfig.lint as unknown as Record<string, unknown>;
  const undeclared = lint.undeclaredSymbol;

  beforeAll(async () => {
    service = await createMcfunctionService(data, { mcVersion: '99.1' });
  });

  afterEach(() => {
    lint.undeclaredSymbol = undeclared;
  });

  it('declares fake player names in the function instead of throwing (B547)', async () => {
    expect(await service.check('get #a points', { uri, projectIds })).toEqual([]);
    expect(await service.check('get a points\nget #a points', { uri, projectIds })).toEqual([]);
    expect(await service.complete('get #a ', 7, { uri, projectIds })).toBeInstanceOf(Array);
  });

  it('turns a Spyglass exception into one info problem and keeps the others', async () => {
    // `declare: 'file'` needs a `file` root node, which MSM's parse does not make, so the
    // `undeclaredSymbol` linter throws inside Spyglass on the first undeclared holder.
    lint.undeclaredSymbol = { declare: 'file' };
    const problems = await service.check('get #a points\nsay ok\nget #a', { uri, projectIds });
    const stopped = problems.filter((p) => p.message.includes('stopped early'));
    expect(stopped).toHaveLength(1);
    expect(stopped[0]).toMatchObject({ severity: 'info', code: 'mcfunction.check', line: 0 });
    expect(problems.some((p) => p.severity === 'error' && p.line === 2)).toBe(true);
    await expect(service.complete('get #a ', 7, { uri, projectIds })).resolves.toBeInstanceOf(
      Array,
    );
  });
});
