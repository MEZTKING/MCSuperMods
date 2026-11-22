/**
 * Module hooks that let Node run the workspace's TypeScript sources directly: the packages
 * import each other's files without endings (`./model/index`), as the bundlers and Vitest
 * allow, and the app's script engine imports TypeScript's lib files as text (`?raw`, a Vite
 * feature). Importing this module registers synchronous hooks (`module.registerHooks`, Node
 * 22.15 and later) that resolve a relative import without an ending to its `.ts`, `.tsx` or
 * `index.ts` file and load a `?raw` import as a module whose default export is the file's text.
 * Every other import resolves as Node does it. A tool that loads workspace packages imports
 * this first and the rest with `await import()`, as static imports are resolved before any
 * code runs.
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAW = '?raw';
const ENDINGS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

/**
 * The file a relative import without an ending names, or `undefined` when the import is not
 * relative, already names a file, or names none of the candidates.
 */
export function resolveWithoutEnding(
  specifier: string,
  parentUrl: string | undefined,
): string | undefined {
  if (parentUrl === undefined || !parentUrl.startsWith('file:')) return undefined;
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) return undefined;
  const base = fileURLToPath(new URL(specifier, parentUrl));
  if (isFile(base)) return undefined;
  for (const ending of ENDINGS) {
    if (isFile(base + ending)) return pathToFileURL(base + ending).href;
  }
  return undefined;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith(RAW)) {
      const inner = nextResolve(specifier.slice(0, -RAW.length), context);
      return { url: `${inner.url}${RAW}`, shortCircuit: true };
    }
    const url = resolveWithoutEnding(specifier, context.parentURL);
    if (url !== undefined) return { url, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(RAW)) {
      const text = readFileSync(fileURLToPath(url.slice(0, -RAW.length)), 'utf8');
      return {
        format: 'module',
        source: `export default ${JSON.stringify(text)};`,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});
