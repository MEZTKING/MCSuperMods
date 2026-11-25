/**
 * B810 V9 (and V11, V15): the cost of ADR 0136 D4's dry run, phase by phase, with the app's own
 * ProjectSession (as tools/check-project runs it), and the problems before and after.
 *
 * node docs/reference/spikes/b810/scripts/v9-dryrun.ts <project folder> <to target> [--worker]
 *   [--problems <out.json>]
 * Phases: read the folder; open and validate and lower on the project's own target (today's
 * problems, as the app already has them); copy; open the copy; migrate (preview); apply the move
 * (target switch, which loads the second schema context); validate; lower. Prints milliseconds and
 * heap per phase. With --worker the whole run happens in a worker thread; --skip-before leaves out
 * the own-target validation and lowering (the app already has them), so a cold worker measures
 * the dry run alone.
 */
import '../../../../../tools/shared/workspace-hooks.ts';

const { Worker, isMainThread, workerData, parentPort } = await import('node:worker_threads');
const { writeFileSync } = await import('node:fs');

const args = isMainThread ? process.argv.slice(2) : (workerData as string[]);
const folder = args[0] as string;
const toTarget = args[1] as string;
const problemsOut = args.includes('--problems') ? args[args.indexOf('--problems') + 1] : undefined;

if (isMainThread && args.includes('--worker')) {
  const t0 = performance.now();
  const w = new Worker(new URL(import.meta.url), { workerData: args.filter((a) => a !== '--worker') });
  w.on('message', (m) => console.log(JSON.stringify({ ...m, worker: true, wallMsIncludingWorkerStart: Math.round(performance.now() - t0) }, null, 1)));
  w.on('error', (e) => console.error('worker error', e));
} else {
  const { createMemoryFileSystem } = await import('../../../../../packages/core/src/index.ts');
  const { builtInTargets } = await import('../../../../../packages/targets/all/src/index.ts');
  const { builtInPlugins } = await import('../../../../../app/src/renderer/src/plugins/built-in.ts');
  const { mcfunctionCheckerFromPlatform } = await import('../../../../../app/src/renderer/src/session/mcfunction-problems.ts');
  const { ProjectSession } = await import('../../../../../app/src/renderer/src/session/project-session.ts');
  const { projectFiles, readFolder } = await import('../../../../../tools/check-project/files.ts');
  const { checkerPlatform } = await import('../../../../../tools/check-project/platform.ts');

  const phases: Record<string, number> = {};
  const heap: Record<string, number> = {};
  let t = performance.now();
  const mark = (name: string) => {
    const now = performance.now();
    phases[name] = Math.round(now - t);
    heap[name] = Math.round(process.memoryUsage().heapUsed / 1e6);
    t = now;
  };
  const files = await readFolder(folder);
  mark('read folder');
  const makeSession = (fsFiles: Record<string, Uint8Array>) => {
    const fs = createMemoryFileSystem(fsFiles);
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
  const record = Object.fromEntries(projectFiles(files).map((f) => [f.path, f.bytes]));
  const skipBefore = args.includes('--skip-before');
  const before = makeSession(record);
  await before.loadSnapshot(folder);
  mark('open (own target)');
  if (!skipBefore) await before.flushValidation();
  mark('validate (own target)');
  const loweredBefore = skipBefore ? { files: [] } : await before.lowerExpandedProject();
  mark('lower (own target)');
  const projectBytes = Object.values(record).reduce((n, b) => n + b.byteLength, 0);
  const copy = Object.fromEntries(Object.entries(record).map(([k, v]) => [k, new Uint8Array(v)]));
  mark('copy files');
  const after = makeSession(copy);
  await after.loadSnapshot(folder);
  mark('open copy');
  const report = await after.upgradeTargetPreview(toTarget);
  mark('migrate (preview)');
  await after.upgradeTarget(toTarget, report);
  mark('apply move + second schema context');
  await after.flushValidation();
  mark('validate (new target)');
  const loweredAfter = await after.lowerExpandedProject();
  mark('lower (new target)');
  const pick = (ps: readonly { severity: string; code?: string; elementId?: string; path?: string; file?: string; message: string }[]) =>
    ps.filter((p) => p.severity === 'error' || p.severity === 'warning').map((p) => ({ severity: p.severity, code: p.code, elementId: p.elementId, path: p.path, file: p.file, message: p.message }));
  const problemsBefore = pick(before.snapshot.problems);
  const problemsAfter = pick(after.snapshot.problems);
  const result = {
    folder,
    toTarget,
    elements: before.snapshot.project?.namespaces.reduce((n, ns) => n + ns.elements.length, 0),
    projectBytes,
    loweredFilesBefore: loweredBefore.files.length,
    loweredFilesAfter: loweredAfter.files.length,
    migration: { changes: report.changes.length, problems: report.problems.length },
    problemsBefore: problemsBefore.length,
    problemsAfter: problemsAfter.length,
    phasesMs: phases,
    dryRunMs: ['copy files', 'open copy', 'migrate (preview)', 'apply move + second schema context', 'validate (new target)', 'lower (new target)'].reduce((n, k) => n + (phases[k] ?? 0), 0),
    dryRunWithoutLoweringMs: ['copy files', 'open copy', 'migrate (preview)', 'apply move + second schema context', 'validate (new target)'].reduce((n, k) => n + (phases[k] ?? 0), 0),
    heapMb: heap,
    rssMb: Math.round(process.memoryUsage().rss / 1e6),
  };
  if (problemsOut) writeFileSync(problemsOut, JSON.stringify({ problemsBefore, problemsAfter, migration: report }, null, 1));
  before.dispose();
  after.dispose();
  if (isMainThread) console.log(JSON.stringify(result, null, 1));
  else parentPort?.postMessage(result);
}
