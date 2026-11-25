import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  BlockFacts,
  CommandArgumentFacts,
  CommandFacts,
  CommandFormName,
  CommandFragmentName,
  ControlFacts,
  DataFolderKey,
  DataFormName,
  DefinitionInput,
  DevFacts,
  DimensionHeightFacts,
  Element,
  ElementKind,
  ElementPatch,
  EntityFacts,
  ExpansionInput,
  ExpansionResult,
  Exporter,
  ExporterInput,
  ExporterOption,
  FabricFacts,
  FixedPlacementShapeFacts,
  FluidTagFacts,
  GameCategory,
  GameRuleFacts,
  GameRuleKindName,
  GeckolibFacts,
  GeneratedFile,
  JavaProjectGenerator,
  JavaProjectInput,
  Json,
  JsonObject,
  MaybePromise,
  MigrationChange,
  MigrationDetail,
  MigrationDetailOp,
  MigrationInGameCheck,
  MigrationReport,
  MigrationReverse,
  ModrinthFileFacts,
  OutputFile,
  OutputMergeMode,
  ParticleFacts,
  PlantSoilFacts,
  PluginContributions,
  PluginSearchData,
  Problem,
  Project,
  ProjectExpander,
  ProjectStarter,
  ProjectValidator,
  ResourceFolderKey,
  RuntimeKeyFacts,
  ScoreboardFacts,
  SearchBehaviour,
  SearchEntryContribution,
  SearchQuestionHint,
  SearchWordGroup,
  SoundSetFacts,
  StarterGameInfo,
  StatFacts,
  StatFormatName,
  Target,
  TargetChange,
  TargetChangeArea,
  TargetChangeCandidate,
  TargetChangeHandling,
  TargetChangeSet,
  TargetChangeSource,
  TargetChangeWhat,
  TargetChannel,
  TargetFacts,
  TerrainPreviewApproximatePart,
  TerrainPreviewFacts,
  TradeSoundFacts,
  ValidationInput,
  ValidationRegistry,
  VanillaFileChanges,
  VanillaPairFacts,
  VanillaTradeSetFacts,
  VehicleFacts,
  WorldFacts,
  WorldgenFacts,
} from '../src/index';
import { testTarget } from './target-fixture';

describe('IR and output types', () => {
  it('parameterises Element by its data', () => {
    expectTypeOf<Element<{ a: number }>>().toHaveProperty('data');
    expectTypeOf<Element<{ a: number }>['data']>().toEqualTypeOf<{ a: number }>();
    expectTypeOf<Element['data']>().toEqualTypeOf<Json>();
  });

  it('accepts a Project literal', () => {
    const project: Project = {
      formatVersion: 1,
      name: 'Example',
      namespaces: [
        {
          name: 'example',
          elements: [
            {
              formatVersion: 1,
              id: 'example:ruby',
              kind: 'minecraft:recipe',
              data: { type: 'minecraft:crafting_shaped' },
              meta: { createdAt: '2026-11-04T00:00:00.000Z', tags: ['gems'] },
            },
          ],
          assets: [{ path: 'textures/item/ruby.png', mediaType: 'image/png' }],
        },
      ],
      targets: ['mc-example'],
      plugins: ['msm.example'],
      settings: { strict: true },
    };
    expectTypeOf(project).toEqualTypeOf<Project>();
  });

  it('accepts bytes and JSON as OutputFile contents', () => {
    const bytes: OutputFile = {
      path: 'a.png',
      contents: new Uint8Array([1]),
      layer: 'resourcepack',
    };
    const json: OutputFile = { path: 'a.json', contents: { a: [1, 'b', null] }, layer: 'datapack' };
    expectTypeOf(bytes.contents).toEqualTypeOf<Uint8Array | Json>();
    expectTypeOf(json).toEqualTypeOf<OutputFile>();
  });

  it('keeps fabric and geckolib optional on Target', () => {
    expectTypeOf<Target['fabric']>().toEqualTypeOf<FabricFacts | undefined>();
    expectTypeOf<Target['geckolib']>().toEqualTypeOf<GeckolibFacts | undefined>();
  });
});

describe('0.2.0 additions', () => {
  it('adds an optional schema to OutputFile', () => {
    expectTypeOf<OutputFile['schema']>().toEqualTypeOf<string | undefined>();
    const file: OutputFile = {
      path: 'assets/example/models/ruby.json',
      contents: { parent: 'minecraft:block/cube_all' },
      layer: 'resourcepack',
      schema: '::java::assets::model::Model',
    };
    expectTypeOf(file).toEqualTypeOf<OutputFile>();
  });

  it('adds optional defaultData, hiddenPaths and previewKind to ElementKind', () => {
    expectTypeOf<ElementKind<{ a: number }>['defaultData']>().toEqualTypeOf<
      { a: number } | undefined
    >();
    expectTypeOf<ElementKind['defaultData']>().toEqualTypeOf<Json | undefined>();
    expectTypeOf<ElementKind['hiddenPaths']>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<ElementKind['previewKind']>().toEqualTypeOf<string | undefined>();
    const kind: ElementKind = {
      id: 'minecraft:pack_mcmeta',
      schema: '::java::pack::Pack',
      folder: 'pack',
      defaultData: { pack: { description: '' } },
      hiddenPaths: ['/pack/pack_format'],
      lower: () => [],
    };
    expectTypeOf(kind).toEqualTypeOf<ElementKind>();
  });

  it('adds an optional per-target defaultDataFor to ElementKind (1.0.0, ADR 0036 D8)', () => {
    expectTypeOf<ElementKind['defaultDataFor']>().toEqualTypeOf<
      ((target: TargetFacts) => MaybePromise<Json>) | undefined
    >();
    const kind: ElementKind = {
      id: 'minecraft:worldgen/noise_settings',
      schema: '::java::data::worldgen::noise_settings::NoiseGeneratorSettings',
      folder: 'worldgen/noise_settings',
      defaultData: { sea_level: 63 },
      defaultDataFor: (target) => ({ sea_level: target.worldgen.featureSteps.length }),
      lower: () => [],
    };
    const asyncKind: ElementKind = { ...kind, defaultDataFor: async () => ({}) };
    expectTypeOf(kind).toEqualTypeOf<ElementKind>();
    expectTypeOf(asyncKind).toEqualTypeOf<ElementKind>();
  });

  it('adds an optional file to Problem', () => {
    expectTypeOf<Problem['file']>().toEqualTypeOf<string | undefined>();
  });

  it('requires export meta on ExporterInput', () => {
    expectTypeOf<ExporterInput['meta']>().toEqualTypeOf<{
      msmVersion: string;
      plugins: string[];
    }>();
  });

  it('requires resource folder names on Target', () => {
    expectTypeOf<ResourceFolderKey>().toEqualTypeOf<
      | 'model'
      | 'block_definition'
      | 'item_definition'
      | 'lang'
      | 'sounds_file'
      | 'textures'
      | 'atlases'
      | 'font'
    >();
    expectTypeOf<Target['folders']['resource']>().toEqualTypeOf<
      Readonly<Record<ResourceFolderKey, string>>
    >();
    expectTypeOf<Target>().toHaveProperty('folders');
  });
});

describe('0.3.0 additions', () => {
  it('adds an optional language to OutputFile', () => {
    expectTypeOf<OutputFile['language']>().toEqualTypeOf<string | undefined>();
    const file: OutputFile = {
      path: 'data/example/function/greet.mcfunction',
      contents: new TextEncoder().encode('say hello\n'),
      layer: 'datapack',
      language: 'mcfunction',
    };
    expectTypeOf(file).toEqualTypeOf<OutputFile>();
  });

  it('adds an optional range to Problem', () => {
    expectTypeOf<Problem['range']>().toEqualTypeOf<{ start: number; end: number } | undefined>();
    const problem: Problem = {
      severity: 'error',
      code: 'example.parse',
      message: 'Expected a float.',
      elementId: 'example:greet',
      path: '/lines/0',
      range: { start: 4, end: 9 },
    };
    expectTypeOf(problem).toEqualTypeOf<Problem>();
  });

  it('requires data folder names on Target', () => {
    expectTypeOf<DataFolderKey>().toEqualTypeOf<
      | 'recipe'
      | 'loot_table'
      | 'advancement'
      | 'predicate'
      | 'item_modifier'
      | 'function'
      | 'tags'
      | 'enchantment'
      | 'damage_type'
      | 'dimension_type'
      | 'chat_type'
      | 'jukebox_song'
      | 'banner_pattern'
      | 'painting_variant'
      | 'trim_material'
      | 'trim_pattern'
      | 'dialog'
      | 'structure'
      | 'dimension'
      | 'worldgen'
      | 'villager_trade'
      | 'trade_set'
      | 'wolf_variant'
      | 'cat_variant'
      | 'pig_variant'
      | 'cow_variant'
      | 'chicken_variant'
      | 'frog_variant'
      | 'zombie_nautilus_variant'
      | 'wolf_sound_variant'
      | 'cat_sound_variant'
      | 'pig_sound_variant'
      | 'cow_sound_variant'
      | 'chicken_sound_variant'
      | 'instrument'
      | 'enchantment_provider'
      | 'trial_spawner'
      | 'timeline'
      | 'world_clock'
      | 'decorated_pot_pattern'
      | 'block_transformer'
      | 'test_environment'
      | 'test_instance'
      | 'sulfur_cube_archetype'
      | 'context_int_provider'
      | 'context_float_provider'
    >();
    expectTypeOf<Target['folders']['data']>().toEqualTypeOf<
      Readonly<Record<DataFolderKey, string>>
    >();
    expectTypeOf<Target['folders']>().toEqualTypeOf<{
      resource: Readonly<Record<ResourceFolderKey, string>>;
      data: Readonly<Record<DataFolderKey, string>>;
    }>();
  });
});

describe('0.5.0 additions', () => {
  it('adds an optional registry to ElementKind', () => {
    expectTypeOf<ElementKind['registry']>().toEqualTypeOf<string | undefined>();
    const kind: ElementKind = {
      id: 'minecraft:structure_template',
      schema: 'msm:structure_template',
      folder: 'structure',
      registry: 'structure',
      lower: () => [],
    };
    expectTypeOf(kind).toEqualTypeOf<ElementKind>();
  });

  it('types project validators', () => {
    expectTypeOf<ProjectValidator['kinds']>().toEqualTypeOf<readonly string[]>();
    expectTypeOf<ProjectValidator['validate']>().parameter(0).toEqualTypeOf<ValidationInput>();
    expectTypeOf<ProjectValidator['validate']>().returns.toEqualTypeOf<MaybePromise<Problem[]>>();
    expectTypeOf<ValidationInput['elements']>().toEqualTypeOf<readonly Element[]>();
    expectTypeOf<ValidationInput['target']>().toEqualTypeOf<TargetFacts>();
    expectTypeOf<ValidationInput['registry']>().toEqualTypeOf<ValidationRegistry>();
    expectTypeOf<ValidationRegistry['ids']>().returns.toEqualTypeOf<readonly string[]>();
    expectTypeOf<PluginContributions['validators']>().toEqualTypeOf<
      ProjectValidator[] | undefined
    >();
    const validator: ProjectValidator = {
      id: 'msm.example.empty',
      kinds: ['minecraft:recipe'],
      validate: ({ elements, registry }) =>
        elements.length === 0 && !registry.has('recipe', 'example:a')
          ? [{ severity: 'info', code: 'example.empty', message: 'Nothing to check.' }]
          : [],
    };
    expectTypeOf(validator).toEqualTypeOf<ProjectValidator>();
  });

  it('requires a data version and worldgen facts on Target', () => {
    expectTypeOf<Target['dataVersion']>().toEqualTypeOf<number>();
    expectTypeOf<Target['worldgen']>().toEqualTypeOf<WorldgenFacts>();
    expectTypeOf<WorldgenFacts['featureSteps']>().toEqualTypeOf<readonly string[]>();
  });
});

describe('0.6.0 additions', () => {
  it('adds an optional merge mode to OutputFile', () => {
    expectTypeOf<OutputFile['merge']>().toEqualTypeOf<OutputMergeMode | undefined>();
    expectTypeOf<OutputMergeMode>().toEqualTypeOf<'tag' | 'object'>();
    const file: OutputFile = {
      path: 'data/example/tags/block/a.json',
      contents: { values: [] },
      layer: 'datapack',
      merge: 'tag',
    };
    expectTypeOf(file).toEqualTypeOf<OutputFile>();
  });

  it('adds exporter options', () => {
    expectTypeOf<Exporter['options']>().toEqualTypeOf<ExporterOption[] | undefined>();
    expectTypeOf<ExporterInput['options']>().toEqualTypeOf<Record<string, Json>>();
    expectTypeOf<ExporterOption['type']>().toEqualTypeOf<'boolean'>();
    expectTypeOf<ExporterOption['default']>().toEqualTypeOf<boolean>();
    expectTypeOf<ExporterOption['description']>().toEqualTypeOf<string | undefined>();
  });

  it('types the Fabric facts of a target', () => {
    expectTypeOf<FabricFacts>().toEqualTypeOf<{
      loader: string;
      api: string;
      loom: string;
      minecraftDependency: string;
      gradle: string;
      apiModrinth?: ModrinthFileFacts;
    }>();
  });
});

describe('0.7.0 additions', () => {
  it('types the GeckoLib facts of a target', () => {
    expectTypeOf<GeckolibFacts>().toEqualTypeOf<{
      version: string;
      modId: string;
      dependency: string;
      fileName: string;
      url: string;
      sha512: string;
      modrinthVersionId?: string;
    }>();
  });
});

describe('0.8.0 additions', () => {
  it('types the Java project generator', () => {
    expectTypeOf<DefinitionInput>().toEqualTypeOf<{
      id: string;
      path: string;
      definition: JsonObject;
    }>();
    expectTypeOf<GeneratedFile>().toEqualTypeOf<{ path: string; contents: string }>();
    expectTypeOf<JavaProjectInput>().toEqualTypeOf<{
      modId: string;
      javaPackage: string;
      modClassName: string;
      blocks: DefinitionInput[];
      items: DefinitionInput[];
      entities: DefinitionInput[];
      effects?: DefinitionInput[];
      soundEvents?: string[];
      biomeAdditions?: DefinitionInput[];
      lootAdditions?: DefinitionInput[];
      potions?: DefinitionInput[];
      particles?: DefinitionInput[];
      commands?: DefinitionInput[];
      creativeTabs?: DefinitionInput[];
      vanillaBlockRules?: DefinitionInput[];
      villagerProfessions?: DefinitionInput[];
      fluids?: DefinitionInput[];
      villagerTypes?: DefinitionInput[];
      gameRules?: DefinitionInput[];
      stats?: DefinitionInput[];
      geckolib: boolean;
    }>();
    expectTypeOf<JavaProjectGenerator['generate']>().toEqualTypeOf<
      (input: JavaProjectInput) => GeneratedFile[]
    >();
    expectTypeOf<Target['javaProject']>().toEqualTypeOf<JavaProjectGenerator | undefined>();
  });

  it('carries optional block facts on a target (1.10.0)', () => {
    expectTypeOf<TargetFacts['blocks']>().toEqualTypeOf<BlockFacts | undefined>();
    expectTypeOf<BlockFacts['setTypes']>().toEqualTypeOf<readonly string[]>();
    expectTypeOf<BlockFacts['woodTypes']>().toEqualTypeOf<readonly string[]>();
    const facts: BlockFacts = { setTypes: ['wood', 'iron'], woodTypes: ['oak'] };
    expect(facts.setTypes).toContain('iron');
    // A 1.9.0-shaped target without block facts stays assignable.
    expect(testTarget.blocks).toBeUndefined();
  });

  it('carries optional entity facts on a target (1.11.0)', () => {
    expectTypeOf<TargetFacts['entities']>().toEqualTypeOf<EntityFacts | undefined>();
    expectTypeOf<EntityFacts['projectileItems']>().toEqualTypeOf<readonly string[]>();
    expectTypeOf<EntityFacts['saddleTag']>().toEqualTypeOf<string>();
    const facts: EntityFacts = {
      projectileItems: ['minecraft:arrow', 'minecraft:snowball'],
      saddleTag: 'minecraft:can_equip_saddle',
    };
    expect(facts.projectileItems).toContain('minecraft:arrow');
    // A 1.10.0-shaped target without entity facts stays assignable.
    expect(testTarget.entities).toBeUndefined();
  });

  it('carries optional container and machine block facts (1.12.0)', () => {
    expectTypeOf<BlockFacts['containerSounds']>().toEqualTypeOf<
      { open: string; close: string } | undefined
    >();
    expectTypeOf<BlockFacts['machineRecipeTypes']>().toEqualTypeOf<readonly string[] | undefined>();
    const facts: BlockFacts = {
      setTypes: ['wood'],
      woodTypes: ['oak'],
      containerSounds: {
        open: 'minecraft:block.barrel.open',
        close: 'minecraft:block.barrel.close',
      },
      machineRecipeTypes: ['minecraft:smelting'],
    };
    expect(facts.machineRecipeTypes).toContain('minecraft:smelting');
    // A 1.11.0-shaped block facts object without them stays assignable.
    const older: BlockFacts = { setTypes: ['wood'], woodTypes: ['oak'] };
    expect(older.containerSounds).toBeUndefined();
    expect(older.machineRecipeTypes).toBeUndefined();
  });

  it('carries optional portal block facts (1.13.0)', () => {
    expectTypeOf<BlockFacts['portal']>().toEqualTypeOf<
      | { ambientSound: string; travelSound: string; triggerSound: string; particle: string }
      | undefined
    >();
    const facts: BlockFacts = {
      setTypes: ['wood'],
      woodTypes: ['oak'],
      portal: {
        ambientSound: 'minecraft:block.portal.ambient',
        travelSound: 'minecraft:block.portal.travel',
        triggerSound: 'minecraft:block.portal.trigger',
        particle: 'minecraft:portal',
      },
    };
    expect(facts.portal?.particle).toBe('minecraft:portal');
    // A 1.12.0-shaped block facts object without them stays assignable.
    const older: BlockFacts = { setTypes: ['wood'], woodTypes: ['oak'] };
    expect(older.portal).toBeUndefined();
  });

  it('carries optional particle facts on a target (1.14.0)', () => {
    expectTypeOf<TargetFacts['particles']>().toEqualTypeOf<ParticleFacts | undefined>();
    expectTypeOf<ParticleFacts['withOptions']>().toEqualTypeOf<readonly string[]>();
    expectTypeOf<ParticleFacts['descriptionFolder']>().toEqualTypeOf<string>();
    expectTypeOf<ParticleFacts['textureFolder']>().toEqualTypeOf<string>();
    const facts: ParticleFacts = {
      withOptions: ['minecraft:dust', 'minecraft:block'],
      descriptionFolder: 'particles',
      textureFolder: 'particle',
    };
    expect(facts.withOptions).toContain('minecraft:dust');
    // A 1.13.0-shaped target without particle facts stays assignable.
    expect(testTarget.particles).toBeUndefined();
  });

  it('carries optional dev facts on a target (1.15.0)', () => {
    expectTypeOf<TargetFacts['dev']>().toEqualTypeOf<DevFacts | undefined>();
    expectTypeOf<DevFacts['worldDataFolders']>().toEqualTypeOf<readonly string[]>();
    const facts: DevFacts = {
      gameRules: {
        advanceTime: 'advance_time',
        advanceWeather: 'advance_weather',
        spawnMobs: 'spawn_mobs',
        keepInventory: 'keep_inventory',
      },
      worldDataFolders: ['dimension_type', 'worldgen/biome'],
    };
    expect(facts.gameRules.keepInventory).toBe('keep_inventory');
    // A 1.14.0-shaped target without dev facts stays assignable.
    expect(testTarget.dev).toBeUndefined();
  });

  it('carries optional control and vehicle facts on a target (1.16.0)', () => {
    expectTypeOf<TargetFacts['controls']>().toEqualTypeOf<ControlFacts | undefined>();
    expectTypeOf<TargetFacts['vehicles']>().toEqualTypeOf<VehicleFacts | undefined>();
    expectTypeOf<ControlFacts['runtimeKeys']>().toEqualTypeOf<RuntimeKeyFacts>();
    expectTypeOf<ControlFacts['vanillaKeys']>().toEqualTypeOf<Readonly<Record<string, string>>>();
    expectTypeOf<ControlFacts['keyboardNamesByCode']>().toEqualTypeOf<readonly string[]>();
    expectTypeOf<VehicleFacts['maxSpeed']>().toEqualTypeOf<number>();
    const controls: ControlFacts = {
      keyNames: ['key.keyboard.a', 'key.keyboard.r', 'key.keyboard.unknown', 'key.mouse.left'],
      unboundKey: 'key.keyboard.unknown',
      vanillaKeys: { 'key.left': 'key.keyboard.a', 'key.debug.reloadChunk': 'key.keyboard.a' },
      vanillaCombinations: ['key.debug.reloadChunk'],
      keyboardNamesByCode: [
        'key.keyboard.unknown',
        'key.keyboard.unknown',
        'key.keyboard.unknown',
        'key.keyboard.unknown',
        'key.keyboard.a',
      ],
      mouseNamesByCode: ['key.mouse.0', 'key.mouse.left'],
      runtimeKeys: {
        fire: 'key.keyboard.r',
        second: 'key.keyboard.v',
        horn: 'key.keyboard.h',
        descend: 'key.keyboard.left.alt',
      },
    };
    const vehicles: VehicleFacts = { modes: ['ground', 'air'], maxSpeed: 3 };
    expect(controls.keyboardNamesByCode[4]).toBe('key.keyboard.a');
    expect(vehicles.maxSpeed).toBe(3);
    // A 1.15.0-shaped target without control or vehicle facts stays assignable.
    expect(testTarget.controls).toBeUndefined();
    expect(testTarget.vehicles).toBeUndefined();
  });

  it("carries vanilla's optional feature order in the worldgen facts (1.17.0)", () => {
    expectTypeOf<WorldgenFacts['vanillaFeatureOrder']>().toEqualTypeOf<
      Readonly<Record<string, readonly string[]>> | undefined
    >();
    const worldgen: WorldgenFacts = {
      featureSteps: ['underground_ores', 'vegetal_decoration'],
      vanillaFeatureOrder: {
        underground_ores: ['minecraft:ore_dirt', 'minecraft:ore_gravel'],
        vegetal_decoration: [],
      },
    };
    expect(worldgen.vanillaFeatureOrder?.underground_ores?.[1]).toBe('minecraft:ore_gravel');
    // A 1.16.0-shaped target without the order stays assignable.
    expect(testTarget.worldgen.vanillaFeatureOrder).toBeUndefined();
  });

  it('carries optional dimension height and environment attribute facts (1.18.0)', () => {
    expectTypeOf<WorldgenFacts['dimensionHeight']>().toEqualTypeOf<
      DimensionHeightFacts | undefined
    >();
    expectTypeOf<WorldgenFacts['environmentAttributes']>().toEqualTypeOf<
      readonly string[] | undefined
    >();
    const worldgen: WorldgenFacts = {
      featureSteps: [],
      dimensionHeight: { minY: -2032, maxY: 2031, step: 16 },
      environmentAttributes: ['minecraft:visual/fog_color', 'minecraft:visual/sky_color'],
    };
    expect(worldgen.dimensionHeight?.step).toBe(16);
    expect(worldgen.environmentAttributes).toContain('minecraft:visual/sky_color');
    // A 1.17.0-shaped target without them stays assignable.
    expect(testTarget.worldgen.dimensionHeight).toBeUndefined();
    expect(testTarget.worldgen.environmentAttributes).toBeUndefined();
  });

  it('carries optional bed, dye, stem, model template and torch facts on blocks (1.17.0)', () => {
    expectTypeOf<BlockFacts['bedRules']>().toEqualTypeOf<
      Readonly<Record<string, string>> | undefined
    >();
    expectTypeOf<BlockFacts['dyeColours']>().toEqualTypeOf<readonly string[] | undefined>();
    expectTypeOf<BlockFacts['stemTags']>().toEqualTypeOf<
      { soil: string; fruitSoil: string } | undefined
    >();
    expectTypeOf<BlockFacts['modelTemplates']>().toEqualTypeOf<readonly string[] | undefined>();
    expectTypeOf<BlockFacts['defaultTorchParticle']>().toEqualTypeOf<string | undefined>();
    const facts: BlockFacts = {
      setTypes: ['wood'],
      woodTypes: ['oak'],
      bedRules: { bed: 'minecraft:gameplay/bed_rule' },
      dyeColours: ['white', 'black'],
      stemTags: { soil: 'minecraft:soil_tag', fruitSoil: 'minecraft:fruit_tag' },
      modelTemplates: ['minecraft:block/template_torch'],
      defaultTorchParticle: 'minecraft:flame',
    };
    expect(facts.bedRules?.bed).toBe('minecraft:gameplay/bed_rule');
    // A 1.16.0-shaped block facts object without them stays assignable.
    const older: BlockFacts = { setTypes: [], woodTypes: [] };
    expect(older.modelTemplates).toBeUndefined();
  });

  it('carries optional fluid facts on blocks (1.18.0)', () => {
    expectTypeOf<BlockFacts['fluidModel']>().toEqualTypeOf<
      'two_fluids' | 'one_fluid' | undefined
    >();
    expectTypeOf<BlockFacts['fluidTags']>().toEqualTypeOf<FluidTagFacts | undefined>();
    expectTypeOf<FluidTagFacts['water']>().toEqualTypeOf<readonly string[]>();
    expectTypeOf<FluidTagFacts['lava']>().toEqualTypeOf<readonly string[]>();
    const facts: BlockFacts = {
      setTypes: [],
      woodTypes: [],
      fluidModel: 'one_fluid',
      fluidTags: { water: ['minecraft:water', 'minecraft:swimmable'], lava: ['minecraft:lava'] },
    };
    expect(facts.fluidTags?.water).toContain('minecraft:swimmable');
    // @ts-expect-error: only the two liquid models exist.
    const wrong: BlockFacts = { setTypes: [], woodTypes: [], fluidModel: 'three_fluids' };
    expect(wrong.fluidModel).toBe('three_fluids');
    // A 1.17.0-shaped block facts object without them stays assignable.
    const older: BlockFacts = { setTypes: [], woodTypes: [] };
    expect(older.fluidModel).toBeUndefined();
    expect(older.fluidTags).toBeUndefined();
  });

  it('carries optional sound, pair and plant soil facts on blocks (1.19.0)', () => {
    expectTypeOf<BlockFacts['soundTypes']>().toEqualTypeOf<readonly string[] | undefined>();
    expectTypeOf<BlockFacts['soundModel']>().toEqualTypeOf<
      'sound_type' | 'block_sound_set' | undefined
    >();
    expectTypeOf<BlockFacts['vanillaPairs']>().toEqualTypeOf<VanillaPairFacts | undefined>();
    expectTypeOf<VanillaPairFacts['strip']>().toEqualTypeOf<Readonly<Record<string, string>>>();
    expectTypeOf<BlockFacts['plantSoils']>().toEqualTypeOf<PlantSoilFacts | undefined>();
    expectTypeOf<PlantSoilFacts['cane']>().toEqualTypeOf<string>();
    expectTypeOf<BlockFacts['soundSetEvents']>().toEqualTypeOf<
      Readonly<Record<string, SoundSetFacts>> | undefined
    >();
    expectTypeOf<SoundSetFacts['break']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<SoundSetFacts['volume']>().toEqualTypeOf<number>();
    const facts: BlockFacts = {
      setTypes: [],
      woodTypes: [],
      soundTypes: ['stone', 'wood'],
      soundModel: 'block_sound_set',
      soundSetEvents: {
        cactus_flower: {
          break: 'minecraft:block.cactus_flower.break',
          place: 'minecraft:block.cactus_flower.place',
          volume: 1,
          pitch: 1,
        },
      },
      vanillaPairs: {
        strip: { 'minecraft:oak_log': 'minecraft:stripped_oak_log' },
        flatten: { 'minecraft:dirt': 'minecraft:dirt_path' },
        till: { 'minecraft:dirt': 'minecraft:farmland' },
        wax: { 'minecraft:copper_block': 'minecraft:waxed_copper_block' },
        age: { 'minecraft:copper_block': 'minecraft:exposed_copper' },
      },
      plantSoils: {
        cane: 'minecraft:supports_sugar_cane',
        caneWater: 'minecraft:supports_sugar_cane_adjacently',
        cactus: 'minecraft:supports_cactus',
        cactusFlower: 'minecraft:support_override_cactus_flower',
        bamboo: 'minecraft:supports_bamboo',
        bigDripleaf: 'minecraft:supports_big_dripleaf',
        smallDripleaf: 'minecraft:supports_small_dripleaf',
        notKelp: 'minecraft:cannot_support_kelp',
        caveVines: 'minecraft:cave_vines',
      },
    };
    expect(facts.vanillaPairs?.strip['minecraft:oak_log']).toBe('minecraft:stripped_oak_log');
    // @ts-expect-error: only the two sound models exist.
    const wrong: BlockFacts = { setTypes: [], woodTypes: [], soundModel: 'sound_event' };
    expect(wrong.soundModel).toBe('sound_event');
    // A 1.18.0-shaped block facts object without them stays assignable.
    const older: BlockFacts = { setTypes: [], woodTypes: [] };
    expect(older.soundTypes).toBeUndefined();
    expect(older.soundModel).toBeUndefined();
    expect(older.vanillaPairs).toBeUndefined();
    expect(older.plantSoils).toBeUndefined();
    expect(older.soundSetEvents).toBeUndefined();
  });

  it('carries optional trade, job site and trade set facts on entities (1.18.0)', () => {
    expectTypeOf<EntityFacts['tradeSounds']>().toEqualTypeOf<TradeSoundFacts | undefined>();
    expectTypeOf<EntityFacts['vanillaJobSites']>().toEqualTypeOf<
      Readonly<Record<string, readonly string[]>> | undefined
    >();
    expectTypeOf<EntityFacts['vanillaTradeSets']>().toEqualTypeOf<
      Readonly<Record<string, VanillaTradeSetFacts>> | undefined
    >();
    expectTypeOf<VanillaTradeSetFacts['villagerOnly']>().toEqualTypeOf<boolean>();
    const facts: EntityFacts = {
      projectileItems: [],
      saddleTag: 'minecraft:can_equip_saddle',
      tradeSounds: {
        yes: 'minecraft:entity.villager.yes',
        no: 'minecraft:entity.villager.no',
        trading: 'minecraft:entity.villager.trade',
      },
      vanillaJobSites: { 'minecraft:librarian': ['minecraft:lectern'] },
      vanillaTradeSets: {
        'minecraft:cartographer/level_2': { trades: 8, villagerOnlyTrades: 7, villagerOnly: true },
      },
    };
    expect(facts.vanillaJobSites?.['minecraft:librarian']).toEqual(['minecraft:lectern']);
    expect(facts.vanillaTradeSets?.['minecraft:cartographer/level_2']?.villagerOnly).toBe(true);
    // A 1.17.0-shaped entity facts object without them stays assignable.
    const older: EntityFacts = { projectileItems: [], saddleTag: 'minecraft:can_equip_saddle' };
    expect(older.tradeSounds).toBeUndefined();
    expect(testTarget.entities?.vanillaTradeSets).toBeUndefined();
  });

  it('carries villager type, cauldron, key-only argument, game rule and stat facts (1.20.0)', () => {
    expectTypeOf<EntityFacts['villagerTypes']>().toEqualTypeOf<readonly string[] | undefined>();
    expectTypeOf<BlockFacts['cauldrons']>().toEqualTypeOf<readonly string[] | undefined>();
    expectTypeOf<CommandArgumentFacts['keyOnly']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<TargetFacts['gameRules']>().toEqualTypeOf<GameRuleFacts | undefined>();
    expectTypeOf<GameRuleFacts['kinds']>().toEqualTypeOf<readonly GameRuleKindName[]>();
    expectTypeOf<TargetFacts['stats']>().toEqualTypeOf<StatFacts | undefined>();
    expectTypeOf<StatFacts['formats']>().toEqualTypeOf<readonly StatFormatName[]>();
    expectTypeOf<JavaProjectInput['vanillaBlockRules']>().toEqualTypeOf<
      DefinitionInput[] | undefined
    >();
    for (const key of [
      'villagerProfessions',
      'fluids',
      'villagerTypes',
      'gameRules',
      'stats',
    ] as const) {
      expectTypeOf<JavaProjectInput[typeof key]>().toEqualTypeOf<DefinitionInput[] | undefined>();
    }
    const entities: EntityFacts = {
      projectileItems: [],
      saddleTag: 'minecraft:can_equip_saddle',
      villagerTypes: ['desert', 'plains'],
    };
    const blocks: BlockFacts = { setTypes: [], woodTypes: [], cauldrons: ['minecraft:cauldron'] };
    const structure: CommandArgumentFacts = {
      parser: 'minecraft:resource_key',
      properties: { registry: 'minecraft:worldgen/structure' },
      keyOnly: true,
    };
    const gameRules: GameRuleFacts = {
      kinds: ['boolean', 'integer'],
      categories: ['player', 'misc'],
      vanillaNames: ['keep_inventory'],
    };
    const stats: StatFacts = {
      formats: ['default', 'distance', 'time'],
      criterionPrefix: 'minecraft.custom:',
      vanillaCustomStats: ['jump'],
    };
    expect(entities.villagerTypes).toContain('plains');
    expect(blocks.cauldrons).toEqual(['minecraft:cauldron']);
    expect(structure.keyOnly).toBe(true);
    expect(gameRules.kinds).toHaveLength(2);
    expect(stats.criterionPrefix).toBe('minecraft.custom:');
    // @ts-expect-error: a game rule holds only vanilla's two kinds of value.
    const wrongKind: GameRuleFacts = { kinds: ['float'], categories: [], vanillaNames: [] };
    expect(wrongKind.kinds).toEqual(['float']);
    const wrongFormat: StatFacts = {
      // @ts-expect-error: a statistic has only vanilla's three formatters.
      formats: ['percent'],
      criterionPrefix: '',
      vanillaCustomStats: [],
    };
    expect(wrongFormat.formats).toEqual(['percent']);
    // 1.19.0-shaped facts without them stay assignable.
    const older: EntityFacts = { projectileItems: [], saddleTag: 'minecraft:can_equip_saddle' };
    expect(older.villagerTypes).toBeUndefined();
    expect(testTarget.gameRules).toBeUndefined();
    expect(testTarget.stats).toBeUndefined();
  });

  it('carries the live world generation preview facts (1.21.0)', () => {
    expectTypeOf<WorldgenFacts['terrainPreview']>().toEqualTypeOf<
      TerrainPreviewFacts | undefined
    >();
    expectTypeOf<TerrainPreviewFacts['approximate']>().toEqualTypeOf<
      readonly TerrainPreviewApproximatePart[]
    >();
    const worldgen: WorldgenFacts = {
      featureSteps: ['raw_generation'],
      terrainPreview: {
        dataFolders: ['dimension_type', 'worldgen/noise_settings'],
        approximate: ['end'],
      },
    };
    expect(worldgen.terrainPreview?.dataFolders).toContain('dimension_type');
    const wrongPart: TerrainPreviewFacts = {
      dataFolders: [],
      // @ts-expect-error: only the biome layout and the End can be approximate.
      approximate: ['carvers'],
    };
    expect(wrongPart.approximate).toEqual(['carvers']);
    // 1.20.0-shaped worldgen facts without it stay assignable.
    expect(testTarget.worldgen.terrainPreview).toBeUndefined();
  });

  it('carries world, scoreboard and command form facts (1.22.0)', () => {
    expectTypeOf<TargetFacts['worlds']>().toEqualTypeOf<WorldFacts | undefined>();
    expectTypeOf<TargetFacts['scoreboard']>().toEqualTypeOf<ScoreboardFacts | undefined>();
    expectTypeOf<WorldFacts['fixedPlacementShape']>().toEqualTypeOf<FixedPlacementShapeFacts>();
    expectTypeOf<WorldFacts['endLikeSettings']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<CommandFacts['forms']>().toEqualTypeOf<
      Readonly<Record<CommandFormName, string>> | undefined
    >();
    const worlds: WorldFacts = {
      structurePlacements: ['minecraft:dimension_origin'],
      voidBiome: 'minecraft:the_void',
      floatingIslandsSettings: 'minecraft:floating_islands',
      fixedPlacementShape: { type: 'minecraft:fixed_placement', minPositions: 1 },
      firstJoinCriterion: 'minecraft:tick',
    };
    expect(worlds.endLikeSettings).toBeUndefined();
    const scoreboard: ScoreboardFacts = {
      criteria: ['dummy'],
      statTypes: ['mined'],
      displaySlots: ['list', 'sidebar', 'below_name', 'sidebar.team.red'],
      renderTypes: ['integer', 'hearts'],
      numberFormats: ['blank', 'fixed', 'styled'],
      teamColours: ['red'],
      nameTagVisibility: ['always'],
      collisionRules: ['always'],
      deathMessageVisibility: ['always'],
    };
    expect(scoreboard.displaySlots).toContain('sidebar.team.red');
    const partial: Partial<Record<CommandFormName, string>> = {
      team_join: 'team join <team> <members>',
    };
    expect(partial.team_join).toContain('<team>');
    // @ts-expect-error: forms are keyed by the documented names only.
    const wrongForm: Partial<Record<CommandFormName, string>> = { team_rename: '' };
    expect(wrongForm).toBeDefined();
    // 1.21.0-shaped targets and command facts without them stay assignable.
    const older: CommandFacts = { vanillaNames: [], argumentTypes: {} };
    expect(older.forms).toBeUndefined();
    expect(testTarget.worlds).toBeUndefined();
    expect(testTarget.scoreboard).toBeUndefined();
  });

  it('carries optional command facts on a target (1.17.0)', () => {
    expectTypeOf<TargetFacts['commands']>().toEqualTypeOf<CommandFacts | undefined>();
    expectTypeOf<CommandFacts['vanillaNames']>().toEqualTypeOf<readonly string[]>();
    expectTypeOf<CommandFacts['argumentTypes']>().toEqualTypeOf<
      Readonly<Record<string, CommandArgumentFacts>>
    >();
    expectTypeOf<CommandArgumentFacts['properties']>().toEqualTypeOf<
      Readonly<Record<string, string>> | undefined
    >();
    const commands: CommandFacts = {
      vanillaNames: ['give', 'tp'],
      argumentTypes: {
        integer: { parser: 'brigadier:integer' },
        player: { parser: 'minecraft:entity', properties: { amount: 'single', type: 'players' } },
      },
    };
    expect(commands.argumentTypes.player?.properties?.type).toBe('players');
    // A 1.16.0-shaped target without command facts stays assignable.
    expect(testTarget.commands).toBeUndefined();
  });

  it('types project expanders and element patches (1.15.0)', async () => {
    expectTypeOf<PluginContributions['projectExpanders']>().toEqualTypeOf<
      ProjectExpander[] | undefined
    >();
    expectTypeOf<ProjectExpander['kinds']>().toEqualTypeOf<readonly string[]>();
    expectTypeOf<ProjectExpander['expand']>().parameter(0).toEqualTypeOf<ExpansionInput>();
    expectTypeOf<ProjectExpander['expand']>().returns.toEqualTypeOf<
      MaybePromise<ExpansionResult>
    >();
    expectTypeOf<ElementPatch['path']>().toEqualTypeOf<readonly (string | number)[]>();
    expectTypeOf<ElementPatch['value']>().toEqualTypeOf<Json>();
    const expander: ProjectExpander = {
      id: 'test.expander',
      kinds: ['test:book'],
      expand: async ({ elements }) => ({
        patches: elements
          .filter((element) => element.kind === 'test:block')
          .map((element) => ({
            elementId: element.id,
            path: ['events', 0],
            value: { actions: [] },
            origin: { elementId: 'test:book', pointer: '/rules/0' },
          })),
        problems: [],
      }),
    };
    const result = await expander.expand({
      elements: [
        {
          formatVersion: 1,
          id: 'test:a',
          kind: 'test:block',
          data: {},
          meta: { createdAt: '2026-11-14T00:00:00.000Z' },
        },
      ],
      target: testTarget,
    });
    expect(result.patches).toEqual([
      {
        elementId: 'test:a',
        path: ['events', 0],
        value: { actions: [] },
        origin: { elementId: 'test:book', pointer: '/rules/0' },
      },
    ]);
    // A 1.14.0-shaped contributions object without expanders stays assignable.
    const older: PluginContributions = { validators: [] };
    expect(older.projectExpanders).toBeUndefined();
  });

  it('keeps a 1.17.0-shaped JavaProjectInput assignable (commands and creative tabs are optional, 1.18.0)', () => {
    const input: JavaProjectInput = {
      modId: 'm',
      javaPackage: 'a.b',
      modClassName: 'M',
      blocks: [],
      items: [],
      entities: [],
      particles: [],
      geckolib: false,
    };
    expect(input.commands).toBeUndefined();
    expect(input.creativeTabs).toBeUndefined();
    const withBoth: JavaProjectInput = {
      ...input,
      commands: [{ id: 'ns:hello', path: 'msm/ns/command/hello.json', definition: {} }],
      creativeTabs: [{ id: 'ns:tab', path: 'msm/ns/creative_tab/tab.json', definition: {} }],
    };
    expect(withBoth.commands).toHaveLength(1);
    expect(withBoth.creativeTabs).toHaveLength(1);
    expectTypeOf<JavaProjectInput['commands']>().toEqualTypeOf<DefinitionInput[] | undefined>();
    expectTypeOf<JavaProjectInput['creativeTabs']>().toEqualTypeOf<DefinitionInput[] | undefined>();
  });

  it('keeps a 1.8.0-shaped JavaProjectInput assignable (potions is optional, 1.9.0)', () => {
    const input: JavaProjectInput = {
      modId: 'm',
      javaPackage: 'a.b',
      modClassName: 'M',
      blocks: [],
      items: [],
      entities: [],
      biomeAdditions: [],
      lootAdditions: [],
      geckolib: false,
    };
    expect(input.potions).toBeUndefined();
    const withPotions: JavaProjectInput = {
      ...input,
      potions: [{ id: 'ns:a', path: 'msm/ns/potion/a.json', definition: {} }],
    };
    expect(withPotions.potions).toHaveLength(1);
    expectTypeOf<JavaProjectInput['potions']>().toEqualTypeOf<DefinitionInput[] | undefined>();
  });

  it('keeps a 1.7.0-shaped JavaProjectInput assignable (additions are optional, 1.8.0)', () => {
    const input: JavaProjectInput = {
      modId: 'm',
      javaPackage: 'a.b',
      modClassName: 'M',
      blocks: [],
      items: [],
      entities: [],
      soundEvents: ['ns:key'],
      geckolib: false,
    };
    expect(input.biomeAdditions).toBeUndefined();
    expect(input.lootAdditions).toBeUndefined();
    const withAdditions: JavaProjectInput = {
      ...input,
      biomeAdditions: [{ id: 'ns:a', path: 'msm/ns/biome_addition/a.json', definition: {} }],
      lootAdditions: [{ id: 'ns:b', path: 'msm/ns/loot_addition/b.json', definition: {} }],
    };
    expect(withAdditions.biomeAdditions).toHaveLength(1);
    expect(withAdditions.lootAdditions).toHaveLength(1);
  });

  it('keeps a 1.6.0-shaped JavaProjectInput assignable (soundEvents is optional, 1.7.0)', () => {
    const input: JavaProjectInput = {
      modId: 'm',
      javaPackage: 'a.b',
      modClassName: 'M',
      blocks: [],
      items: [],
      entities: [],
      geckolib: false,
    };
    expect(input.soundEvents).toBeUndefined();
    const withSounds: JavaProjectInput = { ...input, soundEvents: ['ns:key'] };
    expect(withSounds.soundEvents).toEqual(['ns:key']);
  });

  it('keeps a 1.5.0-shaped JavaProjectInput assignable (effects is optional, 1.6.0)', () => {
    const legacy = {
      modId: 'm',
      javaPackage: 'p',
      modClassName: 'M',
      blocks: [],
      items: [],
      entities: [],
      geckolib: false,
    } satisfies JavaProjectInput;
    const withEffects: JavaProjectInput = { ...legacy, effects: [] };
    expect(legacy).not.toHaveProperty('effects');
    expect(withEffects.effects).toEqual([]);
  });

  it('accepts a pure generator', () => {
    const generator: JavaProjectGenerator = {
      generate: (input) => [{ path: `src/main/java/${input.modClassName}.java`, contents: '' }],
    };
    expectTypeOf(generator.generate).returns.toEqualTypeOf<GeneratedFile[]>();
  });
});

describe('1.0.0 additions', () => {
  it('splits target facts from target hooks', () => {
    expectTypeOf<Target>().toExtend<TargetFacts>();
    expectTypeOf<TargetFacts>().not.toHaveProperty('migrateFrom');
    expectTypeOf<TargetFacts>().not.toHaveProperty('javaProject');
    expectTypeOf<TargetFacts['channel']>().toEqualTypeOf<TargetChannel>();
    expectTypeOf<TargetChannel>().toEqualTypeOf<'release' | 'snapshot'>();
    expectTypeOf<Target['migrateFrom']>().toEqualTypeOf<
      ((previous: Target, project: Project) => MigrationReport) | undefined
    >();
    const target: Target = { ...testTarget, migrateFrom: () => ({ changes: [], problems: [] }) };
    const facts: TargetFacts = target;
    expect(facts.channel).toBe('release');
  });

  it('gives plugin-facing functions the target facts', () => {
    expectTypeOf<ElementKind['lower']>().parameter(1).toEqualTypeOf<TargetFacts>();
    expectTypeOf<ExporterInput['target']>().toEqualTypeOf<Target>();
  });

  it('accepts kinds and validators that return Promises', async () => {
    expectTypeOf<MaybePromise<number>>().toEqualTypeOf<number | Promise<number>>();
    expectTypeOf<ElementKind['lower']>().returns.toEqualTypeOf<MaybePromise<OutputFile[]>>();
    const kind: ElementKind = {
      id: 'example:async',
      schema: '::example::Async',
      folder: 'async',
      lower: async (element, target) => [
        { path: `${target.id}/${element.id}.json`, contents: element.data, layer: 'datapack' },
      ],
    };
    const validator: ProjectValidator = {
      id: 'example.async',
      kinds: ['example:async'],
      validate: async () => [],
    };
    const element: Element = {
      formatVersion: 1,
      id: 'example:a',
      kind: 'example:async',
      data: {},
      meta: { createdAt: '2026-11-05T00:00:00.000Z' },
    };
    expect(await kind.lower(element, testTarget)).toEqual([
      { path: 'mc-test/example:a.json', contents: {}, layer: 'datapack' },
    ]);
    expect(
      await validator.validate({
        elements: [element],
        target: testTarget,
        registry: { has: () => false, ids: () => [] },
      }),
    ).toEqual([]);
  });

  it('adds optional data and kind to migration changes', () => {
    expectTypeOf<MigrationChange['data']>().toEqualTypeOf<Json | undefined>();
    expectTypeOf<MigrationChange['kind']>().toEqualTypeOf<'update' | 'remove' | undefined>();
    const change: MigrationChange = {
      elementId: 'example:a',
      description: 'Replaced a removed id.',
      kind: 'update',
      data: { a: 1 },
    };
    expectTypeOf(change).toEqualTypeOf<MigrationChange>();
  });
  it('types lazy search data on contributions (1.23.0)', async () => {
    expectTypeOf<NonNullable<PluginContributions['searchData']>>().returns.toEqualTypeOf<
      MaybePromise<PluginSearchData>
    >();
    expectTypeOf<SearchWordGroup['misspellings']>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<SearchBehaviour['flows']>().toEqualTypeOf<string[] | undefined>();
    expectTypeOf<SearchBehaviour['appliesTo']>().toEqualTypeOf<
      ('item' | 'block' | 'mob' | 'vehicle')[]
    >();
    expectTypeOf<SearchEntryContribution['opens']['type']>().toEqualTypeOf<
      'starter' | 'template' | 'example' | 'kind' | 'command'
    >();
    expectTypeOf<SearchQuestionHint['role']>().toEqualTypeOf<
      'name' | 'main-colour' | 'main-number' | undefined
    >();
    const data: PluginSearchData = {
      vocabulary: { words: [{ idea: 'sword', same: ['blade'] }], colours: [] },
      behaviours: [],
      entries: [],
      keywords: { ruby_block: ['gem block'] },
      questions: { weapon: { name: { role: 'name' } } },
    };
    const contributions: PluginContributions = { searchData: async () => data };
    expect(await contributions.searchData?.()).toBe(data);
    // A 1.22.0-shaped contributions object without search data stays assignable.
    const older: PluginContributions = { commands: [] };
    expect(older.searchData).toBeUndefined();
  });
  it('types the lazily loaded Java generator on a target (1.24.0)', async () => {
    expectTypeOf<Target['loadJavaProject']>().toEqualTypeOf<
      (() => Promise<JavaProjectGenerator>) | undefined
    >();
    expectTypeOf<TargetFacts>().not.toHaveProperty('loadJavaProject');
    // The generator itself keeps its synchronous shape.
    expectTypeOf<JavaProjectGenerator['generate']>().returns.toEqualTypeOf<GeneratedFile[]>();
    const generator: JavaProjectGenerator = { generate: () => [] };
    const target: Target = { ...testTarget, loadJavaProject: async () => generator };
    expect(await target.loadJavaProject?.()).toBe(generator);
    // A 1.23.0-shaped target with a synchronous generator only stays assignable.
    const older: Target = { ...testTarget, javaProject: generator };
    expect(older.loadJavaProject).toBeUndefined();
  });
  it('types the dye colour values on target facts (1.25.0)', () => {
    expectTypeOf<TargetFacts['dyes']>().toEqualTypeOf<
      Readonly<Record<string, string>> | undefined
    >();
    const facts: TargetFacts = { ...testTarget, dyes: { white: '#f9fffe', black: '#1d1d21' } };
    expect(facts.dyes?.white).toBe('#f9fffe');
    // A 1.24.0-shaped target without the values stays assignable.
    const older: TargetFacts = { ...testTarget };
    expect(older.dyes).toBeUndefined();
  });
  it('names the Rules and game kit line forms (1.26.0)', () => {
    const names: CommandFormName[] = [
      'if_entity',
      'if_score_run',
      'set_world_spawn',
      'spawn_point',
      'set_fire',
      'run_function',
      'in_run',
      'as_at_if_predicate_run',
      'if_score_if_score_run',
      'score_remove',
      'teleport',
      'dialog_show',
    ];
    const forms: Partial<Record<CommandFormName, string>> = {
      if_entity: 'execute if entity <entities>',
      teleport: 'tp <entities> <x> <y> <z>',
    };
    expect(names).toHaveLength(12);
    expect(forms.teleport).toBe('tp <entities> <x> <y> <z>');
  });
  it('adds the community game types: starters, criteria, rules, forms (1.27.0)', () => {
    expectTypeOf<ProjectStarter['game']>().toEqualTypeOf<StarterGameInfo | undefined>();
    expectTypeOf<GameCategory>().toEqualTypeOf<
      | 'survival'
      | 'battle'
      | 'team'
      | 'minigame'
      | 'party'
      | 'chase'
      | 'creative'
      | 'course'
      | 'economy'
    >();
    const game: StarterGameInfo = { category: 'chase', players: [2, 10] };
    expect(game.players[0]).toBe(2);
    expectTypeOf<ScoreboardFacts['teamCriteria']>().toEqualTypeOf<readonly string[] | undefined>();
    expectTypeOf<ScoreboardFacts['customStatCriteria']>().toEqualTypeOf<
      readonly string[] | undefined
    >();
    expectTypeOf<GameRuleFacts['forGames']>().toEqualTypeOf<readonly string[] | undefined>();
    expectTypeOf<CommandFacts['fragments']>().toEqualTypeOf<
      Readonly<Record<CommandFragmentName, string>> | undefined
    >();
    expectTypeOf<TargetFacts['dataForms']>().toEqualTypeOf<
      Readonly<Record<DataFormName, Json>> | undefined
    >();
    const names: CommandFormName[] = [
      'attribute_base_set',
      'attribute_modifier_add',
      'trigger_set',
      'time_query_gametime',
      'function_with_storage',
      'on_attacker_run',
      'if_items_run',
      'score_operation',
      'item_modify_entity',
      'clear',
      'fill',
      'summon_trader',
    ];
    expect(names).toHaveLength(12);
    // Older targets, and the test target, leave every 1.27.0 fact out.
    const older: TargetFacts = { ...testTarget };
    expect(older.dataForms).toBeUndefined();
    expect(older.scoreboard?.teamCriteria).toBeUndefined();
  });

  it('adds change sets and migration detail (1.29.0)', () => {
    expectTypeOf<Target['previous']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<TargetFacts['changes']>().toEqualTypeOf<TargetChangeSet | undefined>();
    expectTypeOf<TargetChangeSet['changes']>().toEqualTypeOf<TargetChange[]>();
    expectTypeOf<TargetChange['candidate']>().toEqualTypeOf<TargetChangeCandidate | undefined>();
    expectTypeOf<MigrationChange['details']>().toEqualTypeOf<MigrationDetail[] | undefined>();
    expectTypeOf<MigrationReport['inGameChecks']>().toEqualTypeOf<
      MigrationInGameCheck[] | undefined
    >();
    expectTypeOf<MigrationReport['reverses']>().toEqualTypeOf<MigrationReverse[] | undefined>();
    expectTypeOf<MigrationDetailOp>().toEqualTypeOf<'rename-id' | 'drop' | 'move' | 'set'>();
    expectTypeOf<TargetChangeHandling>().toEqualTypeOf<'auto' | 'manual' | 'none'>();
    expectTypeOf<TargetChangeArea>().toEqualTypeOf<
      | 'ids'
      | 'formats'
      | 'commands'
      | 'block-states'
      | 'packs'
      | 'players'
      | 'java'
      | 'vanilla-files'
    >();
    expectTypeOf<TargetChangeSource>().toEqualTypeOf<
      'registries' | 'mcdoc' | 'commands' | 'blocks' | 'version' | 'mcmeta-trees' | 'curated'
    >();
    expectTypeOf<'field-addedRequired'>().toExtend<TargetChangeWhat>();
    expectTypeOf<'file-changed'>().toExtend<TargetChangeWhat>();
    expectTypeOf<TargetChangeCandidate['shape']>().toEqualTypeOf<
      'same' | 'superset' | 'subset' | 'similar' | 'differs' | 'none'
    >();

    const set: TargetChangeSet = {
      from: 'mc-<older>',
      to: 'mc-<newer>',
      refs: {
        from: { mcdoc: 'a'.repeat(40), mcmeta: '<older>' },
        to: { mcdoc: 'b'.repeat(40), mcmeta: '<newer>' },
      },
      changes: [
        {
          id: 'formats:minecraft:resource/worldgen/noise_settings#/default_block',
          area: 'formats',
          what: 'field-removed',
          registry: 'minecraft:resource',
          subject: 'minecraft:resource/worldgen/noise_settings',
          field: '/default_block',
          handling: 'auto',
          source: 'mcdoc',
          inGameCheck: 'Walk in a world made with the mod and look at the ground.',
        },
        {
          id: 'ids:worldgen/feature/old_name',
          area: 'ids',
          what: 'member-removed',
          registry: 'minecraft:worldgen/feature',
          subject: 'minecraft:old_name',
          stillIn: [],
          handling: 'manual',
          source: 'registries',
          candidate: { kind: 'rename', to: 'minecraft:new_name', name: 0.8, shape: 'superset' },
        },
      ],
      additions: { 'ids:block': 3 },
    };
    // The set is plain data: it survives a structured clone (the host posts it to a worker).
    expect(structuredClone(set)).toEqual(set);
    const facts: TargetFacts = { ...testTarget, changes: set };
    expect(facts.changes?.changes).toHaveLength(2);

    const report: MigrationReport = {
      changes: [
        {
          elementId: 'demo:land',
          description: 'Removed the default block.',
          kind: 'update',
          data: { sea_level: 63 },
          details: [
            {
              op: 'drop',
              path: '/default_block',
              before: { Name: 'minecraft:stone' },
              changeId: set.changes[0]?.id ?? '',
            },
            { op: 'move', from: '/a', path: '/b/a', before: 1, after: 1, changeId: 'x' },
          ],
        },
      ],
      problems: [],
      inGameChecks: [
        {
          changeId: set.changes[0]?.id ?? '',
          check: 'Look at the ground.',
          elementIds: ['demo:land'],
        },
      ],
      reverses: [
        {
          elementId: 'demo:land',
          path: '/default_block',
          value: { Name: 'minecraft:stone' },
          afterHash: 'h',
        },
      ],
    };
    expect(report.reverses?.[0]?.path).toBe('/default_block');
    // A hook written against an older API returns a report without any 1.29.0 field.
    const older: MigrationReport = {
      changes: [{ elementId: 'demo:x', description: 'd' }],
      problems: [],
    };
    expect(older.inGameChecks).toBeUndefined();
    expect(older.changes[0]?.details).toBeUndefined();
    // The test target has neither a previous target nor a change set.
    expect((testTarget as Target).previous).toBeUndefined();
    expect(testTarget.changes).toBeUndefined();
  });

  it('adds the vanilla files that changed (1.30.0)', () => {
    expectTypeOf<TargetChangeSet['vanillaFiles']>().toEqualTypeOf<VanillaFileChanges | undefined>();
    expectTypeOf<VanillaFileChanges['moved']>().toEqualTypeOf<Record<string, string>>();
    const files: VanillaFileChanges = {
      from: 'mc-1.0',
      to: 'mc-2.0',
      refs: { from: '1.0', to: '2.0' },
      leftOut: ['data/<namespace>/structure/<path>.nbt'],
      added: ['data/minecraft/recipe/new_block.json'],
      removed: [],
      moved: { 'assets/minecraft/textures/gui/a.png': 'assets/minecraft/textures/gui/b.png' },
      changed: ['data/minecraft/loot_table/chests/simple_dungeon.json'],
    };
    const set: TargetChangeSet = {
      from: 'mc-1.0',
      to: 'mc-2.0',
      refs: { from: { mcdoc: 'a', mcmeta: '1.0' }, to: { mcdoc: 'b', mcmeta: '2.0' } },
      changes: [],
      additions: {},
      vanillaFiles: files,
    };
    expect(set.vanillaFiles?.changed).toHaveLength(1);
    // A set written against 1.29.0 has no file list.
    const older: TargetChangeSet = { ...set };
    delete older.vanillaFiles;
    expect(older.vanillaFiles).toBeUndefined();
  });
});
