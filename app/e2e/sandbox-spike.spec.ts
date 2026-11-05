/**
 * B150 spike (temporary; B154 deletes or replaces it): a third-party plugin in a `blob:` Web
 * Worker under the renderer CSP (ADR 0035 D1). Asks the renderer, through the e2e-only
 * `window.__msmSandboxSpike` hook, to run the probes and measurements, asserts every refusal
 * and writes the findings to `e2e/output/sandbox-spike.json`.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'playwright/test';
import type { ProbeResult, SandboxSpike } from '../src/renderer/src/plugins/sandbox/spike';
import { appDir, type LaunchedApp, launchApp, outputDir } from './fixtures';

/** The renderer's global with the spike hook. */
interface Hooked {
  __msmSandboxSpike: SandboxSpike;
}

let launched: LaunchedApp | undefined;

test.afterEach(async () => {
  await launched?.close();
  launched = undefined;
});

/** Probes whose outcome is recorded but not a refusal (facts about the scope). */
const INFORMATIONAL = new Set(['typeof fetch', 'location.href', 'origin', 'fetch(document URL)']);
/** Storage is not governed by the CSP: refused only with the bootstrap's deletions. */
const STORAGE = new Set(['indexedDB', "indexedDB.open('x')", 'caches', 'navigator.storage']);
/** file: URLs outside the app: allowed by `'self'` when the document is itself a file: URL. */
const FILE_PROBES = new Set([
  "fetch('file:///etc/hostname')",
  "XMLHttpRequest('file:///etc/hostname')",
  'importScripts(local file)',
  'import(local file)',
  'import(local JSON file)',
]);
const REFUSED = new Set(['threw', 'rejected', 'undefined']);

function refusals(results: ProbeResult[], skip: ReadonlySet<string>): ProbeResult[] {
  return results.filter((result) => !INFORMATIONAL.has(result.name) && !skip.has(result.name));
}

async function rendererMemoryKb(app: LaunchedApp['app']): Promise<number> {
  return app.evaluate(({ app: electronApp }) => {
    const metrics = electronApp.getAppMetrics();
    const renderer = metrics.find((metric) => metric.type === 'Tab');
    return renderer?.memory.workingSetSize ?? -1;
  });
}

test('a blob: worker is constrained by the CSP and the proxy round-trips', async () => {
  test.setTimeout(180_000);
  launched = await launchApp();
  const { app, window } = launched;
  // Optional: point the window at electron-vite's dev server (`ELECTRON_RENDERER_URL` behaviour)
  // to compare the CSP there; the launcher fixture strips that variable.
  const devUrl = process.env.MSM_SPIKE_DEV_URL;
  if (devUrl !== undefined && devUrl !== '') {
    await window.waitForLoadState('load');
    await app.evaluate(async ({ BrowserWindow }, url) => {
      await BrowserWindow.getAllWindows()[0]?.loadURL(url);
    }, devUrl);
  }
  // A local script outside the app folder, for the `importScripts`/`import()` file probes.
  const fileScriptPath = join(launched.msmHome, 'probe-script.js');
  writeFileSync(fileScriptPath, 'self.__msmFileLoaded = true;\n');
  writeFileSync(join(launched.msmHome, 'probe-script.json'), '{"secret": "local file"}\n');
  const fileScript = pathToFileURL(fileScriptPath).href;
  await window.waitForFunction(
    () => (globalThis as { __msmSandboxSpike?: unknown }).__msmSandboxSpike !== undefined,
    undefined,
    { timeout: 30_000 },
  );
  const cspViolations: string[] = [];
  window.on('console', (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text()))
      cspViolations.push(message.text());
  });

  const imports = await window.evaluate(() =>
    (globalThis as unknown as Hooked).__msmSandboxSpike.bootstrapImports(),
  );
  const stripped = await window.evaluate(
    (value) =>
      (globalThis as unknown as Hooked).__msmSandboxSpike.runProbes({
        strip: true,
        fileScript: value,
      }),
    fileScript,
  );
  const cspOnly = await window.evaluate(
    (value) =>
      (globalThis as unknown as Hooked).__msmSandboxSpike.runProbes({
        strip: false,
        fileScript: value,
      }),
    fileScript,
  );
  // A main-process guard: refuse every file: request outside the renderer's own folder.
  const rendererRoot = await window.evaluate(
    () =>
      new URL('.', (globalThis as unknown as { location: { href: string } }).location.href).href,
  );
  // Tried first and recorded in ADR 0035: `session.webRequest.onBeforeRequest` with a file://
  // filter does not see these requests. `protocol.handle('file')` does.
  await app.evaluate(({ net, protocol }, root) => {
    protocol.handle('file', (request) =>
      request.url.startsWith(root)
        ? net.fetch(request, { bypassCustomProtocolHandlers: true })
        : Response.error(),
    );
  }, rendererRoot);
  const guarded = await window.evaluate(
    (value) =>
      (globalThis as unknown as Hooked).__msmSandboxSpike.runProbes({
        strip: false,
        fileScript: value,
      }),
    fileScript,
  );
  const loop = await window.evaluate(() =>
    (globalThis as unknown as Hooked).__msmSandboxSpike.endlessLoop(),
  );
  const roundTrip = await window.evaluate(() =>
    (globalThis as unknown as Hooked).__msmSandboxSpike.roundTrip(),
  );
  const lower = await window.evaluate(() =>
    (globalThis as unknown as Hooked).__msmSandboxSpike.measureLower(1000, 2048),
  );
  const registry = JSON.parse(
    readFileSync(
      join(appDir, '..', 'packages', 'targets', 'mc-26.3', 'vendor', 'mcmeta', 'registries.json'),
      'utf8',
    ),
  ) as Record<string, string[]>;
  const validate = await window.evaluate(
    (value) => (globalThis as unknown as Hooked).__msmSandboxSpike.measureValidate(value, 5),
    registry,
  );
  const startup = await window.evaluate(() =>
    (globalThis as unknown as Hooked).__msmSandboxSpike.measureStartup(10),
  );
  const memoryBeforeKb = await rendererMemoryKb(app);
  await window.evaluate(() => (globalThis as unknown as Hooked).__msmSandboxSpike.startWorkers(10));
  await window.waitForTimeout(1000);
  const memoryWithTenKb = await rendererMemoryKb(app);
  await window.evaluate(() => (globalThis as unknown as Hooked).__msmSandboxSpike.stopWorkers());
  await window.waitForTimeout(1000);
  const memoryAfterStopKb = await rendererMemoryKb(app);

  const findings = {
    electron: await app.evaluate(() => process.versions.electron),
    chrome: await app.evaluate(() => process.versions.chrome),
    imports,
    documentUrl: await window.evaluate(
      () => (globalThis as unknown as { location: { href: string } }).location.href,
    ),
    rendererRoot,
    probes: { stripped, cspOnly, guarded },
    loop,
    roundTrip,
    lower,
    validate,
    startup,
    memory: { memoryBeforeKb, memoryWithTenKb, memoryAfterStopKb },
    cspViolations,
  };
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'sandbox-spike.json'), `${JSON.stringify(findings, null, 2)}\n`);

  // A file: document makes 'self' match every file: URL, and worker requests bypass both
  // `protocol.handle('file')` and `webRequest` in main (ADR 0035 Status). Under a non-file origin
  // (the dev server, or a custom app scheme) the CSP refuses file: URLs as well.
  const fileOrigin = findings.documentUrl.startsWith('file:');
  // `import()` cannot be removed by the bootstrap, so under a file: document it still loads
  // local files: recorded, asserted below to keep the gap visible until B154 closes it.
  const strippedGap = fileOrigin
    ? new Set(['import(local file)', 'import(local JSON file)'])
    : new Set<string>();
  for (const result of refusals(stripped, strippedGap)) {
    expect(REFUSED.has(result.outcome), `${result.name}: ${result.outcome} ${result.detail}`).toBe(
      true,
    );
  }
  // The CSP alone refuses the network, blob: scripts and eval; file: URLs only off a file: origin.
  const cspGap = fileOrigin ? new Set([...STORAGE, ...FILE_PROBES]) : STORAGE;
  for (const result of refusals(cspOnly, cspGap)) {
    expect(REFUSED.has(result.outcome), `${result.name}: ${result.outcome} ${result.detail}`).toBe(
      true,
    );
  }
  if (fileOrigin) {
    for (const name of FILE_PROBES) {
      const result = cspOnly.find((probe) => probe.name === name);
      expect(result?.outcome, `${name} (CSP only, file: document)`).toBe('resolved');
      // The main-process file: guard does not see worker requests.
      expect(guarded.find((probe) => probe.name === name)?.outcome).toBe('resolved');
    }
  }
  expect(cspOnly.find((result) => result.name === 'typeof fetch')?.detail).toBe('function');

  // The endless loop is terminated at the deadline without freezing the UI thread.
  expect(loop.code).toBe('plugin.timeout');
  expect(loop.stateAfter).toBe('failed');
  expect(loop.elapsedMs).toBeLessThan(1500);
  expect(loop.uiTicks).toBeGreaterThan(3);
  expect(loop.nextWorkerLower).toEqual([
    expect.objectContaining({ path: 'data/spike/note/hello.json' }),
  ]);

  // Every contribution function crosses the boundary.
  expect(roundTrip.writes).toEqual([
    { path: 'notes.txt', text: 'data/demo/note/a.json' },
    { path: 'meta/index.json', text: '{"project":"Demo","count":1}' },
  ]);
  expect(roundTrip.badResult).toBe('plugin.bad-result');
  expect(roundTrip.timeout).toBe('plugin.timeout');
  expect(lower.count).toBe(1000);
});
