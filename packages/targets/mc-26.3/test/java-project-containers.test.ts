/**
 * The 26.3 Java generator for containers and machines (ADR 0074 D9, ADR 0075 D11): goldens of
 * the runtime's GameTest container and machine blocks (`block-container_*` and `block-machine_*`,
 * copied from `engine-mod/src/gametest/resources/msm/msm_test/block/` into
 * `test/fixtures/java-project/input/`), the shared classes compared line by line with the
 * runtime's (`engine-mod/src/main/java/dev/mcsupermods/runtime/registry/container/` and
 * `registry/machine/`), the block classes' container and machine members against
 * `MsmContainerBlock`, and the stricter cases that fail generation. `UPDATE_GOLDENS=1` rewrites
 * `test/fixtures/java-project/expected/containers/` and `machines/`.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DefinitionInput, GeneratedFile, JavaProjectInput, JsonObject } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { generateJavaProject } from '../src/java-project/index';

const update = process.env.UPDATE_GOLDENS === '1';
const here = dirname(fileURLToPath(import.meta.url));
const inputRoot = join(here, 'fixtures', 'java-project', 'input');
const expectedRoot = join(here, 'fixtures', 'java-project', 'expected');
const runtimeRoot = join(
  here,
  '../../../../engine-mod/src/main/java/dev/mcsupermods/runtime/registry',
);

const CONTAINERS = [
  'container_barrel',
  'container_chest',
  'container_crate',
  'container_dispenser',
  'container_holder',
  'container_hopper',
  'container_sealed',
];
const MACHINES = [
  'machine_blaster',
  'machine_fast',
  'machine_grinder',
  'machine_mixer',
  'machine_press',
  'machine_sealed',
  'machine_smelter',
];

async function block(path: string): Promise<DefinitionInput> {
  const json = JSON.parse(
    await readFile(join(inputRoot, `block-${path}.json`), 'utf8'),
  ) as JsonObject;
  return { id: `msm_test:${path}`, path: `msm/msm_test/block/${path}.json`, definition: json };
}

function inline(path: string, definition: JsonObject): DefinitionInput {
  return { id: `msm_test:${path}`, path: `msm/msm_test/block/${path}.json`, definition };
}

function input(blocks: DefinitionInput[]): JavaProjectInput {
  return {
    modId: 'msm_test',
    javaPackage: 'msm_test',
    modClassName: 'MsmTestMod',
    blocks,
    items: [],
    entities: [],
    geckolib: false,
  };
}

async function listFiles(root: string, prefix = ''): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(join(root, prefix), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await listFiles(root, path)));
    else out.push(path);
  }
  return out.sort();
}

/** Compares generated files with `expected/<name>/`, or rewrites it with `UPDATE_GOLDENS=1`. */
async function golden(name: string, files: GeneratedFile[]): Promise<void> {
  const root = join(expectedRoot, name);
  if (update) {
    await rm(root, { recursive: true, force: true });
    for (const file of files) {
      const out = join(root, ...file.path.split('/'));
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, file.contents);
    }
  }
  expect(await listFiles(root)).toEqual(files.map((file) => file.path));
  for (const file of files) {
    expect(file.contents, file.path).toBe(
      await readFile(join(root, ...file.path.split('/')), 'utf8'),
    );
  }
}

const text = (files: GeneratedFile[], suffix: string): string => {
  const file = files.find((f) => f.path.endsWith(suffix));
  if (file === undefined) throw new Error(`no generated file ends with ${suffix}`);
  return file.contents;
};

/** Runtime names to eject names, applied to the runtime's source in this order. */
const RENAMES: readonly (readonly [string, string])[] = [
  ['BlockComponents.ContainerLayout', 'ContainerSpec.Layout'],
  ['BlockComponents.Container', 'ContainerSpec'],
  ['BlockComponents.MachineComparator', 'MachineSpec.Comparator'],
  ['BlockComponents.MachineMenu', 'MachineSpec.Menu'],
  ['BlockComponents.Machine.COOKING_TYPES', 'MachineSpec.COOKING_TYPES'],
  ['BlockComponents.Machine', 'MachineSpec'],
  ['MachinePower.', 'MachineSpec.Power.'],
  ['MsmStorageBlockEntity', 'StorageBlockEntity'],
  ['MsmContainerBlockItem', 'ContainerBlockItem'],
  ['MsmMachineBlockEntity', 'MachineBlockEntity'],
  ['MsmMachineRecipe', 'MachineRecipe'],
  ['MsmMachineResultSlot', 'MachineResultSlot'],
  ['MsmFurnaceMenu', 'MachineFurnaceMenu'],
  ['MsmBlock.OPEN', 'BlockStateProperties.OPEN'],
  ['MsmBlock.LIT', 'BlockStateProperties.LIT'],
  ['spec.menu(machineId)', 'spec.menu()'],
  ['spec.recipeTypes(machineId)', 'spec.recipeTypes()'],
  ['MsmRuntime.', ''],
  // Events: the block's generated fireEvent instead of the runtime's EventRunner.
  ['instanceof MsmContainerBlock block', 'instanceof BlockEvents block'],
  [
    'EventRunner.fire(block.id(), block.definition().events(), event.get(), EventContext.forBlock(server, getBlockPos(), player));',
    'block.fireEvent(event.get(), server, getBlockPos(), player);',
  ],
  [
    'EventRunner.fire(block.id(), block.definition().events(), event.get(), EventContext.forBlock(level, pos, null));',
    'block.fireEvent(event.get(), level, pos, null);',
  ],
];

/**
 * The deliberate differences of a copy beyond the renames, as replacements of the runtime's text
 * (each must match): the recipe's codec is written out because `MachineRecipeFormat` is not
 * ejected, and `MachineRecipes` logs through its own logger.
 */
const DIFFERENCES: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  MachineRecipe: [
    [
      'implements Recipe<MachineInput>, MachineRecipeFormat.Fields<Ingredient, ItemStackTemplate> {',
      'implements Recipe<MachineInput> {\n    public static final int MAX_TIME = 32767;\n',
    ],
    [
      `        return MachineRecipeFormat.mapCodec(Ingredient.CODEC, ItemStackTemplate.MAP_CODEC.codec(),
                (ingredient, count, result, time, experience) -> new MachineRecipe(kind, ingredient, count, result, time, experience));`,
      `        return RecordCodecBuilder.mapCodec(i -> i.group(
                Ingredient.CODEC.fieldOf("ingredient").forGetter(MachineRecipe::ingredient),
                Codec.intRange(1, 64).optionalFieldOf("count", 1).forGetter(MachineRecipe::count),
                ItemStackTemplate.MAP_CODEC.codec().fieldOf("result").forGetter(MachineRecipe::result),
                Codec.intRange(1, MAX_TIME).optionalFieldOf("time").forGetter(MachineRecipe::time),
                Codec.floatRange(0.0f, Float.MAX_VALUE).optionalFieldOf("experience", 0.0f).forGetter(MachineRecipe::experience))
                .apply(i, (ingredient, count, result, time, experience) -> new MachineRecipe(kind, ingredient, count, result, time, experience)));`,
    ],
    // No Fields interface: the accessors override nothing.
    ['    @Override\n    public Ingredient ingredient()', '    public Ingredient ingredient()'],
    ['    @Override\n    public int count()', '    public int count()'],
    [
      '    @Override\n    public ItemStackTemplate result()',
      '    public ItemStackTemplate result()',
    ],
    ['    @Override\n    public Optional<Integer> time()', '    public Optional<Integer> time()'],
    ['    @Override\n    public float experience()', '    public float experience()'],
  ],
  MachineRecipes: [
    [
      '    private static final Set<String> LOGGED = ConcurrentHashMap.newKeySet();\n',
      '    private static final Set<String> LOGGED = ConcurrentHashMap.newKeySet();\n    private static final String MOD_ID = "msm_test";\n    private static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);\n',
    ],
  ],
};

/** Code lines: no comments, package, imports or blank lines. */
function code(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => line.trim() !== '' && !/^\s*(\*|\/\*\*|\/\/|package |import )/.test(line));
}

/** The runtime's source with the renames and a class's deliberate differences applied. */
async function runtimeAsEjected(runtimePath: string, ejected: string): Promise<string> {
  let source = await readFile(join(runtimeRoot, runtimePath), 'utf8');
  for (const [from, to] of RENAMES) source = source.replaceAll(from, to);
  for (const [from, to] of DIFFERENCES[ejected] ?? []) {
    expect(source, `${ejected}: ${from}`).toContain(from);
    source = source.replace(from, to);
  }
  return source;
}

/** Each copied class: runtime file, eject path. */
const COPIES: readonly (readonly [string, string])[] = [
  ['container/MsmStorageBlockEntity.java', 'block/StorageBlockEntity.java'],
  ['container/ContainerMenus.java', 'block/ContainerMenus.java'],
  ['container/ContainerOpeners.java', 'block/ContainerOpeners.java'],
  ['container/HolderInteraction.java', 'block/HolderInteraction.java'],
  ['container/MsmContainerBlockItem.java', 'block/ContainerBlockItem.java'],
  ['machine/MsmMachineBlockEntity.java', 'block/MachineBlockEntity.java'],
  ['machine/MachineData.java', 'block/MachineData.java'],
  ['machine/MsmFurnaceMenu.java', 'block/MachineFurnaceMenu.java'],
  ['machine/MsmMachineResultSlot.java', 'block/MachineResultSlot.java'],
  ['machine/MsmMachineRecipe.java', 'recipe/MachineRecipe.java'],
  ['machine/MachineInput.java', 'recipe/MachineInput.java'],
  ['machine/MachineRecipes.java', 'recipe/MachineRecipes.java'],
];

describe('Java generator: containers and machines (mc-26.3)', () => {
  it('generates every container layout as the runtime does (ADR 0074 D9)', async () => {
    const { files } = generateJavaProject(input(await Promise.all(CONTAINERS.map(block))));
    const mod = text(files, '/MsmTestMod.java');
    expect(mod).toContain('ModBlocks.register();\n        ModBlockEntities.register();');
    expect(mod).not.toContain('ModRecipes');
    expect(files.some((f) => f.path.includes('/recipe/'))).toBe(false);
    expect(files.some((f) => f.path.endsWith('/MachineBlockEntity.java'))).toBe(false);
    const types = text(files, '/ModBlockEntities.java');
    expect(types).toContain(
      'Identifier.fromNamespaceAndPath("msm_test", "container_crate"), new BlockEntityType<>(ContainerCrateBlockEntity::new, Set.of(ModBlocks.CONTAINER_CRATE)));',
    );
    // Keep-contents: the shulker box item rule, creative drop, no loot drop of the contents.
    const blocks = text(files, '/ModBlocks.java');
    expect(blocks).toContain('new ContainerBlockItem(CONTAINER_CRATE, new Item.Properties()');
    expect(blocks).toContain('new BlockItem(CONTAINER_BARREL, new Item.Properties()');
    const crate = text(files, '/block/ContainerCrateBlock.java');
    expect(crate).toContain(
      'public class ContainerCrateBlock extends RotatedPillarBlock implements EntityBlock {',
    );
    expect(crate).toContain('registerDefaultState(defaultBlockState().setValue(OPEN, false));');
    expect(crate).toContain('drop.applyComponents(storage.collectComponents());');
    expect(text(files, '/block/ContainerCrateBlockEntity.java')).toContain(
      'new ContainerSpec(ContainerSpec.Layout.CHEST, 3, 1,\n            true, true, true,',
    );
    // Layouts and settings.
    expect(text(files, '/block/ContainerChestBlockEntity.java')).toContain(
      'new ContainerSpec(ContainerSpec.Layout.CHEST, 2, 1,',
    );
    expect(text(files, '/block/ContainerHopperBlockEntity.java')).toContain(
      'ContainerSpec.Layout.HOPPER',
    );
    expect(text(files, '/block/ContainerDispenserBlockEntity.java')).toContain(
      'Optional.of(Identifier.fromNamespaceAndPath("minecraft", "block.chest.open")), Optional.of(Identifier.fromNamespaceAndPath("minecraft", "block.chest.close"))',
    );
    expect(text(files, '/block/ContainerHolderBlockEntity.java')).toContain(
      'new ContainerSpec(ContainerSpec.Layout.NONE, 3, 2,',
    );
    expect(text(files, '/block/ContainerSealedBlockEntity.java')).toContain(
      '        false, false, false, // keep_contents, hoppers, comparator',
    );
    expect(text(files, '/block/ContainerSealedBlock.java')).not.toContain('getAnalogOutputSignal');
    // Facing types keep their facing and gain open.
    expect(text(files, '/block/ContainerBarrelBlock.java')).toContain(
      'registerDefaultState(stateDefinition.any().setValue(FACING, Direction.NORTH).setValue(OPEN, false));',
    );
    expect(text(files, '/block/ContainerBarrelBlock.java')).toContain('builder.add(FACING, OPEN);');
    // Events through BlockEvents; the holder fires msm:on_interact after its own use.
    const chest = text(files, '/block/ContainerChestBlock.java');
    expect(chest).toContain('implements EntityBlock, BlockEvents {');
    expect(chest).toContain(
      'case "msm_test:container_closed" -> event_container_closed(level, pos.immutable(), Vec3.atCenterOf(pos), player, null, 1);',
    );
    const holder = text(files, '/block/ContainerHolderBlock.java');
    expect(holder).toContain('used = !HolderInteraction.takeOut(storage, player).isEmpty();');
    expect(holder).toContain('interact(level, pos, player); // msm:on_interact');
    expect(holder).toContain(
      'event_holder_used(server, pos.immutable(), Vec3.atCenterOf(pos), player, null, 1);',
    );
    await golden('containers', files);
  });

  it('generates every machine power as the runtime does (ADR 0075 D11)', async () => {
    const { files } = generateJavaProject(input(await Promise.all(MACHINES.map(block))));
    const mod = text(files, '/MsmTestMod.java');
    expect(mod).toContain(
      'ModBlocks.register();\n        ModBlockEntities.register();\n        ModRecipes.register();',
    );
    expect(files.some((f) => f.path.endsWith('/StorageBlockEntity.java'))).toBe(false);
    // One recipe type and serialiser per machine, with the machine's id, as MachineRecipes.register.
    const recipes = text(files, '/ModRecipes.java');
    for (const path of MACHINES) {
      expect(recipes).toContain(
        `MachineRecipes.register(Identifier.fromNamespaceAndPath("msm_test", "${path}"));`,
      );
    }
    const spec = (name: string): string => text(files, `/block/${name}BlockEntity.java`);
    expect(spec('MachineGrinder')).toContain(
      'new MachineSpec(List.of(ID), // recipe_types, in order',
    );
    expect(spec('MachineGrinder')).toContain(
      'MachineSpec.Power.FUEL, 1.0f, 40, MachineSpec.Menu.FURNACE,',
    );
    // The menu follows the first vanilla cooking type unless written.
    expect(spec('MachineBlaster')).toContain('MachineSpec.Menu.BLAST_FURNACE');
    expect(spec('MachinePress')).toContain(
      'MachineSpec.Power.REDSTONE, 1.0f, 20, MachineSpec.Menu.SMOKER,',
    );
    expect(spec('MachineFast')).toContain(
      'List.of(Identifier.fromNamespaceAndPath("msm_test", "machine_grinder"))',
    );
    expect(spec('MachineFast')).toContain('MachineSpec.Power.ALWAYS, 2.0f, 40,');
    expect(spec('MachineMixer')).toContain(
      'List.of(ID, Identifier.fromNamespaceAndPath("msm_test", "machine_grinder"))',
    );
    expect(spec('MachineMixer')).toContain('true, MachineSpec.Comparator.PROGRESS, 15,');
    expect(spec('MachineSealed')).toContain('false, MachineSpec.Comparator.NONE, 13,');
    expect(spec('MachineSmelter')).toContain(
      'List.of(Identifier.fromNamespaceAndPath("minecraft", "smelting"))',
    );
    // Light: lit_light while lit, the light emitter level otherwise.
    expect(text(files, '/ModBlocks.java')).toContain(
      '.lightLevel(state -> state.getValue(MachineMixerBlock.LIT) ? 15 : 3))); // msm:machine lit_light while lit',
    );
    const grinder = text(files, '/block/MachineGrinderBlock.java');
    expect(grinder).toContain(
      'registerDefaultState(stateDefinition.any().setValue(FACING, Direction.NORTH).setValue(LIT, false));',
    );
    expect(grinder).toContain(
      'if (type != ModBlockEntities.MACHINE_GRINDER || !(level instanceof ServerLevel)) {',
    );
    expect(grinder).toContain('machine.serverTick(server, pos, tickState);');
    expect(text(files, '/block/MachineSealedBlock.java')).not.toContain('getAnalogOutputSignal');
    expect(text(files, '/block/MachinePressBlock.java')).toContain(
      'registerDefaultState(defaultBlockState().setValue(LIT, false));',
    );
    const mixer = text(files, '/block/MachineMixerBlock.java');
    expect(mixer).toContain('implements EntityBlock, BlockEvents {');
    expect(mixer).toContain(
      'case "msm_test:machine_started" -> event_machine_started(level, pos.immutable(), Vec3.atCenterOf(pos), player, null, 1);',
    );
    await golden('machines', files);
  });

  it.each(COPIES)('copies %s line by line', async (runtimePath, ejectPath) => {
    const { files } = generateJavaProject(
      input([
        await block('container_holder'),
        await block('machine_mixer'),
        await block('machine_grinder'),
      ]),
    );
    const ejected = text(files, `/${ejectPath}`);
    const name = ejectPath.slice(ejectPath.indexOf('/') + 1, -'.java'.length);
    expect(ejected.startsWith('// Generated by MCSuperMods: copied from msm_runtime')).toBe(true);
    expect(code(ejected)).toEqual(code(await runtimeAsEjected(runtimePath, name)));
  });

  it("gives block classes MsmContainerBlock's container and machine lines", async () => {
    const runtime = (await readFile(join(runtimeRoot, 'container/MsmContainerBlock.java'), 'utf8'))
      .split('\n')
      .map((line) => line.trim());
    const { files } = generateJavaProject(
      input([
        await block('container_holder'),
        await block('container_crate'),
        await block('machine_mixer'),
        await block('machine_grinder'),
      ]),
    );
    const generated = (name: string): string[] =>
      text(files, `/block/${name}.java`)
        .split('\n')
        .map((line) => line.trim());
    const shared = [
      'used = true; // the client cannot see the contents: it predicts a use and the server decides',
      'if (level instanceof ServerLevel && player.getMainHandItem().isEmpty()) {',
      'used = !HolderInteraction.takeOut(storage, player).isEmpty();',
      'storage.fire(storage.spec().onOpen(), player);',
      'used = false; // an item that did not fit: only msm:on_interact below',
      'return used || interact.consumesAction() ? InteractionResult.SUCCESS : InteractionResult.PASS;',
      'if (HolderInteraction.putIn(storage, stack, player) == 0) {',
      'return InteractionResult.TRY_WITH_EMPTY_HAND; // nothing fitted: msm:on_interact only',
      'super.tick(state, level, pos, random);',
      'storage.recheckOpen();',
      'return AbstractContainerMenu.getRedstoneSignalFromBlockEntity(level.getBlockEntity(pos));',
      'Containers.updateNeighboursAfterDestroy(state, level, pos);',
    ];
    const crateLines = [
      'drop.applyComponents(storage.collectComponents());',
      'ItemEntity entity = new ItemEntity(level, pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, drop);',
      'entity.setDefaultPickUpDelay();',
      'level.addFreshEntity(entity);',
    ];
    const machineLines = [
      'return (tickLevel, pos, tickState, be) -> {',
      'player.openMenu(machine); // a locked machine sends its own message and opens nothing',
      'Containers.updateNeighboursAfterDestroy(state, level, pos);',
    ];
    const rename = (line: string): string =>
      line
        .replaceAll('StorageBlockEntity', 'MsmStorageBlockEntity')
        .replace('player.openMenu(machine);', 'player.openMenu(machineEntity);');
    // A line matches when a line of the class ends with it (the generator may declare and set at once).
    const has = (lines: string[], line: string): boolean => lines.some((l) => l.endsWith(line));
    for (const line of [...shared, ...crateLines, ...machineLines]) {
      expect(has(runtime, rename(line)), line).toBe(true);
    }
    for (const line of shared)
      expect(has(generated('ContainerHolderBlock'), line), line).toBe(true);
    for (const line of crateLines)
      expect(has(generated('ContainerCrateBlock'), line), line).toBe(true);
    for (const line of machineLines)
      expect(has(generated('MachineMixerBlock'), line), line).toBe(true);
  });

  it('keeps block and block entity class names unique and clear of the shared classes', () => {
    const { files } = generateJavaProject(
      input([
        inline('storage', { format: 1, components: { 'msm:container': {} } }),
        inline('machine_data', { format: 1, components: { 'msm:machine': {} } }),
      ]),
    );
    const paths = files.map((f) => f.path.replace('src/main/java/msm_test/', ''));
    // StorageBlockEntity is the shared class: the block takes the next free pair of names.
    expect(paths).toContain('block/StorageBlock2.java');
    expect(paths).toContain('block/StorageBlock2Entity.java');
    expect(paths).toContain('block/StorageBlockEntity.java');
    expect(paths).toContain('block/MachineDataBlock.java');
    expect(paths).toContain('block/MachineDataBlockEntity.java');
    expect(paths).toContain('block/MachineData.java');
  });

  describe('fails where the runtime refuses or skips', () => {
    const generate =
      (...blocks: DefinitionInput[]) =>
      () =>
        generateJavaProject(input(blocks));
    const container = (component: JsonObject, extra: JsonObject = {}): DefinitionInput =>
      inline('bad', { format: 1, components: { 'msm:container': component }, ...extra });
    const machine = (component: JsonObject, extra: JsonObject = {}): DefinitionInput =>
      inline('bad', { format: 1, components: { 'msm:machine': component }, ...extra });

    it('rejects containers and machines on family types and together', async () => {
      expect(generate(container({}, { type: 'slab' }))).toThrow(
        /msm:container is not allowed on type 'slab' \(only block, pillar, horizontal, directional\)/,
      );
      expect(generate(machine({}, { type: 'door', set_type: 'wood' }))).toThrow(
        /msm:machine is not allowed on type 'door'/,
      );
      expect(
        generate(
          inline('both', { format: 1, components: { 'msm:container': {}, 'msm:machine': {} } }),
        ),
      ).toThrow(/msm:machine and msm:container are not allowed together/);
    });

    it('rejects layout fields and keep_contents outside their layouts', async () => {
      expect(generate(await block('container_crate'))).not.toThrow();
      const badKeep = JSON.parse(
        await readFile(
          join(
            here,
            '../../../../engine-mod/src/gametest/resources/msm/msm_test/block/container_bad_keep.json',
          ),
          'utf8',
        ),
      ) as JsonObject;
      expect(generate(inline('bad_keep', badKeep))).toThrow(
        /keep_contents needs layout 'chest' with 3 rows/,
      );
      expect(generate(container({ layout: 'hopper', keep_contents: true }))).toThrow(
        /keep_contents needs layout 'chest' with 3 rows/,
      );
      expect(generate(container({ layout: 'hopper', rows: 3 }))).toThrow(
        /rows is only for layout 'chest', not 'hopper'/,
      );
      expect(generate(container({ size: 2 }))).toThrow(
        /size is only for layout 'none', not 'chest'/,
      );
      expect(generate(container({ rows: 7 }))).toThrow(/rows must be 1 to 6/);
      expect(generate(container({ layout: 'none', size: 10 }))).toThrow(/size must be 1 to 9/);
      expect(generate(container({ layout: 'barrel' }))).toThrow(
        /layout 'barrel' is not one of chest, hopper, dispenser, none/,
      );
      expect(generate(container({ slots: 3 }))).toThrow(/unknown msm:container field 'slots'/);
      expect(generate(container({ on_open: 'msm_test:nope' }))).toThrow(
        /names event msm_test:nope, which is not declared in events/,
      );
    });

    it('rejects unknown recipe types and settings out of range', () => {
      expect(generate(machine({ recipe_types: ['minecraft:crafting'] }))).toThrow(
        /recipe_types: minecraft:crafting is neither a machine of the project nor one of minecraft:smelting/,
      );
      expect(generate(machine({ recipe_types: ['msm_test:other_machine'] }))).toThrow(
        /recipe_types: msm_test:other_machine is neither/,
      );
      expect(generate(machine({ recipe_types: ['smelting'] }))).not.toThrow();
      expect(generate(machine({ recipe_types: [] }))).toThrow(/recipe_types must list 1 to 5 ids/);
      expect(generate(machine({ speed: 20 }))).toThrow(/speed must be 0\.1 to 10/);
      expect(generate(machine({ default_time: 40000 }))).toThrow(/default_time must be 1 to 32767/);
      expect(generate(machine({ lit_light: 16 }))).toThrow(/lit_light must be 0 to 15/);
      expect(generate(machine({ power: 'steam' }))).toThrow(
        /power 'steam' is not one of fuel, redstone, always/,
      );
      expect(generate(machine({ recipes: [] }))).toThrow(/unknown msm:machine field 'recipes'/);
      expect(generate(machine({ on_finish: 'msm_test:nope' }))).toThrow(
        /names event msm_test:nope/,
      );
    });
  });

  it('writes nothing new for blocks without containers or machines', () => {
    const { files } = generateJavaProject(
      input([inline('plain', { format: 1, type: 'horizontal' })]),
    );
    expect(
      files.map((f) => f.path).filter((p) => /Entit|Recipe|Container|Machine|BlockEvents/.test(p)),
    ).toEqual([]);
  });
});
