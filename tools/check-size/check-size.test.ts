import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BUDGETS,
  checkBudgets,
  type FileSize,
  formatBytes,
  listFiles,
  type Measurements,
  measure,
  report,
  summarise,
} from './index.ts';

const MB = 1024 * 1024;

const passing: Measurements = {
  asarBytes: 10 * MB,
  rendererFiles: [
    { path: 'assets/index.js', bytes: 500_000 },
    { path: 'index.html', bytes: 900 },
  ],
  mainFiles: [{ path: 'index.js', bytes: 4 * MB }],
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
          { path: 'a.js', bytes: BUDGETS.rendererBytes - BUDGETS.rendererJsonBytes },
          { path: 'data.json', bytes: BUDGETS.rendererJsonBytes },
        ],
        mainFiles: null,
        unpackedBytes: null,
      }),
    ).toEqual([]);
  });

  it('fails an oversized app.asar', () => {
    const violations = checkBudgets({ ...passing, asarBytes: BUDGETS.asarBytes + 1 });
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/^app\.asar is 25\.0 MB, over the 25\.0 MB budget/);
  });

  it('fails an oversized renderer and each large JSON file', () => {
    const violations = checkBudgets({
      ...passing,
      rendererFiles: [
        { path: 'assets/big.js', bytes: 8 * MB },
        { path: 'assets/registries.json', bytes: 200 * 1024 },
        { path: 'assets/small.json', bytes: 1024 },
        { path: 'assets/big.js.map.txt', bytes: 200 * 1024 },
      ],
    });
    expect(violations).toEqual([
      expect.stringMatching(/^Renderer output is 8\.4 MB/),
      expect.stringMatching(/^Renderer JSON assets\/registries\.json is 200\.0 kB/),
    ]);
  });

  it('reports missing inputs', () => {
    expect(
      checkBudgets({
        asarBytes: null,
        rendererFiles: null,
        mainFiles: null,
        unpackedBytes: null,
      }),
    ).toEqual([expect.stringContaining('dist:dir'), expect.stringContaining('pnpm build')]);
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
    writeFileSync(join(renderer, '..', 'index.html'), 'x'.repeat(20));
    writeFileSync(join(resources, 'app.asar'), 'x'.repeat(1000));
    const main = join(root, 'app', 'out', 'main');
    mkdirSync(join(main, 'chunks'), { recursive: true });
    writeFileSync(join(main, 'index.js'), 'x'.repeat(2048));
    writeFileSync(join(main, 'chunks', 'lazy.js'), 'x'.repeat(1024));
    writeFileSync(join(root, 'app', 'dist', 'linux-unpacked', 'mcsupermods'), 'x'.repeat(5000));

    const measured = measure(root);
    expect(measured).toEqual({
      asarBytes: 1000,
      rendererFiles: [
        { path: 'assets/index.js', bytes: 300 },
        { path: 'index.html', bytes: 20 },
      ],
      mainFiles: [
        { path: 'chunks/lazy.js', bytes: 1024 },
        { path: 'index.js', bytes: 2048 },
      ],
      unpackedBytes: 6000,
    });
    expect(listFiles(join(root, 'app', 'out', 'renderer'))).toEqual(measured.rendererFiles);
    expect(checkBudgets(measured)).toEqual([]);

    const lines = report(measured);
    expect(lines[0]).toBe('Renderer output: 320 B (budget 8.0 MB), largest files:');
    expect(lines).toContain('app.asar: 1000 B (budget 25.0 MB)');
    expect(lines).toContain('Main output: index.js 2.0 kB, 3.0 kB in total (reported only)');
    expect(lines.at(-1)).toMatch(/^Unpacked app: 5\.9 kB/);
  });

  it('reports nothing measurable for an empty tree', () => {
    root = mkdtempSync(join(tmpdir(), 'msm-check-size-'));
    expect(measure(root)).toEqual({
      asarBytes: null,
      rendererFiles: null,
      mainFiles: null,
      unpackedBytes: null,
    });
  });
});
