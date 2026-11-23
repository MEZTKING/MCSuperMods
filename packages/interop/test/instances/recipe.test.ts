import { describe, expect, it } from 'vitest';
import {
  candidateName,
  candidateSuffix,
  describeRecipe,
  InstanceError,
  instanceBaseName,
  ownerLabel,
  type RecipeProjectFacts,
  type RecipeTargetFacts,
  type RunAction,
  recipeFor,
  serverBaseName,
} from '../../src/index';
import { RELEASE, SNAPSHOT, TARGETS } from './helpers';

const modded: RecipeProjectFacts = { namespace: 'gems', modId: 'gems', playsWithoutMods: false };
const plainGame: RecipeProjectFacts = {
  namespace: 'parkour',
  modId: 'parkour',
  playsWithoutMods: true,
};
const world = { folder: 'msm-game-parkour', source: '/msm/worlds/parkour' };

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof InstanceError ? error.code : `other: ${String(error)}`;
  }
  return undefined;
}

describe.each(TARGETS)('recipeFor on $mcVersion', (target) => {
  const mc = target.mcVersion;
  const api = target.fabric?.api ?? '';

  it('test: the test instance, Fabric, the content jar and Fabric API, the test world', () => {
    const recipe = recipeFor({ kind: 'test' }, modded, target);
    expect(recipe).toEqual({
      formatVersion: 1,
      purpose: 'test',
      owner: 'gems',
      mcVersion: mc,
      channel: target.channel,
      java: 25,
      loader: { kind: 'fabric', version: '0.20.1' },
      place: { kind: 'instance', role: 'test', owner: null, name: `MCSuperMods Test (${mc})` },
      mods: [
        { role: 'content', fileName: 'gems.jar', modId: 'gems' },
        { role: 'fabric-api', fileName: `fabric-api-${api}.jar`, version: api },
      ],
      resourcePacks: [],
      world: { folder: 'msm-test-gems', source: null, replace: false },
      join: null,
    });
  });

  it('game: the same test instance on the game world, joining a server when asked', () => {
    const recipe = recipeFor(
      { kind: 'game', join: { host: 'localhost', port: 25566 } },
      modded,
      target,
    );
    expect(recipe.place).toEqual({
      kind: 'instance',
      role: 'test',
      owner: null,
      name: `MCSuperMods Test (${mc})`,
    });
    expect(recipe.world).toEqual({ folder: 'msm-game-gems', source: null, replace: false });
    expect(recipe.join).toEqual({ host: 'localhost', port: 25566 });
  });

  it('plain: the Plain instance, no loader, no mods, a copied world', () => {
    const recipe = recipeFor({ kind: 'plain', world }, plainGame, target);
    expect(recipe.loader).toEqual({ kind: 'none', version: null });
    expect(recipe.place).toEqual({
      kind: 'instance',
      role: 'plain',
      owner: null,
      name: `MCSuperMods Plain (${mc})`,
    });
    expect(recipe.mods).toEqual([]);
    expect(recipe.world).toEqual({ ...world, replace: false });
  });

  it('plain: refused in words for a project that needs its mod', () => {
    expect(codeOf(() => recipeFor({ kind: 'plain', world }, modded, target))).toBe(
      'recipe.needs-mod',
    );
    expect(() => recipeFor({ kind: 'plain' }, modded, target)).toThrow(/needs its mod/);
  });

  it('modpack: its own instance with its jars, Modrinth mods and Fabric API', () => {
    const recipe = recipeFor(
      {
        kind: 'modpack',
        name: 'Adventure',
        modIds: ['gems', 'dragons'],
        extraMods: [{ fileName: 'sodium-1.0.jar', projectId: 'AANobbMI' }],
      },
      modded,
      target,
    );
    expect(recipe.owner).toBe('Adventure');
    expect(recipe.place).toEqual({
      kind: 'instance',
      role: 'pack',
      owner: 'Adventure',
      name: `MCSuperMods Pack Adventure (${mc})`,
    });
    expect(recipe.mods.map((mod) => mod.fileName)).toEqual([
      'gems.jar',
      'dragons.jar',
      'sodium-1.0.jar',
      `fabric-api-${api}.jar`,
    ]);
    expect(recipe.world).toBeNull();
  });

  it('map: the Plain instance for a map without mods, its own Fabric instance otherwise', () => {
    const plainMap = recipeFor(
      { kind: 'map', name: 'Sky race', world: { folder: 'Sky race', source: '/maps/sky' } },
      plainGame,
      target,
    );
    expect(plainMap.place).toMatchObject({ role: 'plain', name: `MCSuperMods Plain (${mc})` });
    expect(plainMap.mods).toEqual([]);
    const moddedMap = recipeFor(
      { kind: 'map', name: 'Gem hunt', world: { folder: 'Gem hunt', source: '/maps/gem' } },
      modded,
      target,
    );
    expect(moddedMap.place).toEqual({
      kind: 'instance',
      role: 'map',
      owner: 'Gem hunt',
      name: `MCSuperMods Map Gem hunt (${mc})`,
    });
    expect(moddedMap.loader.kind).toBe('fabric');
    expect(moddedMap.world).toEqual({ folder: 'Gem hunt', source: '/maps/gem', replace: false });
  });

  it('server: a server folder, the mod for a modded game and none for a plain one', () => {
    const recipe = recipeFor({ kind: 'server' }, modded, target);
    expect(recipe.place).toEqual({
      kind: 'server',
      owner: 'gems',
      name: `MCSuperMods Server gems (${mc})`,
    });
    expect(recipe.loader).toEqual({ kind: 'fabric', version: '0.20.1' });
    expect(recipe.mods.map((mod) => mod.role)).toEqual(['content', 'fabric-api']);
    expect(recipeFor({ kind: 'server', world }, plainGame, target).mods).toEqual([]);
  });

  it('describes every recipe in plain words, without paths', () => {
    const actions: [RunAction, RecipeProjectFacts][] = [
      [{ kind: 'test' }, modded],
      [{ kind: 'game', join: { host: 'localhost', port: 25565 } }, modded],
      [{ kind: 'plain', world }, plainGame],
      [{ kind: 'modpack', name: 'Adventure', modIds: ['gems'] }, modded],
      [{ kind: 'map', name: 'Gem hunt', world: { folder: 'Gem hunt', source: '/maps/g' } }, modded],
      [{ kind: 'server' }, modded],
    ];
    for (const [action, project] of actions) {
      const words = describeRecipe(recipeFor(action, project, target));
      expect(words.title).not.toBe('');
      for (const sentence of words.sentences) {
        expect(sentence).toMatch(/^[A-Z].*[.]$/);
        expect(sentence).not.toMatch(/\/maps|\/msm|instances\/|\\/);
      }
      expect(words.sentences.join(' ').includes('is a snapshot')).toBe(
        target.channel === 'snapshot' && action.kind !== 'server',
      );
    }
  });
});

describe('describeRecipe', () => {
  it('says what the Plain instance holds, as the card of D3 does', () => {
    const words = describeRecipe(recipeFor({ kind: 'plain' }, plainGame, RELEASE));
    expect(words).toEqual({
      title: 'Make an instance without mods',
      sentences: [
        'A Prism Launcher instance named MCSuperMods Plain (9.1), with Minecraft 9.1 and nothing else.',
        'Your other instances are not touched.',
      ],
    });
  });

  it('names the loader, the mods, the world and the server', () => {
    const test = describeRecipe(
      recipeFor({ kind: 'test', join: { host: 'localhost', port: 25565 } }, modded, RELEASE),
      { launcher: 'multimc' },
    );
    expect(test.sentences).toEqual([
      'A MultiMC instance named MCSuperMods Test (9.1), with Minecraft 9.1, Fabric Loader 0.20.1, your mod and Fabric API.',
      'The game makes the world "msm-test-gems" itself the first time.',
      'It joins the server at localhost:25565.',
      'Your other instances are not touched.',
    ]);
    const pack = describeRecipe(
      recipeFor(
        {
          kind: 'modpack',
          name: 'Adventure',
          modIds: ['gems', 'dragons'],
          extraMods: [{ fileName: 'x.jar', projectId: 'AANobbMI' }],
        },
        modded,
        SNAPSHOT,
      ),
    );
    expect(pack.sentences[0]).toBe(
      "A Prism Launcher instance named MCSuperMods Pack Adventure (9.2-snapshot-7), with Minecraft 9.2-snapshot-7, Fabric Loader 0.20.1, the modpack's 3 mods and Fabric API.",
    );
    expect(pack.sentences.at(-1)).toMatch(/is a snapshot/);
    const server = describeRecipe(recipeFor({ kind: 'server' }, modded, RELEASE));
    expect(server.title).toBe('Make a server');
    expect(server.sentences.join(' ')).toMatch(/accept the Minecraft EULA/);
  });
});

describe('recipeFor refuses bad input', () => {
  it('needs Fabric facts for a modded recipe', () => {
    const noFabric: RecipeTargetFacts = {
      mcVersion: RELEASE.mcVersion,
      channel: RELEASE.channel,
      java: RELEASE.java,
    };
    expect(codeOf(() => recipeFor({ kind: 'test' }, modded, noFabric))).toBe('recipe.no-fabric');
    // A plain recipe needs no Fabric.
    expect(recipeFor({ kind: 'plain' }, plainGame, noFabric).loader.kind).toBe('none');
  });

  it('refuses unsafe names, ids, versions, worlds, packs and addresses', () => {
    const cases: (() => unknown)[] = [
      () => recipeFor({ kind: 'test' }, { ...modded, namespace: '../x' }, RELEASE),
      () => recipeFor({ kind: 'test' }, { ...modded, modId: null }, RELEASE),
      () => recipeFor({ kind: 'test' }, modded, { ...RELEASE, mcVersion: '../9.1' }),
      () =>
        recipeFor({ kind: 'plain', world: { folder: '../up', source: '/w' } }, plainGame, RELEASE),
      () =>
        recipeFor(
          { kind: 'plain', world: { folder: '.hidden', source: '/w' } },
          plainGame,
          RELEASE,
        ),
      () =>
        recipeFor(
          { kind: 'plain', resourcePacks: [{ fileName: 'a/b.zip', source: 'x' }] },
          plainGame,
          RELEASE,
        ),
      () =>
        recipeFor(
          {
            kind: 'plain',
            resourcePacks: [
              { fileName: 'a.zip', source: 'x' },
              { fileName: 'A.zip', source: 'y' },
            ],
          },
          plainGame,
          RELEASE,
        ),
      () => recipeFor({ kind: 'test', join: { host: 'a b', port: 1 } }, modded, RELEASE),
      () => recipeFor({ kind: 'test', join: { host: 'localhost', port: 70000 } }, modded, RELEASE),
      () => recipeFor({ kind: 'modpack', name: '  ', modIds: ['gems'] }, modded, RELEASE),
      () => recipeFor({ kind: 'modpack', name: 'P', modIds: [] }, modded, RELEASE),
      () => recipeFor({ kind: 'modpack', name: 'P', modIds: ['gems', 'gems'] }, modded, RELEASE),
      () =>
        recipeFor(
          {
            kind: 'modpack',
            name: 'P',
            modIds: ['gems'],
            extraMods: [{ fileName: '../evil.jar', projectId: 'AANobbMI' }],
          },
          modded,
          RELEASE,
        ),
      () =>
        recipeFor(
          { kind: 'map', name: '???', world: { folder: 'w', source: '/w' } },
          modded,
          RELEASE,
        ),
    ];
    for (const run of cases) expect(codeOf(run)).toBe('recipe.bad-input');
  });
});

describe('names', () => {
  it('keeps the test instance name and adds the new ones', () => {
    expect(instanceBaseName('test', '9.1', null)).toBe('MCSuperMods Test (9.1)');
    expect(instanceBaseName('plain', '9.2-snapshot-7', null)).toBe(
      'MCSuperMods Plain (9.2-snapshot-7)',
    );
    expect(instanceBaseName('pack', '9.1', 'My: pack/1?')).toBe(
      'MCSuperMods Pack My- pack-1 (9.1)',
    );
    expect(instanceBaseName('map', '9.1', 'Sky race')).toBe('MCSuperMods Map Sky race (9.1)');
    expect(serverBaseName('gems', SNAPSHOT.mcVersion)).toBe(
      'MCSuperMods Server gems (9.2-snapshot-7)',
    );
    expect(() => instanceBaseName('pack', '9.1', '...')).toThrow();
  });

  it('makes owners safe as folder names', () => {
    expect(ownerLabel('  .hidden. ')).toBe('hidden');
    expect(ownerLabel('a\u0000b<c>d')).toBe('a-b-c-d');
    expect(ownerLabel('x'.repeat(80))).toHaveLength(48);
    expect(ownerLabel('???')).toBe('');
  });

  it('numbers taken names -2, -3 and reads them back without case', () => {
    expect(candidateName('MCSuperMods Plain (9.1)', 1)).toBe('MCSuperMods Plain (9.1)');
    expect(candidateName('MCSuperMods Plain (9.1)', 3)).toBe('MCSuperMods Plain (9.1)-3');
    expect(candidateSuffix('MCSuperMods Plain (9.1)', 'mcsupermods plain (9.1)-12')).toBe(12);
    expect(candidateSuffix('MCSuperMods Plain (9.1)', 'MCSuperMods Plain (9.1)')).toBe(1);
    expect(candidateSuffix('MCSuperMods Plain (9.1)', 'MCSuperMods Plain (9.1)-1')).toBeNull();
    expect(candidateSuffix('MCSuperMods Plain (9.1)', 'MCSuperMods Plain (9.1)-x')).toBeNull();
    expect(candidateSuffix('MCSuperMods Plain (9.1)', 'Other')).toBeNull();
  });

  it('gives both targets their own instances', () => {
    const a = recipeFor({ kind: 'test' }, modded, RELEASE).place;
    const b = recipeFor({ kind: 'test' }, modded, SNAPSHOT).place;
    expect(a).not.toEqual(b);
  });
});
