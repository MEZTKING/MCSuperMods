import { describe, expect, it } from 'vitest';
import {
  cachedFabricApi,
  compareDottedVersions,
  contentJarModsFileName,
  createManagedInstance,
  type Downloader,
  ensureFabricApi,
  type FabricTestFacts,
  fabricApiUrl,
  fabricReadiness,
  findLauncherProgram,
  type GameLocation,
  INSTALLED_RECORD_FILE,
  installContentJar,
  isFabricApiFileName,
  launchArguments,
  launcherProgramCandidates,
  listMmcInstances,
  managedInstanceName,
  parseChecksumFile,
  readInstalledRecord,
  webCryptoSha512,
} from '../src/index';
import { MemoryInstallFileSystem } from './helpers/memory-install-fs';

const facts: FabricTestFacts = { mcVersion: '9.1', loader: '0.20.1', api: '0.165.2+9.1' };
const sha512 = webCryptoSha512;
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const text = (data: Uint8Array): string => new TextDecoder().decode(data);
const MODS = '/game/mods';

function location(overrides: Partial<GameLocation> = {}): GameLocation {
  return {
    ref: { launcher: 'prism', root: '/prism', instance: 'Fab' },
    id: 'prism:Fab',
    displayName: 'Fab',
    mcVersion: '9.1',
    loader: { kind: 'fabric', version: '0.20.1' },
    gameDir: '/prism/instances/Fab/minecraft',
    modsDir: '/prism/instances/Fab/minecraft/mods',
    instanceDir: '/prism/instances/Fab',
    problems: [],
    ...overrides,
  };
}

/** A fake Maven: serves the jar and its checksum, counting requests. */
function fakeMaven(jar: Uint8Array, checksum?: string) {
  const calls: string[] = [];
  const download: Downloader = async (url) => {
    calls.push(url);
    if (url.endsWith('.sha512')) return bytes(`${checksum ?? (await sha512(jar))}  file.jar\n`);
    return jar;
  };
  return { calls, download };
}

describe('versions and names', () => {
  it('compares dotted versions numerically', () => {
    expect(compareDottedVersions('0.20.1', '0.20.1')).toBe(0);
    expect(compareDottedVersions('0.9.0', '0.20.1')).toBeLessThan(0);
    expect(compareDottedVersions('0.21', '0.20.1')).toBeGreaterThan(0);
    expect(compareDottedVersions('0.20.1+build.3', '0.20.1')).toBe(0);
  });

  it('builds the Fabric Maven URL and rejects unsafe versions', () => {
    expect(fabricApiUrl('0.165.2+26.3')).toBe(
      'https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/0.165.2%2B26.3/fabric-api-0.165.2%2B26.3.jar',
    );
    expect(() => fabricApiUrl('../x')).toThrow(/not a valid/);
  });

  it('parses checksum files', () => {
    expect(parseChecksumFile(`${'A'.repeat(128)}  f.jar\n`, 128)).toBe('a'.repeat(128));
    expect(parseChecksumFile('nothex', 128)).toBeNull();
  });

  it('names the managed instance and the content jar', () => {
    expect(managedInstanceName('26.3')).toBe('MCSuperMods Test (26.3)');
    expect(contentJarModsFileName('ruby_mod')).toBe('ruby_mod.jar');
    expect(() => contentJarModsFileName('../evil')).toThrow(/not a valid Fabric mod id/);
    expect(() => contentJarModsFileName('A')).toThrow();
  });

  it('recognises Fabric API file names', () => {
    expect(isFabricApiFileName('fabric-api-0.165.2+26.3.jar')).toBe(true);
    expect(isFabricApiFileName('Fabric-API.jar')).toBe(true);
    expect(isFabricApiFileName('fabric-api-base.jar.disabled')).toBe(false);
    expect(isFabricApiFileName('fabric-language-kotlin.jar')).toBe(false);
  });
});

describe('fabricReadiness', () => {
  it('launches a Prism Fabric instance for the target', () => {
    expect(fabricReadiness(location(), facts)).toEqual({
      mode: 'launch',
      modsDir: '/prism/instances/Fab/minecraft/mods',
    });
  });

  it('blocks instances without Fabric, on another version or with an old loader', () => {
    expect(fabricReadiness(location({ loader: null }), facts).mode).toBe('blocked');
    expect(fabricReadiness(location({ loader: { kind: 'quilt', version: '1' } }), facts).mode).toBe(
      'blocked',
    );
    const other = fabricReadiness(location({ mcVersion: '9.0' }), facts);
    expect(other).toMatchObject({ mode: 'blocked' });
    expect(other.mode === 'blocked' && other.reason).toMatch(/runs Minecraft 9\.0/);
    const old = fabricReadiness(location({ loader: { kind: 'fabric', version: '0.16.0' } }), facts);
    expect(old.mode === 'blocked' && old.reason).toMatch(/needs 0\.20\.1 or newer/);
    expect(fabricReadiness(null, facts).mode).toBe('blocked');
    expect(
      fabricReadiness(
        location({ problems: [{ code: 'location.game-dir-missing', message: 'x' }] }),
        facts,
      ).mode,
    ).toBe('blocked');
  });

  it('makes official and CurseForge locations install-only', () => {
    const official = fabricReadiness(
      location({
        ref: { launcher: 'official', root: '/mc' },
        loader: null,
        mcVersion: null,
        gameDir: '/mc',
        modsDir: null,
        instanceDir: null,
      }),
      facts,
    );
    expect(official).toMatchObject({ mode: 'install-only', modsDir: '/mc/mods' });
    const curse = fabricReadiness(
      location({ ref: { launcher: 'curseforge', root: '/cf', instance: 'A' } }),
      facts,
    );
    expect(curse).toMatchObject({ mode: 'install-only' });
    expect(curse.mode === 'install-only' && curse.note).toMatch(/CurseForge app/);
  });
});

describe('createManagedInstance', () => {
  it('creates a Prism instance that discovery reads as Fabric for the target', async () => {
    const fs = new MemoryInstallFileSystem();
    fs.seed('/prism/prismlauncher.cfg', 'InstanceDir=instances\n');
    const created = await createManagedInstance(fs, '/prism/instances', facts);
    expect(created).toMatchObject({ folder: 'MCSuperMods Test (9.1)', created: true });
    const pack = JSON.parse(text(await fs.readFile(`${created.instanceDir}/mmc-pack.json`)));
    expect(pack).toEqual({
      components: [
        { important: true, uid: 'net.minecraft', version: '9.1' },
        { uid: 'net.fabricmc.fabric-loader', version: '0.20.1' },
      ],
      formatVersion: 1,
    });
    const [found] = await listMmcInstances(fs, '/prism', 'prism');
    expect(found).toMatchObject({
      displayName: 'MCSuperMods Test (9.1)',
      mcVersion: '9.1',
      loader: { kind: 'fabric', version: '0.20.1' },
      problems: [],
    });
    expect(fabricReadiness(found ?? null, facts).mode).toBe('launch');
  });

  it('updates its own instance and never touches a foreign folder', async () => {
    const fs = new MemoryInstallFileSystem();
    await createManagedInstance(fs, '/prism/instances', facts);
    const again = await createManagedInstance(fs, '/prism/instances', {
      ...facts,
      loader: '0.21.0',
    });
    expect(again).toMatchObject({ created: false, updated: true });
    const pack = text(await fs.readFile('/prism/instances/MCSuperMods Test (9.1)/mmc-pack.json'));
    expect(pack).toContain('"0.21.0"');

    const other = new MemoryInstallFileSystem();
    other.seed('/prism/instances/MCSuperMods Test (9.1)/instance.cfg', 'name=Mine\n');
    await expect(createManagedInstance(other, '/prism/instances', facts)).rejects.toMatchObject({
      code: 'fabric.instance-not-managed',
    });
    expect(other.log).toEqual([]);
  });
});

describe('installContentJar', () => {
  it('writes <mod_id>.jar, records it and replaces only its own copy', async () => {
    const fs = new MemoryInstallFileSystem();
    fs.seed(`${MODS}/other.jar`, 'user mod');
    const first = await installContentJar({ fs, sha512 }, MODS, 'ruby', bytes('v1'));
    expect(first).toEqual({ path: `${MODS}/ruby.jar`, replaced: false });
    const second = await installContentJar({ fs, sha512 }, MODS, 'ruby', bytes('v2'));
    expect(second.replaced).toBe(true);
    expect(text(await fs.readFile(`${MODS}/ruby.jar`))).toBe('v2');
    expect(text(await fs.readFile(`${MODS}/other.jar`))).toBe('user mod');
    const record = await readInstalledRecord(fs, MODS);
    expect(Object.keys(record.files)).toEqual(['ruby.jar']);
    expect(record.files['ruby.jar']).toMatchObject({ role: 'content', id: 'ruby' });
    // Sorted keys, 2-space JSON.
    expect(text(await fs.readFile(`${MODS}/${INSTALLED_RECORD_FILE}`))).toMatch(
      /^\{\n {2}"files": \{/,
    );
  });

  it('refuses a file of the same name it did not install, or one changed since', async () => {
    const fs = new MemoryInstallFileSystem();
    fs.seed(`${MODS}/ruby.jar`, 'someone else');
    await expect(
      installContentJar({ fs, sha512 }, MODS, 'ruby', bytes('v1')),
    ).rejects.toMatchObject({ code: 'fabric.foreign-file' });
    expect(text(await fs.readFile(`${MODS}/ruby.jar`))).toBe('someone else');

    const changed = new MemoryInstallFileSystem();
    await installContentJar({ fs: changed, sha512 }, MODS, 'ruby', bytes('v1'));
    changed.seed(`${MODS}/ruby.jar`, 'edited by the user');
    await expect(
      installContentJar({ fs: changed, sha512 }, MODS, 'ruby', bytes('v2')),
    ).rejects.toMatchObject({ code: 'fabric.foreign-file' });
  });
});

describe('Fabric API', () => {
  it('downloads, checks the SHA-512, caches, and serves the cache offline', async () => {
    const fs = new MemoryInstallFileSystem();
    const maven = fakeMaven(bytes('fabric api jar'));
    const deps = { fs, cacheDir: '/cache', download: maven.download };
    const first = await cachedFabricApi(deps, facts.api);
    expect(first.cached).toBe(false);
    expect(maven.calls).toEqual([`${fabricApiUrl(facts.api)}.sha512`, fabricApiUrl(facts.api)]);
    const offline: Downloader = async () => {
      throw new Error('offline');
    };
    const second = await cachedFabricApi({ ...deps, download: offline }, facts.api);
    expect(second).toMatchObject({ cached: true, sha512: first.sha512 });
  });

  it('rejects a checksum mismatch and caches nothing', async () => {
    const fs = new MemoryInstallFileSystem();
    const maven = fakeMaven(bytes('tampered'), 'a'.repeat(128));
    await expect(
      cachedFabricApi({ fs, cacheDir: '/cache', download: maven.download }, facts.api),
    ).rejects.toMatchObject({ code: 'fabric.checksum-mismatch' });
    expect(await fs.exists('/cache/fabric-api')).toBe(false);
  });

  it('reports download failures', async () => {
    const fs = new MemoryInstallFileSystem();
    const download: Downloader = async () => {
      throw new Error('HTTP 404');
    };
    await expect(
      cachedFabricApi({ fs, cacheDir: '/c', download }, facts.api),
    ).rejects.toMatchObject({ code: 'fabric.download-failed' });
  });

  it('installs when missing, keeps its copy, and replaces its older copy', async () => {
    const fs = new MemoryInstallFileSystem();
    let fetched = 0;
    const fetchJar = (version: string) => async () => {
      fetched++;
      const data = bytes(`api ${version}`);
      return { bytes: data, sha512: await sha512(data) };
    };
    expect(await ensureFabricApi({ fs, sha512 }, MODS, '1.0', fetchJar('1.0'))).toEqual({
      state: 'installed',
      file: 'fabric-api-1.0.jar',
      replaced: false,
    });
    expect(await ensureFabricApi({ fs, sha512 }, MODS, '1.0', fetchJar('1.0'))).toEqual({
      state: 'present',
      file: 'fabric-api-1.0.jar',
    });
    expect(fetched).toBe(1);
    expect(await ensureFabricApi({ fs, sha512 }, MODS, '2.0', fetchJar('2.0'))).toEqual({
      state: 'installed',
      file: 'fabric-api-2.0.jar',
      replaced: true,
    });
    expect(await fs.exists(`${MODS}/fabric-api-1.0.jar`)).toBe(false);
    const record = await readInstalledRecord(fs, MODS);
    expect(Object.keys(record.files)).toEqual(['fabric-api-2.0.jar']);
  });

  it('leaves a user copy alone and removes its own then', async () => {
    const fs = new MemoryInstallFileSystem();
    const data = bytes('ours');
    const fetchJar = async () => ({ bytes: data, sha512: await sha512(data) });
    await ensureFabricApi({ fs, sha512 }, MODS, '1.0', fetchJar);
    fs.seed(`${MODS}/fabric-api-0.9+9.1.jar`, 'users own');
    const result = await ensureFabricApi({ fs, sha512 }, MODS, '1.0', async () => {
      throw new Error('must not download');
    });
    expect(result).toEqual({ state: 'user-copy', file: 'fabric-api-0.9+9.1.jar' });
    expect(await fs.exists(`${MODS}/fabric-api-1.0.jar`)).toBe(false);
    expect(text(await fs.readFile(`${MODS}/fabric-api-0.9+9.1.jar`))).toBe('users own');
  });
});

describe('launching', () => {
  const env = {
    platform: 'win32',
    home: 'C:\\Users\\a',
    appData: 'C:\\Users\\a\\AppData\\Roaming',
  };

  it('lists Prism and MultiMC programs', () => {
    const prism = launcherProgramCandidates('prism', 'D:\\Prism', {
      ...env,
      localAppData: 'C:\\Users\\a\\AppData\\Local',
    });
    expect(prism[0]).toBe('D:\\Prism/prismlauncher.exe');
    expect(prism[1]).toBe('C:\\Users\\a\\AppData\\Local/Programs/PrismLauncher/prismlauncher.exe');
    expect(launcherProgramCandidates('multimc', 'D:\\MultiMC', env)[0]).toBe(
      'D:\\MultiMC/MultiMC.exe',
    );
  });

  it('prefers the configured program, then the first existing candidate', async () => {
    const fs = new MemoryInstallFileSystem();
    const linux = { platform: 'linux', home: '/home/a' };
    expect(await findLauncherProgram(fs, 'prism', '/p', linux, null)).toBeNull();
    fs.seed('/usr/bin/prismlauncher', '');
    expect(await findLauncherProgram(fs, 'prism', '/p', linux, null)).toBe(
      '/usr/bin/prismlauncher',
    );
    fs.seed('/opt/prism/prismlauncher', '');
    expect(await findLauncherProgram(fs, 'prism', '/p', linux, '/opt/prism/prismlauncher')).toBe(
      '/opt/prism/prismlauncher',
    );
    expect(await findLauncherProgram(fs, 'prism', '/p', linux, '/missing')).toBe(
      '/usr/bin/prismlauncher',
    );
  });

  it('passes --dir only for non-default data folders', () => {
    const linux = { platform: 'linux', home: '/home/a' };
    expect(
      launchArguments(
        { launcher: 'prism', root: '/home/a/.local/share/PrismLauncher', instance: 'X Y' },
        linux,
      ),
    ).toEqual(['--launch', 'X Y']);
    expect(
      launchArguments({ launcher: 'prism', root: '/data/prism', instance: 'X' }, linux),
    ).toEqual(['--dir', '/data/prism', '--launch', 'X']);
    expect(launchArguments({ launcher: 'multimc', root: '/mmc', instance: 'X' }, linux)).toEqual([
      '--dir',
      '/mmc',
      '--launch',
      'X',
    ]);
  });
});
