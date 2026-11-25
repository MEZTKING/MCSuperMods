// B810 V19 (and the shape for B811/B812): builds a draft generated change set from a differ.ts
// report, in the TargetChange shape the plan names, and measures it raw and gzipped, with the
// additions listed in full and as counts only.
//
// node v19-changeset.mjs <differ report.json> [--mcdoc gated|refs] [--out <changeset.json>]
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const [file] = process.argv.slice(2);
const flag = (n, d) => (process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : d);
const r = JSON.parse(readFileSync(file, 'utf8'));
const mode = flag('mcdoc', r.mcdoc.gated ? 'gated' : 'refs');
const m = r.mcdoc[mode];
const changes = [];
const add = (c) => changes.push({ id: `${c.area}:${c.subject}${c.field ? `#${c.field}` : ''}`, ...c });

// Registries.
for (const name of r.registries.addedRegistries.filter((x) => !Object.values(r.registries.moved).includes(x))) add({ area: 'ids', what: 'registry-added', subject: name, handling: 'none', source: 'registries' });
for (const [from, to] of Object.entries(r.registries.moved)) add({ area: 'ids', what: 'registry-moved', subject: from, to, handling: 'none', source: 'registries' });
for (const [reg, ids] of Object.entries(r.registries.removed)) {
  for (const id of ids) {
    const elsewhere = r.registries.stillElsewhere[reg]?.[id];
    add({ area: 'ids', what: 'member-removed', registry: reg, subject: `${reg}/${id}`, from: id, ...(elsewhere ? { stillIn: elsewhere } : {}), handling: 'manual', source: 'registries' });
  }
}
const additions = [];
for (const [reg, ids] of Object.entries(r.registries.added)) for (const id of ids) additions.push({ area: 'new', what: 'member-added', registry: reg, subject: `${reg}/${id}`, to: id, handling: 'none', source: 'registries' });

// Data formats: one change per (dispatcher member or resource, field); named types only when no
// dispatcher member reported the same field change (they are the same change seen twice).
const seen = new Set();
const fieldKinds = ['addedRequired', 'addedOptional', 'removed', 'madeOptional', 'madeRequired', 'retyped'];
for (const [d, x] of Object.entries(m.dispatcherChanges)) {
  for (const k of x.added) add({ area: 'formats', what: 'type-added', registry: d, subject: `${d}/${k}`, handling: 'none', source: 'mcdoc' });
  for (const k of x.removed) add({ area: 'formats', what: 'type-removed', registry: d, subject: `${d}/${k}`, handling: 'manual', source: 'mcdoc' });
  for (const c of x.changed) {
    for (const fk of fieldKinds) for (const f of c.fields[fk] ?? []) {
      const key = `${fk}|${f}`;
      seen.add(key);
      add({ area: 'formats', what: `field-${fk}`, registry: d, subject: `${d}/${c.key}`, field: f, handling: fk === 'removed' || fk === 'addedRequired' || fk === 'madeRequired' || fk === 'retyped' ? 'manual' : 'none', source: 'mcdoc' });
    }
    if (c.fields.notStruct) add({ area: 'formats', what: 'type-changed', registry: d, subject: `${d}/${c.key}`, handling: 'manual', source: 'mcdoc' });
  }
}
for (const t of m.typesChanged) {
  for (const fk of fieldKinds) for (const f of t.fields?.[fk] ?? []) {
    if (seen.has(`${fk}|${f}`)) continue;
    add({ area: 'formats', what: `field-${fk}`, subject: t.path, field: f, handling: fk === 'addedOptional' || fk === 'madeOptional' ? 'none' : 'manual', source: 'mcdoc' });
  }
}
// Commands.
for (const root of r.commands.rootsAdded) add({ area: 'commands', what: 'root-added', subject: root, handling: 'none', source: 'commands' });
for (const root of r.commands.rootsRemoved) add({ area: 'commands', what: 'root-removed', subject: root, handling: 'manual', source: 'commands' });
for (const p of r.commands.removedTop) add({ area: 'commands', what: 'path-removed', subject: p, handling: 'manual', source: 'commands' });
for (const p of r.commands.addedTop) additions.push({ area: 'commands', what: 'path-added', subject: p, handling: 'none', source: 'commands' });
for (const c of r.commands.changed) add({ area: 'commands', what: 'argument-changed', subject: c.path, from: c.before, to: c.after, handling: 'none', source: 'commands' });
// Block states.
for (const b of r.blocks.removed) add({ area: 'block-states', what: 'block-removed', subject: b, handling: 'manual', source: 'blocks' });
for (const b of r.blocks.added) additions.push({ area: 'new', what: 'block-added', subject: b, handling: 'none', source: 'blocks' });
for (const c of r.blocks.changed) {
  for (const p of c.propsAdded) add({ area: 'block-states', what: 'property-added', subject: c.block, field: p, handling: 'none', source: 'blocks' });
  for (const p of c.propsRemoved) add({ area: 'block-states', what: 'property-removed', subject: c.block, field: p, handling: 'manual', source: 'blocks' });
  for (const v of c.valuesChanged) add({ area: 'block-states', what: 'values-changed', subject: c.block, field: v.prop, from: v.removed, to: v.added, handling: v.removed.length ? 'manual' : 'none', source: 'blocks' });
  for (const v of c.defaultsChanged) add({ area: 'block-states', what: 'default-changed', subject: c.block, field: v.prop, from: v.before, to: v.after, handling: 'none', source: 'blocks' });
}
// Packs.
for (const [k, v] of Object.entries(r.packs)) add({ area: 'packs', what: 'value-changed', subject: k, from: v.before, to: v.after, handling: 'auto', source: 'version' });

changes.sort((a, b) => (a.id < b.id ? -1 : 1));
const full = { changes, additions };
const countsOnly = {
  changes,
  additions: Object.fromEntries(Object.entries(additions.reduce((acc, a) => ({ ...acc, [`${a.what}:${a.registry ?? ''}`]: (acc[`${a.what}:${a.registry ?? ''}`] ?? 0) + 1 }), {}))),
};
const size = (o) => {
  const s = JSON.stringify(o);
  return { raw: s.length, gzip: gzipSync(s).length };
};
const byArea = changes.reduce((acc, c) => ({ ...acc, [c.area]: (acc[c.area] ?? 0) + 1 }), {});
const byHandling = changes.reduce((acc, c) => ({ ...acc, [c.handling]: (acc[c.handling] ?? 0) + 1 }), {});
const out = flag('out');
if (out) writeFileSync(out, `${JSON.stringify(full, null, 1)}\n`);
console.log(JSON.stringify({ report: file.split('/').pop(), mcdocMode: mode, changes: changes.length, additions: additions.length, byArea, byHandling, sizeWithAdditions: size(full), sizeAdditionsAsCounts: size(countsOnly), prettyWithAdditions: JSON.stringify(full, null, 1).length }, null, 1));
