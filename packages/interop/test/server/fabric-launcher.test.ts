import { describe, expect, it } from 'vitest';
import {
  cachedServerLauncher,
  FABRIC_INSTALLER_VERSIONS_URL,
  latestStableInstaller,
  SERVER_STOP_LINE,
  ServerError,
  type ServerLogState,
  serverLauncherUrl,
  serverLogState,
  serverStartCommand,
  serverStateAfter,
} from '../../src/index';
import { MemoryInstallFileSystem } from '../helpers/memory-install-fs';
import { bytes, CACHE, fakeDownloader, jar, sha256, text } from './helpers';

const MC = '9.1';
const LOADER = '0.20.1';
const URL_112 = 'https://meta.fabricmc.net/v2/versions/loader/9.1/0.20.1/1.1.2/server/jar';
const URL_111 = 'https://meta.fabricmc.net/v2/versions/loader/9.1/0.20.1/1.1.1/server/jar';
const INSTALLERS = bytes(
  JSON.stringify([
    { version: '1.2.0-beta', stable: false },
    { version: '1.1.2', stable: true },
    { version: '1.1.1', stable: true },
  ]),
);
const JAR_PATH = `${CACHE}/fabric-server/9.1/0.20.1/1.1.2/fabric-server-launch.jar`;
const RECORD = `${CACHE}/fabric-server/launchers.json`;

function routes(launcher: Uint8Array = jar('launcher 1.1.2')): Map<string, Uint8Array | Error> {
  return new Map<string, Uint8Array | Error>([
    [FABRIC_INSTALLER_VERSIONS_URL, INSTALLERS],
    [URL_112, launcher],
    [URL_111, jar('launcher 1.1.1')],
  ]);
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ServerError) return error.code;
    throw error;
  }
  return 'no error';
}

describe('the Fabric server launcher address', () => {
  it('is the meta service URL for the game, loader and installer', () => {
    expect(serverLauncherUrl(MC, LOADER, '1.1.2')).toBe(URL_112);
    expect(serverLauncherUrl('9.2-snapshot-7', LOADER, '1.1.2')).toBe(
      'https://meta.fabricmc.net/v2/versions/loader/9.2-snapshot-7/0.20.1/1.1.2/server/jar',
    );
    expect(serverLauncherUrl('0.165.2+9.1', LOADER, '1.1.2')).toContain('0.165.2%2B9.1');
  });

  it('refuses versions that could leave the path', () => {
    expect(() => serverLauncherUrl('../9.1', LOADER, '1.1.2')).toThrow(ServerError);
    expect(() => serverLauncherUrl(MC, 'a/b', '1.1.2')).toThrow(ServerError);
    expect(() => serverLauncherUrl(MC, LOADER, '')).toThrow(ServerError);
  });

  it('takes the first stable installer of the list', () => {
    expect(latestStableInstaller(JSON.parse(text(INSTALLERS)))).toBe('1.1.2');
    expect(latestStableInstaller([{ version: '1.0', stable: false }])).toBeNull();
    expect(latestStableInstaller({})).toBeNull();
    expect(latestStableInstaller([{ version: '../x', stable: true }])).toBeNull();
  });
});

describe('cachedServerLauncher', () => {
  it('downloads once, records the SHA-256, and answers from the cache afterwards', async () => {
    const fs = new MemoryInstallFileSystem();
    const net = fakeDownloader(routes());
    const first = await cachedServerLauncher(
      { fs, cacheDir: CACHE, download: net.download },
      { mcVersion: MC, loader: LOADER },
    );
    expect(first).toMatchObject({ installer: '1.1.2', cached: false, firstSeen: true });
    expect(first.sha256).toBe(await sha256(jar('launcher 1.1.2')));
    expect(net.calls).toEqual([FABRIC_INSTALLER_VERSIONS_URL, URL_112]);
    expect(JSON.parse(text(fs.files.get(RECORD) as Uint8Array))).toEqual({
      formatVersion: 1,
      launchers: { '9.1/0.20.1/1.1.2': { sha256: first.sha256 } },
    });

    // Offline afterwards: the recorded installer is used, nothing is fetched.
    const offline = fakeDownloader(
      new Map([[FABRIC_INSTALLER_VERSIONS_URL, new Error('offline')]]),
    );
    const second = await cachedServerLauncher(
      { fs, cacheDir: CACHE, download: offline.download },
      { mcVersion: MC, loader: LOADER },
    );
    expect(second).toMatchObject({
      installer: '1.1.2',
      cached: true,
      firstSeen: false,
      sha256: first.sha256,
    });
    expect(offline.calls).toEqual([]);
  });

  it('uses a given installer version without asking for the list', async () => {
    const fs = new MemoryInstallFileSystem();
    const net = fakeDownloader(routes());
    const got = await cachedServerLauncher(
      { fs, cacheDir: CACHE, download: net.download },
      { mcVersion: MC, loader: LOADER, installer: '1.1.1' },
    );
    expect(got.installer).toBe('1.1.1');
    expect(net.calls).toEqual([URL_111]);
  });

  it('refuses a download whose bytes differ from the ones recorded, and changes nothing', async () => {
    const fs = new MemoryInstallFileSystem();
    await cachedServerLauncher(
      { fs, cacheDir: CACHE, download: fakeDownloader(routes()).download },
      { mcVersion: MC, loader: LOADER },
    );
    // The cached copy is damaged, and the service now sends other bytes.
    fs.files.set(JAR_PATH, jar('damaged'));
    const recordBefore = text(fs.files.get(RECORD) as Uint8Array);
    const changed = fakeDownloader(routes(jar("someone else's launcher")));
    expect(
      await code(
        cachedServerLauncher(
          { fs, cacheDir: CACHE, download: changed.download },
          { mcVersion: MC, loader: LOADER, installer: '1.1.2' },
        ),
      ),
    ).toBe('server.launcher-changed');
    expect(text(fs.files.get(JAR_PATH) as Uint8Array)).toContain('damaged');
    expect(text(fs.files.get(RECORD) as Uint8Array)).toBe(recordBefore);
  });

  it('repairs a damaged cached copy when the service still sends the recorded bytes', async () => {
    const fs = new MemoryInstallFileSystem();
    const first = await cachedServerLauncher(
      { fs, cacheDir: CACHE, download: fakeDownloader(routes()).download },
      { mcVersion: MC, loader: LOADER },
    );
    fs.files.set(JAR_PATH, jar('damaged'));
    const net = fakeDownloader(routes());
    const again = await cachedServerLauncher(
      { fs, cacheDir: CACHE, download: net.download },
      { mcVersion: MC, loader: LOADER },
    );
    expect(again).toMatchObject({ cached: false, firstSeen: false, sha256: first.sha256 });
    expect(await sha256(fs.files.get(JAR_PATH) as Uint8Array)).toBe(first.sha256);
  });

  it('refuses an answer that is not a jar, and a failed download, in plain words', async () => {
    const fs = new MemoryInstallFileSystem();
    const html = fakeDownloader(routes(bytes('<html>Bad gateway</html>')));
    expect(
      await code(
        cachedServerLauncher(
          { fs, cacheDir: CACHE, download: html.download },
          { mcVersion: MC, loader: LOADER },
        ),
      ),
    ).toBe('server.download-failed');
    expect(fs.files.has(RECORD)).toBe(false);
    const down = fakeDownloader(new Map());
    await expect(
      cachedServerLauncher(
        { fs, cacheDir: CACHE, download: down.download },
        { mcVersion: MC, loader: LOADER },
      ),
    ).rejects.toThrow(/could not be downloaded from Fabric's meta service/);
  });

  it('refuses to go on from a record it cannot read', async () => {
    const fs = new MemoryInstallFileSystem();
    fs.seed(RECORD, 'not json');
    expect(
      await code(
        cachedServerLauncher(
          { fs, cacheDir: CACHE, download: fakeDownloader(routes()).download },
          { mcVersion: MC, loader: LOADER },
        ),
      ),
    ).toBe('server.launcher-changed');
  });

  it('refuses unsafe versions before any download', async () => {
    const fs = new MemoryInstallFileSystem();
    const net = fakeDownloader(routes());
    expect(
      await code(
        cachedServerLauncher(
          { fs, cacheDir: CACHE, download: net.download },
          { mcVersion: '..', loader: LOADER },
        ),
      ),
    ).toBe('server.bad-recipe');
    expect(net.calls).toEqual([]);
  });
});

describe('starting and reading a server', () => {
  it('starts the launcher jar in the folder, without a shell, with a heap limit', () => {
    expect(serverStartCommand({ java: '/jdk/bin/java', serverDir: '/srv/a' })).toEqual({
      program: '/jdk/bin/java',
      args: ['-Xmx2048M', '-jar', 'fabric-server-launch.jar', 'nogui'],
      cwd: '/srv/a',
    });
    expect(
      serverStartCommand({ java: 'C:\\J\\bin\\java.exe', serverDir: 'C:\\S', memoryMb: 4096 })
        .args[0],
    ).toBe('-Xmx4096M');
    expect(() => serverStartCommand({ java: 'java', serverDir: '/s', memoryMb: 10 })).toThrow(
      ServerError,
    );
    expect(SERVER_STOP_LINE).toBe('stop\n');
  });

  it('reads the state from the log lines the spike recorded, never from the exit status', () => {
    const lines: [string, ServerLogState | null][] = [
      ['Downloading Minecraft server', 'downloading'],
      ['Installing Fabric Loader 0.20.1(9.1) on the server', 'downloading'],
      [
        '[17:54:25] [main/INFO]: You need to agree to the EULA in order to run the server. Go to eula.txt for more info.',
        'eula-needed',
      ],
      ['[17:56:26] [Server thread/WARN]: **** FAILED TO BIND TO PORT!', 'port-taken'],
      [
        '[17:56:26] [Server thread/ERROR]: This crash report has been saved to: <scratch>/crash.txt',
        'crashed',
      ],
      ['[18:00:47] [Server thread/INFO]: Done (0.577s)! For help, type "help"', 'running'],
      ['[18:00:52] [Server thread/INFO]: Stopping server', 'stopping'],
      ['[18:00:52] [Server thread/INFO]: Saving players', null],
      // A player's chat or a /say line never passes for the server's own.
      ['[18:00:48] [Server thread/INFO]: <Ann> Done (1s)! For help', null],
      ['[18:00:48] [Server thread/INFO]: [Not Secure] [Server] Stopping server', null],
      ['[18:00:48] [Server thread/INFO]: <Ann> **** FAILED TO BIND TO PORT!', null],
    ];
    for (const [line, state] of lines) expect(serverLogState(line), line).toBe(state);
  });

  it('keeps why a server stopped by itself', () => {
    const portTaken = [
      '[Server thread/WARN]: **** FAILED TO BIND TO PORT!',
      '[Server thread/WARN]: Perhaps a server is already running on that port?',
      '[Server thread/ERROR]: This crash report has been saved to: x',
      '[Server thread/INFO]: Stopping server',
    ].reduce<ServerLogState | null>(serverStateAfter, null);
    expect(portTaken).toBe('port-taken');
    const eula = [
      'Failed to load eula.txt',
      'You need to agree to the EULA in order to run the server.',
    ].reduce<ServerLogState | null>(serverStateAfter, 'downloading');
    expect(eula).toBe('eula-needed');
    const normal = [
      'Done (1.5s)! For help, type "help"',
      'Stopping server',
    ].reduce<ServerLogState | null>(serverStateAfter, null);
    expect(normal).toBe('stopping');
  });
});
