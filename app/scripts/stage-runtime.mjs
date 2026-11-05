// Stages the msm_runtime jars for packaging (ADR 0026 D4, ADR 0038 D4): copies the newest
// `engine-mod/build/libs/msm_runtime-<version>+mc<mc>.jar` of every Minecraft version (not
// `-sources` or `-dev`) to `app/build/runtime/msm_runtime-mc-<mc>.jar`. `electron-builder.yml`
// ships the folder `build/runtime/` as the `extraResources` folder `runtime/`, where
// `src/main/platform/runtime-jar.ts` finds the jar of the project's target. Build each version
// first (`./gradlew build` and `./gradlew build -Pmc=<mc>` in `engine-mod/`). Without a jar for
// a version it only warns: the packaged app then reports `export.runtime-missing` for that
// target unless "Separate runtime and GeckoLib (for modpacks)" is chosen.
//
// It also stages the Gradle wrapper the Java project export copies (ADR 0033 D2):
// `engine-mod/gradle/wrapper/gradle-wrapper.jar`, `engine-mod/gradlew` and
// `engine-mod/gradlew.bat` to `app/build/runtime/gradle-wrapper/`, shipped as
// `runtime/gradle-wrapper/`. Without them the export writes projects without the wrapper.
//
// `--require` (for release builds) fails instead of warning when any version listed in
// `engine-mod/versions/<mc>.properties` has no jar (or a wrapper file is missing).
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { newestRuntimeJars, stagedRuntimeJarName } from '../src/main/platform/runtime-jar.ts';

/** The Minecraft versions `engine-mod/versions/` lists (`<mc>.properties`), sorted. */
export function listedVersions(versionsDir) {
  let names;
  try {
    names = readdirSync(versionsDir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith('.properties'))
    .map((name) => name.slice(0, -'.properties'.length))
    .sort();
}

/**
 * Stages every runtime jar of `libsDir` into `outDir` as `msm_runtime-mc-<mc>.jar`, after
 * removing any runtime jar an earlier run staged there (it may be another version).
 *
 * @returns `{ staged: { version, from, to }[], missing: string[] }`: `missing` lists the
 *   versions of `versionsDir` without a jar.
 */
export async function stageRuntimeJars({ libsDir, versionsDir, outDir }) {
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(outDir)) {
    if (/^msm_runtime.*\.jar$/.test(name)) rmSync(join(outDir, name), { force: true });
  }
  const jars = await newestRuntimeJars(libsDir);
  const staged = [];
  for (const [version, from] of [...jars].sort(([a], [b]) => a.localeCompare(b))) {
    const to = join(outDir, stagedRuntimeJarName(version));
    copyFileSync(from, to);
    staged.push({ version, from, to });
  }
  const missing = listedVersions(versionsDir).filter((version) => !jars.has(version));
  return { staged, missing };
}

/** Copies the Gradle wrapper; returns the missing source files (nothing is copied then). */
function stageWrapper(engineModDir, wrapperDir) {
  const files = [
    [join(engineModDir, 'gradle', 'wrapper', 'gradle-wrapper.jar'), 'gradle-wrapper.jar'],
    [join(engineModDir, 'gradlew'), 'gradlew'],
    [join(engineModDir, 'gradlew.bat'), 'gradlew.bat'],
  ];
  rmSync(wrapperDir, { recursive: true, force: true });
  const missing = files.filter(([from]) => !existsSync(from)).map(([from]) => from);
  if (missing.length > 0) return missing;
  mkdirSync(wrapperDir, { recursive: true });
  for (const [from, name] of files) copyFileSync(from, join(wrapperDir, name));
  return [];
}

async function main() {
  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const engineModDir = join(appDir, '..', 'engine-mod');
  const outDir = join(appDir, 'build', 'runtime');
  const required = process.argv.includes('--require');
  const fail = (message) => {
    if (required) {
      console.error(message);
      process.exit(1);
    }
    console.warn(message);
  };

  const wrapperDir = join(outDir, 'gradle-wrapper');
  const missingWrapper = stageWrapper(engineModDir, wrapperDir);
  if (missingWrapper.length > 0) {
    fail(
      `MSM stage-runtime: Gradle wrapper file(s) missing: ${missingWrapper.join(', ')}; the app is packaged without the wrapper.`,
    );
  } else {
    console.log(`MSM stage-runtime: staged the Gradle wrapper in ${wrapperDir}.`);
  }

  const libsDir = join(engineModDir, 'build', 'libs');
  const { staged, missing } = await stageRuntimeJars({
    libsDir,
    versionsDir: join(engineModDir, 'versions'),
    outDir,
  });
  const { version } = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'));
  for (const entry of staged) {
    const expected = `msm_runtime-${version}+mc${entry.version}.jar`;
    if (basename(entry.from) !== expected) {
      // ADR 0026 D4: the runtime carries the app's version.
      console.warn(
        `MSM stage-runtime: ${basename(entry.from)} does not match the app version (${expected}).`,
      );
    }
    console.log(`MSM stage-runtime: staged ${entry.from} as ${entry.to}.`);
  }
  if (missing.length > 0) {
    fail(
      `MSM stage-runtime: no msm_runtime jar for Minecraft ${missing.join(', ')} in ${libsDir}; the app is packaged without it. Build it with ./gradlew build -Pmc=<version> in engine-mod/.`,
    );
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
