/**
 * B810 V10: memory of one and of two targets' schema contexts (the renderer's side) and of one and
 * two mcfunction services (the main process's side), in Node with --expose-gc.
 *
 * node --expose-gc docs/reference/spikes/b810/scripts/v10-contexts.ts
 */
import '../../../../../tools/shared/workspace-hooks.ts';

const { readFileSync } = await import('node:fs');
const schemas = await import('../../../../../packages/schemas/src/index.ts');
const mcf = await import('../../../../../packages/schemas/src/mcfunction/index.ts');
const gc = (globalThis as { gc?: () => void }).gc ?? (() => {});
const heap = () => {
  gc();
  gc();
  return Math.round(process.memoryUsage().heapUsed / 1e5) / 10;
};
const dir = (t: string) => new URL(`../../../../../packages/targets/${t}/vendor/`, import.meta.url);
const read = (t: string, f: string) => JSON.parse(readFileSync(new URL(f, dir(t)), 'utf8'));
const out: Record<string, number> = { baseline: heap() };
const keep: unknown[] = [];
for (const [t, v] of [['mc-26.3', '26.3'], ['mc-26.4', '26.4-snapshot-7']] as const) {
  const t0 = performance.now();
  const symbols = schemas.parseVanillaMcdocSymbols(read(t, 'vanilla-mcdoc/symbols.json'));
  const index = schemas.createSchemaIndex(symbols, { mcVersion: v });
  for (const p of index.typePaths()) {
    try {
      index.resolve(p);
    } catch {
      /* skip */
    }
  }
  const registries = read(t, 'mcmeta/registries.json');
  keep.push(symbols, index, registries);
  out[`schema context ${t} ms`] = Math.round(performance.now() - t0);
  out[`heap after schema context ${t}`] = heap();
}
for (const [t, v] of [['mc-26.3', '26.3'], ['mc-26.4', '26.4-snapshot-7']] as const) {
  const t0 = performance.now();
  const service = await mcf.createMcfunctionService(
    { commands: read(t, 'mcmeta/commands.json'), blocks: read(t, 'mcmeta/blocks.json'), registries: read(t, 'mcmeta/registries.json') },
    { mcVersion: v, mcdocSymbols: read(t, 'vanilla-mcdoc/symbols.json') },
  );
  await service.check('say hi');
  keep.push(service);
  out[`mcfunction service ${t} ms`] = Math.round(performance.now() - t0);
  out[`heap after mcfunction service ${t}`] = heap();
}
console.log(JSON.stringify({ heapMb: out, kept: keep.length }, null, 1));
