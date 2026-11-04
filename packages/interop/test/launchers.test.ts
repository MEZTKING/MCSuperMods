import { describe, expect, it } from 'vitest';
import {
  defaultCurseForgeRoots,
  defaultPrismDataDirs,
  discoverGameLocations,
  findClientJar,
  findGameLocation,
  type GameLocation,
  isAbsoluteInstallPath,
  type LauncherOverrides,
  listCurseForgeInstances,
  listMmcInstances,
  locationPathKey,
  officialLocation,
  parseCurseForgeLoaderName,
  parseIni,
  readMmcConfig,
  sameGameLocationRef,
} from '../src/index';
import { MemoryInstallFileSystem } from './helpers/memory-install-fs';

const NO_OVERRIDES: LauncherOverrides = {
  minecraftDir: null,
  prismDataDirs: [],
  multimcRoots: [],
  curseForgeRoots: [],
};

const LINUX = { platform: 'linux', home: '/home/alex' } as const;

function mmcPack(components: Record<string, unknown>[]): string {
  return JSON.stringify({ formatVersion: 1, components });
}

/** Seeds a Prism-format instance; `game` picks the game folder variant, or none. */
function seedMmcInstance(
  fs: MemoryInstallFileSystem,
  instancesDir: string,
  name: string,
  options: {
    cfg?: string;
    pack?: string | null;
    game?: 'minecraft' | '.minecraft' | 'none';
  } = {},
): void {
  fs.seed(`${instancesDir}/${name}/instance.cfg`, options.cfg ?? `[General]\nname=${name}\n`);
  if (options.pack !== null) {
    fs.seed(
      `${instancesDir}/${name}/mmc-pack.json`,
      options.pack ?? mmcPack([{ uid: 'net.minecraft', version: '9.1' }]),
    );
  }
  const game = options.game ?? 'minecraft';
  if (game !== 'none') fs.seed(`${instancesDir}/${name}/${game}/options.txt`, '');
}

function byName(locations: GameLocation[], instance: string): GameLocation {
  const found = locations.find((location) => location.ref.instance === instance);
  if (found === undefined) throw new Error(`no location ${instance}`);
  return found;
}

describe('parseIni', () => {
  it('reads keys with and without a [General] header', () => {
    expect(parseIni('[General]\nname=Alpha\nInstanceType=OneSix\n').get('name')).toBe('Alpha');
    expect(parseIni('name=Beta\r\nnotes=\n').get('name')).toBe('Beta');
    expect(parseIni('name=Beta\r\nnotes=\n').get('notes')).toBe('');
    expect(parseIni('name=x').get('missing')).toBeUndefined();
  });

  it('decodes quotes and Qt escapes and skips comments', () => {
    const ini = parseIni(
      '; comment\n# other\n[General]\nname="Hello, world"\nuni=Caf\\xe9 \\x4e2d\npath="C:\\\\Games\\\\mc"\n[Other]\nname=ignored\n',
    );
    expect(ini.get('name')).toBe('Hello, world');
    expect(ini.get('uni')).toBe('Caf\u00e9 \u4e2d');
    expect(ini.get('path')).toBe('C:\\Games\\mc');
    expect(ini.get('Other/name')).toBe('ignored');
  });

  it('splits Qt string lists on unquoted commas', () => {
    const ini = parseIni('AdditionalInstanceDirs=/a, /b, "/c, d"\nEmpty=\n');
    expect(ini.list('AdditionalInstanceDirs')).toEqual(['/a', '/b', '/c, d']);
    expect(ini.list('Empty')).toEqual([]);
    expect(ini.list('Missing')).toEqual([]);
  });
});

describe('paths', () => {
  it('recognises absolute paths', () => {
    expect(isAbsoluteInstallPath('/home/alex')).toBe(true);
    expect(isAbsoluteInstallPath('C:\\Users')).toBe(true);
    expect(isAbsoluteInstallPath('C:/Users')).toBe(true);
    expect(isAbsoluteInstallPath('\\\\server\\share')).toBe(true);
    expect(isAbsoluteInstallPath('instances')).toBe(false);
    expect(isAbsoluteInstallPath('C:relative')).toBe(false);
  });

  it('builds comparison keys', () => {
    expect(locationPathKey('/a//b/./c/../d/')).toBe('/a/b/d');
    expect(locationPathKey('C:\\Users\\Alex\\')).toBe('c:/users/alex');
    expect(locationPathKey('C:/Users/Alex')).toBe(locationPathKey('c:\\users\\alex'));
  });
});

describe('readMmcConfig', () => {
  it('defaults to instances/ without a config file', async () => {
    const fs = new MemoryInstallFileSystem();
    expect(await readMmcConfig(fs, '/p')).toEqual({
      configFile: null,
      instanceDirs: ['/p/instances'],
    });
  });

  it('reads InstanceDir (relative and absolute) and AdditionalInstanceDirs', async () => {
    const fs = new MemoryInstallFileSystem()
      .seed('/p/prismlauncher.cfg', '[General]\nInstanceDir=my-instances\n')
      .seed('/q/multimc.cfg', 'InstanceDir=/elsewhere/inst\nAdditionalInstanceDirs=extra, /abs\n');
    expect(await readMmcConfig(fs, '/p')).toEqual({
      configFile: '/p/prismlauncher.cfg',
      instanceDirs: ['/p/my-instances'],
    });
    expect(await readMmcConfig(fs, '/q')).toEqual({
      configFile: '/q/multimc.cfg',
      instanceDirs: ['/elsewhere/inst', '/q/extra', '/abs'],
    });
  });

  it('prefers prismlauncher.cfg over polymc.cfg and multimc.cfg', async () => {
    const fs = new MemoryInstallFileSystem()
      .seed('/p/multimc.cfg', 'InstanceDir=m\n')
      .seed('/p/polymc.cfg', 'InstanceDir=pm\n')
      .seed('/p/prismlauncher.cfg', 'InstanceDir=pr\n');
    expect((await readMmcConfig(fs, '/p')).instanceDirs).toEqual(['/p/pr']);
  });
});

describe('listMmcInstances', () => {
  it('reads names, versions, loaders and both game folder variants', async () => {
    const fs = new MemoryInstallFileSystem().seed('/p/prismlauncher.cfg', '[General]\n');
    seedMmcInstance(fs, '/p/instances', 'fab', {
      cfg: '[General]\nname=Fabric Pack\nInstanceType=OneSix\n',
      pack: mmcPack([
        { uid: 'net.minecraft', version: '9.1' },
        { uid: 'net.fabricmc.fabric-loader', version: '0.1.0' },
      ]),
    });
    seedMmcInstance(fs, '/p/instances', 'quilty', {
      cfg: 'name=Quilt Pack\n',
      pack: mmcPack([
        { uid: 'org.quiltmc.quilt-loader', cachedVersion: '0.2.0' },
        { uid: 'net.minecraft', cachedVersion: '9.2' },
      ]),
      game: '.minecraft',
    });
    seedMmcInstance(fs, '/p/instances', 'plain', { cfg: 'iconKey=default\n' });

    const locations = await listMmcInstances(fs, '/p', 'prism');
    expect(locations.map((location) => location.ref.instance)).toEqual(['fab', 'plain', 'quilty']);

    expect(byName(locations, 'fab')).toEqual({
      ref: { launcher: 'prism', root: '/p', instance: 'fab' },
      id: 'prism:fab',
      displayName: 'Fabric Pack',
      mcVersion: '9.1',
      loader: { kind: 'fabric', version: '0.1.0' },
      gameDir: '/p/instances/fab/minecraft',
      modsDir: '/p/instances/fab/minecraft/mods',
      instanceDir: '/p/instances/fab',
      problems: [],
    });
    const quilty = byName(locations, 'quilty');
    expect(quilty.displayName).toBe('Quilt Pack');
    expect(quilty.mcVersion).toBe('9.2');
    expect(quilty.loader).toEqual({ kind: 'quilt', version: '0.2.0' });
    expect(quilty.gameDir).toBe('/p/instances/quilty/.minecraft');
    expect(quilty.modsDir).toBe('/p/instances/quilty/.minecraft/mods');

    const plain = byName(locations, 'plain');
    expect(plain.displayName).toBe('plain');
    expect(plain.loader).toBeNull();
    expect(plain.modsDir).toBeNull();
    expect(plain.problems).toEqual([]);
  });

  it('prefers minecraft/ when both game folders exist', async () => {
    const fs = new MemoryInstallFileSystem();
    seedMmcInstance(fs, '/p/instances', 'both');
    fs.seed('/p/instances/both/.minecraft/options.txt', '');
    const [location] = await listMmcInstances(fs, '/p', 'prism');
    expect(location?.gameDir).toBe('/p/instances/both/minecraft');
  });

  it('reads custom and additional instance folders', async () => {
    const fs = new MemoryInstallFileSystem().seed(
      '/p/prismlauncher.cfg',
      'InstanceDir=/games/inst\nAdditionalInstanceDirs=more\n',
    );
    seedMmcInstance(fs, '/games/inst', 'a');
    seedMmcInstance(fs, '/p/more', 'b');
    seedMmcInstance(fs, '/p/more', 'a'); // same folder name as the primary one: skipped
    seedMmcInstance(fs, '/p/instances', 'ignored'); // default folder not configured
    const locations = await listMmcInstances(fs, '/p', 'prism');
    expect(locations.map((location) => location.instanceDir)).toEqual([
      '/games/inst/a',
      '/p/more/b',
    ]);
  });

  it('resolves a portable UserData folder like any other root', async () => {
    const fs = new MemoryInstallFileSystem().seed(
      '/apps/Prism/UserData/prismlauncher.cfg',
      'InstanceDir=instances\n',
    );
    seedMmcInstance(fs, '/apps/Prism/UserData/instances', 'port');
    const [location] = await listMmcInstances(fs, '/apps/Prism/UserData', 'prism');
    expect(location?.gameDir).toBe('/apps/Prism/UserData/instances/port/minecraft');
    expect(location?.ref).toEqual({
      launcher: 'prism',
      root: '/apps/Prism/UserData',
      instance: 'port',
    });
  });

  it('reports problems and skips folders that are not instances', async () => {
    const fs = new MemoryInstallFileSystem();
    seedMmcInstance(fs, '/p/instances', 'nomc', {
      pack: mmcPack([{ uid: 'net.fabricmc.fabric-loader', version: '0.1.0' }]),
    });
    seedMmcInstance(fs, '/p/instances', 'legacy', { cfg: 'InstanceType=Legacy\n' });
    seedMmcInstance(fs, '/p/instances', 'nopack', { pack: null });
    seedMmcInstance(fs, '/p/instances', 'badpack', { pack: '{ not json' });
    seedMmcInstance(fs, '/p/instances', 'fresh', { game: 'none' });
    seedMmcInstance(fs, '/p/instances', '.tmp');
    fs.seed('/p/instances/notes/readme.txt', '');
    fs.seed('/p/instances/instgroups.json', '{}');

    const locations = await listMmcInstances(fs, '/p', 'multimc');
    expect(locations.map((location) => location.ref.instance)).toEqual([
      'badpack',
      'fresh',
      'legacy',
      'nomc',
      'nopack',
    ]);
    const codes = (name: string) => byName(locations, name).problems.map((problem) => problem.code);
    expect(codes('nomc')).toEqual(['location.no-minecraft-component']);
    expect(byName(locations, 'nomc').mcVersion).toBeNull();
    expect(byName(locations, 'nomc').loader).toEqual({ kind: 'fabric', version: '0.1.0' });
    expect(codes('legacy')).toEqual(['location.unsupported-instance-type']);
    expect(codes('nopack')).toEqual(['location.unreadable-metadata']);
    expect(codes('badpack')).toEqual(['location.unreadable-metadata']);
    expect(codes('fresh')).toEqual(['location.game-dir-missing']);
    expect(byName(locations, 'fresh').gameDir).toBe('/p/instances/fresh/minecraft');
    expect(byName(locations, 'legacy').ref.launcher).toBe('multimc');
  });

  it('skips a symlinked instance escaping the instances folder and keeps one inside', async () => {
    const fs = new MemoryInstallFileSystem();
    seedMmcInstance(fs, '/p/instances', 'real');
    seedMmcInstance(fs, '/outside', 'escaped');
    fs.link('/p/instances/away', '/outside/escaped');
    fs.link('/p/instances/alias', '/p/instances/real');
    const locations = await listMmcInstances(fs, '/p', 'prism');
    expect(locations.map((location) => location.ref.instance)).toEqual(['alias', 'real']);
  });
});

describe('listCurseForgeInstances', () => {
  it('reads modded and vanilla instances with the instance folder as game folder', async () => {
    const fs = new MemoryInstallFileSystem()
      .seed(
        '/cf/Instances/Modded/minecraftinstance.json',
        JSON.stringify({
          name: 'Modded Pack',
          gameVersion: '9.1',
          installPath: 'C:\\stale\\path\\',
          baseModLoader: { name: 'fabric-0.16.0-1.0-test', type: 4 },
        }),
      )
      .seed(
        '/cf/Instances/Plain/minecraftinstance.json',
        JSON.stringify({ name: 'Plain', gameVersion: '9.2', baseModLoader: null }),
      )
      .seed('/cf/Instances/Broken/minecraftinstance.json', 'nope')
      .seed('/cf/Instances/Empty/readme.txt', '');
    const locations = await listCurseForgeInstances(fs, '/cf');
    expect(locations.map((location) => location.ref.instance)).toEqual([
      'Broken',
      'Modded',
      'Plain',
    ]);
    expect(byName(locations, 'Modded')).toEqual({
      ref: { launcher: 'curseforge', root: '/cf', instance: 'Modded' },
      id: 'curseforge:Modded',
      displayName: 'Modded Pack',
      mcVersion: '9.1',
      loader: { kind: 'fabric', version: '0.16.0' },
      gameDir: '/cf/Instances/Modded',
      modsDir: '/cf/Instances/Modded/mods',
      instanceDir: '/cf/Instances/Modded',
      problems: [],
    });
    const plain = byName(locations, 'Plain');
    expect(plain.loader).toBeNull();
    expect(plain.modsDir).toBeNull();
    expect(plain.gameDir).toBe('/cf/Instances/Plain');
    const broken = byName(locations, 'Broken');
    expect(broken.displayName).toBe('Broken');
    expect(broken.problems.map((problem) => problem.code)).toEqual([
      'location.unreadable-metadata',
    ]);
  });

  it('returns nothing without Instances/', async () => {
    const fs = new MemoryInstallFileSystem().seed('/cf/Install/versions/x.txt', '');
    expect(await listCurseForgeInstances(fs, '/cf')).toEqual([]);
  });

  it('parses loader names', () => {
    expect(parseCurseForgeLoaderName('neoforge-21.1.209')).toEqual({
      kind: 'neoforge',
      version: '21.1.209',
    });
    expect(parseCurseForgeLoaderName('forge-47.2.0')).toEqual({ kind: 'forge', version: '47.2.0' });
    expect(parseCurseForgeLoaderName('quilt-0.3.0')).toEqual({ kind: 'quilt', version: '0.3.0' });
    expect(parseCurseForgeLoaderName('mystery-1')).toEqual({ kind: 'unknown', version: null });
  });
});

describe('default launcher folders', () => {
  it('lists Prism data folders on Windows', () => {
    expect(
      defaultPrismDataDirs({
        platform: 'win32',
        home: 'C:\\Users\\Alex',
        appData: 'C:\\Users\\Alex\\AppData\\Roaming',
      }),
    ).toEqual([
      'C:\\Users\\Alex\\AppData\\Roaming/PrismLauncher',
      'C:\\Users\\Alex/scoop/persist/prismlauncher',
    ]);
  });

  it('lists Prism data folders on macOS', () => {
    expect(defaultPrismDataDirs({ platform: 'darwin', home: '/Users/alex' })).toEqual([
      '/Users/alex/Library/Application Support/PrismLauncher',
    ]);
  });

  it('lists Prism data folders on Linux, with Flatpak, XDG and the override first', () => {
    expect(defaultPrismDataDirs(LINUX)).toEqual([
      '/home/alex/.local/share/PrismLauncher',
      '/home/alex/.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher',
    ]);
    expect(
      defaultPrismDataDirs({
        ...LINUX,
        xdgDataHome: '/data/xdg',
        prismDataDirEnv: '/portable/prism',
      }),
    ).toEqual([
      '/portable/prism',
      '/data/xdg/PrismLauncher',
      '/home/alex/.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher',
    ]);
    // A relative override is ignored.
    expect(defaultPrismDataDirs({ ...LINUX, prismDataDirEnv: 'relative' })[0]).toBe(
      '/home/alex/.local/share/PrismLauncher',
    );
  });

  it('lists CurseForge folders on Windows and macOS only', () => {
    expect(defaultCurseForgeRoots({ platform: 'win32', home: 'C:\\Users\\Alex' })).toEqual([
      'C:\\Users\\Alex/curseforge/minecraft',
    ]);
    expect(defaultCurseForgeRoots({ platform: 'darwin', home: '/Users/alex' })).toEqual([
      '/Users/alex/Documents/curseforge/minecraft',
    ]);
    expect(defaultCurseForgeRoots(LINUX)).toEqual([]);
  });
});

describe('discoverGameLocations', () => {
  function seededMachine(): MemoryInstallFileSystem {
    const fs = new MemoryInstallFileSystem().seed('/home/alex/.minecraft/options.txt', '');
    seedMmcInstance(fs, '/home/alex/.local/share/PrismLauncher/instances', 'My Pack');
    seedMmcInstance(fs, '/manual/prism/instances', 'My Pack');
    seedMmcInstance(fs, '/mmc/instances', 'old');
    fs.seed(
      '/cf/Instances/Pack/minecraftinstance.json',
      JSON.stringify({ name: 'CF Pack', gameVersion: '9.1', baseModLoader: null }),
    );
    return fs;
  }

  it('lists official, Prism, MultiMC and CurseForge locations in order with unique ids', async () => {
    const fs = seededMachine();
    const locations = await discoverGameLocations(fs, LINUX, {
      minecraftDir: null,
      prismDataDirs: ['/manual/prism', '/home/alex/.local/share/PrismLauncher/', 'relative'],
      multimcRoots: ['/mmc', '/missing'],
      curseForgeRoots: ['/cf'],
    });
    expect(locations.map((location) => [location.id, location.gameDir])).toEqual([
      ['official:default', '/home/alex/.minecraft'],
      ['prism:My_Pack', '/home/alex/.local/share/PrismLauncher/instances/My Pack/minecraft'],
      ['prism:My_Pack-2', '/manual/prism/instances/My Pack/minecraft'],
      ['multimc:old', '/mmc/instances/old/minecraft'],
      ['curseforge:Pack', '/cf/Instances/Pack'],
    ]);
    expect(locations[0]).toEqual(officialLocation('/home/alex/.minecraft'));
    for (const location of locations) expect(location.id).toMatch(/^[A-Za-z0-9_.:-]+$/);
  });

  it('uses the official folder override and skips missing roots', async () => {
    const fs = new MemoryInstallFileSystem().seed('/games/mc/options.txt', '');
    expect(
      (await discoverGameLocations(fs, LINUX, { ...NO_OVERRIDES, minecraftDir: '/games/mc' })).map(
        (location) => location.ref,
      ),
    ).toEqual([{ launcher: 'official', root: '/games/mc' }]);
    expect(await discoverGameLocations(new MemoryInstallFileSystem(), LINUX, NO_OVERRIDES)).toEqual(
      [],
    );
  });

  it('finds a stored ref again', async () => {
    const locations = await discoverGameLocations(seededMachine(), LINUX, {
      ...NO_OVERRIDES,
      prismDataDirs: ['/manual/prism'],
    });
    const found = findGameLocation(locations, {
      launcher: 'prism',
      root: '/manual/prism/',
      instance: 'My Pack',
    });
    expect(found?.gameDir).toBe('/manual/prism/instances/My Pack/minecraft');
    expect(
      findGameLocation(locations, { launcher: 'prism', root: '/manual/prism', instance: 'gone' }),
    ).toBeUndefined();
    expect(
      sameGameLocationRef(
        { launcher: 'curseforge', root: 'C:\\CF', instance: 'Pack' },
        { launcher: 'curseforge', root: 'c:/cf/', instance: 'pack' },
      ),
    ).toBe(true);
    expect(
      sameGameLocationRef(
        { launcher: 'prism', root: '/a', instance: 'x' },
        { launcher: 'multimc', root: '/a', instance: 'x' },
      ),
    ).toBe(false);
  });
});

describe('findClientJar', () => {
  const JAR = new Uint8Array([0x50, 0x4b, 0x05, 0x06]);

  function machine(): { fs: MemoryInstallFileSystem } {
    const fs = new MemoryInstallFileSystem()
      .seed('/mc/versions/9.1/9.1.jar', JAR)
      .seed('/mc/versions/9.3/9.3.jar', JAR)
      .seed('/prism/libraries/com/mojang/minecraft/9.1/minecraft-9.1-client.jar', JAR)
      .seed('/prism/libraries/com/mojang/minecraft/9.2/minecraft-9.2-client.jar', JAR)
      .seed('/prism/libraries/com/mojang/minecraft/9.4/readme.txt', '')
      .seed('/cf/Install/versions/9.1/9.1.jar', JAR)
      .seed('/cf/Install/versions/9.5-pre/9.5-pre.jar', JAR);
    seedMmcInstance(fs, '/prism/instances', 'inst');
    fs.seed(
      '/cf/Instances/Pack/minecraftinstance.json',
      JSON.stringify({ name: 'Pack', gameVersion: '9.1', baseModLoader: null }),
    );
    return { fs };
  }

  async function locate(fs: MemoryInstallFileSystem): Promise<GameLocation[]> {
    return discoverGameLocations(fs, LINUX, {
      minecraftDir: '/mc',
      prismDataDirs: ['/prism'],
      multimcRoots: [],
      curseForgeRoots: ['/cf'],
    });
  }

  it("prefers the selected location's own store", async () => {
    const { fs } = machine();
    const locations = await locate(fs);
    const prism = locations.find((location) => location.ref.launcher === 'prism') ?? null;
    const cf = locations.find((location) => location.ref.launcher === 'curseforge') ?? null;
    expect(await findClientJar(fs, locations, prism, '9.1')).toEqual({
      jarPath: '/prism/libraries/com/mojang/minecraft/9.1/minecraft-9.1-client.jar',
      versionId: '9.1',
      launcher: 'prism',
      root: '/prism',
    });
    expect(await findClientJar(fs, locations, cf, '9.1')).toEqual({
      jarPath: '/cf/Install/versions/9.1/9.1.jar',
      versionId: '9.1',
      launcher: 'curseforge',
      root: '/cf',
    });
    expect(await findClientJar(fs, locations, null, '9.1')).toEqual({
      jarPath: '/mc/versions/9.1/9.1.jar',
      versionId: '9.1',
      launcher: 'official',
      root: '/mc',
    });
  });

  it("falls back to another launcher's store, then the prefix rule, then null", async () => {
    const { fs } = machine();
    const locations = await locate(fs);
    const cf = locations.find((location) => location.ref.launcher === 'curseforge') ?? null;
    expect(await findClientJar(fs, locations, cf, '9.3')).toMatchObject({
      launcher: 'official',
      versionId: '9.3',
    });
    expect(await findClientJar(fs, locations, cf, '9.2')).toMatchObject({
      launcher: 'prism',
      jarPath: '/prism/libraries/com/mojang/minecraft/9.2/minecraft-9.2-client.jar',
    });
    expect(await findClientJar(fs, locations, cf, '9.5')).toMatchObject({
      launcher: 'curseforge',
      versionId: '9.5-pre',
    });
    expect(await findClientJar(fs, locations, cf, '9.4')).toBeNull();
    expect(await findClientJar(fs, [], null, '9.1')).toBeNull();
  });
});
