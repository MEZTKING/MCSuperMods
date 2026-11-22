/**
 * The 26.3 Java generator for boats, the mob parts of batch 2, traders, shoulder pets and project
 * beds as villager homes (ADR 0098 D1, D4; ADR 0107; ADR 0109, ADR 0110, ADR 0112 D3; B537b,
 * eject 2c):
 *
 * - every runtime GameTest boat item (`bt_*`), batch 2 mob (`mob2_*`), storage mob (`storage_*`),
 *   trader (`trader_*`) and shoulder pet (`shoulder_*`) generates, alone and together;
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

/** The runtime GameTest mobs of batch 2 the eject generates (every one, since eject 2c). */
async function mobs(): Promise<[string, DefinitionInput][]> {
  return [
    ...(await definitions('entity', 'mob2_')),
    ...(await definitions('entity', 'storage_')),
    ...(await definitions('entity', 'trader_')),
    ...(await definitions('entity', 'shoulder_')),
  ];
}

async function all(): Promise<Partial<JavaProjectInput>> {
  return {
    items: (await definitions('item', 'bt_')).map(([, def]) => def),
    entities: (await mobs()).map(([, def]) => def),
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
  // Traders and shoulder pets (eject 2c).
  [/TraderParser\.Trader\b/g, 'Trader'],
  [/TraderParser\./g, 'Trader.'],
  [/mob\.openTradingScreen\(/g, '((Merchant) body).openTradingScreen('],
  [/instanceof MsmMob mob/g, 'instanceof MobTrader.Trading mob'],
  [/mob\.driver\(\)\.trader\(\)/g, 'mob.mobTrader()'],
  [/MsmAnimal\.DATA_PERCHED/g, 'perchedData'],
  [/MsmAnimal\.DATA_PERCH_LEFT/g, 'perchLeftData'],
  [/\bMsmMob\b/g, 'Pet'],
  [/\bMsmAnimal\b/g, 'TamableAnimal'],
  [/\.driver\(\)\.shoulder\(\)/g, '.shoulder()'],
  [/pet\.asMob\(\)/g, '(Entity) pet'],
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
    const names = (await mobs()).map(([name]) => name);
    expect(names).toEqual(
      expect.arrayContaining([
        'mob2_pet_left.json',
        'storage_crate.json',
        'trader_basic.json',
        'trader_worker.json',
        'shoulder_pet.json',
      ]),
    );
    for (const [name, def] of await mobs()) {
      expect(() => generateJavaProject(input({ entities: [def] })), name).not.toThrow();
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
      'entity/Trader.java',
      'entity/MobTrader.java',
      'entity/TraderReputation.java',
      'entity/RestockAtWorkSiteGoal.java',
      'entity/MobShoulder.java',
      'entity/PerchOnOwnerGoal.java',
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

  it('writes traders and shoulder pets as the runtime does (eject 2c)', async () => {
    const files = sources(await all());
    const basic = files.get('entity/TraderBasicEntity.java') ?? '';
    expect(basic).toContain('implements GeoEntity, Merchant, MobTrader.Trading');
    expect(basic).toContain('new MobTrader(this, false, 1, TRADER, this::tradeEvent)');
    expect(basic).toContain(
      'Optional.of(Identifier.fromNamespaceAndPath("minecraft", "entity.wandering_trader.yes"))',
    );
    expect(basic).toContain(
      'event_tr_traded(level, blockPosition(), position(), player, this, 1);',
    );
    expect(basic).toContain('mobTrader.customServerAiStep(level);');
    expect(basic).toContain('mobTrader.addAdditionalSaveData(output);');
    expect(files.get('entity/TraderBruteEntity.java')).toContain(
      'new MobTrader(this, true, 1, TRADER, null)',
    );
    expect(files.get('entity/TraderScaledEntity.java')).toContain(
      'new Trader.TradeLevel(Identifier.fromNamespaceAndPath("msm_test", "tr_stall/level_1"), Optional.of(20))',
    );
    expect(files.get('entity/TraderFlatEntity.java')).toContain(
      'false, Trader.Restock.NEVER, Optional.empty(),',
    );
    expect(files.get('entity/TraderSteppedEntity.java')).toContain(
      'Optional.of(new Trader.Reputation(10, 5, Optional.of("#minecraft:small_flowers"), 10, 4, Optional.of(5)))',
    );
    expect(files.get('entity/TraderWorkerEntity.java')).toContain(
      'true, Optional.of("#msm_test:tr_sites"));',
    );
    // Storage goes first, trading after it (MobDriver.mobInteract).
    const crate = files.get('entity/StorageCrateEntity.java') ?? '';
    expect(crate.indexOf('storageInteract(player, hand);')).toBeLessThan(
      crate.indexOf('result = traderInteract(player, hand);'),
    );
    const left = files.get('entity/Mob2PetLeftEntity.java') ?? '';
    expect(left).toContain('implements GeoEntity, MobShoulder.Pet');
    expect(left).toContain(
      'new MobShoulder(this, DATA_PERCHED, DATA_PERCH_LEFT, true, MobShoulder.Sides.LEFT)',
    );
    expect(left).toContain('shoulder().addGoals(goalSelector, 1, 1.0f);');
    expect(left).toContain('builder.define(DATA_PERCH_LEFT, false);');
    expect(left).toContain('shoulder().onSyncedDataUpdated(accessor);');
    expect(left).toContain('return shoulder().isPushable(super.isPushable());');
    expect(left).toContain('shoulder().remove(reason);');
    expect(left).toContain('shoulder().die();');
    expect(files.get('entity/ShoulderPetEntity.java')).toContain('MobShoulder.Sides.EITHER');
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
      ['entity/MobTrader.java', [await read('registry/mob/MobTrader.java')]],
      ['entity/TraderReputation.java', [await read('registry/mob/TraderReputation.java')]],
      ['entity/RestockAtWorkSiteGoal.java', [await read('goals/RestockAtWorkSiteGoal.java')]],
      ['entity/MobShoulder.java', [await read('registry/mob/MobShoulder.java')]],
      ['entity/PerchOnOwnerGoal.java', [await read('goals/PerchOnOwnerGoal.java')]],
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
