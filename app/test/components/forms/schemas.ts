/// <reference types="node" />
/**
 * Test helper: the real schema index of the newest built-in target, read from its vendored
 * symbol export with `node:fs` (tests only; the app reads it through main).
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSchemaIndex, parseVanillaMcdocSymbols, type SchemaIndex } from '@msm/schemas';
import { builtInTargets, readVendoredJson } from '@msm/targets';

/**
 * Under happy-dom, Vitest serves modules over HTTP, so `import.meta.url` (and the vendored
 * URLs built from it) read `http://localhost:<port>/@fs/<absolute path>`.
 */
function toPath(url: URL): string {
  if (url.protocol === 'file:') return fileURLToPath(url.href);
  const prefix = '/@fs/';
  if (url.pathname.startsWith(prefix))
    return decodeURIComponent(url.pathname.slice(prefix.length - 1));
  throw new Error(`Cannot read ${url.href} from the file system.`);
}

let cached: Promise<SchemaIndex> | undefined;

/** The schema index of `builtInTargets[0]`, built once per test file. */
export function schemaIndex(): Promise<SchemaIndex> {
  cached ??= (async () => {
    const bundle = builtInTargets[0];
    if (bundle === undefined) throw new Error('No built-in target.');
    const raw = await readVendoredJson(bundle, 'vanillaMcdocSymbols', (url) =>
      readFile(toPath(url)),
    );
    return createSchemaIndex(parseVanillaMcdocSymbols(raw), { mcVersion: bundle.target.mcVersion });
  })();
  return cached;
}
