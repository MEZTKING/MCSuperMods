// B810 V7: ground truth of renames from Mojang's patch notes, and precision and recall of the
// candidates of candidates.ts against it.
//
// node v7-score.mjs truth <notes .txt files...> --from-registries <json> --to-registries <json> > truth.json
//   Extracts "X renamed to Y", "Y (renamed from X)", "Renamed X to Y", "Renamed from X" (under a
//   "Changed Y" heading) and "X -> Y" statements, and keeps the pairs whose old id was a registry
//   member before and whose new id is one after (net renames across the version step). Prints ids
//   only (the notes themselves are not kept).
// node v7-score.mjs score <truth.json> <candidates.json> [extra-truth.json]
//   Prints precision and recall of the proposed candidates at several score thresholds.
import { readFileSync } from 'node:fs';

const [mode, ...rest] = process.argv.slice(2);
const flag = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const strip = (s) => s.replace(/^#?minecraft:/, '').replace(/^#/, '').replace(/\.png$/, '').replace(/[.,;:)]+$/, '');

if (mode === 'truth') {
  const files = rest.filter((a, i) => !a.startsWith('--') && !rest[i - 1]?.startsWith('--'));
  const regA = JSON.parse(readFileSync(flag('from-registries'), 'utf8'));
  const regB = JSON.parse(readFileSync(flag('to-registries'), 'utf8'));
  const id = String.raw`#?(?:minecraft:)?[a-z0-9_./]+`;
  const pats = [
    new RegExp(`(${id}) (?:has been |was )?renamed to (${id})`, 'g'),
    new RegExp(`(${id}) \\(renamed from (${id})\\)`, 'g'),
    new RegExp(`Renamed (?:the )?(${id})(?: tag)? to (${id})`, 'g'),
    new RegExp(`(?:Changed|Updated) (${id})[^/\\n]{0,40}?/? ?-? ?Renamed from (${id})`, 'g'),
    new RegExp(`(${id}) -> (${id})`, 'g'),
  ];
  const raw = [];
  for (const f of files) {
    const t = readFileSync(f, 'utf8').replace(/\n/g, ' / ');
    pats.forEach((re, k) => {
      for (const m of t.matchAll(re)) {
        let [from, to] = [m[1], m[2]];
        if (k === 1 || k === 3) [from, to] = [m[2], m[1]];
        raw.push({ from: strip(from), to: strip(to), file: f.split('/').pop() });
      }
    });
  }
  const PREFIXES = ['', 'gui/sprites/', 'textures/'];
  const full = (reg, x) => PREFIXES.map((p) => p + x).find((y) => Object.values(reg).some((l) => l.includes(y))) ?? x;
  const where = (reg, x) => Object.keys(reg).filter((r) => reg[r].includes(x));
  const net = [];
  const seen = new Set();
  for (const r0 of raw) {
    const r = { ...r0, from: full(regA, r0.from), to: full(regB, r0.to) };
    const before = where(regA, r.from);
    const after = where(regB, r.to);
    const goneAfter = !after.some((reg) => regB[reg].includes(r.from));
    if (before.length && after.length && goneAfter) {
      const key = `${r.from}>${r.to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      net.push({ from: r.from, to: r.to, registriesBefore: before, registriesAfter: after, notes: r.file });
    }
  }
  console.log(JSON.stringify({ statements: raw.length, net }, null, 1));
} else if (mode === 'score') {
  const truth = JSON.parse(readFileSync(rest[0], 'utf8')).net;
  const cand = JSON.parse(readFileSync(rest[1], 'utf8'));
  const extra = rest[2] ? JSON.parse(readFileSync(rest[2], 'utf8')) : [];
  const all = [...truth, ...extra];
  const isTrue = (c) => all.some((t) => t.from === c.from && t.to === c.to);
  const rows = [];
  for (const th of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7]) {
    const p = cand.proposed.filter((c) => c.score >= th);
    const tp = p.filter(isTrue);
    const found = all.filter((t) => p.some((c) => c.from === t.from && c.to === t.to));
    rows.push({ threshold: th, proposed: p.length, correct: tp.length, precision: p.length ? +(tp.length / p.length).toFixed(2) : null, recall: +(found.length / all.length).toFixed(2), truth: all.length });
  }
  const missed = all.filter((t) => !cand.proposed.some((c) => c.from === t.from && c.to === t.to));
  console.log(JSON.stringify({ rows, missedAtAnyThreshold: missed.map((t) => `${t.from} -> ${t.to}`) }, null, 1));
}
