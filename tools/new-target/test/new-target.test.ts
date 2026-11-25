/**
 * `new-target` end to end on a copy of the repository's targets, with fixture upstreams and no
 * network: a made `mc-99.0` type-checks and loads, a re-pin changes only vendored data, the
 * change set and the drafts, a dry run writes nothing into the repository, and `VERIFY.md`
 * lists every dated row of the base target's `CHANGES.md`.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { releaseLine } from '../derive.ts';
import { type RunResult, runNewTarget } from '../make.ts';
import { changesRows } from '../verify.ts';
import {
  FIXTURE_MCDOC_REF,
  fixtureFetcher,
  fixtureRepo,
  fixtureSyncers,
  REPO,
} from './fixture-upstream.ts';

const run = promisify(execFile);
const DATE = '2099-01-02';

let root: string;
let made: RunResult;
const logs: string[] = [];

async function files(folder: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) {
        out.set(
          relative(folder, path).split(sep).join('/'),
          createHash('sha256')
            .update(await readFile(path))
            .digest('hex'),
        );
      }
    }
  };
  await walk(folder);
  return out;
}

beforeAll(async () => {
  root = await fixtureRepo();
  made = await runNewTarget({
    root,
    mode: 'new',
    base: 'mc-26.4',
    version: '99.0',
    date: DATE,
    syncers: fixtureSyncers(join(root, 'packages/targets/mc-26.4'), {
      version: '99.0',
      type: 'release',
    }),
    fetcher: fixtureFetcher,
    log: (line) => logs.push(line),
  });
}, 120_000);

afterAll(async () => {
  if (root !== undefined) await rm(join(root, '..'), { recursive: true, force: true });
});

describe('--from: a new target', () => {
  const folder = () => join(root, 'packages/targets/mc-99.0');
  const text = (rel: string) => readFile(join(folder(), rel), 'utf8');

  it('makes packages/targets/mc-99.0 with the identity facts set and the step files left out', async () => {
    expect(made.folder).toBe(folder());
    expect(made.applied).toEqual(
      expect.arrayContaining([
        'id',
        'mcVersion',
        'channel',
        'mcdocRef',
        'mcmetaRef',
        'dataVersion',
        'packFormats.data',
        'packFormats.resource',
        'previous',
      ]),
    );
    const source = await text('src/target.ts');
    expect(source).toContain("const ID = 'mc-99.0';");
    expect(source).toContain("const MC_VERSION = '99.0';");
    expect(source).toContain("previous: 'mc-26.4',");
    expect(source).toContain("channel: 'release',");
    expect(source).toContain(`mcdocRef: '${FIXTURE_MCDOC_REF}',`);
    expect(source).toContain("mcmetaRef: '99.0',");
    expect(source).not.toContain('migrateFrom');
    expect(source).not.toContain("from './migrate'");
    expect(JSON.parse(await text('package.json')).name).toBe('@msm/target-mc-99.0');
    for (const rel of ['src/migrate.ts', 'src/removed-ids.ts', 'test/migrate.test.ts']) {
      await expect(stat(join(folder(), rel))).rejects.toThrow();
    }
    await expect(stat(join(folder(), 'node_modules'))).rejects.toThrow();
  });

  it('type-checks', async () => {
    await writeFile(
      join(folder(), 'tsconfig.check.json'),
      JSON.stringify({
        extends: './tsconfig.json',
        compilerOptions: {
          composite: false,
          declaration: false,
          declarationMap: false,
          emitDeclarationOnly: false,
          noEmit: true,
        },
      }),
    );
    const tsc = createRequire(join(REPO, 'package.json')).resolve('typescript/bin/tsc');
    const result = await run(
      process.execPath,
      [tsc, '-p', join(folder(), 'tsconfig.check.json'), '--pretty', 'false'],
      { maxBuffer: 16 * 1024 * 1024 },
    ).then(
      (r) => ({ ok: true, output: r.stdout + r.stderr }),
      (error: { stdout?: string; stderr?: string }) => ({
        ok: false,
        output: `${error.stdout ?? ''}${error.stderr ?? String(error)}`,
      }),
    );
    expect(result.output).toBe('');
    expect(result.ok).toBe(true);
  }, 180_000);

  it('loads, with the new id, version and previous target and no migration of the old step', async () => {
    const module = (await import(pathToFileURL(join(folder(), 'src/index.ts')).href)) as {
      target: Record<string, unknown>;
    };
    expect(module.target.id).toBe('mc-99.0');
    expect(module.target.mcVersion).toBe('99.0');
    expect(module.target.previous).toBe('mc-26.4');
    expect(module.target.migrateFrom).toBeUndefined();
    const vendored = JSON.parse(await text('vendor/mcmeta/version.json')) as {
      data_version: number;
    };
    expect(module.target.dataVersion).toBe(vendored.data_version);
    const tests = (await readdir(join(folder(), 'test'))).filter((n) => n.endsWith('.test.ts'));
    expect(tests.length).toBeGreaterThan(5);
  });

  it('recomputes the derived facts and reports the planted change', () => {
    const env = made.facts.find((f) => f.fact === 'worldgen.environmentAttributes');
    expect(env?.state).toBe('changed');
    expect(made.facts.find((f) => f.fact === 'commands.vanillaNames')?.state).toBe('same');
    expect(logs.some((l) => l.includes('worldgen.environmentAttributes'))).toBe(true);
  });

  it('writes the generated change set from the base target and its draft', async () => {
    const set = JSON.parse(await text('src/changes/generated.json')) as {
      from: string;
      to: string;
      changes: { id: string }[];
    };
    expect(set.from).toBe('mc-26.4');
    expect(set.to).toBe('mc-99.0');
    expect(set.changes.map((c) => c.id)).toContain(
      'ids:environment_attribute/visual/has_sky_occluder',
    );
    expect(await text('CHANGES-draft.md')).toContain('# Changes from mc-26.4 to mc-99.0');
    expect(await text('src/changes/generated.additions.json')).toContain('fixture_block');
  });

  it('drafts the engine-mod properties and the Fabric facts, each to be verified', async () => {
    const properties = await text('drafts/engine-mod.properties');
    expect(properties).toContain('minecraft_version=99.0');
    expect(properties).toContain('loader_version=0.30.1');
    expect(properties).toContain('fabric_api_version=0.200.10+99.0');
    expect(properties).toContain('loom_version=1.31.0');
    expect(properties).toContain('minecraft_dependency=~99.0');
    expect(properties).toContain('(verify at implementation)');
    const verify = await text('VERIFY.md');
    expect(verify).toContain('| `java` | `27` (verify at implementation)');
  });

  it("lists every dated row of the base target's CHANGES.md in VERIFY.md", async () => {
    const changes = await readFile(join(root, 'packages/targets/mc-26.4/CHANGES.md'), 'utf8');
    const verify = await text('VERIFY.md');
    const dated = changesRows(changes).filter((r) => r.dates.length > 0);
    expect(dated.length).toBeGreaterThan(40);
    for (const row of dated) expect(verify, row.fact).toContain(`- [ ] ${row.fact}:`);
    expect(verify).toContain('`pnpm --filter @msm/target-mc-99.0 test`');
    expect(verify).toContain('`fixtures/sample-mod`');
    expect(verify).toContain('### Wiring a new target');
    expect(await text('CHANGES.md')).toContain('# Target mc-99.0');
  });

  it('refuses to make a target that exists', async () => {
    await expect(
      runNewTarget({
        root,
        mode: 'new',
        base: 'mc-26.4',
        version: '99.0',
        syncers: fixtureSyncers(join(root, 'packages/targets/mc-26.4'), {
          version: '99.0',
          type: 'release',
        }),
        fetcher: fixtureFetcher,
      }),
    ).rejects.toThrow(/exists/);
  });
});

describe('--repin', () => {
  it('changes only the vendored data, the generated change set and the drafts', async () => {
    const folder = join(root, 'packages/targets/mc-26.4');
    const before = await files(folder);
    const pinned = (
      JSON.parse(await readFile(join(folder, 'vendor/mcmeta/version.json'), 'utf8')) as {
        id: string;
      }
    ).id;
    const version = `${releaseLine(pinned)}-pre-1`;
    const result = await runNewTarget({
      root,
      mode: 'repin',
      base: 'mc-26.4',
      version,
      date: DATE,
      mcdocRef: FIXTURE_MCDOC_REF,
      syncers: fixtureSyncers(folder, { version, type: 'snapshot' }),
      fetcher: fixtureFetcher,
    });
    expect(result.folder).toBe(folder);
    const after = await files(folder);
    const touched = [...new Set([...before.keys(), ...after.keys()])].filter(
      (rel) => before.get(rel) !== after.get(rel),
    );
    expect(touched.length).toBeGreaterThan(3);
    const allowed = [
      /^vendor\//,
      /^src\/changes\/generated(\.additions)?\.json$/,
      /^CHANGES-draft\.md$/,
      /^VERIFY\.md$/,
      /^drafts\//,
    ];
    for (const rel of touched)
      expect(
        allowed.some((re) => re.test(rel)),
        rel,
      ).toBe(true);
    expect(after.get('src/target.ts')).toBe(before.get('src/target.ts'));
    const set = JSON.parse(await readFile(join(folder, 'src/changes/generated.json'), 'utf8')) as {
      from: string;
      to: string;
    };
    expect([set.from, set.to]).toEqual(['mc-26.3', 'mc-26.4']);
    expect(touched).toContain(`drafts/since-${pinned}.md`);
    const verify = await readFile(join(folder, 'VERIFY.md'), 'utf8');
    expect(verify).toContain('Re-pinned by `tools/new-target`');
    // The fixture fetcher knows no Fabric build for this version: said, and the run went on.
    expect(verify).toMatch(/`fabric\.loader` \| not read/);
  }, 120_000);
});

describe('--dry-run', () => {
  it('writes the folder outside the repository and nothing into it', async () => {
    const out = await mkdtemp(join(tmpdir(), 'msm-new-target-dry-'));
    try {
      const before = await readdir(join(root, 'packages/targets'));
      const result = await runNewTarget({
        root,
        mode: 'new',
        base: 'mc-26.4',
        version: '99.1-pre-1',
        date: DATE,
        dryRunOut: out,
        syncers: fixtureSyncers(join(root, 'packages/targets/mc-26.4'), {
          version: '99.1-pre-1',
          type: 'snapshot',
        }),
        fetcher: fixtureFetcher,
      });
      expect(result.folder).toBe(join(out, 'mc-99.1'));
      expect(await readdir(join(root, 'packages/targets'))).toEqual(before);
      const source = await readFile(join(result.folder, 'src/target.ts'), 'utf8');
      expect(source).toContain("channel: 'snapshot',");
      expect(await readFile(join(result.folder, 'drafts/engine-mod.properties'), 'utf8')).toContain(
        'minecraft_dependency=>=99.1- <99.2-',
      );
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  }, 120_000);

  it('refuses an output folder inside the repository', async () => {
    await expect(
      runNewTarget({
        root,
        mode: 'new',
        base: 'mc-26.4',
        version: '99.2',
        dryRunOut: join(root, 'out'),
        syncers: fixtureSyncers(join(root, 'packages/targets/mc-26.4'), {
          version: '99.2',
          type: 'release',
        }),
        fetcher: fixtureFetcher,
      }),
    ).rejects.toThrow(/outside the repository/);
  });
});
