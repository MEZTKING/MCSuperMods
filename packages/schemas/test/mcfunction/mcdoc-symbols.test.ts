import { beforeAll, describe, expect, it } from 'vitest';
import {
  createMcfunctionService,
  type McfunctionData,
  type McfunctionService,
} from '../../src/mcfunction/index';
import { readMcdocSymbolExport } from '../../src/mcfunction/mcdoc-symbols';

/** A tiny tree: `tell <component>` and `place <block_state>`. */
const commands = {
  type: 'root',
  children: {
    tell: {
      type: 'literal',
      children: {
        message: { type: 'argument', parser: 'minecraft:component', executable: true },
      },
    },
    place: {
      type: 'literal',
      children: {
        block: { type: 'argument', parser: 'minecraft:block_state', executable: true },
      },
    },
  },
};

const blocks = { lamp: [{ lit: ['true', 'false'] }, { lit: 'false' }], dirt: [{}, {}] };
const data: McfunctionData = { commands, blocks, registries: { block: ['lamp', 'dirt'] } };

function since(version: string) {
  return {
    name: 'since',
    value: { kind: 'literal', value: { kind: 'string', value: version } },
  };
}

/** A hand-written export in the `mcdoc-cli export symbols.json` shape. */
const mcdocSymbols = {
  mcdoc: {
    '::java::util::text::Text': {
      kind: 'struct',
      fields: [
        { kind: 'pair', key: 'text', type: { kind: 'string' } },
        { kind: 'pair', key: 'bold', optional: true, type: { kind: 'boolean' } },
        // Gated after the fictional version below, so it is unknown there.
        {
          kind: 'pair',
          key: 'future',
          optional: true,
          attributes: [since('100.0')],
          type: { kind: 'string' },
        },
      ],
    },
  },
  'mcdoc/dispatcher': {},
};

// A fictional version string: the service only compares it with release gates.
const mcVersion = '99.1';

describe('mcfunction service with an mcdoc symbol export', () => {
  let service: McfunctionService;
  let bare: McfunctionService;

  beforeAll(async () => {
    service = await createMcfunctionService(data, { mcVersion, mcdocSymbols });
    bare = await createMcfunctionService(data, { mcVersion });
  });

  it('types JSON text components', async () => {
    expect(await service.check('tell {"text":"hi","bold":true}')).toEqual([]);
    const wrong = await service.check('tell {"text":1}');
    expect(wrong.some((p) => p.severity === 'error' && p.code === 'mcfunction.check')).toBe(true);
    expect(await bare.check('tell {"text":1}')).toEqual([]);
  });

  it('gates fields by the target version', async () => {
    const problems = await service.check('tell {"text":"a","future":"b"}');
    expect(problems.map((p) => p.severity)).toEqual(['warning']);
    expect(problems[0]?.start).toBe(17);
  });

  it('checks block-state properties with or without the export', async () => {
    for (const s of [service, bare]) {
      expect(await s.check('place lamp[lit=true]')).toEqual([]);
      const value = await s.check('place lamp[lit=maybe]');
      expect(value).toHaveLength(1);
      expect(value[0]).toMatchObject({ severity: 'error', code: 'mcfunction.check', start: 15 });
      const property = await s.check('place dirt[lit=true]');
      expect(property).toHaveLength(1);
      expect(property[0]?.message).toContain('has no properties');
    }
  });

  it('rejects an export without the expected categories', async () => {
    expect(() => readMcdocSymbolExport([])).toThrow(/not a JSON object/);
    expect(() => readMcdocSymbolExport({ mcdoc: {} })).toThrow(/mcdoc\/dispatcher/);
    expect(() => readMcdocSymbolExport({ mcdoc: {}, 'mcdoc/dispatcher': { a: 1 } })).toThrow(
      /dispatcher "a"/,
    );
    await expect(
      createMcfunctionService(data, { mcVersion, mcdocSymbols: { mcdoc: 1 } }),
    ).rejects.toThrow(/"mcdoc" object/);
  });
});
