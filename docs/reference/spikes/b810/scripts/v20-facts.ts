/**
 * B810 V20: every fact of the two targets (TargetFacts, hooks stripped), one or two levels deep,
 * whether it differs between them, its size, and the CHANGES.md row of mc-26.4 that names it.
 *
 * node docs/reference/spikes/b810/scripts/v20-facts.ts > v20-facts.json
 */
import '../../../../../tools/shared/workspace-hooks.ts';

const { readFileSync } = await import('node:fs');
const all = await import('../../../../../packages/targets/all/src/index.ts');
const a = all.targetFacts('mc-26.3') as unknown as Record<string, unknown>;
const b = all.targetFacts('mc-26.4') as unknown as Record<string, unknown>;
const changes = readFileSync(new URL('../../../../../packages/targets/mc-26.4/CHANGES.md', import.meta.url), 'utf8');
const rows = changes.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Fact') && !l.startsWith('|---'));
const GROUPS = new Set(['worldgen', 'blocks', 'entities', 'items', 'commands', 'fabric', 'geckolib', 'dev', 'folders', 'controls', 'vehicles', 'particles', 'scoreboard', 'gameRules', 'worlds', 'stats', 'packFormats', 'dataForms']);
const out: { fact: string; same: boolean; bytes26_3: number; bytes26_4: number; changesRow: string | null; rowDated: boolean }[] = [];
const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
const consider = (path: string, x: unknown, y: unknown) => {
  const name = path.split('.').at(-1) as string;
  const row = rows.find((r) => r.includes(`\`${name}\``) || r.includes(`\`${path}\``) || r.split('|')[1]?.includes(name)) ?? null;
  out.push({
    fact: path,
    same: JSON.stringify(x) === JSON.stringify(y),
    bytes26_3: x === undefined ? 0 : JSON.stringify(x).length,
    bytes26_4: y === undefined ? 0 : JSON.stringify(y).length,
    changesRow: row ? (row.split('|')[1] ?? '').trim().slice(0, 110) : null,
    rowDated: row ? /20\d\d-\d\d-\d\d/.test(row) : false,
  });
};
for (const k of keys) {
  const x = a[k];
  const y = b[k];
  if (GROUPS.has(k) && x && typeof x === 'object' && !Array.isArray(x)) {
    for (const j of [...new Set([...Object.keys(x as object), ...Object.keys((y ?? {}) as object)])].sort()) {
      consider(`${k}.${j}`, (x as Record<string, unknown>)[j], ((y ?? {}) as Record<string, unknown>)[j]);
    }
  } else consider(k, x, y);
}
console.log(JSON.stringify({ facts: out.length, differing: out.filter((f) => !f.same).length, withRow: out.filter((f) => f.changesRow).length, changesRows: rows.length, datedRows: rows.filter((r) => /20\d\d-\d\d-\d\d/.test(r)).length, out }, null, 1));
