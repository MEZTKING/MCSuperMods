import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error The staging script is plain JavaScript without declarations.
import { listedVersions, stageRuntimeJars } from '../scripts/stage-runtime.mjs';

let temp: string;
let libs: string;
let versions: string;
let out: string;

beforeEach(async () => {
  temp = await mkdtemp(join(tmpdir(), 'msm-stage-runtime-'));
  libs = join(temp, 'engine-mod', 'build', 'libs');
  versions = join(temp, 'engine-mod', 'versions');
  out = join(temp, 'app', 'build', 'runtime');
  await mkdir(libs, { recursive: true });
  await mkdir(versions, { recursive: true });
  await writeFile(join(versions, '26.3.properties'), 'minecraft_version=26.3\n');
  await writeFile(join(versions, '26.4.properties'), 'minecraft_version=26.4-snapshot-7\n');
});

afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});

async function jar(name: string, seconds: number, contents = name): Promise<void> {
  const path = join(libs, name);
  await writeFile(path, contents);
  await utimes(path, seconds, seconds);
}

describe('stage-runtime', () => {
  it('lists the versions of engine-mod/versions', () => {
    expect(listedVersions(versions)).toEqual(['26.3', '26.4']);
    expect(listedVersions(join(temp, 'missing'))).toEqual([]);
  });

  it('stages the newest jar of each version as msm_runtime-mc-<mc>.jar', async () => {
    await jar('msm_runtime-0.6.0+mc26.3.jar', 1000, 'old 26.3');
    await jar('msm_runtime-0.6.1+mc26.3.jar', 2000, 'new 26.3');
    await jar('msm_runtime-0.6.1+mc26.3-sources.jar', 3000);
    await jar('msm_runtime-0.6.1+mc26.4.jar', 2000, 'new 26.4');
    // A jar staged by an earlier run (the pre-ADR 0038 name) is removed.
    await mkdir(out, { recursive: true });
    await writeFile(join(out, 'msm_runtime.jar'), 'stale');
    const result = await stageRuntimeJars({ libsDir: libs, versionsDir: versions, outDir: out });
    expect(result.missing).toEqual([]);
    expect(result.staged.map((entry: { version: string }) => entry.version)).toEqual([
      '26.3',
      '26.4',
    ]);
    expect((await readdir(out)).sort()).toEqual([
      'msm_runtime-mc-26.3.jar',
      'msm_runtime-mc-26.4.jar',
    ]);
    expect(await readFile(join(out, 'msm_runtime-mc-26.3.jar'), 'utf8')).toBe('new 26.3');
    expect(await readFile(join(out, 'msm_runtime-mc-26.4.jar'), 'utf8')).toBe('new 26.4');
  });

  it('reports the versions without a jar', async () => {
    await jar('msm_runtime-0.6.1+mc26.3.jar', 1000);
    const result = await stageRuntimeJars({ libsDir: libs, versionsDir: versions, outDir: out });
    expect(result.missing).toEqual(['26.4']);
    expect(await readdir(out)).toEqual(['msm_runtime-mc-26.3.jar']);
  });

  it('exits non-zero with --require when a listed version has no jar, zero without it', async () => {
    // A copy of the script and its import in a temporary checkout layout (app/ next to
    // engine-mod/), with the wrapper present and only the 26.3 jar built.
    const appDir = join(temp, 'app');
    const here = resolve(__dirname, '..');
    await mkdir(join(appDir, 'scripts'), { recursive: true });
    await mkdir(join(appDir, 'src', 'main', 'platform'), { recursive: true });
    await writeFile(
      join(appDir, 'scripts', 'stage-runtime.mjs'),
      await readFile(join(here, 'scripts', 'stage-runtime.mjs')),
    );
    await writeFile(
      join(appDir, 'src', 'main', 'platform', 'runtime-jar.ts'),
      await readFile(join(here, 'src', 'main', 'platform', 'runtime-jar.ts')),
    );
    await writeFile(join(appDir, 'package.json'), JSON.stringify({ version: '0.6.1' }));
    const engineMod = join(temp, 'engine-mod');
    await mkdir(join(engineMod, 'gradle', 'wrapper'), { recursive: true });
    await writeFile(join(engineMod, 'gradle', 'wrapper', 'gradle-wrapper.jar'), 'jar');
    await writeFile(join(engineMod, 'gradlew'), '#!/bin/sh');
    await writeFile(join(engineMod, 'gradlew.bat'), '@rem');
    await jar('msm_runtime-0.6.1+mc26.3.jar', 1000);
    const run = (...args: string[]) =>
      spawnSync(process.execPath, [join(appDir, 'scripts', 'stage-runtime.mjs'), ...args], {
        encoding: 'utf8',
      });
    const required = run('--require');
    expect(required.status).toBe(1);
    expect(required.stderr).toContain('no msm_runtime jar for Minecraft 26.4');
    const lenient = run();
    expect(lenient.status).toBe(0);
    expect(lenient.stderr).toContain('no msm_runtime jar for Minecraft 26.4');
    expect((await readdir(out)).sort()).toEqual(['gradle-wrapper', 'msm_runtime-mc-26.3.jar']);
    await jar('msm_runtime-0.6.1+mc26.4.jar', 1000);
    expect(run('--require').status).toBe(0);
  });
});
