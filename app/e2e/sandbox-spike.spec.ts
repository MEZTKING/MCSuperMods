/**
 * B150 spike (temporary; B154 deletes or replaces it): a third-party plugin in a `blob:` Web
 * Worker under the renderer CSP (ADR 0035 D1). Asks the renderer, through the e2e-only
 * `window.__msmSandboxSpike` hook, to run the probes and measurements, asserts every refusal
 * and writes the findings to `e2e/output/sandbox-spike.json`.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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
  await window.waitForFunction(
    () => (globalThis as { __msmSandboxSpike?: unknown }).__msmSandboxSpike !== undefined,
    undefined,
    { timeout: 30_000 },
  );
  const cspViolations: string[] = [];
  window.on('console', (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) cspViolations.push(message.text());
  });

  const imports = await window.evaluate(() => (globalThis as unknown as Hooked).__msmSandboxSpike.bootstrapImports();
  const stripped = await window.evaluate(() => (globalThis as unknown as Hooked).__msmSandboxSpike.runProbes({ strip: true });
  const cspOnly = await window.evaluate(() => (globalThis as unknown as Hooked).__msmSandboxSpike.runProbes({ strip: false });
  const loop = await window.evaluate(() => (globalThis as unknown as Hooked).__msmSandboxSpike.endlessLoop();
  const roundTrip = await window.evaluate(() => (globalThis as unknown as Hooked).__msmSandboxSpike.roundTrip();
  const lower = await window.evaluate(() => (globalThis as unknown as Hooked).__msmSandboxSpike.measureLower(1000, 2048);
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
  const startup = await window.evaluate(() => (globalThis as unknown as Hooked).__msmSandboxSpike.measureStartup(10);
  const memoryBeforeKb = await rendererMemoryKb(app);
  await window.evaluate(() => (globalThis as unknown as Hooked).__msmSandboxSpike.startWorkers(10);
  await window.waitForTimeout(1000);
  const memoryWithTenKb = await rendererMemoryKb(app);
  await window.evaluate(() => (globalThis as unknown as Hooked).__msmSandboxSpike.stopWorkers();
  await window.waitForTimeout(1000);
  const memoryAfterStopKb = await rendererMemoryKb(app);

  const findings = {
    electron: await app.evaluate(() => process.versions.electron),
    chrome: await app.evaluate(() => process.versions.chrome),
    imports,
    probes: { stripped, cspOnly },
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

  // With the bootstrap: everything is refused.
  for (const result of refusals(stripped, new Set())) {
    expect(REFUSED.has(result.outcome), `${result.name}: ${result.outcome} ${result.detail}`).toBe(true);
  }
  // The CSP alone: the network, script loading and eval are refused by the browser.
  for (const result of refusals(cspOnly, STORAGE)) {
    expect(REFUSED.has(result.outcome), `${result.name}: ${result.outcome} ${result.detail}`).toBe(true);
  }
  expect(cspOnly.find((result) => result.name === 'typeof fetch')?.detail).toBe('function');

  // The endless loop is terminated at the deadline without freezing the UI thread.
  expect(loop.code).toBe('plugin.timeout');
  expect(loop.stateAfter).toBe('failed');
  expect(loop.elapsedMs).toBeLessThan(1500);
  expect(loop.uiTicks).toBeGreaterThan(3);
  expect(loop.nextWorkerLower).toEqual([expect.objectContaining({ path: 'data/spike/note/hello.json' })]);

  // Every contribution function crosses the boundary.
  expect(roundTrip.writes).toEqual([
    { path: 'notes.txt', text: 'data/demo/note/a.json' },
    { path: 'meta/index.json', text: '{"project":"Demo","count":1}' },
  ]);
  expect(roundTrip.badResult).toBe('plugin.bad-result');
  expect(roundTrip.timeout).toBe('plugin.timeout');
  expect(lower.count).toBe(1000);
});
