// Packaged smoke test: starts the unpacked electron-builder output with MSM_SMOKE=1 and exits
// with its code. Run `pnpm --filter @msm/app dist:dir` first. Uses a temporary MSM_HOME and
// user-data folder so it never touches the developer's settings or a running instance.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(appDir, 'dist');

/** The unpacked executable for this platform (names follow electron-builder.yml). */
function executable() {
  switch (process.platform) {
    case 'linux':
      return join(distDir, 'linux-unpacked', 'mcsupermods');
    case 'win32':
      return join(distDir, 'win-unpacked', 'MCSuperMods.exe');
    case 'darwin':
      return join(distDir, 'mac', 'MCSuperMods.app', 'Contents', 'MacOS', 'MCSuperMods');
    default:
      return null;
  }
}

const binary = executable();
if (binary === null || !existsSync(binary)) {
  console.error(
    `MSM packaged smoke: no unpacked app at ${binary ?? `(unsupported platform ${process.platform})`}. ` +
      'Run `pnpm --filter @msm/app dist:dir` first.',
  );
  process.exit(1);
}

const hasXvfb =
  process.platform === 'linux' &&
  spawnSync('which', ['xvfb-run'], { stdio: 'ignore' }).status === 0;
const needsXvfb = process.platform === 'linux' && !process.env.DISPLAY && hasXvfb;

const temp = mkdtempSync(join(tmpdir(), 'msm-smoke-packaged-'));
const args = [binary, '--no-sandbox', `--user-data-dir=${join(temp, 'user-data')}`];
const [command, ...rest] = needsXvfb ? ['xvfb-run', '-a', ...args] : args;

const cleanup = () => rmSync(temp, { recursive: true, force: true });
const child = spawn(command, rest, {
  stdio: 'inherit',
  env: { ...process.env, MSM_SMOKE: '1', MSM_HOME: join(temp, 'msm-home') },
});
child.on('error', (error) => {
  console.error(`MSM packaged smoke: could not start the app: ${error.message}`);
  cleanup();
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal !== null) console.error(`MSM packaged smoke: app terminated by ${signal}.`);
  cleanup();
  process.exit(code ?? 1);
});
