// B810 V8: the vanilla files that changed between two versions, from mcmeta's trees alone.
//
// node v8-files.mjs <bare mcmeta git folder> <older version> <newer version> [--list <out.json>]
// Needs the tags <v>-data and <v>-assets fetched with --filter=blob:none (trees only, no file
// contents). Compares paths and blob hashes: added, removed, changed, and renamed (same blob under
// another path). Prints counts by folder and the size of the list, raw and gzipped.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const [repo, older, newer] = process.argv.slice(2);
const listOut = process.argv.includes('--list') ? process.argv[process.argv.indexOf('--list') + 1] : undefined;
const tree = (tag) => {
  const out = execFileSync('git', ['-C', repo, 'ls-tree', '-r', `refs/tags/${tag}`], { maxBuffer: 1 << 28 }).toString();
  const map = new Map();
  for (const line of out.split('\n')) {
    const m = line.match(/^\d+ blob ([0-9a-f]+)\t(.+)$/);
    if (m) map.set(m[2], m[1]);
  }
  return map;
};
/** The folder a path belongs to, two or three levels deep: data/minecraft/tags/block, assets/minecraft/textures/block. */
const folderOf = (p) => {
  const parts = p.split('/');
  if (parts[0] === 'data' && parts[2] === 'tags') return parts.slice(0, 4).join('/');
  if (parts[0] === 'data' && parts[2] === 'worldgen') return parts.slice(0, 4).join('/');
  if (parts[0] === 'assets' && parts[2] === 'textures') return parts.slice(0, 4).join('/');
  return parts.slice(0, 3).join('/');
};
/** Folders a data pack or resource pack can replace or add to (MSM projects write these). */
const OVERRIDABLE = /^(data\/minecraft\/(tags|loot_table|recipe|advancement|predicate|item_modifier|worldgen|dimension|dimension_type|structure|enchantment|damage_type|trim_material|trim_pattern|banner_pattern|painting_variant|jukebox_song|instrument|dialog|villager_trade|trade_set|function|chat_type|wolf_variant|cat_variant|pig_variant|cow_variant|chicken_variant|frog_variant|test_instance|test_environment|timeline|world_clock|sulfur_cube_archetype|block_sound_set|dispense_behavior))|^(assets\/minecraft\/(models|blockstates|textures|sounds\.json|sounds|lang|items|font|shaders|post_effect|equipment|atlases|particles|texts|waypoint_style))/;
const result = { older, newer, kinds: {} };
const list = [];
for (const side of ['data', 'assets']) {
  const a = tree(`${older}-${side}`);
  const b = tree(`${newer}-${side}`);
  const added = [...b.keys()].filter((p) => !a.has(p));
  const removed = [...a.keys()].filter((p) => !b.has(p));
  const changed = [...a.keys()].filter((p) => b.has(p) && a.get(p) !== b.get(p));
  // Exact renames: a removed path whose blob is an added path's blob.
  const addedByBlob = new Map();
  for (const p of added) addedByBlob.set(b.get(p), [...(addedByBlob.get(b.get(p)) ?? []), p]);
  const renamed = [];
  for (const p of removed) {
    const to = addedByBlob.get(a.get(p));
    if (to?.length === 1) renamed.push([p, to[0]]);
  }
  const byFolder = {};
  const bump = (p, k) => {
    const f = folderOf(p);
    byFolder[f] ??= { added: 0, removed: 0, changed: 0 };
    byFolder[f][k]++;
  };
  added.forEach((p) => bump(p, 'added'));
  removed.forEach((p) => bump(p, 'removed'));
  changed.forEach((p) => bump(p, 'changed'));
  const over = (ps) => ps.filter((p) => OVERRIDABLE.test(p)).length;
  result.kinds[side] = {
    filesBefore: a.size,
    filesAfter: b.size,
    added: added.length,
    removed: removed.length,
    changed: changed.length,
    renamedExact: renamed.length,
    overridable: { added: over(added), removed: over(removed), changed: over(changed) },
    topFolders: Object.entries(byFolder)
      .sort((x, y) => y[1].added + y[1].removed + y[1].changed - (x[1].added + x[1].removed + x[1].changed))
      .slice(0, 15),
  };
  for (const p of added) list.push([p, 'a']);
  for (const p of removed) list.push([p, 'r']);
  for (const p of changed) list.push([p, 'c']);
}
list.sort((x, y) => (x[0] < y[0] ? -1 : 1));
const raw = JSON.stringify(list);
result.list = { entries: list.length, rawBytes: raw.length, gzipBytes: gzipSync(raw).length };
const overridableOnly = JSON.stringify(list.filter(([p]) => OVERRIDABLE.test(p)));
result.listOverridableOnly = { entries: list.filter(([p]) => OVERRIDABLE.test(p)).length, rawBytes: overridableOnly.length, gzipBytes: gzipSync(overridableOnly).length };
if (listOut) writeFileSync(listOut, `${JSON.stringify(list)}\n`);
console.log(JSON.stringify(result, null, 1));
