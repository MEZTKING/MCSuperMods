import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BUDGETS,
  checkBudgets,
  type FileSize,
  formatBytes,
  LICENSED_VENDOR_FOLDERS,
  listFiles,
  type Measurements,
  measure,
  missingLicences,
  plainJsonFiles,
  report,
  summarise,
  typescriptWorkerChunks,
} from './index.ts';

const MB = 1024 * 1024;

const passing: Measurements = {
  asarBytes: 10 * MB,
  rendererFiles: [
    { path: 'assets/index.js', bytes: 500_000 },
    { path: 'assets/ts.worker-AbC123.js', bytes: 7 * MB },
    { path: 'index.html', bytes: 900 },
  ],
  mainFiles: [{ path: 'index.js', bytes: 4 * MB }],
  vendorFiles: [
    { path: 'mc-26.3/mcmeta/registries.json.gz', bytes: 145_000 },
    { path: 'mc-26.3/vanilla-mcdoc/LICENSE', bytes: 1_000 },
    { path: 'mc-26.3/vanilla-mcdoc/symbols.json.gz', bytes: 211_000 },
  ],
  plainVendorJson: [],
  looseVendorJson: [],
  missingVendorLicences: [],
  unpackedBytes: 280 * MB,
};

describe('summarise and formatBytes', () => {
  it('totals files and lists the largest first, ties by path', () => {
    const files: FileSize[] = [
      { path: 'b.js', bytes: 10 },
      { path: 'a.js', bytes: 10 },
      { path: 'c.js', bytes: 30 },
      { path: 'd.css', bytes: 1 },
    ];
    expect(summarise(files, 3)).toEqual({
      totalBytes: 51,
      largest: [
        { path: 'c.js', bytes: 30 },
        { path: 'a.js', bytes: 10 },
        { path: 'b.js', bytes: 10 },
      ],
    });
    expect(summarise([], 3)).toEqual({ totalBytes: 0, largest: [] });
  });

  it('formats bytes in binary units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 kB');
    expect(formatBytes(25 * MB)).toBe('25.0 MB');
  });
});

describe('checkBudgets', () => {
  it('passes within budget and ignores the unpacked total', () => {
    expect(checkBudgets(passing)).toEqual([]);
    expect(checkBudgets({ ...passing, unpackedBytes: 900 * MB })).toEqual([]);
  });

  it('allows exactly the threshold', () => {
    expect(
      checkBudgets({
        asarBytes: BUDGETS.asarBytes,
        rendererFiles: [
          { path: 'a.js', bytes: BUDGETS.rendererBytes - BUDGETS.rendererJsonBytes - 10 },
          { path: 'assets/ts.worker-x.js', bytes: 10 },
          { path: 'data.json', bytes: BUDGETS.rendererJsonBytes },
        ],
        mainFiles: null,
        vendorFiles: null,
        plainVendorJson: [],
        looseVendorJson: [],
        missingVendorLicences: [],
        unpackedBytes: null,
      }),
    ).toEqual([]);
  });

  it('fails an oversized app.asar', () => {
    const violations = checkBudgets({ ...passing, asarBytes: BUDGETS.asarBytes + 1 });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/^app\.asar is 32\.0 MB, over the 32\.0 MB budget/);
  });

  it('fails an oversized renderer and each large JSON file', () => {
    const violations = checkBudgets({
      ...passing,
      rendererFiles: [
        { path: 'assets/big.js', bytes: 19 * MB },
        { path: 'assets/ts.worker-x.js', bytes: 1024 },
        { path: 'assets/registries.json', bytes: 200 * 1024 },
        { path: 'assets/small.json', bytes: 1024 },
        { path: 'assets/big.js.map.txt', bytes: 200 * 1024 },
      ],
    });
    expect(violations).toEqual([
      expect.stringMatching(/^Renderer output is 19.4 MB/),
      expect.stringMatching(/^Renderer JSON assets\/registries\.json is 200\.0 kB/),
    ]);
  });

  it('has a 19 MB renderer budget (ADR 0031 D6, ADR 0091 D5, ADR 0123 D4)', () => {
    expect(BUDGETS.rendererBytes).toBe(19 * MB);
  });

  it('requires the Monaco TypeScript worker as a separate chunk', () => {
    expect(typescriptWorkerChunks(passing.rendererFiles ?? [])).toEqual([
      { path: 'assets/ts.worker-AbC123.js', bytes: 7 * MB },
    ]);
    expect(typescriptWorkerChunks([{ path: 'assets/ts.worker.css', bytes: 1 }])).toEqual([]);
    const violations = checkBudgets({
      ...passing,
      rendererFiles: [{ path: 'assets/index.js', bytes: 500_000 }],
    });
    expect(violations).toEqual([expect.stringContaining('TypeScript worker')]);
  });

  it('reports missing inputs', () => {
    expect(
      checkBudgets({
        asarBytes: null,
        rendererFiles: null,
        mainFiles: null,
        vendorFiles: null,
        plainVendorJson: [],
        looseVendorJson: [],
        missingVendorLicences: [],
        unpackedBytes: null,
      }),
    ).toEqual([expect.stringContaining('dist:dir'), expect.stringContaining('pnpm build')]);
  });

  it('fails each vendored JSON file that is not compact, naming it (ADR 0079)', () => {
    const violations = checkBudgets({
      ...passing,
      looseVendorJson: ['mc-26.4/vanilla-mcdoc/symbols.json.gz'],
    });
    expect(violations).toEqual([
      'Vendored JSON out/main/vendor/mc-26.4/vanilla-mcdoc/symbols.json.gz is not compact gzipped JSON (does not gunzip, or has line breaks): bundleVendoredData must compact and gzip it (ADRs 0079, 0123).',
    ]);
  });

  it('fails each plain vendored JSON file, naming it (ADR 0123)', () => {
    expect(
      plainJsonFiles([
        { path: 'mc-26.3/mcmeta/blocks.json', bytes: 1 },
        { path: 'mc-26.3/mcmeta/registries.json.gz', bytes: 1 },
        { path: 'mc-26.3/vanilla-mcdoc/LICENSE', bytes: 1 },
      ]),
    ).toEqual(['mc-26.3/mcmeta/blocks.json']);
    expect(checkBudgets({ ...passing, plainVendorJson: ['mc-26.3/mcmeta/blocks.json'] })).toEqual([
      'Vendored JSON out/main/vendor/mc-26.3/mcmeta/blocks.json is not gzipped: bundleVendoredData must store it as mc-26.3/mcmeta/blocks.json.gz (ADR 0123).',
    ]);
  });

  it('fails a main build without its vendor folder', () => {
    expect(checkBudgets({ ...passing, vendorFiles: null })).toEqual([
      'app/out/main/vendor not found: the main build lost the vendored target data (ADR 0079).',
    ]);
  });

  it('adds no vendor violation when main itself is missing', () => {
    expect(checkBudgets({ ...passing, mainFiles: null, vendorFiles: null })).toEqual([]);
  });

  it('fails a licensed vendored folder without its LICENSE', () => {
    expect(LICENSED_VENDOR_FOLDERS).toContain('vanilla-mcdoc');
    expect(
      missingLicences([
        { path: 'mc-26.3/vanilla-mcdoc/symbols.json', bytes: 1 },
        { path: 'mc-26.3/mcmeta/registries.json', bytes: 1 },
        { path: 'mc-26.4/vanilla-mcdoc/LICENSE', bytes: 1 },
        { path: 'mc-26.4/vanilla-mcdoc/symbols.json', bytes: 1 },
      ]),
    ).toEqual(['mc-26.3/vanilla-mcdoc']);
    expect(checkBudgets({ ...passing, missingVendorLicences: ['mc-26.3/vanilla-mcdoc'] })).toEqual([
      expect.stringMatching(
        /^Vendored folder out\/main\/vendor\/mc-26\.3\/vanilla-mcdoc has no LICENSE/,
      ),
    ]);
  });
});

describe('measure and report', () => {
  let root: string | undefined;
  afterEach(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  it('measures a fake build tree', () => {
    root = mkdtempSync(join(tmpdir(), 'msm-check-size-'));
    const renderer = join(root, 'app', 'out', 'renderer', 'assets');
    const resources = join(root, 'app', 'dist', 'linux-unpacked', 'resources');
    mkdirSync(renderer, { recursive: true });
    mkdirSync(resources, { recursive: true });
    writeFileSync(join(renderer, 'index.js'), 'x'.repeat(300));
    writeFileSync(join(renderer, 'ts.worker-1.js'), 'x'.repeat(100));
    writeFileSync(join(renderer, '..', 'index.html'), 'x'.repeat(20));
    writeFileSync(join(resources, 'app.asar'), 'x'.repeat(1000));
    const main = join(root, 'app', 'out', 'main');
    mkdirSync(join(main, 'chunks'), { recursive: true });
    writeFileSync(join(main, 'index.js'), 'x'.repeat(2048));
    writeFileSync(join(main, 'chunks', 'lazy.js'), 'x'.repeat(1024));
    const vendor = join(main, 'vendor', 'mc-26.3', 'vanilla-mcdoc');
    mkdirSync(vendor, { recursive: true });
    writeFileSync(join(vendor, 'symbols.json.gz'), gzipSync('{"a":[1,2]}'));
    writeFileSync(join(vendor, 'LICENSE'), 'MIT\nLicence text\n');
    writeFileSync(join(root, 'app', 'dist', 'linux-unpacked', 'mcsupermods'), 'x'.repeat(5000));

    const GZ_BYTES = gzipSync('{"a":[1,2]}').byteLength;
    const measured = measure(root);
    expect(measured).toEqual({
      asarBytes: 1000,
      rendererFiles: [
        { path: 'assets/index.js', bytes: 300 },
        { path: 'assets/ts.worker-1.js', bytes: 100 },
        { path: 'index.html', bytes: 20 },
      ],
      mainFiles: [
        { path: 'chunks/lazy.js', bytes: 1024 },
        { path: 'index.js', bytes: 2048 },
        { path: 'vendor/mc-26.3/vanilla-mcdoc/LICENSE', bytes: 17 },
        { path: 'vendor/mc-26.3/vanilla-mcdoc/symbols.json.gz', bytes: GZ_BYTES },
      ],
      vendorFiles: [
        { path: 'mc-26.3/vanilla-mcdoc/LICENSE', bytes: 17 },
        { path: 'mc-26.3/vanilla-mcdoc/symbols.json.gz', bytes: GZ_BYTES },
      ],
      plainVendorJson: [],
      looseVendorJson: [],
      missingVendorLicences: [],
      unpackedBytes: 6000,
    });
    expect(listFiles(join(root, 'app', 'out', 'renderer'))).toEqual(measured.rendererFiles);
    expect(checkBudgets(measured)).toEqual([]);

    const lines = report(measured);
    expect(lines[0]).toBe('Renderer output: 420 B (budget 19.0 MB), largest files:');
    expect(lines).toContain('TypeScript worker chunk: assets/ts.worker-1.js (100 B)');
    expect(lines).toContain('app.asar: 1000 B (budget 32.0 MB)');
    expect(lines).toContain(
      'Main output: index.js 2.0 kB, 3.0 kB in total (reported only), largest files:',
    );
    expect(lines).toContain('     1.0 kB  chunks/lazy.js');
    expect(lines).toContain(
      `Vendored target data: ${17 + GZ_BYTES} B in app/out/main/vendor (compact JSON, gzipped; ADRs 0079, 0123)`,
    );
    expect(lines.at(-1)).toMatch(/^Unpacked app: 5\.9 kB/);
  });

  it('reports nothing measurable for an empty tree', () => {
    root = mkdtempSync(join(tmpdir(), 'msm-check-size-'));
    expect(measure(root)).toEqual({
      asarBytes: null,
      rendererFiles: null,
      mainFiles: null,
      vendorFiles: null,
      plainVendorJson: [],
      looseVendorJson: [],
      missingVendorLicences: [],
      unpackedBytes: null,
    });
  });

  it('finds plain, indented and broken vendored JSON and a missing licence in a built tree', () => {
    root = mkdtempSync(join(tmpdir(), 'msm-check-size-'));
    const vendor = join(root, 'app', 'out', 'main', 'vendor', 'mc-26.4');
    mkdirSync(join(vendor, 'mcmeta'), { recursive: true });
    mkdirSync(join(vendor, 'vanilla-mcdoc'), { recursive: true });
    const gz = (text: string) => gzipSync(text, { level: 9 });
    writeFileSync(
      join(vendor, 'mcmeta', 'compact.json.gz'),
      gz(JSON.stringify({ a: 'line\nbreak' })),
    );
    writeFileSync(
      join(vendor, 'mcmeta', 'indented.json.gz'),
      gz(JSON.stringify({ a: [1] }, null, 2)),
    );
    writeFileSync(join(vendor, 'mcmeta', 'broken.json.gz'), '{"not":"gzip"}');
    writeFileSync(join(vendor, 'mcmeta', 'plain.json'), '{}');
    writeFileSync(join(vendor, 'vanilla-mcdoc', 'symbols.json.gz'), gz('{}'));
    writeFileSync(join(vendor, 'mcmeta', 'notes.txt'), 'a\nb\n');

    const measured = measure(root);
    expect(measured.plainVendorJson).toEqual(['mc-26.4/mcmeta/plain.json']);
    expect(measured.looseVendorJson).toEqual([
      'mc-26.4/mcmeta/broken.json.gz',
      'mc-26.4/mcmeta/indented.json.gz',
    ]);
    expect(measured.missingVendorLicences).toEqual(['mc-26.4/vanilla-mcdoc']);
    expect(checkBudgets(measured)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('out/main/vendor/mc-26.4/mcmeta/plain.json is not gzipped'),
        expect.stringContaining('out/main/vendor/mc-26.4/mcmeta/broken.json.gz is not compact'),
        expect.stringContaining('out/main/vendor/mc-26.4/mcmeta/indented.json.gz is not compact'),
        expect.stringContaining('out/main/vendor/mc-26.4/vanilla-mcdoc has no LICENSE'),
      ]),
    );
  });
});
