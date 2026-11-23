/**
 * Shared fixtures for the instance tests: an in-memory file system that can rename and checks
 * after every change that no half-made instance or world folder is visible, the two targets'
 * facts, and a made-up Prism data folder full of foreign instances.
 */

import type { FabricFacts } from '@msm/plugin-api';
import {
  type RecipeMod,
  type RecipePack,
  type RecipeTargetFacts,
  webCryptoSha512,
} from '../../src/index';
import { MemoryInstallFileSystem } from '../helpers/memory-install-fs';

export const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
export const text = (data: Uint8Array): string => new TextDecoder().decode(data);
export const sha512 = webCryptoSha512;

function fabric(api: string): FabricFacts {
  return { loader: '0.20.1', api, loom: '1.0.0', minecraftDependency: '~test', gradle: '9.0.0' };
}

/** A release target, shaped as the default target is. */
export const RELEASE: RecipeTargetFacts = {
  mcVersion: '9.1',
  channel: 'release',
  java: 25,
  fabric: fabric('0.165.2+9.1'),
};

/** A snapshot target, shaped as the second target is. */
export const SNAPSHOT: RecipeTargetFacts = {
  mcVersion: '9.2-snapshot-7',
  channel: 'snapshot',
  java: 25,
  fabric: fabric('0.165.4+9.2'),
};

export const TARGETS = [RELEASE, SNAPSHOT] as const;

export const ROOT = '/prism';
export const INSTANCES = '/prism/instances';

/**
 * A {@link MemoryInstallFileSystem} with `rename` (refusing an existing target, as the Node
 * adapter does) and a check after every change: each visible folder in `watched` instances
 * folders must be a whole instance (`instance.cfg`, `mmc-pack.json` and the marker) unless it
 * was there before (`foreign`), and each visible world in a managed instance's `saves/` must
 * hold `level.dat`. A failed check is recorded in `violations`.
 */
export class StagingMemoryFs extends MemoryInstallFileSystem {
  readonly violations: string[] = [];
  readonly foreign = new Set<string>();
  watched: string[] = [INSTANCES];
  /** Called once before the next rename (to simulate a race). */
  beforeRename: (() => void) | null = null;

  /** Records every current child of the watched folders as foreign (not checked). */
  markForeign(): this {
    for (const dir of this.dirs) {
      for (const watched of this.watched) {
        if (dir.startsWith(`${watched}/`) && !dir.slice(watched.length + 1).includes('/')) {
          this.foreign.add(dir);
        }
      }
    }
    return this;
  }

  private check(op: string): void {
    for (const watched of this.watched) {
      for (const dir of this.dirs) {
        if (!dir.startsWith(`${watched}/`)) continue;
        const name = dir.slice(watched.length + 1);
        if (name.includes('/') || name.startsWith('.') || this.foreign.has(dir)) continue;
        for (const file of ['instance.cfg', 'mmc-pack.json', '.msm-managed.json']) {
          if (!this.files.has(`${dir}/${file}`)) {
            this.violations.push(`${op}: ${dir} visible without ${file}`);
          }
        }
        for (const game of [`${dir}/minecraft/saves`, `${dir}/.minecraft/saves`]) {
          for (const world of this.dirs) {
            if (!world.startsWith(`${game}/`)) continue;
            const rest = world.slice(game.length + 1);
            if (rest.includes('/') || rest.startsWith('.')) continue;
            if (!this.files.has(`${world}/level.dat`)) {
              this.violations.push(`${op}: world ${world} visible without level.dat`);
            }
          }
        }
      }
    }
  }

  override async writeFile(absPath: string, data: Uint8Array): Promise<void> {
    await super.writeFile(absPath, data);
    this.check(`write ${absPath}`);
  }

  override async mkdirp(absPath: string): Promise<void> {
    await super.mkdirp(absPath);
    this.check(`mkdirp ${absPath}`);
  }

  override async remove(absPath: string): Promise<void> {
    await super.remove(absPath);
    this.check(`remove ${absPath}`);
  }

  async rename(fromAbsPath: string, toAbsPath: string): Promise<void> {
    const hook = this.beforeRename;
    this.beforeRename = null;
    hook?.();
    const from = this.resolve(fromAbsPath);
    const to = this.resolve(toAbsPath);
    if (this.files.has(to) || this.dirs.has(to)) throw new Error(`EEXIST: ${to}`);
    if (!this.files.has(from) && !this.dirs.has(from)) throw new Error(`ENOENT: ${from}`);
    this.log.push(`rename ${from} -> ${to}`);
    const move = (path: string): string => (path === from ? to : `${to}${path.slice(from.length)}`);
    const inside = (path: string): boolean => path === from || path.startsWith(`${from}/`);
    for (const [path, data] of [...this.files]) {
      if (inside(path)) {
        this.files.delete(path);
        this.files.set(move(path), data);
      }
    }
    for (const dir of [...this.dirs]) {
      if (inside(dir)) {
        this.dirs.delete(dir);
        this.dirs.add(move(dir));
      }
    }
    this.check(`rename ${to}`);
  }
}

/** A world folder to copy, with the files a save has. */
export function seedWorld(fs: MemoryInstallFileSystem, dir: string, tag = 'w'): void {
  fs.seed(`${dir}/level.dat`, `level ${tag}`);
  fs.seed(`${dir}/region/r.0.0.mca`, `region ${tag}`);
  fs.seed(`${dir}/datapacks/game.zip`, `pack ${tag}`);
  fs.seed(`${dir}/session.lock`, 'lock');
}

/** Ten foreign instances of every kind a user may have, plus Prism's own files. */
export function seedForeignPrism(fs: MemoryInstallFileSystem): void {
  fs.seed(`${ROOT}/prismlauncher.cfg`, 'InstanceDir=instances\nLanguage=en\n');
  fs.seed(`${ROOT}/accounts.json`, '{"accounts":[{"secret":"never read"}]}');
  fs.seed(`${INSTANCES}/instgroups.json`, '{"formatVersion":"1","groups":{}}');
  const cfg = (name: string): string => `[General]\nInstanceType=OneSix\nname=${name}\n`;
  const pack = (components: string): string => `{"components":[${components}],"formatVersion":1}`;
  const mc = (v: string): string => `{"important":true,"uid":"net.minecraft","version":"${v}"}`;
  const instances: [string, string][] = [
    ['Vanilla 9.1', pack(mc('9.1'))],
    ['Fabric 9.1', pack(`${mc('9.1')},{"uid":"net.fabricmc.fabric-loader","version":"0.20.1"}`)],
    ['Quilt', pack(`${mc('9.1')},{"uid":"org.quiltmc.quilt-loader","version":"0.30.2"}`)],
    ['NeoForge', pack(`${mc('9.1')},{"uid":"net.neoforged","version":"9.1.0.110"}`)],
    ['Snapshot', pack(mc('9.2-snapshot-7'))],
    ['Old 1.20', pack(mc('1.20.1'))],
    ['Modpack', pack(`${mc('9.1')},{"uid":"net.fabricmc.fabric-loader","version":"0.19.0"}`)],
    ['Survival world', pack(mc('9.1'))],
    ['Creative', pack(mc('9.1'))],
    ['Friends server', pack(mc('9.1'))],
  ];
  for (const [name, mmc] of instances) {
    const dir = `${INSTANCES}/${name}`;
    fs.seed(`${dir}/instance.cfg`, cfg(name));
    fs.seed(`${dir}/mmc-pack.json`, mmc);
    fs.seed(`${dir}/minecraft/options.txt`, 'resourcePacks:["vanilla"]\nfov:0.5\n');
    fs.seed(`${dir}/minecraft/mods/their-mod.jar`, `jar of ${name}`);
    fs.seed(`${dir}/minecraft/resourcepacks/theirs.zip`, `pack of ${name}`);
    seedWorld(fs, `${dir}/minecraft/saves/My world`, name);
  }
  // Same-named folders without MSM's marker: never touched.
  for (const name of ['MCSuperMods Plain (9.1)', 'MCSuperMods Pack Adventure (9.1)']) {
    const dir = `${INSTANCES}/${name}`;
    fs.seed(`${dir}/instance.cfg`, cfg(name));
    fs.seed(`${dir}/mmc-pack.json`, pack(mc('9.1')));
    fs.seed(`${dir}/minecraft/options.txt`, 'fov:1\n');
  }
  // A folder named like MSM's staging folder that MSM did not make.
  fs.seed(`${INSTANCES}/.msm-staging/notes/readme.txt`, 'the user put this here');
}

/** Every file under `prefix` with its bytes as text, for byte-for-byte comparison. */
export function snapshot(
  fs: MemoryInstallFileSystem,
  keep: (path: string) => boolean,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const [path, data] of fs.files) if (keep(path)) out.set(path, text(data));
  for (const dir of fs.dirs) if (keep(dir)) out.set(`${dir}/`, '<dir>');
  return out;
}

/** The bytes the caller hands back for each recipe item. */
export async function bytesOf(item: RecipeMod | RecipePack): Promise<Uint8Array> {
  if ('role' in item) {
    if (item.role === 'content') return bytes(`content jar ${item.modId}`);
    if (item.role === 'fabric-api') return bytes(`fabric api ${item.version}`);
    return bytes(`extra ${item.projectId}`);
  }
  return bytes(`resource pack ${item.source}`);
}

let counter = 0;
/** Deterministic staging ids. */
export function stagingIds(): () => string {
  return () => `stage-${++counter}`;
}
