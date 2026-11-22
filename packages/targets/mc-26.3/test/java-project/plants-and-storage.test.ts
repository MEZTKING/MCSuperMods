/**
 * The 26.3 Java generator for vanilla parity 3, batch 1 (ADRs 0103 to 0105, ADR 0112 D3; B517):
 *
 * - every runtime GameTest definition of the plant types, project pots, the six new weathering
 *   types, storage 2, own sounds, own set types and the tool pairs (`plant3_*`, `pot_*`,
 *   `weathering2_*`, `storage2_*`, `sound_*`, `set_*`, `tools_*`, `vp_*` in
 *   `engine-mod/src/gametest/resources/msm/msm_test/block/`) generates;
 * - the shared classes copied from the runtime are compared line by line with it: the plant classes
 *   (the runtime's source without its behaviour driver, `stripDriver` below, then the renames and
 *   `PLANT_DIFFERENCES`), `Lightning`, the double chest's `HopperFaces`, and the parts of
 *   `BlockWaxing` that are the runtime's `Weathering` (`replace`, `randomTick`, `afterChange`);
 * - the cases the runtime refuses fail generation with a message naming them.
 *
 * The ejected Gradle build of a project with all of it is the exporters' `vanilla-parity-3.test.ts`
 * (`MSM_VANILLA_PARITY_3_JAVA_OUT`).
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DefinitionInput, GeneratedFile, JavaProjectInput, JsonObject } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { generateJavaProject } from '../../src/java-project/index';
import { PLANT_CLASSES } from '../../src/java-project/templates/growing-plants-java';

const here = dirname(fileURLToPath(import.meta.url));
const engine = join(here, '../../../../../engine-mod');
const gametestBlocks = join(engine, 'src/gametest/resources/msm/msm_test/block');
const runtimeRoot = join(engine, 'src/main/java/dev/mcsupermods/runtime/registry');

function definition(path: string, json: JsonObject): DefinitionInput {
  return { id: `msm_test:${path}`, path: `msm/msm_test/block/${path}.json`, definition: json };
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
    soundEvents: ['msm_test:chime'],
  };
}

const PREFIXES = /^(plant3|pot|weathering2|storage2|sound|set|tools|vp)_.*\.json$/;

async function gametestDefinitions(): Promise<DefinitionInput[]> {
  const names = (await readdir(gametestBlocks)).filter((name) => PREFIXES.test(name)).sort();
  // A potted plant names type_sapling; the grinder is the machine's recipe type.
  names.push('type_sapling.json', 'machine_grinder.json');
  return Promise.all(
    names.map(async (name) =>
      definition(
        name.slice(0, -'.json'.length),
        JSON.parse(await readFile(join(gametestBlocks, name), 'utf8')) as JsonObject,
      ),
    ),
  );
}

const sources = (files: readonly GeneratedFile[]): Map<string, string> =>
  new Map(files.map((file) => [file.path.replace('src/main/java/msm_test/', ''), file.contents]));

const text = (files: Map<string, string>, path: string): string => {
  const found = files.get(path);
  if (found === undefined) throw new Error(`${path} was not generated`);
  return found;
};

/** Code lines: no comments, package, imports or blank lines. */
function code(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => line.trim() !== '' && !/^\s*(\*|\/\*\*|\/\/|package |import )/.test(line));
}

/**
 * The runtime's block class without its behaviour driver, as the eject has it: the driver field,
 * its construction and every call into it go; an override left calling only `super` (or only
 * vanilla's use) goes too, because a project block with events gets a generated subclass that fires
 * them after these classes' own behaviour.
 */
function stripDriver(source: string): string {
  let src = source.replace(/^import dev\.mcsupermods\.[^\n]*\n/gm, '');
  src = src.replaceAll(' implements DrivenBlock', '').replaceAll(', DrivenBlock', '');
  for (const pattern of [
    /^\s*(private )?final BlockBehaviourDriver driver;\n/gm,
    /^\s*this\.driver = new BlockBehaviourDriver\(id, definition\);\n/gm,
    /^\s*InteractionResult own = driver\.useWithoutItem\(level, pos, player\);\n/gm,
    /^\s*(rules\.)?driver\.(stepOn|playerWillDestroy|setPlacedBy|entityInside|animateTick|useWithoutItem)\([^\n]*\);\n/gm,
    /^\s*if \(level\.getBlockState\(pos\)\.is\(this\)\) \{\n\s*(rules\.)?driver\.randomTick\(level, pos, random\);\n\s*\}\n/gm,
  ]) {
    src = src.replace(pattern, '');
  }
  src = src
    .replaceAll(' || rules.driver.definition().components().onRandomTick().isPresent()', '')
    .replaceAll(' || driver.definition().components().onRandomTick().isPresent()', '')
    .replaceAll('return picked.consumesAction() ? picked : own;', 'return picked;')
    .replaceAll('return vanilla.consumesAction() ? vanilla : own;', 'return vanilla;');
  const lines = src.split('\n');
  const out: string[] = [];
  const end = (start: number): number => {
    let depth = 0;
    let seen = false;
    for (let j = start; j < lines.length; j++) {
      const line = lines[j] as string;
      depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      if (line.includes('{')) seen = true;
      if (seen && depth === 0) return j;
    }
    return lines.length - 1;
  };
  for (let i = 0; i < lines.length; i++) {
    let j = i;
    if (/^\s*\/\*\*/.test(lines[i] as string)) {
      while (!(lines[j] as string).includes('*/')) j++;
      j++;
    }
    if ((lines[j] ?? '').trim() === '@Override') {
      const last = end(j + 1);
      const body = lines
        .slice(j + 1, last + 1)
        .map((l) => l.trim())
        .join(' ');
      const inner = body.slice(body.indexOf('{') + 1, body.lastIndexOf('}')).trim();
      const name = /(\w+)\(/.exec(lines[j + 1] as string)?.[1];
      if (
        /^(return )?super\.\w+\([^;]*\);$/.test(inner) ||
        name === 'driver' ||
        /^InteractionResult vanilla = super\.useWithoutItem\([^;]*\); return vanilla;$/.test(inner)
      ) {
        i = last;
        continue;
      }
    }
    out.push(lines[i] as string);
  }
  return out.join('\n');
}

const PLANT_RENAMES: readonly (readonly [RegExp, string])[] = [
  [
    /\bMsm(GrowingPlantHead|GrowingPlantBody|ColumnPlant|Bamboo|BambooShoot|Multiface|BigDripleaf|DripleafStem|SmallDripleaf|FlowerPot)Block\b/g,
    'Mod$1Block',
  ],
  [/\bGrowingPlantFields\./g, 'PlantSpec.'],
  [/\bGrowingPlantTypes\./g, 'PlantSpec.'],
  [/\bBlockType\.IdOrTag\b/g, 'PlantSpec.IdOrTag'],
];

/** The deliberate differences of the plant copies: constructors take their fields, and companions are attached. */
const PLANT_DIFFERENCES: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  ModGrowingPlantHeadBlock: [
    [
      `    public static Block create(Identifier id, BlockDefinition definition, Properties props) {
        PlantSpec.GrowingPlant fields = (PlantSpec.GrowingPlant) definition.typeFields();
        SETUP.set(fields.berries().isPresent());
        try {
            return fields.needsWater() ? new Water(id, definition, props) : new ModGrowingPlantHeadBlock(id, definition, fields, props);
        } finally {
            SETUP.remove();
        }
    }`,
      `    static Properties setup(PlantSpec.GrowingPlant fields, Properties props) {
        SETUP.set(fields.berries().isPresent());
        return props;
    }`,
    ],
    [
      `    private ModGrowingPlantHeadBlock(Identifier id, BlockDefinition definition, PlantSpec.GrowingPlant fields, Properties props) {
        super(props, direction(fields), headShape(fields), false, fields.growthChance());
        this.rules = new Rules(this, id, definition);`,
      `    public ModGrowingPlantHeadBlock(PlantSpec.GrowingPlant fields, Properties props) {
        super(setup(fields, props), direction(fields), headShape(fields), false, fields.growthChance());
        SETUP.remove();
        this.rules = new Rules(this, fields);`,
    ],
    [
      `        Water(Identifier id, BlockDefinition definition, Properties props) {
            super(props);
            this.rules = new Rules(this, id, definition);
            this.growthChance = ((PlantSpec.GrowingPlant) definition.typeFields()).growthChance();`,
      `        public Water(PlantSpec.GrowingPlant fields, Properties props) {
            super(setup(fields, props));
            SETUP.remove();
            this.rules = new Rules(this, fields);
            this.growthChance = fields.growthChance();`,
    ],
    [
      `    Rules rules() {
        return rules;
    }
`,
      `    Rules rules() {
        return rules;
    }

    public void attachBody(Block body) {
        rules.attach(body);
    }
`,
    ],
    [
      `        Rules rules() {
            return rules;
        }
`,
      `        Rules rules() {
            return rules;
        }

        public void attachBody(Block body) {
            rules.attach(body);
        }
`,
    ],
    [
      `        Rules(Block block, Identifier id, BlockDefinition definition) {
            this.block = block;
            this.fields = (PlantSpec.GrowingPlant) definition.typeFields();`,
      `        Rules(Block block, PlantSpec.GrowingPlant fields) {
            this.block = block;
            this.fields = fields;`,
    ],
    [
      `            if (body == null) {
                Optional<Block> found = Companions.companionOf(block);
                if (found.isEmpty()) {
                    return block;
                }
                body = found.get();
            }
            return body;
        }`,
      `            return body == null ? block : body;
        }

        void attach(Block companion) {
            body = companion;
        }`,
    ],
  ],
  ModGrowingPlantBodyBlock: [
    [
      `    static Block create(Identifier id, BlockDefinition definition, Block head, Properties props) {
        PlantSpec.GrowingPlant fields = (PlantSpec.GrowingPlant) definition.typeFields();
        ModGrowingPlantHeadBlock.SETUP.set(fields.berries().isPresent());
        try {
            return head instanceof ModGrowingPlantHeadBlock.Water water ? new Water(id, definition, water, props)
                    : new ModGrowingPlantBodyBlock(id, definition, (ModGrowingPlantHeadBlock) head, fields, props);
        } finally {
            ModGrowingPlantHeadBlock.SETUP.remove();
        }
    }
`,
      '',
    ],
    [
      `    private ModGrowingPlantBodyBlock(Identifier id, BlockDefinition definition, ModGrowingPlantHeadBlock head,
            PlantSpec.GrowingPlant fields, Properties props) {
        super(props, ModGrowingPlantHeadBlock.direction(fields), bodyShape(fields), false);
        this.head = head;
        this.rules = new ModGrowingPlantHeadBlock.Rules(this, id, definition);`,
      `    public ModGrowingPlantBodyBlock(PlantSpec.GrowingPlant fields, ModGrowingPlantHeadBlock head, Properties props) {
        super(ModGrowingPlantHeadBlock.setup(fields, props), ModGrowingPlantHeadBlock.direction(fields), bodyShape(fields), false);
        ModGrowingPlantHeadBlock.SETUP.remove();
        this.head = head;
        this.rules = new ModGrowingPlantHeadBlock.Rules(this, fields);`,
    ],
    [
      `        Water(Identifier id, BlockDefinition definition, ModGrowingPlantHeadBlock.Water head, Properties props) {
            super(props);
            this.head = head;
            this.rules = new ModGrowingPlantHeadBlock.Rules(this, id, definition);`,
      `        public Water(PlantSpec.GrowingPlant fields, ModGrowingPlantHeadBlock.Water head, Properties props) {
            super(ModGrowingPlantHeadBlock.setup(fields, props));
            ModGrowingPlantHeadBlock.SETUP.remove();
            this.head = head;
            this.rules = new ModGrowingPlantHeadBlock.Rules(this, fields);`,
    ],
  ],
  ModColumnPlantBlock: ['Cane', 'Cactus'].map(
    (name) =>
      [
        `        ${name}(Identifier id, BlockDefinition definition, Properties props) {
            super(props);
            this.fields = (PlantSpec.ColumnPlant) definition.typeFields();`,
        `        public ${name}(PlantSpec.ColumnPlant fields, Properties props) {
            super(props);
            this.fields = fields;`,
      ] as const,
  ),
  ModBambooBlock: [
    [
      `    ModBambooBlock(Identifier id, BlockDefinition definition, Properties props) {
        super(props);
        this.fields = (PlantSpec.ColumnPlant) definition.typeFields();`,
      `    public ModBambooBlock(PlantSpec.ColumnPlant fields, Properties props) {
        super(props);
        this.fields = fields;`,
    ],
    [
      `    public Optional<Block> shoot() {
        return Companions.companionOf(this);
    }`,
      `    private Block shoot;

    public void attachShoot(Block companion) {
        shoot = companion;
    }

    public Optional<Block> shoot() {
        return Optional.ofNullable(shoot);
    }`,
    ],
  ],
  ModBambooShootBlock: [
    [
      'ModBambooShootBlock(Identifier id, BlockDefinition definition, ModBambooBlock stalk, Properties props) {',
      'public ModBambooShootBlock(ModBambooBlock stalk, Properties props) {',
    ],
  ],
  ModMultifaceBlock: [
    [
      `    ModMultifaceBlock(Identifier id, BlockDefinition definition, Properties props) {
        super(props);
        this.fields = (PlantSpec.Multiface) definition.typeFields();`,
      `    public ModMultifaceBlock(PlantSpec.Multiface fields, Properties props) {
        super(props);
        this.fields = fields;`,
    ],
  ],
  ModBigDripleafBlock: [
    [
      `    ModBigDripleafBlock(Identifier id, BlockDefinition definition, Properties props) {
        super(props);
        this.tiltTicks = ((PlantSpec.Dripleaf) definition.typeFields()).tiltTicks();`,
      `    public ModBigDripleafBlock(PlantSpec.Dripleaf fields, Properties props) {
        super(props);
        this.tiltTicks = fields.tiltTicks();`,
    ],
    [
      `        return Companions.companionOf(this);
    }`,
      `        return Optional.ofNullable(stem);
    }

    private Block stem;

    public void attachStem(Block companion) {
        stem = companion;
    }`,
    ],
  ],
  ModDripleafStemBlock: [
    [
      'ModDripleafStemBlock(Identifier id, BlockDefinition definition, ModBigDripleafBlock leaf, Properties props) {',
      'public ModDripleafStemBlock(ModBigDripleafBlock leaf, Properties props) {',
    ],
  ],
  ModSmallDripleafBlock: [
    [
      `    ModSmallDripleafBlock(Identifier id, BlockDefinition definition, Properties props) {
        super(props);
        this.growsInto = ((PlantSpec.Dripleaf) definition.typeFields()).growsInto().orElseThrow();`,
      `    public ModSmallDripleafBlock(PlantSpec.Dripleaf fields, Properties props) {
        super(props);
        this.growsInto = fields.growsInto().orElseThrow();`,
    ],
  ],
  ModFlowerPotBlock: [
    [
      `    public ModFlowerPotBlock(Identifier id, BlockDefinition definition, Block plant, ModFlowerPotBlock emptyPot,
            Properties properties) {`,
      '    public ModFlowerPotBlock(Block plant, ModFlowerPotBlock emptyPot, Properties properties) {',
    ],
    ['    void addPotted(', '    public void addPotted('],
    [
      'return own.consumesAction() ? own : InteractionResult.CONSUME;',
      'return InteractionResult.CONSUME;',
    ],
  ],
};

/** Removes Javadoc comments, so the differences above need not repeat them. */
const withoutDocs = (source: string): string => source.replace(/^\s*\/\*\*[\s\S]*?\*\/\n/gm, '');

async function runtimePlantAsEjected(name: string): Promise<string> {
  let source = stripDriver(
    await readFile(join(runtimeRoot, 'types', `${name.replace(/^Mod/, 'Msm')}.java`), 'utf8'),
  );
  for (const [from, to] of PLANT_RENAMES) source = source.replace(from, to);
  source = withoutDocs(source);
  for (const [from, to] of PLANT_DIFFERENCES[name] ?? []) {
    expect(source, `${name}: ${from}`).toContain(from);
    source = source.replace(from, to);
  }
  return source;
}

describe('the 26.3 generator and vanilla parity 3, batch 1 (B517)', () => {
  it('generates every runtime GameTest definition of the batch', async () => {
    const blocks = await gametestDefinitions();
    const files = sources(generateJavaProject(input(blocks)).files);
    const modBlocks = text(files, 'ModBlocks.java');
    // Plants and their companions.
    expect(modBlocks).toContain('PLANT3_CAVE_PLANT = Registry.register(BuiltInRegistries.BLOCK');
    expect(modBlocks).toContain('PLANT3_CAVE.attachBody(PLANT3_CAVE_PLANT);');
    expect(modBlocks).toContain('new ModGrowingPlantHeadBlock.Water(new PlantSpec.GrowingPlant(');
    expect(modBlocks).toContain('PLANT3_BAMBOO.attachShoot(PLANT3_BAMBOO_SHOOT);');
    expect(modBlocks).toContain('PLANT3_BIG_LEAF.attachStem(PLANT3_BIG_LEAF_STEM);');
    expect(modBlocks).toContain('new DoubleHighBlockItem(PLANT3_SMALL_LEAF');
    expect(modBlocks).toContain('new ModColumnPlantBlock.Cane(new PlantSpec.ColumnPlant(3, 3,');
    expect(modBlocks).toContain('.lightLevel(GlowLichenBlock.emission(7))');
    expect(modBlocks).toContain(
      'state.hasProperty(CaveVines.BERRIES) && state.getValue(CaveVines.BERRIES) ? 12 : 0',
    );
    // Pots: listed plants after every block, and a potted plant of a project pot.
    expect(modBlocks).toContain(
      'potted(POT_LISTED, Identifier.fromNamespaceAndPath("msm_test", "pot_listed_poppy"), Identifier.fromNamespaceAndPath("minecraft", "poppy"));',
    );
    expect(modBlocks).toContain(
      'new ModFlowerPotBlock(ModBlocks.plantBlock(Identifier.fromNamespaceAndPath("minecraft", "poppy")), ModBlocks.POT_CLAY,',
    );
    expect(modBlocks).toContain('POT_CLAY.addPotted(POT_CLAY_POPPY.plant(), POT_CLAY_POPPY);');
    expect(modBlocks.indexOf('potted(POT_LISTED')).toBeGreaterThan(
      modBlocks.indexOf('POT_CLAY.addPotted'),
    );
    // Own sounds and set types; any 26.3 sound type, not only the format's suggested names.
    expect(modBlocks).toContain('.sound(SoundType.GLOW_LICHEN)');
    expect(modBlocks).toContain(
      '.sound(ModBlocks.ownSounds(Identifier.fromNamespaceAndPath("msm_test", "sound_own"), SoundType.STONE, Float.NaN, Float.NaN,',
    );
    expect(text(files, 'block/SetOwnDoorBlock.java')).toContain(
      'super(ModBlocks.ownSetType(Identifier.fromNamespaceAndPath("msm_test", "set_own_door"), BlockSetType.OAK, null,',
    );
    expect(text(files, 'block/SetMobsPlateBlock.java')).toContain(
      'BlockSetType.PressurePlateSensitivity.MOBS',
    );
    // Pairs.
    expect(modBlocks).toContain(
      'BlockStripping.till(TOOLS_DIRT, Identifier.fromNamespaceAndPath("msm_test", "vp_tilled"), Identifier.fromNamespaceAndPath("minecraft", "stick")); // msm:tillable',
    );
    expect(modBlocks).toContain('BlockStripping.flatten(TOOLS_DIRT,');
    // Weathering of the six types, lightning.
    expect(text(files, 'block/Weathering2TinButtonBlock.java')).toContain(
      'implements ChangeOverTimeBlock<WeatheringCopper.WeatherState>, BlockWaxing.Pressed',
    );
    expect(text(files, 'block/Weathering2TinButtonBlock.java')).toContain(
      'BlockWaxing.age(this, state, level, pos, random);',
    );
    expect(text(files, 'block/Weathering2TinRodBlock.java')).toContain(
      'changeOverTime(state, level, pos, random);',
    );
    expect(modBlocks).toContain('Lightning.init();');
    expect(files.has('Lightning.java')).toBe(true);
    // Storage 2.
    expect(text(files, 'block/Storage2DoubleBlock.java')).toContain(
      'public class Storage2DoubleBlock extends DoubleChestBlock implements BlockEvents {',
    );
    expect(text(files, 'block/Storage2DoubleBlock.java')).toContain(
      'super(SPEC, () -> ModBlockEntities.STORAGE2_DOUBLE, properties);',
    );
    expect(text(files, 'block/Storage2DoubleBlockEntity.java')).toContain(
      'extends DoubleChestBlockEntity',
    );
    expect(text(files, 'block/Storage2TinDoubleBlock.java')).toContain(
      'BlockWaxing.age(this, state, level, pos, random);',
    );
    expect(text(files, 'block/Storage2StoreBlock.java')).toContain(
      'PlayerStores.open(storage, player);',
    );
    expect(text(files, 'block/Storage2StoreBlock.java')).not.toContain('getAnalogOutputSignal');
    expect(text(files, 'block/Storage2WetCrateBlock.java')).toContain(
      'implements EntityBlock, SimpleWaterloggedBlock',
    );
    expect(text(files, 'block/Storage2TinCrateBlock.java')).toContain(
      'BlockWaxing.age(this, state, level, pos, random);',
    );
    expect(modBlocks).toContain('PlayerStores.register();');
    for (const name of PLANT_CLASSES) expect(files.has(`block/type/${name}.java`), name).toBe(true);
  });

  it.each(PLANT_CLASSES.filter((name) => name !== 'PlantSpec'))(
    'copies %s line by line',
    async (name) => {
      const files = sources(generateJavaProject(input(await gametestDefinitions())).files);
      const ejected = text(files, `block/type/${name}.java`);
      expect(ejected.startsWith('// Generated by MCSuperMods: copied from msm_runtime')).toBe(true);
      expect(code(ejected)).toEqual(code(await runtimePlantAsEjected(name)));
    },
  );

  it("copies GrowingPlantTypes' rules into PlantSpec line by line", async () => {
    const files = sources(generateJavaProject(input(await gametestDefinitions())).files);
    const ejected = code(text(files, 'block/type/PlantSpec.java'));
    const runtime = await readFile(join(runtimeRoot, 'types/GrowingPlantTypes.java'), 'utf8');
    const rules = runtime
      .slice(runtime.indexOf('    // Shared rules.'), runtime.lastIndexOf('}'))
      .replace(/\bBlockType\.IdOrTag\b/g, 'IdOrTag');
    const lines = code(rules);
    expect(ejected.slice(-lines.length - 1, -1)).toEqual(lines);
  });

  it('copies Lightning line by line', async () => {
    const files = sources(generateJavaProject(input(await gametestDefinitions())).files);
    let runtime = await readFile(join(runtimeRoot, 'weathering/Lightning.java'), 'utf8');
    for (const [from, to] of [
      ['Weathering.isWeathering', 'BlockWaxing.isWeathering'],
      ['Weathering.firstStage', 'BlockWaxing.firstStage'],
      ['Weathering.replace', 'BlockWaxing.replace'],
      ['Weathering.previous', 'BlockWaxing.previous'],
      ['BlockExtras.copyProperties', 'BlockWaxing.copyProperties'],
    ] as const) {
      runtime = runtime.replaceAll(from, to);
    }
    expect(code(text(files, 'Lightning.java'))).toEqual(code(runtime));
  });

  it("gives BlockWaxing the runtime's replace, ageing and release rules line by line", async () => {
    const files = sources(generateJavaProject(input(await gametestDefinitions())).files);
    const ejected = code(text(files, 'BlockWaxing.java')).join('\n');
    const runtime = await readFile(join(runtimeRoot, 'weathering/Weathering.java'), 'utf8');
    const method = (signature: string): string => {
      const start = runtime.indexOf(signature);
      const end = runtime.indexOf('\n    }\n', start) + '\n    }'.length;
      return code(
        runtime.slice(start, end).replaceAll('BlockExtras.copyProperties', 'copyProperties'),
      ).join('\n');
    };
    expect(ejected).toContain(method('    public static void replace('));
    expect(ejected).toContain(method('    private static void keepingData('));
    expect(ejected).toContain(method('    static void afterChange('));
    expect(ejected).toContain(
      method('    static Identifier firstStage(').replace('    static', '    public static'),
    );
    const tick = method('    public static void randomTick(Ageing block,').replace(
      'public static void randomTick(Ageing block,',
      'public static void age(ChangeOverTimeBlock<?> block,',
    );
    expect(ejected).toContain(tick);
  });

  it("copies the double chest's hopper faces line by line", async () => {
    const files = sources(generateJavaProject(input(await gametestDefinitions())).files);
    const runtime = await readFile(join(runtimeRoot, 'container/MsmDoubleChestBlock.java'), 'utf8');
    const faces = runtime.slice(
      runtime.indexOf('    private record HopperFaces'),
      runtime.lastIndexOf('}'),
    );
    const ejected = code(text(files, 'block/DoubleChestBlock.java'));
    const lines = code(faces);
    expect(ejected.slice(-lines.length - 1, -1)).toEqual(lines);
  });

  it('fails where the runtime refuses', () => {
    const fails = (json: JsonObject, message: RegExp) =>
      expect(() => generateJavaProject(input([definition('bad', { format: 1, ...json })]))).toThrow(
        message,
      );
    fails(
      { type: 'pillar', components: { 'msm:container': { double: true } } },
      /a double chest must be a block or horizontal block/,
    );
    fails(
      { components: { 'msm:container': { double: true, per_player: true } } },
      /per_player is not allowed with double/,
    );
    fails({ components: { 'msm:container': { double: true, rows: 2 } } }, /double needs 3 rows/);
    fails(
      { components: { 'msm:container': { layout: 'hopper', per_player: true } } },
      /per_player is only for layout 'chest'/,
    );
    fails({ type: 'dripleaf', size: 'small' }, /grows_into: missing/);
    fails({ type: 'column_plant', style: 'cane', min_height: 5 }, /min_height 5 is above/);
    fails(
      { type: 'bed', components: { 'msm:weathering': { stage: 'exposed' } } },
      /not allowed on type 'bed'/,
    );
    fails(
      { type: 'potted_plant', plant: 'minecraft:poppy', pot: 'msm_test:nowhere' },
      /is not a flower_pot block of the project/,
    );
    fails({ block_sounds: { pitch: 9 } }, /pitch must be 0.25 to 4/);
  });

  it('writes nothing new for a project without these', () => {
    const files = sources(generateJavaProject(input([definition('plain', { format: 1 })])).files);
    expect([...files.keys()].some((path) => path.startsWith('block/'))).toBe(false);
    expect(files.has('Lightning.java')).toBe(false);
  });
});
