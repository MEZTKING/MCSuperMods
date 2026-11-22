/**
 * The 26.3 Java generator for boats, the mob parts of batch 2 and project beds as villager homes
 * (ADR 0107 D4, ADR 0109, ADR 0110, ADR 0112 D3; B537b):
 *
 * - every runtime GameTest boat item (`bt_*`), batch 2 mob (`mob2_*`) and storage mob (`storage_*`)
 *   generates, alone and together; a mob's trader and shoulder riding still fail generation by name (the
 *   exporter leaves them out with `export.not-in-eject`);
 * - boats register through `boat/ModBoats.itemFor` with their chest boats, the dispenser behaviour
 *   after every item and vanilla's renderers on the client; buckets, hover, phase, the dash and the
 *   habits write what the runtime does;
 * - the shared classes copied from the runtime keep its code: after the renames below, at least
 *   `MIN_SHARED` of each class's code lines are lines of the runtime source.
 *
 * The ejected Gradle build of such a project is the exporters' `vanilla-parity-3-batch-2.test.ts`
 * (`MSM_VANILLA_PARITY_3_BATCH_2_JAVA_OUT`).
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DefinitionInput, JavaProjectInput, JsonObject } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { generateJavaProject } from '../../src/java-project/index';

const here = dirname(fileURLToPath(import.meta.url));
const engine = join(here, '../../../../../engine-mod');
const gametest = join(engine, 'src/gametest/resources/msm/msm_test');
const runtime = join(engine, 'src/main/java/dev/mcsupermods/runtime');

async function definitions(folder: string, prefix: string): Promise<[string, DefinitionInput][]> {
  const names = (await readdir(join(gametest, folder)))
    .filter((n) => n.startsWith(prefix) && n.endsWith('.json'))
    .sort();
  return Promise.all(
    names.map(
      async (name): Promise<[string, DefinitionInput]> => [
        name,
        {
          id: `msm_test:${name.slice(0, -'.json'.length)}`,
          path: `msm/msm_test/${folder}/${name}`,
          definition: JSON.parse(
            await readFile(join(gametest, folder, name), 'utf8'),
          ) as JsonObject,
        },
      ],
    ),
  );
}

function input(lists: Partial<JavaProjectInput> = {}): JavaProjectInput {
  return {
    modId: 'msm_test',
    javaPackage: 'msm_test',
    modClassName: 'MsmTestMod',
    blocks: [],
    items: [],
    entities: [],
    geckolib: true,
    ...lists,
  };
}

/** Batch 2 mobs the eject still leaves out (the exporter drops these components first). */
const REFUSED: Readonly<Record<string, RegExp>> = {
  'mob2_pet_left.json': /msm:shoulder_riding/,
  'storage_crate.json': /msm:trader/,
};

async function all(): Promise<Partial<JavaProjectInput>> {
  return {
    items: (await definitions('item', 'bt_')).map(([, def]) => def),
    entities: [
      ...(await definitions('entity', 'mob2_')),
      ...(await definitions('entity', 'storage_')),
    ]
      .filter(([name]) => REFUSED[name] === undefined)
      .map(([, def]) => def),
    blocks: (await definitions('block', 'furniture_bed')).map(([, def]) => def),
  };
}

const sources = (lists: Partial<JavaProjectInput>): Map<string, string> =>
  new Map(
    generateJavaProject(input(lists)).files.map((file) => [
      file.path.replace('src/main/java/msm_test/', ''),
      file.contents,
    ]),
  );

/** Code lines: no comments, package, imports, annotations or blank lines; trimmed. */
function code(source: string): string[] {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !/^(\*|\/\*\*|\/\/|package |import |@)/.test(line));
}

/** The ejected names of the runtime's classes and members. */
const RENAMES: readonly [RegExp, string][] = [
  [/StorageParser\.Storage/g, 'Storage'],
  [/definition\.components\(\)\.tameable\(\)\.isPresent\(\)/g, 'tameable'],
  [/MsmBoats/g, 'ModBoats'],
  [/\bGoal\.(Roost|PlayDead|CollectItems|DigItems|Barter)\b/g, 'HabitGoal.$1'],
  [/mob\.asMob\(\)/g, 'mob'],
  [/mob\.roostingData\(\)/g, 'roostingData'],
  [/mob\.playingDeadData\(\)/g, 'playingDeadData'],
  [/MobMovement movement/g, 'Charging movement'],
  [/EntityRendererRegistration\./g, 'EntityRenderers.'],
  [/MsmRuntime\.LOGGER/g, 'LOGGER'],
  [/"\[\{\}\] /g, '"'],
  [/MsmRuntime\.MOD_ID, /g, ''],
];

function renamed(source: string): Set<string> {
  let out = source;
  for (const [from, to] of RENAMES) out = out.replace(from, to);
  return new Set(code(out));
}

/** The share of `ejected`'s code lines found in `runtimeSources`. */
function shared(ejected: string, runtimeSources: readonly string[]): number {
  const known = new Set(runtimeSources.flatMap((source) => [...renamed(source)]));
  const lines = code(ejected);
  return lines.filter((line) => known.has(line)).length / lines.length;
}

const MIN_SHARED = 0.75;

describe('the 26.3 generator, boats, mobs 2 and bed homes (B537b)', () => {
  it('generates every runtime GameTest boat and batch 2 mob, alone and together', async () => {
    for (const [name, def] of await definitions('item', 'bt_')) {
      expect(() => generateJavaProject(input({ items: [def] })), name).not.toThrow();
    }
    for (const [name, def] of [
      ...(await definitions('entity', 'mob2_')),
      ...(await definitions('entity', 'storage_')),
    ]) {
      const run = () => generateJavaProject(input({ entities: [def] }));
      const refused = REFUSED[name];
      if (refused === undefined) expect(run, name).not.toThrow();
      else expect(run, name).toThrow(refused);
    }
    const files = sources(await all());
    for (const path of [
      'boat/ModBoats.java',
      'client/boat/BoatRenderers.java',
      'entity/MobHabits.java',
      'entity/HabitGoal.java',
      'entity/SwoopGoal.java',
      'entity/RoostGoal.java',
      'entity/CollectItemsGoal.java',
      'entity/DigForItemsGoal.java',
      'entity/PlayDeadGoal.java',
      'entity/BarterGoal.java',
      'entity/PhaseChargeGoal.java',
      'entity/HoverMoveControl.java',
      'entity/DryBucketItem.java',
      'entity/MobStorage.java',
    ]) {
      expect(files.has(path), path).toBe(true);
    }
    const mod = files.get('MsmTestMod.java') ?? '';
    expect(mod.indexOf('ModItems.register();')).toBeLessThan(mod.indexOf('ModBoats.register();'));
    expect(files.get('client/MsmTestModClient.java')).toContain('BoatRenderers.init();');
  });

  it('writes boats, buckets, hover, phase, the dash, the habits and bed homes as the runtime does', async () => {
    const files = sources(await all());
    const items = files.get('ModItems.java') ?? '';
    expect(items).toContain(
      'ModBoats.itemFor(Identifier.fromNamespaceAndPath("msm_test", "bt_reed_raft"), true, Identifier.fromNamespaceAndPath("msm_test", "bt_reed_chest_raft"), Identifier.fromNamespaceAndPath("msm_test", "bt_reed"), null, boat -> new BoatItem(boat,',
    );
    const entities = files.get('ModEntities.java') ?? '';
    expect(entities).toContain(
      'new MobBucketItem(MOB2_FISH, Fluids.WATER, SoundEvents.BUCKET_EMPTY_FISH',
    );
    expect(entities).toContain('new DryBucketItem(MOB2_DRY_FISH,');
    const fish = files.get('entity/Mob2FishEntity.java') ?? '';
    expect(fish).toContain('implements GeoEntity, Bucketable');
    expect(fish).toContain('tag.getString("Variant").ifPresent(this::setVariantById);');
    expect(fish).toContain('return super.requiresCustomPersistence() || fromBucket;');
    expect(files.get('entity/Mob2HoverEntity.java')).toContain(
      'moveControl = new HoverMoveControl(this, 4.0f);',
    );
    const phase = files.get('entity/Mob2PhaseEntity.java') ?? '';
    expect(phase).toContain('new PhaseChargeGoal(this, this, ');
    expect(phase).toContain('noPhysics = true;');
    const camel = files.get('entity/Mob2CamelEntity.java') ?? '';
    expect(camel).toContain('dashCooldown = 40;');
    expect(camel).toContain('return dashCooldown == 0;');
    expect(files.get('entity/Mob2DeadEntity.java')).toContain(
      'return habits().canBeSeenAsEnemy(super.canBeSeenAsEnemy());',
    );
    expect(files.get('entity/Mob2CollectorEntity.java')).toContain(
      'habits().updateDynamicGameEventListener(consumer);',
    );
    expect(files.get('entity/Mob2BartererEntity.java')).toContain('habitsInteract(player, hand)');
    expect(files.get('block/type/ModBedBlock.java')).toContain('addHome(this);');
    const mule = files.get('entity/StorageMuleEntity.java') ?? '';
    expect(mule).toContain('HasCustomInventoryScreen');
    expect(mule).toContain('new MobStorage(this, true, STORAGE)');
    expect(mule).toContain('mobStorage.die();');
  });

  it('keeps the code of the shared classes the runtime has', async () => {
    const files = sources(await all());
    const read = (path: string) => readFile(join(runtime, path), 'utf8');
    const seam = join(engine, 'src/mc/26.3/java/dev/mcsupermods/runtime/registry/PoiTypes.java');
    const pairs: [string, string[]][] = [
      ['boat/ModBoats.java', [await read('registry/boat/MsmBoats.java')]],
      ['client/boat/BoatRenderers.java', [await read('client/boat/BoatRenderers.java')]],
      [
        'entity/MobHabits.java',
        [await read('registry/mob/MobHabits.java'), await read('registry/mob/MobGoals.java')],
      ],
      ['entity/SwoopGoal.java', [await read('goals/SwoopGoal.java')]],
      ['entity/RoostGoal.java', [await read('goals/RoostGoal.java')]],
      ['entity/CollectItemsGoal.java', [await read('goals/CollectItemsGoal.java')]],
      ['entity/DigForItemsGoal.java', [await read('goals/DigForItemsGoal.java')]],
      ['entity/PlayDeadGoal.java', [await read('goals/PlayDeadGoal.java')]],
      ['entity/BarterGoal.java', [await read('goals/BarterGoal.java')]],
      ['entity/PhaseChargeGoal.java', [await read('goals/PhaseChargeGoal.java')]],
      ['entity/HoverMoveControl.java', [await read('registry/mob/MobMovement.java')]],
      ['entity/DryBucketItem.java', [await read('registry/mob/MobBuckets.java')]],
      ['entity/MobStorage.java', [await read('registry/mob/MobStorage.java')]],
      [
        'block/type/ModBedBlock.java',
        [await read('registry/types/MsmBedBlock.java'), await readFile(seam, 'utf8')],
      ],
    ];
    for (const [path, runtimeSources] of pairs) {
      const share = shared(files.get(path) ?? '', runtimeSources);
      expect(
        share,
        `${path}: ${share.toFixed(2)} of its code lines are the runtime's`,
      ).toBeGreaterThanOrEqual(MIN_SHARED);
    }
  });
});
