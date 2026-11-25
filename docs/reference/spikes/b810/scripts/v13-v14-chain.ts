/**
 * B810 V13 (moving back) and V14 (chains), with the app's ProjectSession.
 *
 * node docs/reference/spikes/b810/scripts/v13-v14-chain.ts <project folder>
 *
 * V13: move the project 26.3 -> 26.4 (the real hook), record what each change dropped (path and
 * value, from the before and after data), edit one changed element, then move back to 26.3 and put
 * the dropped values back where the place is free; compare with the original.
 * V14: a stand-in third target `mc-26.5` (the 26.4 target with its own id, version and hook, its
 * vendored data read from mc-26.4's) with two invented changes: the feature type `minecraft:ore`
 * renamed to `minecraft:mineral_vein` (same shape, applied) and `disable_mob_generation` dropped
 * from noise settings. 26.3 -> 26.5 as one chained step on an in-memory copy against two moves in
 * the session (26.3 -> 26.4 -> 26.5); then undo.
 */
import '../../../../../tools/shared/workspace-hooks.ts';

const { createMemoryFileSystem } = await import('../../../../../packages/core/src/index.ts');
const { builtInTargets } = await import('../../../../../packages/targets/all/src/index.ts');
const { builtInPlugins } = await import('../../../../../app/src/renderer/src/plugins/built-in.ts');
const { mcfunctionCheckerFromPlatform } = await import('../../../../../app/src/renderer/src/session/mcfunction-problems.ts');
const { ProjectSession } = await import('../../../../../app/src/renderer/src/session/project-session.ts');
const { projectFiles, readFolder } = await import('../../../../../tools/check-project/files.ts');
const { checkerPlatform } = await import('../../../../../tools/check-project/platform.ts');
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Project = import('../../../../../packages/plugin-api/src/index.ts').Project;
type Target = import('../../../../../packages/plugin-api/src/index.ts').Target;
type MigrationReport = import('../../../../../packages/plugin-api/src/index.ts').MigrationReport;

const folder = process.argv[2] as string;
const files = await readFolder(folder);
const record = Object.fromEntries(projectFiles(files).map((f) => [f.path, f.bytes]));

// ----- the stand-in third target -----
const t264 = builtInTargets.find((b) => b.target.id === 'mc-26.4');
if (!t264) throw new Error('no mc-26.4');
const isObj = (v: Json | undefined): v is { [k: string]: Json } => typeof v === 'object' && v !== null && !Array.isArray(v);
const standIn: Target = {
  ...t264.target,
  id: 'mc-26.5',
  mcVersion: '26.5-snapshot-1',
  migrateFrom(previous: Target, project: Project): MigrationReport {
    if (previous.id !== 'mc-26.4') return { changes: [], problems: [{ severity: 'warning', code: 'target.no-migration-path', message: `There is no migration from ${previous.id} to mc-26.5.` }] };
    const changes: MigrationReport['changes'] = [];
    for (const ns of project.namespaces) {
      for (const el of ns.elements) {
        let data: Json | undefined;
        const parts: string[] = [];
        if (el.kind === 'minecraft:worldgen/feature' && isObj(el.data as Json) && (el.data as { type?: string }).type === 'minecraft:ore') {
          data = structuredClone(el.data as Json) as { [k: string]: Json };
          (data as { [k: string]: Json }).type = 'minecraft:mineral_vein';
          parts.push('Renamed minecraft:ore → minecraft:mineral_vein');
        }
        if (el.kind === 'minecraft:worldgen/noise_settings' && isObj(el.data as Json) && 'disable_mob_generation' in (el.data as object)) {
          data = data ?? (structuredClone(el.data as Json) as Json);
          delete (data as { [k: string]: Json }).disable_mob_generation;
          parts.push('Removed /disable_mob_generation');
        }
        if (data !== undefined) changes.push({ elementId: el.id, kind: 'update', description: `${parts.join('; ')} for Minecraft 26.5.`, data });
      }
    }
    return { changes, problems: [] };
  },
};
const targets = [{ ...t264, target: standIn }, ...builtInTargets];

const make = () => {
  const fs = createMemoryFileSystem(Object.fromEntries(Object.entries(record).map(([k, v]) => [k, new Uint8Array(v)])));
  const { platform } = checkerPlatform(fs, '0.0.0-spike');
  const readVendored = platform.targets.readVendored;
  platform.targets.readVendored = (id: string, key: never) => readVendored(id === 'mc-26.5' ? 'mc-26.4' : id, key);
  const session: InstanceType<typeof ProjectSession> = new ProjectSession(platform, {
    plugins: builtInPlugins,
    targets,
    validationDelay: 0,
    mcfunction: mcfunctionCheckerFromPlatform(platform.mcfunction, () => (session.target.id === 'mc-26.5' ? 'mc-26.4' : session.target.id)),
    scripting: platform.scripting,
  });
  return session;
};
const project = (s: InstanceType<typeof ProjectSession>) => s.snapshot.project as Project;
const canon = (p: Project) =>
  JSON.stringify({ targets: p.targets, elements: p.namespaces.flatMap((n) => n.elements.map((e) => [e.id, e.kind, e.data])).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) });
const dataOf = (p: Project) => new Map(p.namespaces.flatMap((n) => n.elements.map((e) => [e.id, e.data as Json] as const)));

/** Leaves present in `a` and absent in `b`, as [pointer segments, value]. */
function dropped(a: Json, b: Json | undefined, at: (string | number)[] = []): [(string | number)[], Json][] {
  if (isObj(a)) {
    const out: [(string | number)[], Json][] = [];
    for (const [k, v] of Object.entries(a)) {
      if (!isObj(b) || !(k in b)) out.push([[...at, k], v]);
      else out.push(...dropped(v, b[k], [...at, k]));
    }
    return out;
  }
  return [];
}
const get = (root: Json, seg: (string | number)[]): Json | undefined => seg.reduce<Json | undefined>((n, s) => (n === undefined ? undefined : isObj(n) ? n[s as string] : Array.isArray(n) ? n[s as number] : undefined), root);

const result: Record<string, unknown> = { folder };

// ----- V13 -----
{
  const s = make();
  await s.loadSnapshot(folder);
  const original = structuredClone(project(s));
  const report = await s.upgradeTargetPreview('mc-26.4');
  const beforeData = dataOf(original);
  // What the saved report must hold to restore: element, path, the dropped value, and the data after.
  const saved = report.changes.map((c) => ({ elementId: c.elementId, dropped: dropped(beforeData.get(c.elementId) as Json, c.data as Json), after: c.data as Json }));
  await s.upgradeTarget('mc-26.4', report);
  // Edit one moved element in a way that does not touch the dropped field.
  const edited = saved[0]?.elementId;
  if (edited) {
    const el = project(s).namespaces.flatMap((n) => n.elements).find((e) => e.id === edited);
    const data = structuredClone(el?.data as Json) as { [k: string]: Json };
    if (isObj(data) && typeof data.sea_level === 'number') data.sea_level = (data.sea_level as number) + 1;
    else if (isObj(data)) data.__spike_edit = 1;
    s.setElementData(edited as never, data as never);
    await s.flushValidation();
  }
  // Move back: the older target has no hook, so the session only switches; then put values back.
  const back = await s.upgradeTargetPreview('mc-26.3');
  const restoreChanges: MigrationReport['changes'] = [];
  const notRestored: string[] = [];
  const now = dataOf(project(s));
  for (const entry of saved) {
    const current = now.get(entry.elementId);
    if (current === undefined) {
      notRestored.push(`${entry.elementId}: element gone`);
      continue;
    }
    const data = structuredClone(current);
    for (const [seg, value] of entry.dropped) {
      const parent = get(data, seg.slice(0, -1));
      const key = seg.at(-1) as string;
      if (!isObj(parent)) notRestored.push(`${entry.elementId}${seg.join('/')}: parent gone`);
      else if (key in parent) notRestored.push(`${entry.elementId}/${seg.join('/')}: place taken`);
      else parent[key] = value;
    }
    restoreChanges.push({ elementId: entry.elementId, kind: 'update', description: 'Put back', data });
  }
  await s.upgradeTarget('mc-26.3', { changes: [...back.changes, ...restoreChanges], problems: [] });
  const roundTrip = project(s);
  const differing = [...dataOf(original)].filter(([id, d]) => JSON.stringify(d) !== JSON.stringify(dataOf(roundTrip).get(id))).map(([id]) => id);
  result.v13 = {
    changes: report.changes.length,
    droppedValues: saved.reduce((n, x) => n + x.dropped.length, 0),
    savedReportBytes: JSON.stringify(saved.map((x) => ({ elementId: x.elementId, dropped: x.dropped }))).length,
    backHookAnswer: back.problems.map((p) => p.message),
    editedElement: edited ?? null,
    editApplied: true,
    notRestored,
    differingFromOriginal: differing.map((id) => {
      const a = dataOf(original).get(id) as Json;
      const b = dataOf(roundTrip).get(id) as Json;
      const leaves = (x: Json, at = ''): string[] => (isObj(x) ? Object.entries(x).flatMap(([k, v]) => leaves(v, `${at}/${k}`)) : [`${at}=${JSON.stringify(x)}`]);
      const la = new Set(leaves(a));
      const lb = new Set(leaves(b));
      return { id, onlyBefore: [...la].filter((x) => !lb.has(x)), onlyAfter: [...lb].filter((x) => !la.has(x)) };
    }),
    problemsAfterRoundTrip: s.snapshot.problems.filter((p) => p.severity === 'error').length,
  };
  s.dispose();
}

// ----- V14 -----
{
  // Two moves in the session.
  const s = make();
  await s.loadSnapshot(folder);
  const original = canon(project(s));
  const r1 = await s.upgradeTargetPreview('mc-26.4');
  await s.upgradeTarget('mc-26.4', r1);
  const r2 = await s.upgradeTargetPreview('mc-26.5');
  await s.upgradeTarget('mc-26.5', r2);
  const twoMoves = canon(project(s));
  const undo1 = s.undo();
  const afterOneUndo = canon(project(s));
  const undo2 = s.undo();
  const afterTwoUndos = canon(project(s));
  // One hop 26.3 -> 26.5 without a chain: the stand-in's hook only knows 26.4.
  const d = make();
  await d.loadSnapshot(folder);
  const direct = await d.upgradeTargetPreview('mc-26.5');
  // The chain on an in-memory copy: each hook in order, changes applied between hops, merged.
  let copy = structuredClone(project(d));
  const merged = new Map<string, Json>();
  let prev: Target = builtInTargets.find((b) => b.target.id === 'mc-26.3')?.target as Target;
  const chainProblems: string[] = [];
  for (const next of [t264.target, standIn]) {
    const rep = next.migrateFrom?.(prev, copy) ?? { changes: [], problems: [] };
    chainProblems.push(...rep.problems.map((p) => `${next.id}: ${p.code}`));
    copy = structuredClone(copy);
    for (const c of rep.changes) {
      for (const ns of copy.namespaces) for (const e of ns.elements) if (e.id === c.elementId && c.data !== undefined) (e as { data: unknown }).data = structuredClone(c.data);
      if (c.data !== undefined) merged.set(c.elementId, c.data as Json);
    }
    copy = { ...copy, targets: [next.id] } as Project;
    prev = next;
  }
  await d.upgradeTarget('mc-26.5', { changes: [...merged].map(([elementId, data]) => ({ elementId: elementId as never, kind: 'update', description: 'chain', data })), problems: [] });
  const chained = canon(project(d));
  const undoChain = d.undo();
  const afterChainUndo = canon(project(d));
  result.v14 = {
    hop1Changes: r1.changes.length,
    hop2Changes: r2.changes.length,
    directOneHop: { changes: direct.changes.length, problems: direct.problems.map((p) => p.code) },
    chainProblems,
    mergedChanges: merged.size,
    chainEqualsTwoMoves: chained === twoMoves,
    undo: { twoMovesNeedTwoUndos: undo1 && afterOneUndo !== original && undo2 && afterTwoUndos === original, chainIsOneUndo: undoChain && afterChainUndo === original },
  };
  s.dispose();
  d.dispose();
}
console.log(JSON.stringify(result, null, 1));
