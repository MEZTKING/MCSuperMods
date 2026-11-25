/**
 * B840 S13: can the host show a plugin kind live from the files it lowers to, with no plugin code?
 *
 * node docs/reference/spikes/b840/scripts/s13-from-files.ts
 *
 * 1. For every built-in kind whose id has an entry in the live view registry (LIVE_VIEWS), lower
 *    one element of its default data on the first built-in target and test whether the files read back give the
 *    element again: one output file whose path names the kind's folder and whose JSON equals the
 *    data (or, for functions, whose lines equal the data's lines). Those kinds are "readable
 *    back", so a lowered file of that shape can be shown with the existing view.
 * 2. The sample plugin's kind and two invented kinds (a loot table plus a function; a model plus a
 *    texture) lowered, each file matched to a readable-back kind by path.
 */
import '../../../../../tools/shared/workspace-hooks.ts';

const { ElementKindRegistry, registerPlugin } = await import('../../../../../packages/core/src/index.ts');
const { builtInTargets, targetById } = await import('../../../../../packages/targets/all/src/index.ts');
const { builtInPlugins } = await import('../../../../../app/src/renderer/src/plugins/built-in.ts');
const { LIVE_VIEWS } = await import('../../../../../app/src/renderer/src/liveviews/registry.ts');
const sample = (await import('../../../../../fixtures/sample-plugin/src/index.ts')).default;

const found = targetById(builtInTargets[0]!.target.id) as unknown as { target?: unknown } | undefined;
const target = (found?.target ?? found ?? builtInTargets[0]!.target) as never;
const registry = new ElementKindRegistry();
for (const p of builtInPlugins) registerPlugin(registry, p);
registerPlugin(registry, sample);
/** OutputFile contents are bytes or a JSON value the exporter serialises. */
const text = (contents: unknown) => (contents instanceof Uint8Array ? new TextDecoder().decode(contents) : typeof contents === 'string' ? contents : JSON.stringify(contents));
const viewKinds = Object.keys(LIVE_VIEWS);

type Readable = { kind: string; pattern: RegExp; read(path: string, contents: string): unknown };
const readable: Readable[] = [];
const rows: unknown[] = [];
for (const kindId of viewKinds) {
  const kind = registry.get(kindId);
  if (kind === undefined) { rows.push({ kind: kindId, result: 'not a registered kind' }); continue; }
  const data = await (kind.defaultDataFor ? kind.defaultDataFor(target) : kind.defaultData);
  const element = { id: 'spike:probe/thing', kind: kindId, data, meta: {} } as never;
  let files: { path: string; contents: unknown }[];
  try {
    files = (await kind.lower(element, target)) as never;
  } catch (e) { rows.push({ kind: kindId, result: `lower threw: ${String(e).slice(0, 80)}` }); continue; }
  if (files.length !== 1) { rows.push({ kind: kindId, result: `${files.length} files`, paths: files.map((f) => f.path).slice(0, 4) }); continue; }
  const f = files[0]!;
  const m = f.path.match(/^(data|assets)\/spike\/(.+)\/probe\/thing\.(json|mcfunction)$/);
  if (!m) { rows.push({ kind: kindId, result: 'path does not name the id', path: f.path }); continue; }
  const folder = m[2]!;
  const body = text(f.contents);
  let back: unknown;
  if (m[3] === 'json') back = f.contents instanceof Uint8Array ? JSON.parse(body) : f.contents;
  else back = body;
  const same = JSON.stringify(back) === JSON.stringify(data) || (typeof data === 'object' && data !== null && JSON.stringify((data as { lines?: unknown }).lines) === JSON.stringify(body.split('\n').filter((l) => l !== '')));
  rows.push({ kind: kindId, folder: `${m[1]}/<ns>/${folder}`, readBack: same ? 'equal' : 'differs' });
  if (same) {
    const pattern = new RegExp(`^${m[1]}/[a-z0-9_.-]+/${folder.replace(/\//g, '\\/')}/.+\\.${m[3]}$`);
    readable.push({ kind: kindId, pattern, read: (_p, c) => (m[3] === 'json' ? JSON.parse(c) : data && typeof data === 'object' && 'lines' in (data as object) ? { ...(data as object), lines: c.split('\n').filter((l) => l !== '') } : c) });
  }
}

const match = (path: string) => readable.find((r) => r.pattern.test(path))?.kind ?? null;
const lowerOf = async (kindLower: (e: never, t: never) => unknown, data: unknown, kindId: string) =>
  (await kindLower({ id: 'demo:thing', kind: kindId, data, meta: {} } as never, target as never)) as { path: string; contents: Uint8Array | string }[];

const plugins: Record<string, unknown> = {};
const greeting = registry.get('sample:greeting')!;
const g = await lowerOf(greeting.lower as never, { message: 'Hello' }, 'sample:greeting');
plugins['sample:greeting'] = g.map((f) => ({ path: f.path, shownBy: match(f.path) }));
// Invented kind 1: a treasure kind lowering to a loot table and a function that gives it.
const treasure = [
  { path: 'data/demo/loot_table/thing.json', contents: JSON.stringify({ type: 'minecraft:chest', pools: [{ rolls: 1, entries: [{ type: 'minecraft:item', name: 'minecraft:diamond' }] }] }) },
  { path: 'data/demo/function/give_thing.mcfunction', contents: 'loot give @s loot demo:thing\n' },
];
plugins['invented:treasure (loot + function)'] = treasure.map((f) => ({ path: f.path, shownBy: match(f.path) }));
// Invented kind 2: a gadget lowering to an item model and its texture.
const gadget = [
  { path: 'assets/demo/models/item/thing.json', contents: JSON.stringify({ parent: 'minecraft:item/generated', textures: { layer0: 'demo:item/thing' } }) },
  { path: 'assets/demo/items/thing.json', contents: JSON.stringify({ model: { type: 'minecraft:model', model: 'demo:item/thing' } }) },
  { path: 'assets/demo/textures/item/thing.png', contents: '(png bytes)' },
];
plugins['invented:gadget (model + texture)'] = gadget.map((f) => ({ path: f.path, shownBy: match(f.path) }));

const counts = { viewKinds: viewKinds.length, readableBack: readable.length };
console.log(JSON.stringify({ counts, readable: readable.map((r) => r.kind), rows, plugins }, null, 1));
