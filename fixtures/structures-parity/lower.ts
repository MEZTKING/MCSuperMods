/**
 * `node fixtures/structures-parity/lower.ts` (run by `make_fixture.py`): lowers the fixture project's
 * `content/` with MSM's own element kinds (`@msm/plugin-structures`, `@msm/plugin-worldgen`,
 * `@msm/plugin-datapack`) into `lowered/<target id>/data/` for every built-in target, as MSM's
 * data pack export writes the files: templates as gzip `.nbt` with the target's `DataVersion`, the
 * JSON kinds with sorted keys and two-space indents. The workspace packages import each other
 * without file endings, so this first registers the tools' module hooks.
 */
import '../../tools/shared/workspace-hooks.ts';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packages = join(here, '..', '..', 'packages');

const { default: structures } = await import(join(packages, 'plugins/structures/src/index.ts'));
const { default: worldgen } = await import(join(packages, 'plugins/worldgen/src/index.ts'));
const { default: datapack } = await import(join(packages, 'plugins/datapack/src/index.ts'));
const { builtInTargets } = await import(join(packages, 'targets/all/src/index.ts'));
const { outputFileBytes } = await import(join(packages, 'exporters/src/contents.ts'));

type Kind = { id: string; lower: (element: unknown, target: unknown) => { path: string }[] };
const kinds = new Map<string, Kind>();
for (const plugin of [structures, worldgen, datapack]) {
  for (const kind of plugin.contributes.elementKinds as Kind[]) kinds.set(kind.id, kind);
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, out);
    else if (entry.name.endsWith('.json')) out.push(path);
  }
  return out;
}

const elements = await Promise.all(
  (await walk(join(here, 'content'))).sort().map(async (file) => {
    const element = JSON.parse(await readFile(file, 'utf8'));
    return { ...element, namespace: element.id.split(':')[0] };
  }),
);

await rm(join(here, 'lowered'), { recursive: true, force: true });
for (const bundle of builtInTargets) {
  const root = join(here, 'lowered', bundle.target.id);
  let count = 0;
  for (const element of elements) {
    const kind = kinds.get(element.kind);
    if (!kind) throw new Error(`${element.id}: no kind ${element.kind}`);
    for (const file of kind.lower(element, bundle.target)) {
      const path = join(root, ...file.path.split('/'));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, outputFileBytes(file as never));
      count += 1;
    }
  }
  console.log(`${bundle.target.id}: ${count} files`);
}
