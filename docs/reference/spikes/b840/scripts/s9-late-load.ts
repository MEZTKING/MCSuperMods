/**
 * B840 S9: what adding one plugin while a project is open costs with today's code, part by part,
 * using the app's own ProjectSession as tools/check-project runs it. The sample plugin is used
 * as a plain object (no worker; the worker's start is measured in the harness, S4/S10).
 *
 * node docs/reference/spikes/b840/scripts/s9-late-load.ts <project folder>
 *
 * Parts: build a session with the built-ins only; build one with the sample plugin as an
 * external plugin (its symbols merged); registerPlugin alone; the first schema context of the
 * project's target with and without the plugin's symbols; open and validate the project.
 */
import '../../../../../tools/shared/workspace-hooks.ts';

const { readFileSync } = await import('node:fs');
const { createMemoryFileSystem, ElementKindRegistry, registerPlugin } = await import('../../../../../packages/core/src/index.ts');
const { builtInTargets } = await import('../../../../../packages/targets/all/src/index.ts');
const { builtInPlugins } = await import('../../../../../app/src/renderer/src/plugins/built-in.ts');
const { ProjectSession } = await import('../../../../../app/src/renderer/src/session/project-session.ts');
const { projectFiles, readFolder } = await import('../../../../../tools/check-project/files.ts');
const { checkerPlatform } = await import('../../../../../tools/check-project/platform.ts');
const sample = (await import('../../../../../fixtures/sample-plugin/src/index.ts')).default;
const { parseVanillaMcdocSymbols } = await import('../../../../../packages/schemas/src/index.ts');
const symbols = parseVanillaMcdocSymbols(JSON.parse(readFileSync(new URL('../../../../../fixtures/sample-plugin/dist/symbols.json', import.meta.url), 'utf8')));

const folder = process.argv[2] as string;
const files = await readFolder(folder);
const record = Object.fromEntries(projectFiles(files).map((f) => [f.path, f.bytes]));
const time = async <T>(fn: () => T | Promise<T>): Promise<[T, number]> => {
  const t = performance.now();
  const v = await fn();
  return [v, +(performance.now() - t).toFixed(2)];
};
const make = (external: boolean) => {
  const fs = createMemoryFileSystem(Object.fromEntries(Object.entries(record).map(([k, v]) => [k, new Uint8Array(v)])));
  const { platform } = checkerPlatform(fs, '0.0.0-spike');
  return new ProjectSession(platform, {
    plugins: builtInPlugins,
    targets: builtInTargets,
    validationDelay: 0,
    ...(external ? { externalPlugins: [sample], externalSymbols: [symbols] } : {}),
  });
};
const out: Record<string, unknown> = { folder, elements: Object.keys(record).filter((p) => p.startsWith('content/')).length };
// Warm the module graph once.
make(false);
const builtOnly: number[] = [];
const withPlugin: number[] = [];
for (let i = 0; i < 5; i++) {
  builtOnly.push((await time(() => make(false)))[1]);
  withPlugin.push((await time(() => make(true)))[1]);
}
out.sessionConstructMs = { builtInsOnly: builtOnly, withSamplePlugin: withPlugin };
const reg: number[] = [];
for (let i = 0; i < 5; i++) {
  const registry = new ElementKindRegistry();
  for (const p of builtInPlugins) registerPlugin(registry, p);
  reg.push((await time(() => registerPlugin(registry, sample)))[1]);
}
out.registerPluginMs = reg;
out.builtInKinds = builtInPlugins.reduce((n, p) => n + (p.contributes.elementKinds?.length ?? 0), 0);
for (const external of [false, true]) {
  const session = make(external);
  const [, openMs] = await time(() => session.loadSnapshot(folder));
  const [, firstSchemas] = await time(() => session.schemas());
  const [, validateMs] = await time(() => session.flushValidation());
  out[external ? 'withPlugin' : 'builtInsOnly'] = { openMs, firstSchemaContextMs: firstSchemas, validateMs, problems: session.snapshot.problems.length };
}
console.log(JSON.stringify(out, null, 1));
