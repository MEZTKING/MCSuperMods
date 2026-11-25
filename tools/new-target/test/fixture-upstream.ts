/**
 * Offline upstreams for the tests: a copy of the repository's targets in a temporary folder,
 * vendoring steps that serve a newer version made from a target's own vendored files with a few
 * planted changes, and a fetcher that answers from `fixtures/` and refuses everything else.
 */
import { cp, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringifySorted } from '../../shared/download.ts';
import type { FetchFile } from '../../sync-mcmeta/index.ts';
import { FABRIC_API_METADATA, FABRIC_META, LOOM_METADATA } from '../fabric-meta.ts';
import { defaultSyncers, type FetchText, MANIFEST_URL, type Syncers } from '../upstream.ts';

export const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

/** The vanilla-mcdoc commit the fixture upstream claims. */
export const FIXTURE_MCDOC_REF = 'f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1';

/** Every URL the fixture fetcher answers, and the file it answers with. */
const ANSWERS: Record<string, string> = {
  [MANIFEST_URL]: 'manifest.json',
  'https://piston-meta.mojang.com/v1/packages/fixture/99.0.json': 'version-99.0.json',
  [`${FABRIC_META}/versions/loader/99.0`]: 'fabric-loader.json',
  [FABRIC_API_METADATA]: 'fabric-api-maven-metadata.xml',
  [LOOM_METADATA]: 'loom-maven-metadata.xml',
};

/** The fetcher: fixture answers, and an error for any other URL (the tests are offline). */
export const fixtureFetcher: FetchText = async (url) => {
  const file = ANSWERS[url];
  if (file === undefined) throw new Error(`offline in tests: ${url}`);
  return await readFile(join(FIXTURES, file), 'utf8');
};

/**
 * A temporary repository: `tsconfig.base.json`, the named target folders copied whole (without
 * installs), `mc-26.3`'s vendored data only, two fixture folders, `node_modules` linked to the
 * real target's installs and the packages the targets' tsconfig references linked to the real
 * ones, so a made folder resolves its workspace imports.
 */
export async function fixtureRepo(): Promise<string> {
  const root = join(await mkdtemp(join(tmpdir(), 'msm-new-target-test-')), 'repo');
  const targets = join(root, 'packages', 'targets');
  await mkdir(targets, { recursive: true });
  await cp(join(REPO, 'tsconfig.base.json'), join(root, 'tsconfig.base.json'));
  await cp(join(REPO, 'packages/targets/mc-26.4'), join(targets, 'mc-26.4'), {
    recursive: true,
    filter: (source) => !source.includes(`${join('mc-26.4', 'node_modules')}`),
  });
  await cp(join(REPO, 'packages/targets/mc-26.3/vendor'), join(targets, 'mc-26.3', 'vendor'), {
    recursive: true,
  });
  for (const name of ['sample-mod', 'worldgen-parity']) {
    await mkdir(join(root, 'fixtures', name), { recursive: true });
  }
  await symlink(join(REPO, 'packages/targets/mc-26.4/node_modules'), join(root, 'node_modules'));
  // The targets' tsconfig references these; the transform and tsc read them.
  for (const name of ['plugin-api', 'schemas', 'core']) {
    await symlink(join(REPO, 'packages', name), join(root, 'packages', name));
  }
  return root;
}

/** How the fixture upstream differs from the target it is made from. */
export interface Plant {
  /** The version it claims to be. */
  version: string;
  type: 'release' | 'snapshot';
}

/**
 * Vendoring steps serving `plant.version` from `source`'s own vendored files, with one
 * environment attribute removed, one block id added and the data version and pack formats
 * raised. The mcmeta step is the real `sync-mcmeta`, given a fixture `fetchFile`; the mcdoc and
 * feature order steps copy the files with the fixture ref.
 */
export function fixtureSyncers(source: string, plant: Plant): Syncers {
  const mcmeta = join(source, 'vendor', 'mcmeta');
  const read = async (name: string) =>
    JSON.parse(await readFile(join(mcmeta, name), 'utf8')) as Record<string, unknown>;
  const fetchFile: FetchFile = async (_repository, ref, path) => {
    if (ref !== `${plant.version}-summary`) throw new Error(`no tag ${ref}`);
    let value: unknown;
    if (path === 'version.json') {
      const v = await read('version.json');
      value = {
        ...v,
        id: plant.version,
        name: plant.version,
        type: plant.type,
        stable: plant.type === 'release',
        data_version: (v.data_version as number) + 10,
        data_pack_version: (v.data_pack_version as number) + 1,
        resource_pack_version: (v.resource_pack_version as number) + 1,
      };
    } else if (path === 'registries/data.min.json') {
      const r = (await read('registries.json')) as Record<string, string[]>;
      value = {
        ...r,
        environment_attribute: (r.environment_attribute ?? []).filter(
          (id) => id !== 'visual/has_sky_occluder',
        ),
        block: [...(r.block ?? []), 'fixture_block'].sort(),
      };
    } else if (path === 'commands/data.min.json') value = await read('commands.json');
    else if (path === 'blocks/data.min.json') value = await read('blocks.json');
    else throw new Error(`no file ${path}`);
    return { text: JSON.stringify(value), url: `fixture:${ref}/${path}` };
  };
  return {
    ...defaultSyncers({ fetchFile }),
    async mcdoc(ref, out) {
      const symbols = JSON.parse(
        await readFile(join(source, 'vendor', 'vanilla-mcdoc', 'symbols.json'), 'utf8'),
      ) as Record<string, unknown>;
      await mkdir(out, { recursive: true });
      await writeFile(join(out, 'symbols.json'), stringifySorted({ ...symbols, ref }));
      await writeFile(join(out, 'LICENSE'), 'fixture licence\n');
      await writeFile(
        join(out, 'SOURCE.json'),
        stringifySorted({ fetchedAt: 'fixture', mode: 'build', ref, repository: 'fixture' }),
      );
    },
    async featureOrder(version, outFile) {
      const order = JSON.parse(
        await readFile(join(source, 'vendor', 'worldgen', 'feature-order.json'), 'utf8'),
      ) as { source: Record<string, unknown>; steps: string[][] };
      await writeFile(
        outFile,
        stringifySorted({ ...order, source: { ...order.source, ref: `${version}-summary` } }),
      );
    },
    async latestMcdocRef() {
      return FIXTURE_MCDOC_REF;
    },
  };
}
