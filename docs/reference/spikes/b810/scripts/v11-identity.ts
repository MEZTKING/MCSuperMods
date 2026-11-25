/**
 * B810 V9 (spread) and V11: the warm dry run over every project under the given roots, and how
 * many problems each identity key calls "new on the new version".
 *
 * node docs/reference/spikes/b810/scripts/v11-identity.ts <to target> <root>... > v11.json
 * For each project: validate on its own target (today's problems), then copy, migrate, apply the
 * move and validate again. Problems are compared under four keys:
 *   K1 code + element + path;  K2 code + element;  K3 severity + element + message;
 *   K4 code + element + path with array indices removed.
 */
import '../../../../../tools/shared/workspace-hooks.ts';

const { existsSync, readdirSync, statSync } = await import('node:fs');
const { join, relative } = await import('node:path');
const { createMemoryFileSystem } = await import('../../../../../packages/core/src/index.ts');
const { builtInTargets } = await import('../../../../../packages/targets/all/src/index.ts');
const { builtInPlugins } = await import('../../../../../app/src/renderer/src/plugins/built-in.ts');
const { mcfunctionCheckerFromPlatform } = await import('../../../../../app/src/renderer/src/session/mcfunction-problems.ts');
const { ProjectSession } = await import('../../../../../app/src/renderer/src/session/project-session.ts');
const { projectFiles, readFolder } = await import('../../../../../tools/check-project/files.ts');
const { checkerPlatform } = await import('../../../../../tools/check-project/platform.ts');

const [toTarget, ...roots] = process.argv.slice(2) as [string, ...string[]];
const projects: string[] = [];
const find = (dir: string) => {
  if (existsSync(join(dir, 'msm.project.json'))) {
    projects.push(dir);
    return;
  }
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) find(p);
  }
};
for (const r of roots) find(r);

type P = { severity: string; code?: string; elementId?: string; path?: string; file?: string; message: string };
const keys: Record<string, (p: P) => string> = {
  K1: (p) => `${p.code}|${p.elementId ?? p.file}|${p.path ?? ''}`,
  K2: (p) => `${p.code}|${p.elementId ?? p.file}`,
  K3: (p) => `${p.severity}|${p.elementId ?? p.file}|${p.message}`,
  K4: (p) => `${p.code}|${p.elementId ?? p.file}|${(p.path ?? '').replace(/\/\d+(?=\/|$)/g, '/#')}`,
};
const make = (record: Record<string, Uint8Array>) => {
  const fs = createMemoryFileSystem(record);
  const { platform } = checkerPlatform(fs, '0.0.0-spike');
  const session: InstanceType<typeof ProjectSession> = new ProjectSession(platform, {
    plugins: builtInPlugins,
    targets: builtInTargets,
    validationDelay: 0,
    mcfunction: mcfunctionCheckerFromPlatform(platform.mcfunction, () => session.target.id),
    scripting: platform.scripting,
  });
  return session;
};
const pick = (ps: readonly P[]) => ps.filter((p) => p.severity === 'error' || p.severity === 'warning');

const rows: unknown[] = [];
const totals: Record<string, number> = { K1: 0, K2: 0, K3: 0, K4: 0, before: 0, after: 0, migrationChanges: 0, migrationProblems: 0 };
const times: number[] = [];
const newOnes: { project: string; problem: P; K1: boolean; K2: boolean; K3: boolean; K4: boolean }[] = [];
for (const project of projects) {
  const files = await readFolder(project);
  const record = Object.fromEntries(projectFiles(files).map((f) => [f.path, f.bytes]));
  let header: { targets?: string[] };
  try {
    header = JSON.parse(new TextDecoder().decode(record['msm.project.json']));
  } catch {
    continue;
  }
  if (header.targets?.[0] === toTarget) continue;
  const before = make(record);
  if (!(await before.loadSnapshot(project)).ok) continue;
  await before.flushValidation();
  const pb = pick(before.snapshot.problems as P[]);
  const t0 = performance.now();
  const after = make(Object.fromEntries(Object.entries(record).map(([k, v]) => [k, new Uint8Array(v)])));
  await after.loadSnapshot(project);
  const report = await after.upgradeTargetPreview(toTarget);
  await after.upgradeTarget(toTarget, report);
  await after.lowerExpandedProject();
  const ms = performance.now() - t0;
  times.push(ms);
  const pa = [...pick(report.problems as P[]), ...pick(after.snapshot.problems as P[])];
  const row: Record<string, unknown> = { project: relative(process.cwd(), project), elements: after.snapshot.project?.namespaces.reduce((n, ns) => n + ns.elements.length, 0), ms: Math.round(ms), before: pb.length, after: pa.length, changes: report.changes.length };
  for (const [k, f] of Object.entries(keys)) {
    const seen = new Set(pb.map(f));
    const n = pa.filter((p) => !seen.has(f(p))).length;
    row[k] = n;
    totals[k] = (totals[k] ?? 0) + n;
  }
  for (const p of pa) {
    const flags = Object.fromEntries(Object.entries(keys).map(([k, f]) => [k, !new Set(pb.map(f)).has(f(p))])) as Record<'K1' | 'K2' | 'K3' | 'K4', boolean>;
    if (flags.K1 || flags.K2 || flags.K3 || flags.K4) newOnes.push({ project: row.project as string, problem: p, ...flags });
  }
  totals.before = (totals.before ?? 0) + pb.length;
  totals.after = (totals.after ?? 0) + pa.length;
  totals.migrationChanges = (totals.migrationChanges ?? 0) + report.changes.length;
  totals.migrationProblems = (totals.migrationProblems ?? 0) + report.problems.length;
  rows.push(row);
  before.dispose();
  after.dispose();
}
times.sort((a, b) => a - b);
const q = (f: number) => Math.round(times[Math.min(times.length - 1, Math.floor(f * times.length))] ?? 0);
console.log(
  JSON.stringify(
    { toTarget, projects: rows.length, totals, warmDryRunMs: { min: q(0), median: q(0.5), p90: q(0.9), max: q(1) }, newOnes, rows },
    null,
    1,
  ),
);
