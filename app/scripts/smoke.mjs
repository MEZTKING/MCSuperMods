// Headless smoke test: starts the built app with MSM_SMOKE=1 and exits with Electron's code.
// Builds nothing; run `electron-vite build` first (the `smoke` script does).
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
/** The electron package's default export is the binary path when required from Node. */
const electron = require('electron');

const hasXvfb = spawnSync('which', ['xvfb-run'], { stdio: 'ignore' }).status === 0;
const needsXvfb = process.platform === 'linux' && !process.env.DISPLAY && hasXvfb;

const args = [electron, '.', '--no-sandbox'];
const [command, ...rest] = needsXvfb ? ['xvfb-run', '-a', ...args] : args;

const child = spawn(command, rest, {
  cwd: appDir,
  stdio: 'inherit',
  env: { ...process.env, MSM_SMOKE: '1' },
});
child.on('error', (error) => {
  console.error(`MSM smoke: could not start Electron: ${error.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal !== null) console.error(`MSM smoke: Electron terminated by ${signal}.`);
  process.exit(code ?? 1);
});
