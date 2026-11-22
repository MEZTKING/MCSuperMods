// Keeps only observations of MSM's own content: drops the vanilla advancement positions and every resolved string
// (game text from the language file); keeps keys, arguments and styles. Client widget labels are kept only when the
// fixture wrote them.
import { readFileSync, writeFileSync } from 'node:fs';
const [inp, out, kind] = process.argv.slice(2);
const r = JSON.parse(readFileSync(inp, 'utf8'));
const OURS = new Set(['Notice', 'Confirm', 'Many', 'List', 'Links', 'Plain', 'A plain message body of a few words.', 'Three diamonds', 'Name', 'Agree', 'Pick: Two', 'How many: 5', 'OK', 'Yes', 'No', 'One', 'Two', 'Three', 'Four', 'Five', 'Back', '']);
function strip(o) {
  if (Array.isArray(o)) return o.map(strip);
  if (o && typeof o === 'object') {
    const c = {};
    for (const [k, v] of Object.entries(o)) {
      if (k === 'string') continue;
      if (k === 'style' && typeof v === 'string') { c[k] = v.replace(/EntityTooltipInfo@[0-9a-f]+/g, 'EntityTooltipInfo').replace(/insertion=[0-9a-f-]{36}/, 'insertion=<uuid>'); continue; }
      c[k] = strip(v);
    }
    return c;
  }
  return o;
}
if (kind === 'server') {
  delete r['adv.vanilla'];
  for (const k of ['death', 'chat', 'ench.names']) r[k] = strip(r[k]);
  for (const m of Object.values(r.mod ?? {})) m.tooltip = strip(m.tooltip);
} else {
  for (const [k, v] of Object.entries(r)) for (const w of v.widgets ?? []) if (!OURS.has(w.message)) w.message = '(game text)';
  if (r['advancements.screen']) for (const w of r['advancements.screen'].widgets) w.message = '(game text)';
}
writeFileSync(out, JSON.stringify(r, null, 1) + '\n');
