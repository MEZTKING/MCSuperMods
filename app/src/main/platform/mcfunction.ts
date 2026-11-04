/**
 * The mcfunction broker (ADR 0014): one offline Spyglass `McfunctionService` per target,
 * created on first use. The service module is loaded with `import()` so that start-up does
 * not pay for Spyglass; its data (command tree, block states, registries and the vanilla-mcdoc
 * symbol export, which types text components, item components and NBT inside commands) is read
 * through the targets service, which serves the vendored files of each built-in target.
 *
 * @packageDocumentation
 */

import type {
  McfunctionCompletion,
  McfunctionData,
  McfunctionProblem,
  McfunctionService,
} from '@msm/schemas/mcfunction';
import { targetById } from '@msm/targets';
import type { McfunctionProjectIds, PlatformAdapter } from '../../shared/platform';
import type { TargetsService } from './targets';

/** The broker's public face: the adapter's `mcfunction` service. */
export type McfunctionBroker = PlatformAdapter['mcfunction'];

/** The subset of `@msm/schemas/mcfunction` the broker uses. */
export interface McfunctionModule {
  createMcfunctionService(
    data: McfunctionData,
    options: { mcVersion: string; mcdocSymbols?: unknown },
  ): Promise<McfunctionService>;
}

/** What the broker needs from its host. */
export interface McfunctionBrokerDeps {
  /** Reads one vendored data file of a built-in target. */
  readVendored: TargetsService['readVendored'];
  /** The Minecraft version of a target id. Defaults to the built-in targets. */
  mcVersionOf?(targetId: string): string | undefined;
  /** Loads the service module. Defaults to `import('@msm/schemas/mcfunction')`. */
  load?(): Promise<McfunctionModule>;
}

const decoder = new TextDecoder();

function defaultMcVersionOf(targetId: string): string | undefined {
  return targetById(targetId)?.target.mcVersion;
}

/**
 * Creates the broker. Services are memoised per target; a failed initialisation is not
 * memoised, so the next call retries. Each service serialises its own calls.
 */
export function createMcfunctionBroker(deps: McfunctionBrokerDeps): McfunctionBroker {
  const mcVersionOf = deps.mcVersionOf ?? defaultMcVersionOf;
  const load = deps.load ?? (() => import('@msm/schemas/mcfunction'));
  const services = new Map<string, Promise<McfunctionService>>();

  const readJson = async (
    targetId: string,
    key: 'mcmetaCommands' | 'mcmetaBlocks' | 'mcmetaRegistries' | 'vanillaMcdocSymbols',
  ): Promise<unknown> => JSON.parse(decoder.decode(await deps.readVendored(targetId, key)));

  const create = async (targetId: string): Promise<McfunctionService> => {
    const mcVersion = mcVersionOf(targetId);
    if (mcVersion === undefined) throw new Error(`Unknown target ${JSON.stringify(targetId)}.`);
    const [module, commands, blocks, registries, mcdocSymbols] = await Promise.all([
      load(),
      readJson(targetId, 'mcmetaCommands'),
      readJson(targetId, 'mcmetaBlocks'),
      readJson(targetId, 'mcmetaRegistries'),
      readJson(targetId, 'vanillaMcdocSymbols'),
    ]);
    return module.createMcfunctionService(
      { commands, blocks, registries: registries as Record<string, string[]> },
      { mcVersion, mcdocSymbols },
    );
  };

  const serviceFor = (targetId: string): Promise<McfunctionService> => {
    const existing = services.get(targetId);
    if (existing !== undefined) return existing;
    const promise = create(targetId);
    services.set(targetId, promise);
    promise.catch(() => {
      if (services.get(targetId) === promise) services.delete(targetId);
    });
    return promise;
  };

  const withService = async <T>(
    targetId: string,
    run: (service: McfunctionService) => Promise<T>,
  ): Promise<T> => {
    let service: McfunctionService;
    try {
      service = await serviceFor(targetId);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`The function checker for ${targetId} could not start: ${reason}`);
    }
    return run(service);
  };

  return {
    check(
      targetId: string,
      source: string,
      options: { uri: string; projectIds: McfunctionProjectIds },
    ): Promise<McfunctionProblem[]> {
      return withService(targetId, (service) =>
        service.check(source, { uri: options.uri, projectIds: options.projectIds }),
      );
    },
    complete(
      targetId: string,
      source: string,
      offset: number,
      options: { uri: string; projectIds: McfunctionProjectIds; limit?: number },
    ): Promise<McfunctionCompletion[]> {
      return withService(targetId, (service) =>
        service.complete(source, offset, {
          uri: options.uri,
          projectIds: options.projectIds,
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        }),
      );
    },
  };
}
