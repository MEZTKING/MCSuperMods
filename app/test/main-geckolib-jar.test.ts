import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Downloader } from '@msm/interop';
import { createNodeInstallFileSystem } from '@msm/interop/node';
import type { GeckolibFacts } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  builtInGeckolibFacts,
  createGeckolibJarService,
  GECKOLIB_CACHE_FOLDER,
  geckolibCachePath,
} from '../src/main/platform/geckolib-jar';
import { createNodePlatform, withAtomicWrites } from '../src/main/platform/node-platform';
import { InvokeChannels, ipcContract } from '../src/shared/ipc-contract';

/** Made-up facts; tests never download the real GeckoLib. */
const JAR = new TextEncoder().encode('fake geckolib jar');
const sha512 = (bytes: Uint8Array) => createHash('sha512').update(bytes).digest('hex');
const FACTS: GeckolibFacts = {
  version: '9.9.9',
  modId: 'geckolib',
  dependency: '>=9.9.9',
  fileName: 'geckolib-fabric-9.9-msm-test-9.9.9.jar',
  url: 'https://example.invalid/geckolib-fabric-9.9-msm-test-9.9.9.jar',
  sha512: sha512(JAR),
};

let temp: string;
let cacheDir: string;
let downloads: string[];

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-main-geckolib-'));
  cacheDir = join(temp, 'downloads');
  downloads = [];
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

function serviceWith(download: Downloader, facts: GeckolibFacts | null = FACTS) {
  return createGeckolibJarService({
    fs: withAtomicWrites(createNodeInstallFileSystem()),
    cacheDir,
    download: async (url) => {
      downloads.push(url);
      return download(url);
    },
    facts: () => facts ?? undefined,
  });
}

const cachedPath = () => join(cacheDir, GECKOLIB_CACHE_FOLDER, FACTS.fileName);

describe('GeckoLib jar in main', () => {
  it('downloads the jar once, checks its SHA-512 and caches it', async () => {
    const service = serviceWith(async () => JAR);
    expect(await service.jar('mc-test')).toEqual(JAR);
    expect(downloads).toEqual([FACTS.url]);
    expect(new Uint8Array(await readFile(cachedPath()))).toEqual(JAR);
    // No temporary file of the atomic write is left behind.
    expect(await readdir(join(cacheDir, GECKOLIB_CACHE_FOLDER))).toEqual([FACTS.fileName]);
  });

  it('serves a cache hit without the network', async () => {
    await mkdir(join(cacheDir, GECKOLIB_CACHE_FOLDER), { recursive: true });
    await writeFile(cachedPath(), JAR);
    const service = serviceWith(async () => {
      throw new Error('offline');
    });
    expect(await service.jar('mc-test')).toEqual(JAR);
    expect(downloads).toEqual([]);
  });

  it('refuses a download with a bad hash and caches nothing', async () => {
    const service = serviceWith(async () => new TextEncoder().encode('tampered'));
    expect(await service.jar('mc-test')).toBeNull();
    expect(downloads).toEqual([FACTS.url]);
    await expect(readFile(cachedPath())).rejects.toThrow();
  });

  it('downloads again when the cached copy no longer matches', async () => {
    await mkdir(join(cacheDir, GECKOLIB_CACHE_FOLDER), { recursive: true });
    await writeFile(cachedPath(), 'damaged');
    const service = serviceWith(async () => JAR);
    expect(await service.jar('mc-test')).toEqual(JAR);
    expect(downloads).toEqual([FACTS.url]);
    expect(new Uint8Array(await readFile(cachedPath()))).toEqual(JAR);
  });

  it('is null offline with nothing cached', async () => {
    const service = serviceWith(async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    });
    expect(await service.jar('mc-test')).toBeNull();
  });

  it('is null without GeckoLib facts or with an unsafe file name', async () => {
    expect(await serviceWith(async () => JAR, null).jar('mc-test')).toBeNull();
    expect(
      await serviceWith(async () => JAR, { ...FACTS, fileName: '../escape.jar' }).jar('mc-test'),
    ).toBeNull();
    expect(downloads).toEqual([]);
    expect(geckolibCachePath(cacheDir, { ...FACTS, fileName: 'a/b.jar' })).toBeNull();
  });

  it('shares one download between concurrent requests', async () => {
    const service = serviceWith(async () => JAR);
    const [a, b] = await Promise.all([service.jar('mc-test'), service.jar('mc-test')]);
    expect(a).toEqual(JAR);
    expect(b).toEqual(JAR);
    expect(downloads).toEqual([FACTS.url]);
  });

  it('reads the built-in targets’ GeckoLib facts', () => {
    for (const bundle of builtInTargets) {
      expect(builtInGeckolibFacts(bundle.target.id)).toEqual(bundle.target.geckolib);
    }
    expect(builtInGeckolibFacts('mc-0.0-missing')).toBeUndefined();
  });

  it('is served by the platform from the shared download cache, and over IPC as bytes', async () => {
    const target = builtInTargets.find((bundle) => bundle.target.geckolib !== undefined)?.target;
    if (target?.geckolib === undefined) throw new Error('No built-in target has GeckoLib facts.');
    const real = target.geckolib;
    // The platform asks the built-in facts; serve bytes whose hash will not match them, so
    // nothing is cached and the result is null without reaching the network.
    const platform = createNodePlatform({
      info: async () => ({ version: '0', electron: '0', platform: 'test' }),
      dialogs: {
        pickDirectory: async () => null,
        confirmDiscard: async () => true,
        openFiles: async () => [],
        saveFilePath: async () => null,
      },
      showItemInFolder: () => {},
      resizePng: (png) => png,
      msmHome: join(temp, 'msm-home'),
      installEnv: { platform: 'linux', home: join(temp, 'home') },
      testInMinecraft: {
        cacheDir,
        download: async (url) => {
          downloads.push(url);
          return JAR;
        },
      },
    });
    expect(await platform.exports.geckolibJar(target.id)).toBeNull();
    expect(downloads).toEqual([real.url]);
    expect(await platform.exports.geckolibJar('mc-0.0-missing')).toBeNull();
    const schema = ipcContract[InvokeChannels.exportsGeckolibJar];
    expect(schema.request.safeParse({ targetId: target.id }).success).toBe(true);
    expect(schema.response.safeParse(JAR).success).toBe(true);
    expect(schema.response.safeParse(null).success).toBe(true);
  });
});
