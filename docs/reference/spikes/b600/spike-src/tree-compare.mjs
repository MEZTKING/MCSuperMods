// B600 spike (throwaway): the tidy tree against the server's own positions (adv.* of server-<mc>.json), with the
// children in the game's order (sorted by the game's y) and in MSM's order (sorted by id). Prints rates only.
import { readFileSync } from 'node:fs';
import { layout } from './tree-layout.mjs';
const obs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const all = { ...obs['adv.vanilla'], ...obs['adv.ours'] };
const shown = (id) => all[id] && all[id].display !== false;
const kids = new Map();
for (const [id, n] of Object.entries(all)) { if (n.parent) { if (!kids.has(n.parent)) kids.set(n.parent, []); kids.get(n.parent).push(id); } }
const shownKids = (id) => (kids.get(id) ?? []).flatMap((k) => (shown(k) ? [k] : shownKids(k)));
const out = {};
for (const root of Object.keys(all).filter((id) => !all[id].parent && shown(id))) {
  const tab = root.split('/')[0];
  for (const [label, order] of [['gameOrder', (a, b) => all[a].y - all[b].y], ['idOrder', (a, b) => (a < b ? -1 : 1)]]) {
    const t0 = performance.now();
    const pos = layout(root, (n) => shownKids(n).sort(order));
    const ms = performance.now() - t0;
    let same = 0, xSame = 0;
    const depth = (n) => { let d = 0; for (let p = all[n].parent; p; p = all[p].parent) if (shown(p)) d++; return d; };
    for (const [n, y] of pos) { if (Math.abs(y - all[n].y) < 1e-6) same++; if (depth(n) === all[n].x) xSame++; }
    out[`${tab}.${label}`] = { nodes: pos.size, xExact: xSame, yExact: same, layoutMs: +ms.toFixed(2) };
  }
}
console.log(JSON.stringify(out, null, 1));
