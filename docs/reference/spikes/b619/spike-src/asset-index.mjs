// B619 spike (throwaway), 3S1: the asset store as the launcher lays it out (Loom's cache has the same objects folder;
// its index is named <mc>-<id>.json where the launcher writes <id>.json). Reads the version JSON's assetIndex,
// parses the index, finds sounds.json and one sound by their listed paths, and times each step (warm cache).
import fs from 'node:fs';
import path from 'node:path';
const [store, versionJson, indexName, ...keys] = process.argv.slice(2);
const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
const out = {};
const t = () => performance.now();
const times = { versionJson: [], index: [], soundsJson: [], one: {} };
for (let i = 0; i < 15; i++) {
  let a = t();
  const v = JSON.parse(fs.readFileSync(versionJson, 'utf8'));
  times.versionJson.push(t() - a);
  out.assetIndexId = v.assetIndex.id;
  out.assets = v.assets;
  a = t();
  const idx = JSON.parse(fs.readFileSync(path.join(store, 'indexes', indexName), 'utf8'));
  times.index.push(t() - a);
  out.indexObjects = Object.keys(idx.objects).length;
  a = t();
  const sj = idx.objects['minecraft/sounds.json'];
  const sounds = JSON.parse(fs.readFileSync(path.join(store, 'objects', sj.hash.slice(0, 2), sj.hash), 'utf8'));
  times.soundsJson.push(t() - a);
  out.soundEvents = Object.keys(sounds).length;
  for (const k of keys) {
    a = t();
    const o = idx.objects[k];
    const b = fs.readFileSync(path.join(store, 'objects', o.hash.slice(0, 2), o.hash));
    (times.one[k] ??= []).push(t() - a);
    if (b.length !== o.size) throw new Error('size');
  }
}
out.ms = { versionJson: +med(times.versionJson).toFixed(2), indexParse: +med(times.index).toFixed(2),
  soundsJsonParse: +med(times.soundsJson).toFixed(2), first: +times.index[0].toFixed(2) };
out.oneFileMs = Object.fromEntries(Object.entries(times.one).map(([k, v]) => [k.split('/').slice(2).join('/'), +med(v).toFixed(2)]));
console.log(JSON.stringify(out, null, 1));
