import { defaultFunctionUri } from '@msm/schemas/mcfunction';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it, vi } from 'vitest';
import { createMcfunctionBroker } from '../src/main/platform/mcfunction';
import { createTargetsService } from '../src/main/platform/targets';
import { InvokeChannels, ipcContract } from '../src/shared/ipc-contract';

const targets = createTargetsService();

for (const bundle of builtInTargets) {
  const targetId = bundle.target.id;
  const uri = defaultFunctionUri('msm_sample', 'test', bundle.target.folders.data.function);

  describe(`mcfunction broker over ${targetId}`, () => {
    let reads = 0;
    const broker = createMcfunctionBroker({
      readVendored: (id, key) => {
        reads += 1;
        return targets.readVendored(id, key);
      },
    });

    it('warns on an unknown item and accepts a declared project function', async () => {
      const unknown = await broker.check(targetId, 'give @s minecraft:not_an_item 1', {
        uri,
        projectIds: {},
      });
      expect(unknown).toHaveLength(1);
      expect(unknown[0]?.severity).toBe('warning');
      expect(ipcContract[InvokeChannels.mcfunctionCheck].response.parse(unknown)).toEqual(unknown);

      const source = 'function msm_sample:greet';
      expect(await broker.check(targetId, source, { uri, projectIds: {} })).toHaveLength(1);
      expect(
        await broker.check(targetId, source, {
          uri,
          projectIds: { function: ['msm_sample:greet'] },
        }),
      ).toEqual([]);
    }, 20_000);

    it('caps completions and creates the service once', async () => {
      const completions = await broker.complete(targetId, 'give @s minecraft:', 18, {
        uri,
        projectIds: {},
        limit: 25,
      });
      expect(completions).toHaveLength(25);
      expect(ipcContract[InvokeChannels.mcfunctionComplete].response.parse(completions)).toEqual(
        completions,
      );
      // One read each of commands, blocks and registries across every call above.
      expect(reads).toBe(3);
    }, 20_000);
  });
}

describe('mcfunction broker errors', () => {
  it('rejects unknown targets and retries after a failed start', async () => {
    const readVendored = vi.fn(targets.readVendored);
    let fail = true;
    const createMcfunctionService = vi.fn(async () => {
      if (fail) throw new Error('boom');
      return {
        mcVersion: '0',
        check: async () => [],
        complete: async () => [],
      };
    });
    const broker = createMcfunctionBroker({
      readVendored,
      mcVersionOf: (id) => (id === 'fake' ? '0' : undefined),
      load: async () => ({ createMcfunctionService }),
    });
    const options = { uri: 'file:///a.mcfunction', projectIds: {} };
    await expect(broker.check('nope', '', options)).rejects.toThrow(/Unknown target/);
    readVendored.mockImplementation(async () => new TextEncoder().encode('{}'));
    await expect(broker.check('fake', '', options)).rejects.toThrow(/could not start: boom/);
    fail = false;
    expect(await broker.check('fake', '', options)).toEqual([]);
    expect(await broker.complete('fake', '', 0, options)).toEqual([]);
    expect(createMcfunctionService).toHaveBeenCalledTimes(2);
  });
});
