// B840 S2 check: a transferred canvas really shows the worker's frames (screenshot, pixel spread).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '..', '..', 'wt-B840', 'app', 'package.json'));
const { _electron } = require('playwright');
const app = await _electron.launch({ executablePath: require('electron'), args: [here, '--no-sandbox'] });
const win = await app.firstWindow();
await win.waitForFunction(() => document.title === 'B840 ready');
const shots = [];
const p = win.evaluate(() => window.spike.s2('2d', 'transfer'));
for (const wait of [800, 1500]) {
  await win.waitForTimeout(wait);
  const png = await win.locator('#cv').screenshot();
  shots.push(png.toString('base64').slice(100, 140));
}
await p;
console.log(JSON.stringify({ framesDiffer: shots[0] !== shots[1], shots }));
await app.close();
