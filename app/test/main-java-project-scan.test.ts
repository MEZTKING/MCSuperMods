// @vitest-environment node
/**
 * The read-only scan of an ejected Java project (B822, ADR 0136 D8): what it reads, what it
 * only counts, what it never follows, and that the folder is the same afterwards; its path rules
 * and limits agree with `@msm/exporters`' (main imports no `@msm/*` code at run time).
 */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EXPORT_MANIFEST_FILE,
  isJavaSourcePath,
  isUpgradeScanPath,
  UPGRADE_BUILD_FILES,
  UPGRADE_SCAN_LIMITS,
} from '@msm/exporters';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createJavaProjectScanService,
  isCountedJavaPath,
  isScannedPath,
  SCAN_LIMITS,
  scanJavaProjectFolder,
} from '../src/main/platform/java-project-scan';
import { InvokeChannels, ipcContract, JAVA_SCAN_MAX_FILES } from '../src/shared/ipc-contract';

const made: string[] = [];
afterEach(async () => {
  for (const folder of made.splice(0)) await rm(folder, { recursive: true, force: true });
});

async function folder(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'msm-b822-scan-'));
  made.push(path);
  return path;
}

async function put(root: string, path: string, text: string): Promise<void> {
  const file = join(root, ...path.split('/'));
  await mkdir(join(file, '..'), { recursive: true });
  await writeFile(file, text);
}

async function hashOf(root: string, at = ''): Promise<string> {
  const hash = createHash('sha256');
  const visit = async (sub: string): Promise<void> => {
    const entries = await readdir(join(root, sub), { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const entry of entries) {
      const path = sub === '' ? entry.name : `${sub}/${entry.name}`;
      hash.update(`${path}\0${entry.isSymbolicLink() ? 'l' : entry.isDirectory() ? 'd' : 'f'}\0`);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(path);
      else hash.update(await readFile(join(root, path)));
    }
  };
  await visit(at);
  return hash.digest('hex');
}

const PATHS = [
  ...UPGRADE_BUILD_FILES,
  EXPORT_MANIFEST_FILE,
  'src/main/resources/data/my_mod/recipe/ruby.json',
  'src/main/resources/data/my_mod/function/tick.mcfunction',
  'src/main/resources/assets/my_mod/models/block/ruby.json',
  'src/main/resources/assets/my_mod/textures/block/ruby.png',
  'src/main/resources/assets/my_mod/textures/block/ruby.png.mcmeta',
  'src/main/resources/pack.mcmeta',
  'src/main/resources/data/My Mod/recipe/x.json',
  'src/main/java/com/example/RubyMod.java',
  'src/client/java/com/example/Client.java',
  'gradlew',
  'gradle/wrapper/gradle-wrapper.jar',
  'notes/README.md',
  'build/resources/main/data/my_mod/recipe/ruby.json',
];

describe('the Java project scan', () => {
  it('reads the paths and keeps the limits that @msm/exporters gives', () => {
    for (const path of PATHS) {
      expect(isScannedPath(path), path).toBe(isUpgradeScanPath(path));
      expect(isCountedJavaPath(path), path).toBe(isJavaSourcePath(path));
    }
    expect(SCAN_LIMITS).toEqual(UPGRADE_SCAN_LIMITS);
    expect(JAVA_SCAN_MAX_FILES).toBe(UPGRADE_SCAN_LIMITS.maxFiles);
  });

  it('reads the build and resource files, counts the Java, follows no link, changes nothing', async () => {
    const root = await folder();
    const outside = await folder();
    await put(outside, 'secret.json', '{"x": "minecraft:flowing_water"}');
    await put(root, 'gradle.properties', 'minecraft_version=1.0\n');
    await put(root, EXPORT_MANIFEST_FILE, '{"minecraft": "1.0"}');
    await put(root, 'src/main/resources/fabric.mod.json', '{"id": "my_mod"}');
    await put(root, 'src/main/resources/data/my_mod/recipe/ruby.json', '{"type": "x"}');
    await put(root, 'src/main/resources/data/my_mod/function/a.mcfunction', 'say hi\n');
    await put(root, 'src/main/resources/data/my_mod/recipe/big.json', `"${'a'.repeat(2048)}"`);
    await put(root, 'src/main/java/com/example/RubyMod.java', 'class RubyMod {}');
    await put(root, 'src/main/java/com/example/block/Ruby.java', 'class Ruby {}');
    await put(root, 'build/resources/main/data/my_mod/recipe/ruby.json', '{}');
    await put(root, 'notes.txt', 'not read');
    await symlink(outside, join(root, 'src/main/resources/data/linked'));
    await symlink(
      join(outside, 'secret.json'),
      join(root, 'src/main/resources/data/my_mod/recipe/linked.json'),
    );
    const before = await hashOf(root);
    const scan = await scanJavaProjectFolder(root, { ...SCAN_LIMITS, maxFileBytes: 1024 });
    expect(await hashOf(root)).toBe(before);
    expect(scan.files.map((file) => file.path)).toEqual([
      'gradle.properties',
      'msm.export.json',
      'src/main/resources/data/my_mod/function/a.mcfunction',
      'src/main/resources/data/my_mod/recipe/ruby.json',
      'src/main/resources/fabric.mod.json',
    ]);
    expect(scan.files[0]?.text).toBe('minecraft_version=1.0\n');
    expect(scan.javaFiles).toBe(2);
    expect(scan.truncated).toBeUndefined();
    // The answer passes the channel's own check.
    expect(ipcContract[InvokeChannels.exportsScanJavaProject].response.parse(scan)).toEqual(scan);
  });

  it('stops at the file limit and says so', async () => {
    const root = await folder();
    for (let index = 0; index < 4; index++) {
      await put(root, `src/main/resources/data/m/recipe/r${index}.json`, '{}');
    }
    const scan = await scanJavaProjectFolder(root, { ...SCAN_LIMITS, maxFiles: 2 });
    expect(scan.files).toHaveLength(2);
    expect(scan.truncated).toBe(true);
  });

  it('asks for the folder first and scans nothing when cancelled', async () => {
    const root = await folder();
    await put(root, 'gradle.properties', 'x=1\n');
    const titles: string[] = [];
    const service = (answer: string | null) =>
      createJavaProjectScanService({
        pickFolder: async ({ title }) => {
          titles.push(title);
          return answer;
        },
      });
    expect(await service(null).scan('Choose')).toBeNull();
    expect((await service(root).scan('Choose'))?.files).toHaveLength(1);
    expect(titles).toEqual(['Choose', 'Choose']);
    await expect(scanJavaProjectFolder('relative/path')).rejects.toThrow('absolute');
  });
});
