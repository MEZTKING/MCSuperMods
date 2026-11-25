/**
 * B810 V5 and V6: where ids and block states live in projects, and which of 26.4's removed ids
 * the present migration walk (whole strings in element data) would miss.
 *
 * node docs/reference/spikes/b810/scripts/v6-scan.ts <root>... > v6-scan.json
 * Every folder under a root with an `msm.project.json` is a project; its `content/**.json` files
 * are elements. Reads only; prints counts and the hits (element id, kind, path, id).
 */
import '../../../../../tools/shared/workspace-hooks.ts';

const { readFileSync, readdirSync, statSync, existsSync } = await import('node:fs');
const { join, relative } = await import('node:path');
const tables = await import('../../../../../packages/targets/mc-26.4/src/removed-ids.ts');

const roots = process.argv.slice(2);
const projects: string[] = [];
const findProjects = (dir: string) => {
  if (existsSync(join(dir, 'msm.project.json'))) projects.push(dir);
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) findProjects(p);
  }
};
for (const r of roots) findProjects(r);
const files = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return statSync(p).isDirectory() ? files(p) : [p];
      })
    : [];

// Removed ids of 26.4 (the moved registry's members mean the same and are left out).
const removed = new Map<string, string[]>(); // id (no namespace, '#' for tags) -> registries
for (const [reg, ids] of Object.entries(tables.REMOVED_IDS)) {
  if (reg in tables.MOVED_REGISTRIES) continue;
  for (const id of ids) {
    const key = reg.startsWith('tag/') ? `#${id}` : id;
    removed.set(key, [...(removed.get(key) ?? []), reg]);
  }
}
const WHOLE = /^#?(?:[a-z0-9_.-]+:)?[a-z0-9_./-]+$/;
const NAMESPACED = /#?minecraft:[a-z0-9_./-]+/g;
const STATE_IN_TEXT = /(?:minecraft:)?[a-z0-9_]+\[[a-z0-9_]+=[^\]]*\]/g;

const counts = {
  projects: 0,
  elements: 0,
  stringsWhole: 0,
  idTokensWhole: 0,
  idTokensInside: {} as Record<string, number>,
  stringsWithIdsInside: {} as Record<string, number>,
  blockStates: {} as Record<string, number>,
  assetFiles: 0,
  assetJson: 0,
  nbtFiles: 0,
};
const hits: { project: string; element: string; kind: string; path: string; value: string; id: string; where: string; walkFinds: boolean }[] = [];
const inc = (o: Record<string, number>, k: string, n = 1) => {
  o[k] = (o[k] ?? 0) + n;
};
/** The category of a string that is not a whole id. */
function category(kind: string, path: string, value: string): string {
  if (kind === 'minecraft:function' && path.startsWith('/lines')) return 'function text';
  if (kind === 'msm:script') return 'script text';
  if (kind === 'msm:rules') return 'rules (inside a string)';
  if (/^\s*[[{]/.test(value)) return value.includes(':"') || /\b[A-Za-z]+:/.test(value) ? 'embedded SNBT or JSON text' : 'embedded JSON';
  if (kind === 'minecraft:lang') return 'lang text';
  return `other inside a string (${kind})`;
}
const lookup = (token: string) => {
  const tag = token.startsWith('#');
  const bare = token.replace(/^#/, '').replace(/^minecraft:/, '');
  return removed.has(tag ? `#${bare}` : bare) ? (tag ? `#${bare}` : bare) : undefined;
};

for (const project of projects) {
  counts.projects++;
  const rel = relative(process.cwd(), project);
  for (const file of files(join(project, 'content'))) {
    if (!file.endsWith('.json')) continue;
    let el: { id?: string; kind?: string; data?: unknown };
    try {
      el = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    if (typeof el.kind !== 'string') continue;
    counts.elements++;
    const kind = el.kind;
    const visit = (v: unknown, path: string, key: string | undefined) => {
      if (typeof v === 'string') {
        if (WHOLE.test(v) && v.includes(':')) {
          counts.stringsWhole++;
          counts.idTokensWhole++;
          const id = lookup(v);
          if (id) {
            const reg = removed.get(id) ?? [];
            const typeOnly = id === 'large_dripstone';
            hits.push({ project: rel, element: String(el.id), kind, path, value: v, id, where: 'whole string', walkFinds: !typeOnly || key === 'type' });
            void reg;
          }
          return;
        }
        const inner = v.match(NAMESPACED) ?? [];
        if (inner.length) {
          const cat = category(kind, path, v);
          inc(counts.idTokensInside, cat, inner.length);
          inc(counts.stringsWithIdsInside, cat);
          for (const t of inner) {
            const id = lookup(t);
            if (id) hits.push({ project: rel, element: String(el.id), kind, path, value: v.slice(0, 120), id, where: cat, walkFinds: false });
          }
        }
        const states = v.match(STATE_IN_TEXT) ?? [];
        if (states.length && (kind === 'minecraft:function' || kind === 'msm:script' || kind === 'msm:rules')) inc(counts.blockStates, `in text: ${kind}`, states.length);
        return;
      }
      if (Array.isArray(v)) {
        v.forEach((x, i) => visit(x, `${path}/${i}`, undefined));
        return;
      }
      if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>;
        const keys = Object.keys(o);
        if ((keys.includes('Name') && keys.includes('Properties')) || (keys.includes('id') && keys.includes('properties'))) {
          inc(counts.blockStates, `object: ${kind}`);
        } else if (keys.includes('Name') && typeof o.Name === 'string' && kind.startsWith('minecraft:worldgen')) {
          inc(counts.blockStates, `object without properties: ${kind}`);
        }
        for (const k of keys) visit(o[k], `${path}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`, k);
      }
    };
    visit(el.data, '', undefined);
    if (kind === 'minecraft:structure_template') {
      const palette = (el.data as { palette?: unknown[] })?.palette;
      if (Array.isArray(palette)) inc(counts.blockStates, 'structure template palette entries', palette.length);
    }
  }
  for (const file of files(join(project, 'assets'))) {
    counts.assetFiles++;
    if (file.endsWith('.json')) counts.assetJson++;
  }
  counts.nbtFiles += files(project).filter((f) => f.endsWith('.nbt')).length;
}
console.log(JSON.stringify({ roots, removedIds: [...removed.keys()].sort(), counts, hitCount: hits.length, hits }, null, 1));
