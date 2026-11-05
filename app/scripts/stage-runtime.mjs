// Stages the msm_runtime jar for packaging (ADR 0026 D4): copies the newest
// `engine-mod/build/libs/msm_runtime-<version>.jar` (not `-sources` or `-dev`) to
// `app/build/runtime/msm_runtime.jar`, which `electron-builder.yml` ships as the
// `extraResources` file `runtime/msm_runtime.jar`. Run `./gradlew build` in `engine-mod/`
// first. Without a runtime jar it only warns: electron-builder then skips the missing file
// (with its own "file source doesn't exist" warning) and the packaged app reports
// `export.runtime-missing` unless "Separate runtime (for modpacks)" is chosen.
//
// `--require` (for release builds) fails instead of warning when no jar is found.
import { copyFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newestRuntimeJar } from '../src/main/platform/runtime-jar.ts';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const libsDir = join(appDir, '..', 'engine-mod', 'build', 'libs');
const staged = join(appDir, 'build', 'runtime', 'msm_runtime.jar');
const required = process.argv.includes('--require');

const source = await newestRuntimeJar(libsDir);
if (source === null) {
  // Never ship a jar staged by an earlier build: it may be another version.
  rmSync(staged, { force: true });
  const message = `MSM stage-runtime: no msm_runtime jar in ${libsDir}; the app is packaged without it.`;
  if (required) {
    console.error(`${message} Build it with ./gradlew build in engine-mod/.`);
    process.exit(1);
  }
  console.warn(message);
  process.exit(0);
}

mkdirSync(dirname(staged), { recursive: true });
copyFileSync(source, staged);
const { version } = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8'));
const expected = `msm_runtime-${version}.jar`;
if (basename(source) !== expected) {
  // ADR 0026 D4: the runtime carries the app's version.
  console.warn(
    `MSM stage-runtime: ${basename(source)} does not match the app version (${expected}).`,
  );
}
console.log(`MSM stage-runtime: staged ${source} as ${staged}.`);
