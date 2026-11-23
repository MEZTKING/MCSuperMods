import { describe, expect, it } from 'vitest';
import {
  acceptServerEula,
  ensureServer,
  listServers,
  parseProperties,
  parseServerMarker,
  placeServer,
  planServerStart,
  recipeFor,
  ServerError,
  serverFolderBase,
  serverMarkerText,
  serversFolder,
} from '../../src/index';
import { ROOT, seedForeignPrism, seedWorld, snapshot } from '../instances/helpers';
import {
  HOME,
  jar,
  MOD_PROJECT,
  PLAIN_PROJECT,
  RELEASE,
  SERVERS,
  ServerMemoryFs,
  SNAPSHOT,
  serverDeps,
  serverRecipe,
  sha256,
  text,
} from './helpers';

const DIR = `${SERVERS}/gem_hunt-9.1`;
const AT = '2026-11-23T18:00:00Z';

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ServerError) return error.code;
    throw error;
  }
  return 'no error';
}

function json(fs: ServerMemoryFs, path: string): unknown {
  return JSON.parse(text(fs.files.get(path) as Uint8Array));
}

describe('the server folder', () => {
  it('lives in <msmHome>/servers under <namespace>-<mc>', () => {
    expect(serversFolder(HOME)).toBe(SERVERS);
    expect(() => serversFolder('relative')).toThrow(ServerError);
    expect(serverFolderBase(serverRecipe())).toBe('gem_hunt-9.1');
    expect(serverFolderBase(serverRecipe(MOD_PROJECT, SNAPSHOT))).toBe('gem_hunt-9.2-snapshot-7');
    expect(serverRecipe().place).toMatchObject({
      kind: 'server',
      name: 'MCSuperMods Server gem_hunt (9.1)',
    });
  });

  it('is made with its marker, the launcher jar, the mods and server.properties, and no EULA', async () => {
    const fs = new ServerMemoryFs();
    const recipe = serverRecipe();
    const made = await ensureServer(serverDeps(fs, recipe), SERVERS, recipe);
    expect(made).toMatchObject({
      folder: 'gem_hunt-9.1',
      serverDir: DIR,
      name: 'MCSuperMods Server gem_hunt (9.1)',
      created: true,
      launcher: { installer: '1.1.2', written: true },
      mods: { files: ['fabric-api-0.165.2+9.1.jar', 'gem_hunt.jar'], removed: [] },
      world: null,
      port: 25565,
      eula: 'missing',
      keptUserValues: [],
    });
    expect(fs.serverViolations).toEqual([]);
    expect(text(fs.files.get(`${DIR}/mods/gem_hunt.jar`) as Uint8Array)).toBe(
      'content jar gem_hunt',
    );
    expect(fs.files.has(`${DIR}/mods/.msm-installed.json`)).toBe(true);
    expect(fs.files.has(`${DIR}/eula.txt`)).toBe(false);
    expect(await sha256(fs.files.get(`${DIR}/fabric-server-launch.jar`) as Uint8Array)).toBe(
      made.launcher.sha256,
    );
    expect(parseProperties(text(fs.files.get(`${DIR}/server.properties`) as Uint8Array))).toEqual(
      new Map([
        ['level-name', 'world'],
        ['online-mode', 'true'],
        ['server-port', '25565'],
        ['spawn-protection', '0'],
        ['white-list', 'false'],
      ]),
    );
    expect(json(fs, `${DIR}/.msm-server.json`)).toEqual({
      eula: null,
      formatVersion: 1,
      generator: 'MCSuperMods',
      kind: 'fabric',
      launcher: { installer: '1.1.2', sha256: made.launcher.sha256 },
      loader: '0.20.1',
      minecraft: '9.1',
      owner: 'gem_hunt',
      properties: {
        'level-name': 'world',
        'online-mode': 'true',
        'server-port': '25565',
        'spawn-protection': '0',
        'white-list': 'false',
      },
      worlds: [],
    });
    // Nothing is left of the staging folder.
    expect([...fs.dirs].some((dir) => dir.includes('.msm-staging'))).toBe(false);
  });

  it('is brought up to date without writing again what is already right', async () => {
    const fs = new ServerMemoryFs();
    const recipe = serverRecipe();
    const calls = { n: 0 };
    await ensureServer(serverDeps(fs, recipe, calls), SERVERS, recipe);
    const writes = fs.log.length;
    const again = await ensureServer(serverDeps(fs, recipe, calls), SERVERS, recipe);
    expect(again).toMatchObject({ created: false, launcher: { written: false } });
    expect(calls.n).toBe(1);
    // Only the mods folder is written again (the content jar is always replaced by the latest
    // export, as in an instance); nothing else.
    expect(fs.log.slice(writes).filter((entry) => !entry.includes(`${DIR}/mods/`))).toEqual([]);
  });

  it('gets its own folder on each target', async () => {
    const fs = new ServerMemoryFs();
    for (const target of [RELEASE, SNAPSHOT]) {
      const recipe = serverRecipe(MOD_PROJECT, target);
      await ensureServer(serverDeps(fs, recipe), SERVERS, recipe);
    }
    expect(
      (await listServers(fs, SERVERS)).map((s) => [s.folder, s.mcVersion, s.eulaAccepted]),
    ).toEqual([
      ['gem_hunt-9.1', '9.1', false],
      ['gem_hunt-9.2-snapshot-7', '9.2-snapshot-7', false],
    ]);
  });

  it('holds no mods for a game that plays without them, and drops the ones MSM put there before', async () => {
    const fs = new ServerMemoryFs();
    const withMod = serverRecipe();
    await ensureServer(serverDeps(fs, withMod), SERVERS, withMod);
    fs.seed(`${DIR}/mods/their-mod.jar`, 'the user put this here');
    const plain = serverRecipe(PLAIN_PROJECT);
    expect(plain.mods).toEqual([]);
    const made = await ensureServer(serverDeps(fs, plain), SERVERS, plain);
    expect(made.mods).toEqual({
      files: [],
      removed: ['fabric-api-0.165.2+9.1.jar', 'gem_hunt.jar'],
    });
    expect(fs.files.has(`${DIR}/mods/gem_hunt.jar`)).toBe(false);
    expect(text(fs.files.get(`${DIR}/mods/their-mod.jar`) as Uint8Array)).toBe(
      'the user put this here',
    );
  });

  it('copies a world whole, names it in server.properties, and keeps it as played', async () => {
    const fs = new ServerMemoryFs();
    seedWorld(fs, '/projects/gem/worlds/Gem hunt', 'map');
    const world = { folder: 'Gem hunt', source: '/projects/gem/worlds/Gem hunt' };
    const recipe = serverRecipe(MOD_PROJECT, RELEASE, world);
    const made = await ensureServer(serverDeps(fs, recipe), SERVERS, recipe);
    expect(made.world).toEqual({ folder: 'Gem hunt', copied: true });
    expect(made.properties['level-name']).toBe('Gem hunt');
    expect(text(fs.files.get(`${DIR}/Gem hunt/datapacks/game.zip`) as Uint8Array)).toBe('pack map');
    expect(fs.files.has(`${DIR}/Gem hunt/session.lock`)).toBe(false);
    expect(fs.log.some((entry) => entry.startsWith(`rename ${DIR}/.msm-staging/`))).toBe(true);

    fs.seed(`${DIR}/Gem hunt/level.dat`, 'played');
    const again = await ensureServer(serverDeps(fs, recipe), SERVERS, recipe);
    expect(again.world).toEqual({ folder: 'Gem hunt', copied: false });
    expect(text(fs.files.get(`${DIR}/Gem hunt/level.dat`) as Uint8Array)).toBe('played');

    const replace = serverRecipe(MOD_PROJECT, RELEASE, { ...world, replace: true });
    await ensureServer(serverDeps(fs, replace), SERVERS, replace);
    expect(text(fs.files.get(`${DIR}/Gem hunt/level.dat`) as Uint8Array)).toBe('level map');
  });

  it('refuses a world, a mod or a launcher jar of the same name that MSM did not put there', async () => {
    const recipe = serverRecipe();
    const fs = new ServerMemoryFs();
    await ensureServer(serverDeps(fs, recipe), SERVERS, recipe);
    fs.seed(`${DIR}/world/level.dat`, 'made by the server');
    seedWorld(fs, '/w/world');
    const intoWorld = serverRecipe(MOD_PROJECT, RELEASE, { folder: 'world', source: '/w/world' });
    expect(await code(ensureServer(serverDeps(fs, intoWorld), SERVERS, intoWorld))).toBe(
      'server.foreign-world',
    );
    expect(text(fs.files.get(`${DIR}/world/level.dat`) as Uint8Array)).toBe('made by the server');

    const mods = new ServerMemoryFs();
    mods.seed(
      `${DIR}/.msm-server.json`,
      serverMarkerText({
        formatVersion: 1,
        kind: 'fabric',
        owner: 'gem_hunt',
        minecraft: '9.1',
        loader: '0.20.1',
        launcher: null,
        eula: null,
        properties: {},
        worlds: [],
      }),
    );
    mods.seed(`${DIR}/fabric-server-launch.jar`, jar('mine'));
    expect(await code(ensureServer(serverDeps(mods, recipe), SERVERS, recipe))).toBe(
      'server.foreign-file',
    );

    const content = new ServerMemoryFs();
    await ensureServer(serverDeps(content, recipe), SERVERS, recipe);
    content.seed(`${DIR}/mods/gem_hunt.jar`, 'their own build');
    expect(await code(ensureServer(serverDeps(content, recipe), SERVERS, recipe))).toBe(
      'server.foreign-file',
    );
    expect(text(content.files.get(`${DIR}/mods/gem_hunt.jar`) as Uint8Array)).toBe(
      'their own build',
    );
  });

  it('refuses recipes a server cannot use', async () => {
    const fs = new ServerMemoryFs();
    const test = recipeFor({ kind: 'test' }, MOD_PROJECT, RELEASE);
    expect(await code(ensureServer(serverDeps(fs, test), SERVERS, test))).toBe('server.bad-recipe');
    const quilt = { ...serverRecipe(), loader: { kind: 'quilt' as const, version: '0.30.2' } };
    expect(await code(ensureServer(serverDeps(fs, quilt), SERVERS, quilt))).toBe(
      'server.loader-not-supported',
    );
    const packs = { ...serverRecipe(), resourcePacks: [{ fileName: 'p.zip', source: 'x' }] };
    expect(await code(ensureServer(serverDeps(fs, packs), SERVERS, packs))).toBe(
      'server.bad-recipe',
    );
    const logs = { ...serverRecipe(), world: { folder: 'logs', source: '/w', replace: false } };
    expect(await code(ensureServer(serverDeps(fs, logs), SERVERS, logs))).toBe('server.bad-recipe');
    expect(
      await code(ensureServer(serverDeps(fs, serverRecipe()), 'relative/servers', serverRecipe())),
    ).toBe('server.no-folder');
    expect(
      await code(
        ensureServer(serverDeps(fs, serverRecipe()), SERVERS, serverRecipe(), { port: 0 }),
      ),
    ).toBe('server.bad-recipe');
    expect(fs.dirs.has(SERVERS)).toBe(false);
  });

  it('replaces its own launcher jar when the loader changes', async () => {
    const fs = new ServerMemoryFs();
    const recipe = serverRecipe();
    await ensureServer(serverDeps(fs, recipe), SERVERS, recipe);
    const newer = { ...recipe, loader: { kind: 'fabric' as const, version: '0.21.0' } };
    const calls = { n: 0 };
    const made = await ensureServer(serverDeps(fs, newer, calls), SERVERS, newer);
    expect(calls.n).toBe(1);
    expect(made.launcher.written).toBe(true);
    expect(text(fs.files.get(`${DIR}/fabric-server-launch.jar`) as Uint8Array)).toContain('0.21.0');
    expect(
      parseServerMarker(text(fs.files.get(`${DIR}/.msm-server.json`) as Uint8Array))?.loader,
    ).toBe('0.21.0');
  });
});

describe('server.properties in a server folder', () => {
  it("keeps the user's own keys and values, and forces only what the caller names", async () => {
    const fs = new ServerMemoryFs();
    const recipe = serverRecipe();
    await ensureServer(serverDeps(fs, recipe), SERVERS, recipe);
    const path = `${DIR}/server.properties`;
    fs.seed(
      path,
      `${text(fs.files.get(path) as Uint8Array)}max-players=4\nwhite-list=true\nserver-port=25599\n`.replace(
        /^white-list=false\n|^server-port=25565\n/gm,
        '',
      ),
    );
    const kept = await ensureServer(serverDeps(fs, recipe), SERVERS, recipe, { motd: 'Gem hunt' });
    expect(kept.keptUserValues.sort()).toEqual(['server-port', 'white-list']);
    expect(kept.port).toBe(25599);
    const map = parseProperties(text(fs.files.get(path) as Uint8Array));
    expect(map.get('max-players')).toBe('4');
    expect(map.get('white-list')).toBe('true');
    expect(map.get('motd')).toBe('Gem hunt');

    const moved = await ensureServer(serverDeps(fs, recipe), SERVERS, recipe, {
      port: 25570,
      force: ['server-port'],
    });
    expect(moved.port).toBe(25570);
    expect(parseProperties(text(fs.files.get(path) as Uint8Array)).get('white-list')).toBe('true');
  });

  it('sets the world type of a new world when asked', async () => {
    const fs = new ServerMemoryFs();
    const recipe = serverRecipe();
    await ensureServer(serverDeps(fs, recipe), SERVERS, recipe, {
      levelType: 'gem_hunt:sky_islands',
    });
    expect(text(fs.files.get(`${DIR}/server.properties`) as Uint8Array)).toContain(
      'level-type=gem_hunt\\:sky_islands',
    );
  });
});

describe('the EULA and the start', () => {
  it('starts only after the user accepted the EULA for this folder', async () => {
    const fs = new ServerMemoryFs();
    const recipe = serverRecipe();
    await ensureServer(serverDeps(fs, recipe), SERVERS, recipe);
    const java = '/jdk/bin/java';
    expect(await planServerStart({ fs, sha256 }, SERVERS, DIR, java)).toMatchObject({
      ok: false,
      code: 'server.eula-needed',
    });
    // Nothing but the user's acceptance writes the file.
    for (const bad of [undefined, { accepted: false, at: AT }, { accepted: true }]) {
      expect(await code(acceptServerEula(fs, SERVERS, DIR, bad as never))).toBe(
        'server.eula-not-accepted',
      );
    }
    expect(fs.files.has(`${DIR}/eula.txt`)).toBe(false);

    await acceptServerEula(fs, SERVERS, DIR, { accepted: true, at: AT });
    expect(text(fs.files.get(`${DIR}/eula.txt`) as Uint8Array)).toMatch(/^eula=true$/m);
    expect((json(fs, `${DIR}/.msm-server.json`) as { eula: unknown }).eula).toEqual({
      acceptedAt: AT,
    });
    expect(await planServerStart({ fs, sha256 }, SERVERS, DIR, java)).toEqual({
      ok: true,
      command: {
        program: java,
        args: ['-Xmx2048M', '-jar', 'fabric-server-launch.jar', 'nogui'],
        cwd: DIR,
      },
      port: 25565,
      levelName: 'world',
    });

    // A removed eula.txt is written again from the user's own acceptance of this folder.
    await fs.remove(`${DIR}/eula.txt`);
    const again = await ensureServer(serverDeps(fs, recipe), SERVERS, recipe);
    expect(again.eula).toBe('accepted');
    // One the user set to false stays so.
    fs.seed(`${DIR}/eula.txt`, 'eula=false\n');
    expect((await ensureServer(serverDeps(fs, recipe), SERVERS, recipe)).eula).toBe('not-accepted');
  });

  it('refuses a changed launcher jar', async () => {
    const fs = new ServerMemoryFs();
    const recipe = serverRecipe();
    await ensureServer(serverDeps(fs, recipe), SERVERS, recipe);
    await acceptServerEula(fs, SERVERS, DIR, { accepted: true, at: AT });
    fs.seed(`${DIR}/fabric-server-launch.jar`, jar('changed'));
    expect(await planServerStart({ fs, sha256 }, SERVERS, DIR, 'java')).toMatchObject({
      ok: false,
      code: 'server.launcher-changed',
    });
    expect(await code(ensureServer(serverDeps(fs, recipe), SERVERS, recipe))).toBe(
      'server.launcher-changed',
    );
    expect(text(fs.files.get(`${DIR}/fabric-server-launch.jar`) as Uint8Array)).toContain(
      'changed',
    );
  });

  it('refuses folders that are not MSM servers', async () => {
    const fs = new ServerMemoryFs();
    fs.seed(`${SERVERS}/theirs/server.properties`, 'motd=Mine\n');
    expect(await planServerStart({ fs }, SERVERS, `${SERVERS}/theirs`, 'java')).toMatchObject({
      ok: false,
      code: 'server.not-ours',
    });
    expect(
      await code(acceptServerEula(fs, SERVERS, `${SERVERS}/theirs`, { accepted: true, at: AT })),
    ).toBe('server.not-ours');
    expect(fs.files.has(`${SERVERS}/theirs/eula.txt`)).toBe(false);
    expect(await planServerStart({ fs }, SERVERS, '/elsewhere/srv', 'java')).toMatchObject({
      ok: false,
      code: 'server.outside-root',
    });
  });
});

describe('D5: foreign folders are never touched', () => {
  it('every server recipe, run twice on both targets, leaves foreign servers and launchers byte for byte as they were', async () => {
    const fs = new ServerMemoryFs();
    seedForeignPrism(fs);
    // The user's own server, a same-named folder without the marker, one with an unreadable
    // marker, and a folder named like MSM's staging folder.
    fs.seed(`${SERVERS}/my own server/server.properties`, 'motd=Mine\n');
    fs.seed(`${SERVERS}/my own server/eula.txt`, 'eula=true\n');
    fs.seed(`${SERVERS}/gem_hunt-9.1/notes.txt`, 'not a server');
    fs.seed(`${SERVERS}/gem_hunt-9.1-2/.msm-server.json`, 'garbage');
    fs.seed(`${SERVERS}/.msm-staging/notes/readme.txt`, 'the user put this here');
    seedWorld(fs, '/projects/gem/worlds/Gem hunt', 'map');
    fs.markForeignServers();
    const ours = (path: string): boolean =>
      /^\/home\/alex\/\.msm\/servers\/gem_hunt-9\.(1-3|2-snapshot-7)(\/|$)/.test(path);
    const keep = (path: string): boolean =>
      (path.startsWith(ROOT) || path.startsWith(SERVERS)) && !ours(path);
    const before = snapshot(fs, keep);

    for (let round = 0; round < 2; round++) {
      for (const target of [RELEASE, SNAPSHOT]) {
        for (const project of [MOD_PROJECT, PLAIN_PROJECT]) {
          for (const world of [
            undefined,
            { folder: 'Gem hunt', source: '/projects/gem/worlds/Gem hunt' },
          ]) {
            const recipe = serverRecipe(project, target, world);
            const made = await ensureServer(serverDeps(fs, recipe), SERVERS, recipe);
            await acceptServerEula(fs, SERVERS, made.serverDir, { accepted: true, at: AT });
          }
        }
      }
    }
    expect(snapshot(fs, keep)).toEqual(before);
    expect(fs.serverViolations).toEqual([]);
    expect((await listServers(fs, SERVERS)).map((s) => s.folder)).toEqual([
      'gem_hunt-9.1-3',
      'gem_hunt-9.2-snapshot-7',
    ]);
    // Every write, removal and move was inside MSM's own server folders or its staging folders.
    const touched = fs.log.flatMap((entry) => {
      const [op, ...rest] = entry.split(' ');
      const paths = rest.join(' ');
      return op === 'rename' ? paths.split(' -> ') : [paths];
    });
    expect(touched.length).toBeGreaterThan(0);
    expect(
      touched.filter((path) => !ours(path) && !path.startsWith(`${SERVERS}/.msm-staging/stage-`)),
    ).toEqual([]);
    expect((await placeServer(fs, SERVERS, serverRecipe())).folder).toBe('gem_hunt-9.1-3');
  });
});
