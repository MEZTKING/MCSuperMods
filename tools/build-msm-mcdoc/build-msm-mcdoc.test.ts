import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkSymbols,
  exportMsmMcdoc,
  formatSymbols,
  isUpToDate,
  listSources,
  type MsmSymbols,
  OUTPUT_FILE,
  REF_PREFIX,
  readCheckedIn,
  SOURCE_DIR,
  sourceRef,
} from './index.ts';

const temporary: string[] = [];

afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function sourceFolder(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'msm-build-msm-mcdoc-test-'));
  temporary.push(root);
  const dir = join(root, 'msm');
  await mkdir(dir);
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, name), text);
  return dir;
}

describe('build-msm-mcdoc', () => {
  it('the checked-in symbols.json matches a fresh export of the mcdoc sources', async () => {
    expect(await listSources(SOURCE_DIR)).toEqual([
      'action.mcdoc',
      'animation.mcdoc',
      'definition.mcdoc',
      'element.mcdoc',
      'geometry.mcdoc',
      'mod.mcdoc',
    ]);
    const fresh = await exportMsmMcdoc();
    const current = await readCheckedIn();
    expect(current, 'stale export: run `node tools/build-msm-mcdoc/index.ts`').toEqual(
      JSON.parse(JSON.stringify(fresh)),
    );
    expect(await isUpToDate()).toBe(true);
    // The checked-in text is exactly what the script writes.
    expect(await readFile(OUTPUT_FILE, 'utf8')).toBe(await formatSymbols(fresh));
  }, 60_000);

  it('exports a local folder and detects a stale export', async () => {
    const dir = await sourceFolder({
      'a.mcdoc': 'struct A {\n\tlevel: int @ 0..15,\n\tb?: super::b::B,\n}\n',
      'b.mcdoc': 'struct B {\n\tname: string,\n}\n',
    });
    const symbols = await exportMsmMcdoc(dir);
    expect(Object.keys(symbols.mcdoc).sort()).toEqual(['::msm::a::A', '::msm::b::B']);
    expect(symbols.ref.startsWith(REF_PREFIX)).toBe(true);
    const out = join(dir, '..', 'symbols.json');
    await writeFile(out, JSON.stringify(symbols));
    expect(await isUpToDate(dir, out)).toBe(true);
    await writeFile(join(dir, 'b.mcdoc'), 'struct B {\n\tname?: string,\n}\n');
    expect(await isUpToDate(dir, out)).toBe(false);
  }, 60_000);

  it('rejects dangling references, which mcdoc-cli exports silently', async () => {
    const dir = await sourceFolder({ 'a.mcdoc': 'struct A {\n\tb: Missing,\n}\n' });
    await expect(exportMsmMcdoc(dir)).rejects.toThrow(/unknown type ::msm::a::Missing/);
  }, 60_000);

  it('checkSymbols reports paths and dispatchers outside msm', () => {
    const symbols: MsmSymbols = {
      ref: 'x',
      mcdoc: {
        '::java::X': { kind: 'boolean' },
        '::msm::a::A': {
          kind: 'struct',
          fields: [
            { kind: 'spread', type: { kind: 'dispatcher', registry: 'msm:nope' } },
            { kind: 'pair', key: 'x', type: { kind: 'reference', path: '::msm::a::Gone' } },
          ],
        },
      },
      'mcdoc/dispatcher': { 'minecraft:thing': {} },
    };
    expect(checkSymbols(symbols)).toEqual([
      '::java::X: not under ::msm',
      'dispatcher minecraft:thing: not under msm:',
      '::msm::a::A: dispatcher over unknown registry msm:nope',
      '::msm::a::A: reference to unknown type ::msm::a::Gone',
    ]);
  });

  it('sourceRef depends on names and contents, not order or line endings', () => {
    const a = { name: 'a.mcdoc', text: 'struct A {}\n' };
    const b = { name: 'b.mcdoc', text: 'struct B {}\n' };
    expect(sourceRef([a, b])).toBe(sourceRef([b, a]));
    expect(sourceRef([a, b])).toBe(sourceRef([{ ...a, text: 'struct A {}\r\n' }, b]));
    expect(sourceRef([a, b])).not.toBe(sourceRef([a, { ...b, text: 'struct C {}\n' }]));
  });
});
