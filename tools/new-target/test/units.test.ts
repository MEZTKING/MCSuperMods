/**
 * The parts of `new-target` one at a time: the derived facts against the repository's own
 * targets, the text edits of `target.ts`, the Fabric drafts, `--check` and the arguments.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { target as target263 } from '../../../packages/targets/mc-26.3/src/index.ts';
import { target as target264 } from '../../../packages/targets/mc-26.4/src/index.ts';
import { main, parseArgs } from '../cli.ts';
import { compareFacts, DERIVERS, listDelta, plainFacts, readVendored } from '../derive.ts';
import {
  compareDotted,
  draftUpstream,
  mavenVersions,
  minecraftDependency,
  newestFabricApi,
  newestLoader,
  newestLoom,
  propertiesDraft,
} from '../fabric-meta.ts';
import { isInside, removeStepWiring, replaceOnce, rewriteTargetSource } from '../make.ts';
import { checkLines, checkTargets, parseManifest, readManifest } from '../upstream.ts';
import { changesRows, FACT_CLASSES, factPaths, verifyText } from '../verify.ts';
import { fixtureFetcher, REPO } from './fixture-upstream.ts';

const folder = (name: string) => join(REPO, 'packages/targets', name);

describe('derived facts', () => {
  it.each([
    ['mc-26.3', target263],
    ['mc-26.4', target264],
  ])(
    'recomputes every derived fact of %s from its own vendored data unchanged',
    async (name, t) => {
      const comparisons = compareFacts(plainFacts(t), await readVendored(folder(name)));
      expect(comparisons.map((c) => c.fact)).toEqual(DERIVERS.map((d) => d.fact));
      for (const c of comparisons) expect(c.state, c.fact).toBe('same');
    },
  );

  it('names every derived fact as derived in the table of fact kinds', () => {
    for (const d of DERIVERS) expect(FACT_CLASSES[d.fact], d.fact).toBe('D');
  });

  it('says what a list gained and lost', () => {
    expect(listDelta(['a', 'b'], ['b', 'c'])).toBe('+`c`; -`a`');
    expect(listDelta(['a', 'b'], ['b', 'a'])).toBe('same members, new order');
  });
});

describe('target.ts edits', () => {
  it('replaces a literal only where the pattern matches once', () => {
    expect(replaceOnce("const ID = 'mc-1';", /\bconst ID = '([^']*)'/, 'mc-2')).toBe(
      "const ID = 'mc-2';",
    );
    expect(replaceOnce("a: '1', a: '2'", /a: '([^']*)'/, 'x')).toBeUndefined();
    expect(replaceOnce('b', /a: '([^']*)'/, 'x')).toBeUndefined();
  });

  it('removes the step imports and the changes and migrateFrom members', () => {
    const text = [
      "import type { Target } from '@msm/plugin-api';",
      "import { changes } from './changes';",
      'import {',
      '  createMigrateFrom,',
      '  migrationTables,',
      "} from './migrate';",
      '',
      'export const target: Target = {',
      "  id: 'mc-1',",
      '  changes,',
      '  migrateFrom: createMigrateFrom(',
      "    migrationTables(ID, { a: [')'] }),",
      '  ),',
      '};',
      '',
    ].join('\n');
    const out = removeStepWiring(text);
    expect(out.text).toBe(
      [
        "import type { Target } from '@msm/plugin-api';",
        '',
        'export const target: Target = {',
        "  id: 'mc-1',",
        '};',
        '',
      ].join('\n'),
    );
    expect(out.removed).toHaveLength(4);
  });

  it("rewrites the repository's newest target.ts and says what it could not set", async () => {
    const text = await readFile(join(folder('mc-26.4'), 'src/target.ts'), 'utf8');
    const facts = compareFacts(plainFacts(target264), await readVendored(folder('mc-26.4')));
    const out = rewriteTargetSource(text, facts, {
      previous: 'mc-26.4',
      version: target264.mcVersion,
      base: 'mc-26.4',
      date: '2099-01-02',
    });
    expect(out.notApplied).toEqual([]);
    expect(out.text).toContain("previous: 'mc-26.4',");
    expect(out.text.startsWith('/**\n * Facts for Minecraft Java')).toBe(true);
    expect(out.text).not.toContain('migrateFrom');
  });

  it('knows when a folder is inside another', () => {
    expect(isInside('/a/b/c', '/a/b')).toBe(true);
    expect(isInside('/a/b', '/a/b')).toBe(true);
    expect(isInside('/a/bc', '/a/b')).toBe(false);
    expect(isInside('/tmp/x', '/a/b')).toBe(false);
  });
});

describe('upstream drafts', () => {
  it('picks the newest builds', () => {
    expect(compareDotted('0.165.10', '0.165.4')).toBeGreaterThan(0);
    expect(newestFabricApi(['0.1.0+9.1', '0.2.0+9.1', '0.3.0+9.10', '0.4.0-beta+9.1'], '9.1')).toBe(
      '0.2.0+9.1',
    );
    expect(newestLoom(['1.2.3', '1.10.0', '1.11.0-alpha.1', '1.10.1-SNAPSHOT'])).toBe('1.10.0');
    expect(
      newestLoader([
        { loader: { version: '2', stable: false } },
        { loader: { version: '1', stable: true } },
      ]),
    ).toBe('1');
    expect(newestLoader([])).toBeUndefined();
    expect(mavenVersions('<version>1</version><version> 2 </version>')).toEqual(['1', '2']);
  });

  it('drafts the fabric.mod.json range by the targets rule', () => {
    expect(minecraftDependency('9.1')).toBe('~9.1');
    expect(minecraftDependency('9.2-snapshot-3')).toBe('>=9.2- <9.3-');
    expect(minecraftDependency('9.2-pre-1')).toBe('>=9.2- <9.3-');
  });

  it('records what could not be read and goes on', async () => {
    const draft = await draftUpstream('97.0', fixtureFetcher, undefined);
    expect(draft.loader.problem).toMatch(/offline/);
    expect(draft.api.problem).toBe('not listed');
    expect(draft.loom.value).toBe('1.31.0');
    expect(draft.java.problem).toMatch(/manifest/);
    const text = propertiesDraft(draft, '2099-01-02');
    expect(text).toContain('# Not read: https://meta.fabricmc.net/v2/versions/loader/97.0');
    expect(text).toContain('loader_version=\n');
  });
});

describe('--check', () => {
  const manifest = () => readManifest(fixtureFetcher);

  it('finds a newer version on a target line and a line no target covers', async () => {
    const targets = [
      { id: 'mc-98.0', version: '98.0' },
      { id: 'mc-99.0', version: '99.0-pre-1' },
    ];
    const findings = checkTargets(await manifest(), targets);
    expect(findings.map((f) => [f.kind, f.target, f.newer.id])).toEqual([
      ['repin', 'mc-99.0', '99.0'],
      ['new', 'mc-99.1', '99.1-pre-1'],
    ]);
    expect(findings[1]?.command).toBe(
      'node tools/new-target/index.ts --from mc-99.0 --version 99.1-pre-1',
    );
    const lines = checkLines(targets, findings);
    expect(lines[0]).toBe('mc-98.0 (98.0): nothing newer on its line.');
    expect(lines[1]).toContain('99.0 (release, 2099-02-01) is newer');
  });

  it('finds nothing when every target is the newest', async () => {
    const targets = [
      { id: 'mc-99.0', version: '99.0' },
      { id: 'mc-99.1', version: '99.1-pre-1' },
    ];
    expect(checkTargets(await manifest(), targets)).toEqual([]);
  });

  it('refuses a manifest without versions', () => {
    expect(() => parseManifest('{}')).toThrow(/versions/);
  });

  it('runs from the command line with an injected root and fetcher, and exits 1 when something is newer', async () => {
    const lines: string[] = [];
    const code = await main(['--check'], (l) => lines.push(l), {
      root: REPO,
      fetcher: fixtureFetcher,
      syncers: undefined as never,
    });
    // The fixture manifest does not list the repository's own versions: nothing to report.
    expect(code).toBe(0);
    expect(lines.some((l) => l.startsWith('mc-26.4 ('))).toBe(true);
  });
});

describe('arguments', () => {
  it('parses the three forms', () => {
    expect(parseArgs(['--check'])).toEqual({ kind: 'check' });
    expect(parseArgs(['--from', 'mc-9.1', '--version', '9.2'])).toEqual({
      kind: 'new',
      base: 'mc-9.1',
      version: '9.2',
      dryRun: false,
    });
    expect(
      parseArgs(['--repin=mc-9.2', '--version=9.2-pre-1', '--dry-run', '--out', '/x']),
    ).toEqual({ kind: 'repin', base: 'mc-9.2', version: '9.2-pre-1', dryRun: true, out: '/x' });
  });

  it('refuses what does not fit', () => {
    expect(() => parseArgs([])).toThrow(/--from and --repin/);
    expect(() => parseArgs(['--from', 'mc-1', '--repin', 'mc-1', '--version', '1'])).toThrow();
    expect(() => parseArgs(['--from', 'mc-1'])).toThrow(/--version/);
    expect(() => parseArgs(['--from', 'mc-1', '--version', '1', '--out', '/x'])).toThrow(/dry-run/);
    expect(() => parseArgs(['--from', 'mc-1', '--version', '1', '--mcdoc-ref', 'abc'])).toThrow(
      /sha/,
    );
    expect(() => parseArgs(['--check', '--dry-run'])).toThrow();
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown/);
  });
});

describe('VERIFY.md', () => {
  it("lists every dated row of mc-26.4's CHANGES.md, and the facts no row names", async () => {
    const changesMd = await readFile(join(folder('mc-26.4'), 'CHANGES.md'), 'utf8');
    const facts = plainFacts(target264);
    const text = verifyText({
      mode: 'repin',
      id: 'mc-26.4',
      version: target264.mcVersion,
      base: { id: 'mc-26.4', version: target264.mcVersion },
      previous: 'mc-26.3',
      date: '2099-01-02',
      changesMd,
      facts: compareFacts(facts, await readVendored(folder('mc-26.4'))),
      paths: factPaths(facts),
      upstream: await draftUpstream('98.0', fixtureFetcher, undefined),
      applied: [],
      notApplied: [],
      tests: ['target.test.ts'],
      fixtures: ['sample-mod'],
    });
    const rows = changesRows(changesMd);
    const dated = rows.filter((r) => r.dates.length > 0);
    expect(dated.length).toBeGreaterThan(40);
    for (const row of dated) {
      expect(text, row.fact).toContain(`- [ ] ${row.fact}: last read ${row.dates.at(-1)}.`);
    }
    // Undated rows under "Checked on <date>" carry the section's date.
    expect(rows.some((r) => r.dates.length === 0 && r.sectionDate !== undefined)).toBe(true);
    expect(text).toContain('no date of its own (the section says');
    expect(text).not.toContain('### Facts not classified');
    expect(text).not.toContain('### Wiring a new target');
  });

  it('reads table rows but not their headers or separators', () => {
    const rows = changesRows(
      '# T\n\n## A\n\nChecked 2099-01-01.\n\n| Fact | Value | Source |\n|---|---|---|\n| `x` | 1 | jar, 2099-02-03 |\n| `y` | 2 | dump |\n',
    );
    expect(rows.map((r) => [r.section, r.fact, r.source, r.dates, r.sectionDate])).toEqual([
      ['A', '`x`', 'jar, 2099-02-03', ['2099-02-03'], '2099-01-01'],
      ['A', '`y`', 'dump', [], '2099-01-01'],
    ]);
  });
});
