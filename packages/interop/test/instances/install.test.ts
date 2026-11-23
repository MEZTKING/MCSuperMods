import { describe, expect, it } from 'vitest';
import {
  createManagedInstance,
  type EnsureInstanceDeps,
  ensureInstance,
  fabricReadiness,
  INSTALLED_RECORD_FILE,
  InstanceError,
  listManaged,
  listMmcInstances,
  parseInstanceMarker,
  type RecipeProjectFacts,
  type RunRecipe,
  recipeFor,
} from '../../src/index';
import { MemoryInstallFileSystem } from '../helpers/memory-install-fs';
import {
  bytes,
  bytesOf,
  INSTANCES,
  RELEASE,
  ROOT,
  SNAPSHOT,
  StagingMemoryFs,
  seedWorld,
  sha512,
  stagingIds,
  TARGETS,
  text,
} from './helpers';

const modded: RecipeProjectFacts = { namespace: 'gems', modId: 'gems', playsWithoutMods: false };
const plainGame: RecipeProjectFacts = {
  namespace: 'parkour',
  modId: 'parkour',
  playsWithoutMods: true,
};

function prism(): StagingMemoryFs {
  const fs = new StagingMemoryFs();
  fs.seed(`${ROOT}/prismlauncher.cfg`, 'InstanceDir=instances\n');
  fs.seed('/msm/worlds/parkour/level.dat', 'x');
  seedWorld(fs, '/msm/worlds/parkour', 'parkour');
  fs.markForeign();
  return fs;
}

function deps(fs: MemoryInstallFileSystem): EnsureInstanceDeps {
  return { fs, sha512, bytesOf, stagingId: stagingIds() };
}

async function codeOf(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (error) {
    return error instanceof InstanceError ? error.code : `other: ${String(error)}`;
  }
  return undefined;
}

async function marker(fs: MemoryInstallFileSystem, instanceDir: string) {
  return parseInstanceMarker(text(await fs.readFile(`${instanceDir}/.msm-managed.json`)));
}

describe.each(TARGETS)('ensureInstance on $mcVersion', (target) => {
  const mc = target.mcVersion;

  it('makes the test instance whole, in one rename, and discovery reads it as Fabric', async () => {
    const fs = prism();
    const recipe = recipeFor({ kind: 'test' }, modded, target);
    const made = await ensureInstance(deps(fs), ROOT, recipe);
    expect(made).toMatchObject({
      folder: `MCSuperMods Test (${mc})`,
      created: true,
      updated: false,
      mods: { removed: [] },
      world: { folder: 'msm-test-gems', copied: false },
    });
    expect(fs.violations).toEqual([]);
    expect(fs.log.filter((line) => line.startsWith('rename'))).toEqual([
      `rename ${INSTANCES}/.msm-staging/stage-${fs.log.join().match(/stage-(\d+)/)?.[1]}/MCSuperMods Test (${mc}) -> ${made.instanceDir}`,
    ]);
    // No staging folder is left behind.
    expect([...fs.dirs].some((dir) => dir.includes('.msm-staging'))).toBe(false);
    const [found] = await listMmcInstances(fs, ROOT, 'prism');
    expect(found).toMatchObject({
      displayName: `MCSuperMods Test (${mc})`,
      mcVersion: mc,
      loader: { kind: 'fabric', version: '0.20.1' },
      problems: [],
    });
    expect(fabricReadiness(found ?? null, { mcVersion: mc, loader: '0.20.1', api: '' }).mode).toBe(
      'launch',
    );
    expect(text(await fs.readFile(`${made.instanceDir}/instance.cfg`))).toBe(
      `[General]\nInstanceType=OneSix\nname=MCSuperMods Test (${mc})\n`,
    );
    expect(text(await fs.readFile(`${made.gameDir}/options.txt`))).toBe(
      'onboardAccessibility:false\n',
    );
    expect(await fs.exists(`${made.gameDir}/mods/gems.jar`)).toBe(true);
    expect(await fs.exists(`${made.gameDir}/mods/${INSTALLED_RECORD_FILE}`)).toBe(true);
    expect(await marker(fs, made.instanceDir)).toMatchObject({
      formatVersion: 2,
      role: 'test',
      owner: null,
      loaderKind: 'fabric',
      minecraft: mc,
    });
  });

  it('makes the Plain instance: only net.minecraft, no mods folder, the world copied whole', async () => {
    const fs = prism();
    const recipe = recipeFor(
      {
        kind: 'plain',
        world: { folder: 'msm-game-parkour', source: '/msm/worlds/parkour' },
        resourcePacks: [{ fileName: 'parkour.zip', source: 'parkour' }],
      },
      plainGame,
      target,
    );
    const made = await ensureInstance(deps(fs), ROOT, recipe);
    expect(fs.violations).toEqual([]);
    expect(made.folder).toBe(`MCSuperMods Plain (${mc})`);
    expect(JSON.parse(text(await fs.readFile(`${made.instanceDir}/mmc-pack.json`)))).toEqual({
      components: [{ important: true, uid: 'net.minecraft', version: mc }],
      formatVersion: 1,
    });
    expect(await fs.exists(`${made.gameDir}/mods`)).toBe(false);
    const world = `${made.gameDir}/saves/msm-game-parkour`;
    expect(text(await fs.readFile(`${world}/level.dat`))).toBe('level parkour');
    expect(text(await fs.readFile(`${world}/datapacks/game.zip`))).toBe('pack parkour');
    expect(await fs.exists(`${world}/session.lock`)).toBe(false);
    expect(text(await fs.readFile(`${made.gameDir}/resourcepacks/parkour.zip`))).toBe(
      'resource pack parkour',
    );
    expect(text(await fs.readFile(`${made.gameDir}/options.txt`))).toBe(
      'onboardAccessibility:false\nresourcePacks:["vanilla","file/parkour.zip"]\n',
    );
    expect(await marker(fs, made.instanceDir)).toMatchObject({
      formatVersion: 2,
      role: 'plain',
      loaderKind: 'none',
      loader: null,
      worlds: ['msm-game-parkour'],
      files: {
        'resourcepacks/parkour.zip': { sha512: await sha512(bytes('resource pack parkour')) },
      },
    });
    const [found] = await listMmcInstances(fs, ROOT, 'prism');
    expect(found).toMatchObject({ mcVersion: mc, loader: null });
  });

  it('runs twice without changing anything the second time', async () => {
    const fs = prism();
    const recipe = recipeFor(
      { kind: 'plain', world: { folder: 'w1', source: '/msm/worlds/parkour' } },
      plainGame,
      target,
    );
    await ensureInstance(deps(fs), ROOT, recipe);
    const before = new Map(fs.files);
    const logLength = fs.log.length;
    const again = await ensureInstance(deps(fs), ROOT, recipe);
    expect(again).toMatchObject({ created: false, updated: false, world: { copied: false } });
    expect(fs.log.slice(logLength)).toEqual([]);
    expect(new Map(fs.files)).toEqual(before);
  });

  it('gives a modpack its own instance, so the test instance keeps its mods', async () => {
    const fs = prism();
    const test = await ensureInstance(deps(fs), ROOT, recipeFor({ kind: 'test' }, modded, target));
    const testMods = new Map(
      [...fs.files].filter(([path]) => path.startsWith(`${test.gameDir}/mods/`)),
    );
    const pack = await ensureInstance(
      deps(fs),
      ROOT,
      recipeFor(
        {
          kind: 'modpack',
          name: 'Adventure',
          modIds: ['gems', 'dragons'],
          extraMods: [{ fileName: 'sodium-1.0.jar', projectId: 'AANobbMI' }],
        },
        modded,
        target,
      ),
    );
    expect(pack.folder).toBe(`MCSuperMods Pack Adventure (${mc})`);
    expect(pack.mods.files).toEqual([
      'dragons.jar',
      `fabric-api-${target.fabric?.api}.jar`,
      'gems.jar',
      'sodium-1.0.jar',
    ]);
    expect(
      new Map([...fs.files].filter(([path]) => path.startsWith(`${test.gameDir}/mods/`))),
    ).toEqual(testMods);
    // Dropping a mod from the pack removes MSM's copy of it, and nothing else.
    const smaller = await ensureInstance(
      deps(fs),
      ROOT,
      recipeFor({ kind: 'modpack', name: 'Adventure', modIds: ['gems'] }, modded, target),
    );
    expect(smaller.mods.removed).toEqual(['dragons.jar', 'sodium-1.0.jar']);
    expect(fs.violations).toEqual([]);
  });

  it('gives a map that needs its mod its own Fabric instance with the world', async () => {
    const fs = prism();
    const made = await ensureInstance(
      deps(fs),
      ROOT,
      recipeFor(
        {
          kind: 'map',
          name: 'Gem hunt',
          world: { folder: 'Gem hunt', source: '/msm/worlds/parkour' },
        },
        modded,
        target,
      ),
    );
    expect(made.folder).toBe(`MCSuperMods Map Gem hunt (${mc})`);
    expect(await fs.exists(`${made.gameDir}/saves/Gem hunt/level.dat`)).toBe(true);
    expect(await fs.exists(`${made.gameDir}/mods/gems.jar`)).toBe(true);
    expect(fs.violations).toEqual([]);
  });

  it('refuses a server recipe', async () => {
    const fs = prism();
    expect(
      await codeOf(() =>
        ensureInstance(deps(fs), ROOT, recipeFor({ kind: 'server' }, modded, target)),
      ),
    ).toBe('instance.server-recipe');
  });
});

describe('an existing test instance', () => {
  it('a version 1 marker still works: used, kept at version 1, the mods installed', async () => {
    const fs = prism();
    const facts = { mcVersion: '9.1', loader: '0.20.1', api: RELEASE.fabric?.api ?? '' };
    const legacy = new MemoryInstallFileSystem();
    // The old writer (no rename) made it before this plan.
    await createManagedInstance(legacy, INSTANCES, facts);
    for (const [path, data] of legacy.files) fs.seed(path, data);
    for (const dir of legacy.dirs) await fs.mkdirp(dir);
    const markerBefore = text(
      await fs.readFile(`${INSTANCES}/MCSuperMods Test (9.1)/.msm-managed.json`),
    );
    expect(JSON.parse(markerBefore).formatVersion).toBe(1);

    const made = await ensureInstance(deps(fs), ROOT, recipeFor({ kind: 'test' }, modded, RELEASE));
    expect(made).toMatchObject({
      folder: 'MCSuperMods Test (9.1)',
      created: false,
      updated: false,
    });
    expect(text(await fs.readFile(`${made.instanceDir}/.msm-managed.json`))).toBe(markerBefore);
    expect(await fs.exists(`${made.gameDir}/mods/gems.jar`)).toBe(true);
    // And the old writer still reads what the new one leaves.
    expect(await createManagedInstance(fs, INSTANCES, facts)).toMatchObject({ created: false });
  });

  it('a new loader version rewrites mmc-pack.json and the marker, keeping version 1', async () => {
    const fs = prism();
    const legacy = new MemoryInstallFileSystem();
    await createManagedInstance(legacy, INSTANCES, {
      mcVersion: '9.1',
      loader: '0.19.0',
      api: 'x',
    });
    for (const [path, data] of legacy.files) fs.seed(path, data);
    for (const dir of legacy.dirs) await fs.mkdirp(dir);
    const made = await ensureInstance(deps(fs), ROOT, recipeFor({ kind: 'test' }, modded, RELEASE));
    expect(made.updated).toBe(true);
    expect(
      JSON.parse(text(await fs.readFile(`${made.instanceDir}/mmc-pack.json`))).components[1],
    ).toEqual({
      uid: 'net.fabricmc.fabric-loader',
      version: '0.20.1',
    });
    expect(JSON.parse(text(await fs.readFile(`${made.instanceDir}/.msm-managed.json`)))).toEqual({
      formatVersion: 1,
      generator: 'MCSuperMods',
      loader: '0.20.1',
      minecraft: '9.1',
    });
  });

  it('createManagedInstance builds a new instance in a staging folder when it can rename', async () => {
    const fs = prism();
    const made = await createManagedInstance(fs, INSTANCES, {
      mcVersion: '9.1',
      loader: '0.20.1',
      api: 'x',
    });
    expect(made.created).toBe(true);
    expect(fs.violations).toEqual([]);
    expect(
      fs.log.some((line) => line.startsWith('rename') && line.endsWith(made.instanceDir)),
    ).toBe(true);
    expect([...fs.dirs].some((dir) => dir.includes('.msm-staging'))).toBe(false);
  });
});

describe('the taken-name rule and the marker check', () => {
  it('never touches a same-named folder without the marker, and uses -2', async () => {
    const fs = prism();
    fs.seed(`${INSTANCES}/MCSuperMods Plain (9.1)/instance.cfg`, '[General]\nname=mine\n');
    fs.seed(`${INSTANCES}/MCSuperMods Plain (9.1)/notes.txt`, 'mine');
    fs.markForeign();
    const before = new Map(
      [...fs.files].filter(([path]) => path.startsWith(`${INSTANCES}/MCSuperMods Plain (9.1)/`)),
    );
    const recipe = recipeFor({ kind: 'plain' }, plainGame, RELEASE);
    const made = await ensureInstance(deps(fs), ROOT, recipe);
    expect(made.folder).toBe('MCSuperMods Plain (9.1)-2');
    const again = await ensureInstance(deps(fs), ROOT, recipe);
    expect(again).toMatchObject({ folder: 'MCSuperMods Plain (9.1)-2', created: false });
    expect(
      new Map(
        [...fs.files].filter(([path]) => path.startsWith(`${INSTANCES}/MCSuperMods Plain (9.1)/`)),
      ),
    ).toEqual(before);
    expect(fs.violations).toEqual([]);
  });

  it('skips MSM folders made for something else and folders with an unreadable marker', async () => {
    const fs = prism();
    const base = `${INSTANCES}/MCSuperMods Pack A (9.1)`;
    // `A?` and `A` share a label: the first pack takes the base name.
    await ensureInstance(
      deps(fs),
      ROOT,
      recipeFor({ kind: 'modpack', name: 'A?', modIds: ['gems'] }, modded, RELEASE),
    );
    fs.seed(`${base}-2/instance.cfg`, 'x');
    fs.seed(`${base}-2/.msm-managed.json`, '{not json');
    fs.markForeign();
    const made = await ensureInstance(
      deps(fs),
      ROOT,
      recipeFor({ kind: 'modpack', name: 'A', modIds: ['gems'] }, modded, RELEASE),
    );
    expect(made.folder).toBe('MCSuperMods Pack A (9.1)-3');
    expect(text(await fs.readFile(`${base}-2/.msm-managed.json`))).toBe('{not json');
    // Each finds its own again.
    expect(
      (
        await ensureInstance(
          deps(fs),
          ROOT,
          recipeFor({ kind: 'modpack', name: 'A?', modIds: ['gems'] }, modded, RELEASE),
        )
      ).folder,
    ).toBe('MCSuperMods Pack A (9.1)');
  });

  it('refuses a resource pack or world of the same name that MSM did not put there', async () => {
    const fs = prism();
    const plain = (packs = true) =>
      recipeFor(
        {
          kind: 'plain',
          world: { folder: 'w1', source: '/msm/worlds/parkour' },
          ...(packs ? { resourcePacks: [{ fileName: 'p.zip', source: 'p' }] } : {}),
        },
        plainGame,
        RELEASE,
      );
    const made = await ensureInstance(
      deps(fs),
      ROOT,
      recipeFor({ kind: 'plain' }, plainGame, RELEASE),
    );
    fs.seed(`${made.gameDir}/resourcepacks/p.zip`, 'the user made this');
    expect(await codeOf(() => ensureInstance(deps(fs), ROOT, plain()))).toBe(
      'instance.foreign-file',
    );
    expect(text(await fs.readFile(`${made.gameDir}/resourcepacks/p.zip`))).toBe(
      'the user made this',
    );
    seedWorld(fs, `${made.gameDir}/saves/w1`, 'theirs');
    expect(await codeOf(() => ensureInstance(deps(fs), ROOT, plain(false)))).toBe(
      'instance.foreign-world',
    );
    expect(text(await fs.readFile(`${made.gameDir}/saves/w1/level.dat`))).toBe('level theirs');
  });

  it('refuses a mod file of the same name that MSM did not install', async () => {
    const fs = prism();
    const made = await ensureInstance(deps(fs), ROOT, recipeFor({ kind: 'test' }, modded, RELEASE));
    fs.seed(`${made.gameDir}/mods/dragons.jar`, 'the user put this here');
    const pack = recipeFor({ kind: 'test' }, { ...modded, modId: 'dragons' }, RELEASE);
    expect(await codeOf(() => ensureInstance(deps(fs), ROOT, pack))).toBe('instance.foreign-file');
    expect(text(await fs.readFile(`${made.gameDir}/mods/dragons.jar`))).toBe(
      'the user put this here',
    );
  });

  it('keeps a copied world unless the recipe replaces it, building the new copy first', async () => {
    const fs = prism();
    const recipe = (replace: boolean) =>
      recipeFor(
        { kind: 'plain', world: { folder: 'w1', source: '/msm/worlds/parkour', replace } },
        plainGame,
        RELEASE,
      );
    const made = await ensureInstance(deps(fs), ROOT, recipe(false));
    fs.seed(`${made.gameDir}/saves/w1/level.dat`, 'played');
    expect((await ensureInstance(deps(fs), ROOT, recipe(false))).world).toEqual({
      folder: 'w1',
      copied: false,
    });
    expect(text(await fs.readFile(`${made.gameDir}/saves/w1/level.dat`))).toBe('played');
    const replaced = await ensureInstance(deps(fs), ROOT, recipe(true));
    expect(replaced.world).toEqual({ folder: 'w1', copied: true });
    expect(text(await fs.readFile(`${made.gameDir}/saves/w1/level.dat`))).toBe('level parkour');
    expect(fs.violations).toEqual([]);
    expect([...fs.dirs].some((dir) => dir.includes('.msm-staging'))).toBe(false);
  });
});

describe('staging', () => {
  it('removes a staging folder an earlier run left, and nothing else there', async () => {
    const fs = prism();
    fs.seed(
      `${INSTANCES}/.msm-staging/old-run/.msm-managed.json`,
      '{"generator":"MCSuperMods","staging":true}\n',
    );
    fs.seed(`${INSTANCES}/.msm-staging/old-run/MCSuperMods Plain (9.1)/instance.cfg`, 'half');
    fs.seed(`${INSTANCES}/.msm-staging/theirs/file.txt`, 'not ours');
    await ensureInstance(deps(fs), ROOT, recipeFor({ kind: 'plain' }, plainGame, RELEASE));
    expect(await fs.exists(`${INSTANCES}/.msm-staging/old-run`)).toBe(false);
    expect(text(await fs.readFile(`${INSTANCES}/.msm-staging/theirs/file.txt`))).toBe('not ours');
  });

  it('moves nothing when a folder of the same name appears during the build', async () => {
    const raced = prism();
    const target = `${INSTANCES}/MCSuperMods Plain (9.1)`;
    const realExists = raced.exists.bind(raced);
    let armed = false;
    // Once the build has started, the launcher (say) makes a folder of the same name.
    raced.exists = async (path: string) => {
      if (armed && path === target && !raced.dirs.has(target)) {
        raced.seed(`${target}/instance.cfg`, 'raced');
        raced.markForeign();
      }
      return realExists(path);
    };
    const run = ensureInstance(
      {
        ...deps(raced),
        bytesOf: async (item) => {
          armed = true;
          return bytesOf(item);
        },
      },
      ROOT,
      recipeFor(
        { kind: 'plain', resourcePacks: [{ fileName: 'p.zip', source: 'p' }] },
        plainGame,
        RELEASE,
      ),
    );
    expect(await codeOf(() => run)).toBe('instance.taken');
    expect(text(await raced.readFile(`${target}/instance.cfg`))).toBe('raced');
    expect(await raced.exists(`${target}/.msm-managed.json`)).toBe(false);
    expect(raced.log.some((line) => line.startsWith('rename'))).toBe(false);
    expect([...raced.dirs].some((dir) => dir.includes('.msm-staging'))).toBe(false);
  });

  it('cannot make a new instance without rename, and says so', async () => {
    const fs = new MemoryInstallFileSystem();
    fs.seed(`${ROOT}/prismlauncher.cfg`, 'InstanceDir=instances\n');
    expect(
      await codeOf(() =>
        ensureInstance(deps(fs), ROOT, recipeFor({ kind: 'plain' }, plainGame, RELEASE)),
      ),
    ).toBe('instance.cannot-stage');
    expect(await fs.exists(`${INSTANCES}/MCSuperMods Plain (9.1)`)).toBe(false);
  });

  it('needs the launcher folder to exist', async () => {
    const fs = new StagingMemoryFs();
    expect(
      await codeOf(() =>
        ensureInstance(deps(fs), ROOT, recipeFor({ kind: 'plain' }, plainGame, RELEASE)),
      ),
    ).toBe('instance.no-launcher');
    expect(fs.files.size).toBe(0);
  });

  it('refuses loaders whose plans do not exist yet', async () => {
    const fs = prism();
    const recipe: RunRecipe = {
      ...recipeFor({ kind: 'test' }, modded, RELEASE),
      loader: { kind: 'neoforge', version: '9.1.0.110' },
    };
    expect(await codeOf(() => ensureInstance(deps(fs), ROOT, recipe))).toBe(
      'instance.loader-not-supported',
    );
  });

  it('refuses an instance folder that leads outside the instances folder', async () => {
    const fs = prism();
    const made = await ensureInstance(
      deps(fs),
      ROOT,
      recipeFor({ kind: 'plain' }, plainGame, RELEASE),
    );
    // Swap the folder for a link to somewhere else that holds a copy of the marker.
    const marker = await fs.readFile(`${made.instanceDir}/.msm-managed.json`);
    await fs.remove(made.instanceDir);
    fs.seed('/elsewhere/inst/.msm-managed.json', marker);
    fs.seed('/elsewhere/inst/instance.cfg', 'x');
    fs.seed('/elsewhere/inst/mmc-pack.json', 'x');
    fs.link(made.instanceDir, '/elsewhere/inst');
    expect(
      await codeOf(() =>
        ensureInstance(deps(fs), ROOT, recipeFor({ kind: 'plain' }, plainGame, RELEASE)),
      ),
    ).toBe('instance.outside-root');
    expect(await fs.exists('/elsewhere/inst/minecraft')).toBe(false);
  });
});

describe('listManaged', () => {
  it('lists the instances MSM made in each root, with both marker versions', async () => {
    const fs = prism();
    const legacy = new MemoryInstallFileSystem();
    await createManagedInstance(legacy, INSTANCES, {
      mcVersion: '9.1',
      loader: '0.20.1',
      api: 'x',
    });
    for (const [path, data] of legacy.files) fs.seed(path, data);
    for (const dir of legacy.dirs) await fs.mkdirp(dir);
    await ensureInstance(deps(fs), ROOT, recipeFor({ kind: 'plain' }, plainGame, SNAPSHOT));
    fs.seed('/multimc/multimc.cfg', 'InstanceDir=inst\n');
    fs.seed('/multimc/inst/Theirs/instance.cfg', 'x');
    await ensureInstance(
      deps(fs),
      '/multimc',
      recipeFor({ kind: 'modpack', name: 'Adventure', modIds: ['gems'] }, modded, RELEASE),
    );
    const listed = await listManaged(fs, [ROOT, '/multimc', '/missing']);
    expect(
      listed.map((entry) => [entry.root, entry.folder, entry.role, entry.markerVersion]),
    ).toEqual([
      [ROOT, 'MCSuperMods Plain (9.2-snapshot-7)', 'plain', 2],
      [ROOT, 'MCSuperMods Test (9.1)', 'test', 1],
      ['/multimc', 'MCSuperMods Pack Adventure (9.1)', 'pack', 2],
    ]);
    expect(listed[2]).toMatchObject({
      owner: 'Adventure',
      loaderKind: 'fabric',
      loaderVersion: '0.20.1',
      mcVersion: '9.1',
      instanceDir: '/multimc/inst/MCSuperMods Pack Adventure (9.1)',
    });
  });
});
