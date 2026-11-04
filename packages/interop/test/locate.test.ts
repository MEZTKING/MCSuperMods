import { describe, expect, it } from 'vitest';
import {
  defaultMinecraftDir,
  type InstalledVersion,
  joinInstallPath,
  listInstalledVersions,
  pickVersionJar,
} from '../src/index';
import { MemoryInstallFileSystem } from './helpers/memory-install-fs';

describe('joinInstallPath', () => {
  it('joins with forward slashes and drops redundant separators', () => {
    expect(joinInstallPath('/home/alex/', '/.minecraft/', 'versions')).toBe(
      '/home/alex/.minecraft/versions',
    );
    expect(joinInstallPath('/', 'tmp')).toBe('/tmp');
    expect(joinInstallPath('C:\\', 'Games')).toBe('C:\\Games');
    expect(joinInstallPath('C:\\Users\\Alex\\AppData\\Roaming\\', '.minecraft')).toBe(
      'C:\\Users\\Alex\\AppData\\Roaming/.minecraft',
    );
    expect(joinInstallPath('a', '', 'b')).toBe('a/b');
    expect(joinInstallPath()).toBe('');
  });
});

describe('defaultMinecraftDir', () => {
  it('uses %APPDATA% on Windows', () => {
    expect(
      defaultMinecraftDir({
        platform: 'win32',
        home: 'C:\\Users\\Alex',
        appData: 'C:\\Users\\Alex\\AppData\\Roaming',
      }),
    ).toBe('C:\\Users\\Alex\\AppData\\Roaming/.minecraft');
  });

  it('falls back to the home directory on Windows without %APPDATA%', () => {
    expect(defaultMinecraftDir({ platform: 'win32', home: 'C:\\Users\\Alex' })).toBe(
      'C:\\Users\\Alex/AppData/Roaming/.minecraft',
    );
  });

  it('uses Application Support on macOS', () => {
    expect(defaultMinecraftDir({ platform: 'darwin', home: '/Users/alex' })).toBe(
      '/Users/alex/Library/Application Support/minecraft',
    );
  });

  it('uses ~/.minecraft on Linux and other platforms', () => {
    expect(defaultMinecraftDir({ platform: 'linux', home: '/home/alex' })).toBe(
      '/home/alex/.minecraft',
    );
    expect(defaultMinecraftDir({ platform: 'freebsd', home: '/home/alex' })).toBe(
      '/home/alex/.minecraft',
    );
  });
});

describe('listInstalledVersions', () => {
  it('lists version folders that contain <id>/<id>.jar, sorted by id', async () => {
    const fs = new MemoryInstallFileSystem()
      .seed('/mc/versions/9.2/9.2.jar', 'jar')
      .seed('/mc/versions/9.2/9.2.json', '{}')
      .seed('/mc/versions/9.1/9.1.jar', 'jar')
      .seed('/mc/versions/9.1-fabric/9.1-fabric.json', '{}') // no jar: skipped
      .seed('/mc/versions/broken/other.jar', 'jar') // wrong name: skipped
      .seed('/mc/versions/stray.txt', 'x'); // a file, not a folder
    expect(await listInstalledVersions(fs, '/mc')).toEqual([
      { id: '9.1', jarPath: '/mc/versions/9.1/9.1.jar', jsonPath: '/mc/versions/9.1/9.1.json' },
      { id: '9.2', jarPath: '/mc/versions/9.2/9.2.jar', jsonPath: '/mc/versions/9.2/9.2.json' },
    ]);
  });

  it('returns an empty list when there is no installation', async () => {
    const fs = new MemoryInstallFileSystem();
    expect(await listInstalledVersions(fs, '/missing')).toEqual([]);
    fs.seed('/mc/options.txt', '');
    expect(await listInstalledVersions(fs, '/mc')).toEqual([]);
  });
});

describe('pickVersionJar', () => {
  const version = (id: string): InstalledVersion => ({
    id,
    jarPath: `/mc/versions/${id}/${id}.jar`,
    jsonPath: `/mc/versions/${id}/${id}.json`,
  });

  it('prefers the exact id', () => {
    const versions = ['9.1-pre1', '9.1', '9.1.2'].map(version);
    expect(pickVersionJar(versions, '9.1')?.id).toBe('9.1');
  });

  it('otherwise picks the greatest id starting with the version', () => {
    const versions = ['9.1-pre1', '9.1-pre2', '9.1.2', '9.10', '9.0'].map(version);
    expect(pickVersionJar(versions, '9.1')?.id).toBe('9.1.2');
    expect(pickVersionJar(['9.1-pre1', '9.1-pre2'].map(version), '9.1')?.id).toBe('9.1-pre2');
  });

  it('does not match a longer version number', () => {
    expect(pickVersionJar(['9.10', '9.11'].map(version), '9.1')).toBeUndefined();
  });

  it('returns undefined when nothing matches', () => {
    expect(pickVersionJar([], '9.1')).toBeUndefined();
    expect(pickVersionJar([version('8.0')], '9.1')).toBeUndefined();
  });
});
