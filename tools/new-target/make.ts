/**
 * Makes a target folder from the newest one, or re-pins one (ADR 0136 D11): copy, vendor the
 * new version's data, recompute the derived facts, write the generated change set and its draft,
 * draft the upstream facts and write `VERIFY.md`. Everything is built in a work folder first; a
 * real run then moves the new folder into `packages/targets/`, or copies back only the vendored
 * data, the change set and the drafts of a re-pin. A dry run leaves the work folder where it is,
 * outside the repository.
 *
 * @packageDocumentation
 */

import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { additionsText, changeSetText, diffTargets, readTarget } from '../diff-targets/diff.ts';
import { draftText } from '../diff-targets/draft.ts';
import {
  compareFacts,
  type FactComparison,
  factDiffLines,
  type Json,
  plainFacts,
  readVendored,
  releaseLine,
  targetIdOf,
  VERSION_PATTERN,
} from './derive.ts';
import { draftUpstream, propertiesDraft } from './fabric-meta.ts';
import { type FetchText, type Manifest, readManifest, type Syncers } from './upstream.ts';
import { type ChangeSetSummary, factPaths, verifyText } from './verify.ts';

/** Folders never copied: installs and build output. */
const NEVER_COPIED = new Set(['node_modules', 'dist-types', '.turbo']);

/**
 * Files that describe the step from the previous target to this one; a new target starts
 * without them (its own step is drafted in `src/changes/generated.json`).
 */
export const STEP_FILES = [
  'src/migrate.ts',
  'src/removed-ids.ts',
  'src/changes',
  'test/migrate.test.ts',
  'test/removed-ids.test.ts',
  'test/changes.test.ts',
  'VERIFY.md',
  'CHANGES-draft.md',
  'drafts',
];

/** What a re-pin copies back into the real folder: everything else stays as it was. */
export const REPIN_OUTPUTS = [
  'vendor',
  'src/changes/generated.json',
  'src/changes/generated.additions.json',
  'CHANGES-draft.md',
  'VERIFY.md',
  'drafts',
];

/** Loads a target folder's facts (its `src/index.ts` `target`), hooks left out. */
export type LoadFacts = (folder: string) => Promise<Record<string, Json>>;

export const loadFacts: LoadFacts = async (folder) => {
  const module = (await import(pathToFileURL(join(folder, 'src', 'index.ts')).href)) as {
    target?: unknown;
  };
  if (module.target === undefined) throw new Error(`${folder}/src/index.ts exports no target`);
  return plainFacts(module.target);
};

export interface RunOptions {
  /** The repository root (the folder holding `packages/targets/`). */
  root: string;
  /** `new`: make `mc-<line of version>` from `base`; `repin`: refresh `base` to `version`. */
  mode: 'new' | 'repin';
  base: string;
  version: string;
  /** The vanilla-mcdoc commit to vendor; the newest on its default branch when left out. */
  mcdocRef?: string;
  /** Write everything here, outside the repository, and nothing into it. */
  dryRunOut?: string;
  /** The date written into the drafts (`YYYY-MM-DD`); today when left out. */
  date?: string;
  syncers: Syncers;
  fetcher: FetchText;
  loadFacts?: LoadFacts;
  log?: (line: string) => void;
}

export interface RunResult {
  /** Where the target folder now is (in the repository, or the dry run's folder). */
  folder: string;
  id: string;
  facts: FactComparison[];
  /** Facts set in `target.ts` (new targets only) and the ones the tool could not set. */
  applied: string[];
  notApplied: string[];
  /** The paths written, relative to `folder`. */
  written: string[];
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const posix = (path: string): string => path.split(sep).join('/');

/** Whether `path` is `folder` or inside it. */
export function isInside(path: string, folder: string): boolean {
  const rel = relative(resolve(folder), resolve(path));
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !/^[a-zA-Z]:/.test(rel));
}

/** Copies a target folder, leaving out installs, build output and (for `new`) the step files. */
export async function copyTargetFolder(
  from: string,
  to: string,
  mode: 'new' | 'repin',
): Promise<void> {
  const skipped = mode === 'new' ? new Set(STEP_FILES) : new Set<string>();
  await cp(from, to, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (source) => {
      const rel = posix(relative(from, source));
      if (rel === '') return true;
      if (rel.split('/').some((part) => NEVER_COPIED.has(part))) return false;
      return !skipped.has(rel);
    },
  });
}

/**
 * Replaces the first capture group of the one match of `pattern` with `value`; `undefined` when
 * the pattern matches none or more than one place.
 */
export function replaceOnce(text: string, pattern: RegExp, value: string): string | undefined {
  const flags = [...new Set(`${pattern.flags}gd`)].join('');
  const matches = [...text.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) return undefined;
  const span = (matches[0] as RegExpMatchArray & { indices: [number, number][] }).indices[1];
  if (span === undefined) return undefined;
  return text.slice(0, span[0]) + value + text.slice(span[1]);
}

const quote = (value: string): string =>
  `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;

/** Where each identity fact is written in a `target.ts`, most specific first. */
const LITERALS: readonly { fact: string; patterns: RegExp[]; write: (v: Json) => string }[] = [
  {
    fact: 'id',
    patterns: [/\bconst ID = '([^']*)'/, /^ {2}id: '([^']*)',/m],
    write: (v) => quote(String(v)).slice(1, -1),
  },
  {
    fact: 'mcVersion',
    patterns: [/\bconst MC_VERSION = '([^']*)'/, /^ {2}mcVersion: '([^']*)',/m],
    write: (v) => quote(String(v)).slice(1, -1),
  },
  { fact: 'channel', patterns: [/^ {2}channel: '([^']*)',/m], write: (v) => String(v) },
  { fact: 'mcdocRef', patterns: [/^ {2}mcdocRef: '([^']*)',/m], write: (v) => String(v) },
  { fact: 'mcmetaRef', patterns: [/^ {2}mcmetaRef: '([^']*)',/m], write: (v) => String(v) },
  { fact: 'dataVersion', patterns: [/^ {2}dataVersion: (\d+),/m], write: (v) => String(v) },
  {
    fact: 'packFormats.resource',
    patterns: [/\bresource: (\{ major: \d+, minor: \d+ \})/],
    write: (v) => {
      const f = v as { major: number; minor: number };
      return `{ major: ${f.major}, minor: ${f.minor} }`;
    },
  },
  {
    fact: 'packFormats.data',
    patterns: [/\bdata: (\{ major: \d+, minor: \d+ \})/],
    write: (v) => {
      const f = v as { major: number; minor: number };
      return `{ major: ${f.major}, minor: ${f.minor} }`;
    },
  },
  {
    fact: 'worldgen.noiseSettingsDefaultBlock',
    patterns: [
      /\bconst NOISE_SETTINGS_DEFAULT_BLOCK = (true|false)\b/,
      /^ {4}noiseSettingsDefaultBlock: (true|false),/m,
    ],
    write: (v) => String(v),
  },
];

/** Removes the import lines of the step files and the `changes` and `migrateFrom` members. */
export function removeStepWiring(text: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  let out = text.replace(
    /^import[^;]*?from '\.\/(?:migrate|removed-ids|changes)(?:\/[^']*)?';\r?\n/gm,
    (line) => {
      removed.push(line.trim().replace(/\s+/g, ' '));
      return '';
    },
  );
  for (const name of ['changes', 'migrateFrom']) {
    const lines = out.split('\n');
    const start = lines.findIndex((l) => new RegExp(`^ {2}${name}(,|:)`).test(l));
    if (start < 0) continue;
    let end = start;
    let depth = 0;
    for (let i = start; i < lines.length; i++) {
      const code = (lines[i] as string).replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, "''");
      for (const ch of code) {
        if ('([{'.includes(ch)) depth++;
        else if (')]}'.includes(ch)) depth--;
      }
      end = i;
      if (depth <= 0 && code.trimEnd().endsWith(',')) break;
    }
    removed.push(`${name} member`);
    lines.splice(start, end - start + 1);
    out = lines.join('\n');
  }
  return { text: out, removed };
}

/** Sets the identity facts and the new target's own lines in a copied `target.ts`. */
export function rewriteTargetSource(
  text: string,
  facts: readonly FactComparison[],
  options: { previous: string; version: string; base: string; date: string },
): { text: string; applied: string[]; notApplied: string[] } {
  const applied: string[] = [];
  const notApplied: string[] = [];
  let out = text;
  const header = `/**\n * Facts for Minecraft Java ${releaseLine(options.version)}, pinned to ${options.version}. Drafted by\n * \`tools/new-target\` on ${options.date} from ${options.base}: every value but the identity facts is\n * still ${options.base}'s until \`VERIFY.md\` has been worked through (ADR 0136 D11).\n */\n`;
  if (out.startsWith('/**')) {
    const close = out.indexOf('*/');
    out = header + out.slice(close + 2).replace(/^\r?\n/, '');
  } else out = header + out;
  for (const literal of LITERALS) {
    const fact = facts.find((f) => f.fact === literal.fact);
    if (fact === undefined || fact.after === undefined || fact.after === null) {
      notApplied.push(literal.fact);
      continue;
    }
    const value = literal.write(fact.after);
    const next = literal.patterns
      .map((p) => replaceOnce(out, p, value))
      .find((t) => t !== undefined);
    if (next === undefined) notApplied.push(literal.fact);
    else {
      out = next;
      applied.push(literal.fact);
    }
  }
  const previous = replaceOnce(out, /^ {2}previous: '([^']*)',/m, options.previous);
  if (previous === undefined) notApplied.push('previous');
  else {
    out = previous;
    applied.push('previous');
  }
  const wiring = removeStepWiring(out);
  return { text: wiring.text, applied, notApplied };
}

/** The new target's `CHANGES.md` until facts are verified. */
export function changesStub(id: string, version: string, base: string, date: string): string {
  return [
    `# Target ${id} — changes and facts`,
    '',
    `Minecraft Java ${releaseLine(version)}, pinned to \`${version}\`. Made by \`tools/new-target\` on ${date} from \`${base}\`.`,
    '',
    '## Verified facts',
    '',
    `None yet. Work through \`VERIFY.md\`: move each fact here once it has been read on \`${version}\`, with its date and source, as in ${base}'s \`CHANGES.md\`.`,
    '',
    '| Fact | Value | Source |',
    '|---|---|---|',
    '',
    '## Vendored data',
    '',
    '- `vendor/vanilla-mcdoc/symbols.json`: Spyglass symbol export, regenerated by `tools/sync-mcdoc`.',
    '- `vendor/mcmeta/`: `version.json`, `registries.json`, `commands.json`, `blocks.json`, regenerated by `tools/sync-mcmeta`.',
    '- `vendor/worldgen/feature-order.json`: regenerated by `tools/sync-feature-order`.',
    '',
    `## What changed from ${base}`,
    '',
    '`src/changes/generated.json` (written by `tools/diff-targets`; in words in `CHANGES-draft.md`).',
    '',
  ].join('\n');
}

async function write(folder: string, rel: string, text: string, written: string[]): Promise<void> {
  const path = join(folder, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
  written.push(rel);
}

async function listNames(folder: string, keep: (name: string) => boolean): Promise<string[]> {
  try {
    return (await readdir(folder)).filter(keep).sort();
  } catch {
    return [];
  }
}

/** Runs `new` or `repin`; throws on anything that stops it, before the repository is touched. */
export async function runNewTarget(options: RunOptions): Promise<RunResult> {
  const log = options.log ?? (() => {});
  const { root, mode, base, version } = options;
  const date = options.date ?? new Date().toISOString().slice(0, 10);
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(
      `--version must be a release (1.2, 1.2.1) or a test version (1.3-snapshot-4, 1.3-pre-1, 1.3-rc-1), got ${version}`,
    );
  }
  const targets = join(root, 'packages', 'targets');
  const baseFolder = join(targets, base);
  if (!(await exists(join(baseFolder, 'src', 'index.ts')))) {
    throw new Error(`no target folder ${posix(relative(root, baseFolder))}`);
  }
  const id = targetIdOf(version);
  if (mode === 'new' && (await exists(join(targets, id)))) {
    throw new Error(`packages/targets/${id} exists: re-pin it with --repin ${id}`);
  }
  if (mode === 'repin' && id !== base) {
    throw new Error(`${version} is not on ${base}'s line: make ${id} with --from ${base}`);
  }
  if (options.dryRunOut !== undefined && isInside(options.dryRunOut, root)) {
    throw new Error('--out must be outside the repository');
  }
  const scratch =
    options.dryRunOut === undefined
      ? await mkdtemp(join(tmpdir(), 'msm-new-target-'))
      : resolve(options.dryRunOut);
  const work = join(scratch, id);
  if (await exists(work)) throw new Error(`${work} exists: choose an empty --out`);

  try {
    const load = options.loadFacts ?? loadFacts;
    log(`reading ${base}'s facts`);
    const before = await load(baseFolder);
    const baseVersion = String(before.mcVersion ?? '');
    let changesMd = '';
    try {
      changesMd = await readFile(join(baseFolder, 'CHANGES.md'), 'utf8');
    } catch {
      log(`${base} has no CHANGES.md`);
    }
    const oldData = mode === 'repin' ? await readTarget(baseFolder) : undefined;

    log(`copying ${base} to ${work}`);
    await copyTargetFolder(baseFolder, work, mode);

    const mcdocRef = options.mcdocRef ?? (await options.syncers.latestMcdocRef(log));
    await options.syncers.mcmeta(version, join(work, 'vendor', 'mcmeta'), log);
    await options.syncers.mcdoc(mcdocRef, join(work, 'vendor', 'vanilla-mcdoc'), log);
    await options.syncers.featureOrder(
      version,
      join(work, 'vendor', 'worldgen', 'feature-order.json'),
      log,
    );

    const facts = compareFacts(before, await readVendored(work));
    for (const line of factDiffLines(facts)) log(`fact ${line}`);

    const written: string[] = ['vendor/mcmeta', 'vendor/vanilla-mcdoc', 'vendor/worldgen'];
    let applied: string[] = [];
    let notApplied: string[] = [];
    if (mode === 'new') {
      const targetPath = join(work, 'src', 'target.ts');
      const rewritten = rewriteTargetSource(await readFile(targetPath, 'utf8'), facts, {
        previous: base,
        version,
        base,
        date,
      });
      applied = rewritten.applied;
      notApplied = rewritten.notApplied;
      await write(work, 'src/target.ts', rewritten.text, written);
      const pkgPath = join(work, 'package.json');
      const pkg = await readFile(pkgPath, 'utf8');
      await write(
        work,
        'package.json',
        pkg.replace(`"name": "@msm/target-${base}"`, `"name": "@msm/target-${id}"`),
        written,
      );
      const indexPath = join(work, 'src', 'index.ts');
      const index = (await readFile(indexPath, 'utf8'))
        .split('\n')
        .map((l) =>
          /^\s*(\/\*\*|\*)/.test(l)
            ? l
                .replaceAll(baseVersion, version)
                .replaceAll(base, id)
                .replaceAll(releaseLine(baseVersion), releaseLine(version))
            : l,
        )
        .join('\n');
      await write(work, 'src/index.ts', index, written);
      await write(work, 'CHANGES.md', changesStub(id, version, base, date), written);
      log(`set in target.ts: ${applied.join(', ') || 'nothing'}`);
      if (notApplied.length > 0) log(`not set (do it by hand): ${notApplied.join(', ')}`);
    }

    const previous =
      mode === 'new'
        ? base
        : /^ {2}previous: '([^']*)',/m.exec(
            await readFile(join(work, 'src', 'target.ts'), 'utf8'),
          )?.[1];
    let changeSet: ChangeSetSummary | undefined;
    const newData = await readTarget(work);
    if (previous !== undefined && (await exists(join(targets, previous, 'vendor')))) {
      const diff = diffTargets(await readTarget(join(targets, previous)), newData);
      await write(work, 'src/changes/generated.json', changeSetText(diff), written);
      await write(work, 'src/changes/generated.additions.json', additionsText(diff), written);
      await write(work, 'CHANGES-draft.md', draftText(diff), written);
      const set = diff.changeSet;
      changeSet = {
        from: set.from,
        to: set.to,
        changes: set.changes.length,
        manual: set.changes.filter((c) => c.handling === 'manual').length,
        subjects: [
          ...new Set(set.changes.flatMap((c) => [c.registry ?? '', c.subject.split('/')[0] ?? ''])),
        ].filter((s) => s.length > 2),
      };
      log(`change set ${set.from} to ${set.to}: ${set.changes.length} changes`);
    } else log('no previous target folder: no change set');
    if (oldData !== undefined) {
      const since = diffTargets(oldData, newData);
      await write(work, `drafts/since-${oldData.version}.md`, draftText(since), written);
      log(`since ${oldData.version}: ${since.changeSet.changes.length} changes`);
    }

    let manifest: Manifest | undefined;
    try {
      manifest = await readManifest(options.fetcher);
    } catch (error) {
      log(`Mojang's version manifest could not be read: ${(error as Error).message}`);
    }
    const upstream = await draftUpstream(version, options.fetcher, manifest);
    await write(work, 'drafts/engine-mod.properties', propertiesDraft(upstream, date), written);

    const tests = await listNames(join(work, 'test'), (n) => n.endsWith('.test.ts'));
    const fixtures = await listNames(
      join(root, 'fixtures'),
      (n) => n.startsWith('sample-') || n.endsWith('-parity'),
    );
    await write(
      work,
      'VERIFY.md',
      verifyText({
        mode,
        id,
        version,
        base: { id: base, version: baseVersion },
        ...(previous === undefined ? {} : { previous }),
        date,
        changesMd,
        facts,
        paths: factPaths(before),
        upstream,
        applied,
        notApplied,
        ...(changeSet === undefined ? {} : { changeSet }),
        tests,
        fixtures,
      }),
      written,
    );

    let folder = work;
    if (options.dryRunOut === undefined) {
      folder = join(targets, id);
      if (mode === 'new') await cp(work, folder, { recursive: true, verbatimSymlinks: true });
      else {
        for (const rel of REPIN_OUTPUTS) {
          const source = join(work, rel);
          if (!(await exists(source))) continue;
          if (rel === 'drafts') await rm(join(folder, rel), { recursive: true, force: true });
          await cp(source, join(folder, rel), { recursive: true });
        }
      }
    }
    log(`${mode === 'new' ? 'made' : 're-pinned'} ${posix(folder)}; read VERIFY.md next`);
    return { folder, id, facts, applied, notApplied, written: [...new Set(written)].sort() };
  } finally {
    if (options.dryRunOut === undefined) await rm(scratch, { recursive: true, force: true });
  }
}
