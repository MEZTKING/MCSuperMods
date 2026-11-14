/**
 * The 26.3 Java generator for portal blocks (ADR 0077 D9): goldens of the runtime's GameTest
 * portals (`block-portal_*`, copied from `engine-mod/src/gametest/resources/msm/msm_test/block/`
 * into `test/fixtures/java-project/input/`), the shared classes compared line by line with the
 * runtime's (`engine-mod/src/main/java/dev/mcsupermods/runtime/registry/portal/` and
 * `registry/types/MsmPortalBlock.java`), the generated block classes, `ModBlocks`, the mod
 * initialiser and the `light_portal` action, and the stricter cases that fail generation.
 * `UPDATE_GOLDENS=1` rewrites `test/fixtures/java-project/expected/portals/`.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DefinitionInput, GeneratedFile, JavaProjectInput, JsonObject } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { generateJavaProject } from '../src/java-project/index';
import { OPTION_PARTICLES } from '../src/java-project/portals';

const update = process.env.UPDATE_GOLDENS === '1';
const here = dirname(fileURLToPath(import.meta.url));
const inputRoot = join(here, 'fixtures', 'java-project', 'input');
const expectedRoot = join(here, 'fixtures', 'java-project', 'expected');
const runtimeRoot = join(
  here,
  '../../../../engine-mod/src/main/java/dev/mcsupermods/runtime/registry',
);

/** The GameTest portals that generate (the `portal_bad_*` ones fail, below). */
const PORTALS = [
  'portal_basic',
  'portal_beacon',
  'portal_clash_a',
  'portal_clash_b',
  'portal_frame',
  'portal_quiet',
  'portal_tag',
  'portal_travel_linked',
  'portal_travel_missing',
  'portal_travel_nether',
  'portal_travel_players',
  'portal_travel_radius',
  'portal_travel_scaled',
  'portal_travel_surface',
  'portal_travel_surface_nether',
  'portal_with_item',
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

function input(blocks: DefinitionInput[], items: DefinitionInput[] = []): JavaProjectInput {
  return {
    modId: 'msm_test',
    javaPackage: 'msm_test',
    modClassName: 'MsmTestMod',
    blocks,
    items,
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
  ['BlockType.PortalSound', 'PortalSpec.Sound'],
  ['BlockType.PortalParticles', 'PortalSpec.Particles'],
  ['BlockType.PortalArrival', 'PortalSpec.Arrival'],
  ['BlockType.IdOrTag', 'PortalSpec.IdOrTag'],
  ['BlockType.Portal', 'PortalSpec'],
  ['MsmPortalBlock', 'PortalBlock'],
  ['block.driver().id()', 'block.id()'],
  ['MsmRuntime.', ''],
];

/**
 * The deliberate differences of a copy beyond the renames, as replacements of the runtime's text
 * (each must match): the index's saved form uses vanilla's `fieldOf` (`MsmCodecs` is not
 * ejected), the attachment and travel log through their own logger, `on_travel` is the block's
 * `onTravel`, and the portal block takes a `PortalSpec` and has no behaviour driver (the
 * generated subclass adds the triggers).
 */
const DIFFERENCES: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  PortalIndex: [
    [
      'MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(',
      'RecordCodecBuilder.create(i -> i.group(',
    ],
    ['MsmCodecs.required("block", Identifier.CODEC)', 'Identifier.CODEC.fieldOf("block")'],
    ['MsmCodecs.required("min", BlockPos.CODEC)', 'BlockPos.CODEC.fieldOf("min")'],
    ['MsmCodecs.required("axis", Direction.Axis.CODEC.validate(', 'Direction.Axis.CODEC.validate('],
    [
      ': DataResult.success(a))).forGetter(Entry::axis),',
      ': DataResult.success(a)).fieldOf("axis").forGetter(Entry::axis),',
    ],
    [
      'MsmCodecs.required("width", Codec.intRange(PortalFrame.MIN_WIDTH, PortalFrame.MAX_WIDTH))',
      'Codec.intRange(PortalFrame.MIN_WIDTH, PortalFrame.MAX_WIDTH).fieldOf("width")',
    ],
    [
      'MsmCodecs.required("height", Codec.intRange(PortalFrame.MIN_HEIGHT, PortalFrame.MAX_HEIGHT))',
      'Codec.intRange(PortalFrame.MIN_HEIGHT, PortalFrame.MAX_HEIGHT).fieldOf("height")',
    ],
    [
      '.apply(i, Entry::new)), List.of("block", "min", "axis", "width", "height"));',
      '.apply(i, Entry::new));',
    ],
  ],
  PortalIndexAttachment: [
    [
      `public final class PortalIndexAttachment {
`,
      `public final class PortalIndexAttachment {
    private static final String MOD_ID = "msm_test";
    private static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
`,
    ],
  ],
  PortalTravel: [
    [
      `public final class PortalTravel {
`,
      `public final class PortalTravel {
    private static final String MOD_ID = "msm_test";
    private static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
`,
    ],
    [
      `                EventRunner.fire(block.id(), block.driver().definition().events(), portal.onTravel().get(),
                        EventContext.forBlockActor(arrivedLevel, arrived.blockPosition(), arrived));`,
      '                block.onTravel(arrivedLevel, arrived);',
    ],
  ],
  PortalBlock: [
    [
      'public class PortalBlock extends Block implements Portal, DrivenBlock {',
      'public class PortalBlock extends Block implements Portal {',
    ],
    [
      `    private final BlockBehaviourDriver driver;
`,
      '',
    ],
    [
      `    public PortalBlock(Identifier id, BlockDefinition definition, Properties properties) {
        super(properties);
        this.driver = new BlockBehaviourDriver(id, definition);
        this.portal = (PortalSpec) definition.typeFields();`,
      `    public PortalBlock(PortalSpec portal, Properties properties) {
        super(properties);
        this.portal = portal;`,
    ],
    [
      `    @Override
    public BlockBehaviourDriver driver() {
        return driver;
    }`,
      `    /** The block's registry id. */
    public Identifier id() {
        return BuiltInRegistries.BLOCK.getKey(this);
    }

    /**
     * {@code on_travel}: called by {@link PortalTravel} after arrival with the arrived entity; a generated portal block
     * with {@code on_travel} fires its event here.
     */
    protected void onTravel(ServerLevel level, Entity arrived) {}`,
    ],
    [
      `        driver.entityInside(level, pos, entity);
`,
      '',
    ],
    [
      `

    // Triggers allowed on a portal (ADR 0077 D1): delegated to the driver after vanilla's own behaviour.

    @Override
    public BlockState playerWillDestroy(Level level, BlockPos pos, BlockState state, Player player) {
        driver.playerWillDestroy(level, pos, player);
        return super.playerWillDestroy(level, pos, state, player);
    }

    @Override
    public void setPlacedBy(Level level, BlockPos pos, BlockState state, LivingEntity placer, ItemStack stack) {
        super.setPlacedBy(level, pos, state, placer, stack);
        driver.setPlacedBy(level, pos, placer);
    }

    @Override
    protected void randomTick(BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        super.randomTick(state, level, pos, random);
        driver.randomTick(level, pos, random);
    }
`,
      `
`,
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
  ['portal/PortalFrame.java', 'portal/PortalFrame.java'],
  ['portal/ExitPortals.java', 'portal/ExitPortals.java'],
  ['portal/PortalIndex.java', 'portal/PortalIndex.java'],
  ['portal/PortalIndexAttachment.java', 'portal/PortalIndexAttachment.java'],
  ['portal/PortalLighting.java', 'portal/PortalLighting.java'],
  ['portal/PortalTravel.java', 'portal/PortalTravel.java'],
  ['types/MsmPortalBlock.java', 'portal/PortalBlock.java'],
];

const PORTAL = {
  format: 1,
  type: 'portal',
  frame: 'minecraft:obsidian',
  destination: 'minecraft:the_end',
};

describe('Java generator: portals (mc-26.3)', () => {
  it('generates every portal as the runtime does (ADR 0077 D9)', async () => {
    const { files } = generateJavaProject(input(await Promise.all(PORTALS.map(block))));
    const shared = files.filter((f) => f.path.includes('/portal/')).map((f) => f.path);
    expect(shared).toEqual(
      [
        'ExitPortals',
        'PortalBlock',
        'PortalFrame',
        'PortalIndex',
        'PortalIndexAttachment',
        'PortalLighting',
        'PortalSpec',
        'PortalTravel',
      ].map((name) => `src/main/java/msm_test/portal/${name}.java`),
    );
    // The mod initialiser: the attachment, the igniter callback and the levels check, last.
    const mod = text(files, '/MsmTestMod.java');
    expect(mod).toContain(
      '        ModBlocks.register();\n        // Portals (ADR 0077): the level attachment msm_test:portals',
    );
    expect(mod).toContain('PortalIndexAttachment.register();\n        PortalLighting.register();');
    expect(mod).toContain(
      'ServerLifecycleEvents.SERVER_STARTED.register(server -> PortalTravel.checkLevels(server)',
    );
    expect(mod).toContain('import msm_test.portal.PortalTravel;');
    // ModBlocks: the runtime's defaults and properties, no item unless written, each portal added.
    const blocks = text(files, '/ModBlocks.java');
    expect(blocks).toContain(
      'public static final PortalBasicBlock PORTAL_BASIC = Registry.register(BuiltInRegistries.BLOCK, PORTAL_BASIC_KEY, new PortalBasicBlock(BlockBehaviour.Properties.of()\n' +
        '            .setId(PORTAL_BASIC_KEY)\n' +
        '            .strength(-1.0f, 0.0f)\n' +
        '            .sound(SoundType.GLASS)\n' +
        '            .lightLevel(state -> 11)\n' +
        "            .noCollision().pushReaction(PushReaction.IMMOVEABLE) // portal: as vanilla's Nether portal\n" +
        '            .noLootTable())); // portal: drops nothing unless loot_table is set',
    );
    expect(blocks).not.toContain('PORTAL_BASIC_ITEM');
    expect(blocks).toContain('PORTAL_WITH_ITEM_ITEM = Registry.register(');
    expect(blocks).toContain(
      'Optional.of(ResourceKey.create(Registries.LOOT_TABLE, Identifier.fromNamespaceAndPath("minecraft", "blocks/glass"))))));',
    );
    expect(blocks).toContain('.lightLevel(state -> 15)');
    expect(blocks).toContain(
      'PortalLighting.add(PORTAL_BASIC); // portal: tried by the igniter callback in sorted id order (ADR 0077 D3)',
    );
    // portal_frame is a plain block; portal_beacon fires light_portal.
    expect(blocks).not.toContain('PortalLighting.add(PORTAL_FRAME)');
    expect(text(files, '/block/PortalBeaconBlock.java')).toContain(
      'PortalLighting.byId(Identifier.fromNamespaceAndPath("msm_test", "portal_quiet")).ifPresent(portal -> PortalLighting.lightNear(level, portal, base));',
    );
    // Block classes: a PortalSpec with the defaults applied.
    const basic = text(files, '/block/PortalBasicBlock.java');
    expect(basic).toContain('public class PortalBasicBlock extends PortalBlock {');
    expect(basic).toContain('super(SPEC, properties);');
    expect(basic).toContain(
      'new PortalSpec.IdOrTag(Identifier.fromNamespaceAndPath("minecraft", "flint_and_steel"), false)',
    );
    expect(basic).toContain(
      'Identifier.fromNamespaceAndPath("minecraft", "the_nether"), Identifier.fromNamespaceAndPath("minecraft", "overworld"), // destination, return_to',
    );
    expect(basic).toContain(
      'new PortalSpec.Travel(Optional.empty(), PortalSpec.Arrival.PORTAL, Optional.empty(), Optional.empty(),\n                    false, true)',
    );
    expect(basic).toContain('new PortalSpec.Particles(Optional.empty(), Optional.empty(), 4)');
    expect(basic).not.toContain('onTravel');
    const tag = text(files, '/block/PortalTagBlock.java');
    expect(tag).toContain(
      'new PortalSpec.IdOrTag(Identifier.fromNamespaceAndPath("minecraft", "beacon_base_blocks"), true), // frame',
    );
    expect(tag).toContain(
      'Optional.of(Identifier.fromNamespaceAndPath("minecraft", "gold_block")), // frame_block (the frame block unless written)',
    );
    expect(tag).toContain(
      'Optional.of(new PortalSpec.IdOrTag(Identifier.fromNamespaceAndPath("minecraft", "creeper_igniters"), true)), // igniter',
    );
    const quiet = text(files, '/block/PortalQuietBlock.java');
    expect(quiet).toContain('        Optional.empty(), // igniter');
    expect(quiet).toContain(
      'new PortalSpec.Sounds(new PortalSpec.Sound(true, Optional.empty()), new PortalSpec.Sound(true, Optional.empty()))',
    );
    expect(quiet).toContain(
      'PortalSpec.Arrival.PORTAL, Optional.of(7), Optional.empty(),\n                    true, false)',
    );
    expect(quiet).toContain('new PortalSpec.Particles(Optional.empty(), Optional.of(5636010), 2)');
    expect(text(files, '/block/PortalTravelScaledBlock.java')).toContain(
      'new PortalSpec.Travel(Optional.of(4.0), PortalSpec.Arrival.PORTAL,',
    );
    expect(text(files, '/block/PortalTravelSurfaceBlock.java')).toContain(
      'PortalSpec.Arrival.SURFACE',
    );
    expect(text(files, '/block/PortalTravelPlayersBlock.java')).toContain(
      'new PortalSpec.Sound(false, Optional.of(Identifier.fromNamespaceAndPath("msm_test", "chime")))',
    );
    // on_travel: the arrived entity is the actor; run_function runs as it.
    const nether = text(files, '/block/PortalTravelNetherBlock.java');
    expect(nether).toContain(
      'Optional.of(Identifier.fromNamespaceAndPath("msm_test", "arrived"))); // on_travel',
    );
    expect(nether).toContain('protected void onTravel(ServerLevel level, Entity arrived) {');
    expect(nether).toContain(
      'event_arrived(level, pos, Vec3.atCenterOf(pos), player, player == null ? arrived : null, 1);',
    );
    expect(nether).toContain(
      'Actions.runFunction(OWNER, level, origin, player != null ? player : entity, "msm_test:portal/arrived");',
    );
    await golden('portals', files);
  });

  it.each(COPIES)('copies %s line by line', async (runtimePath, ejectPath) => {
    const { files } = generateJavaProject(input([await block('portal_basic')]));
    const ejected = text(files, `/${ejectPath}`);
    const name = ejectPath.slice(ejectPath.indexOf('/') + 1, -'.java'.length);
    expect(ejected.startsWith('// Generated by MCSuperMods: copied from msm_runtime')).toBe(true);
    expect(code(ejected)).toEqual(code(await runtimeAsEjected(runtimePath, name)));
  });

  it('gives a portal the triggers it may carry after its own behaviour', () => {
    const { files } = generateJavaProject(
      input([
        inline('busy_portal', {
          ...PORTAL,
          components: {
            'msm:breakable': { hardness: 2 },
            'msm:on_break': { event: 'msm_test:e' },
            'msm:on_place': { event: 'msm_test:e' },
            'msm:on_random_tick': { event: 'msm_test:e' },
            'msm:on_entity_inside': { event: 'msm_test:e' },
          },
          events: {
            'msm_test:e': {
              actions: [{ type: 'play_sound', sound: 'minecraft:block.glass.break' }],
            },
          },
        }),
      ]),
    );
    const busy = text(files, '/block/BusyPortalBlock.java');
    expect(busy).toContain(
      '    super.entityInside(state, level, pos, entity, effects, intersects);',
    );
    expect(busy).toContain('    super.randomTick(state, level, pos, random);');
    expect(busy).toContain('    return super.playerWillDestroy(level, pos, state, player);');
    expect(busy).toContain('    super.setPlacedBy(level, pos, state, placer, stack);');
    const blocks = text(files, '/ModBlocks.java');
    // A partial msm:breakable takes the component's defaults, as the runtime's Codec.
    expect(blocks).toContain('.strength(2.0f, 6.0f)');
    expect(blocks).toContain('.randomTicks())); // msm:on_random_tick');
  });

  it('fails where the runtime reports a load error', async () => {
    const generate = (blocks: DefinitionInput[]) => () => generateJavaProject(input(blocks));
    expect(generate([await block('portal_bad_component')])).toThrow(
      /msm:on_interact is not allowed on type 'portal'/,
    );
    expect(generate([await block('portal_bad_particle')])).toThrow(
      /type minecraft:dust is not a particle type without options/,
    );
    expect(generate([await block('portal_bad_tag_frame')])).toThrow(
      /frame_block is needed when frame is a tag \(#minecraft:wool\)/,
    );
    expect(generate([await block('portal_frame'), await block('portal_bad_light')])).toThrow(
      /light_portal names msm_test:portal_frame, which is not a portal block of the project/,
    );
    expect(generate([inline('p', { ...PORTAL, on_travel: 'msm_test:nope' })])).toThrow(
      /on_travel names event msm_test:nope, which is not declared in events/,
    );
    expect(
      generate([inline('p', { ...PORTAL, particles: { type: 'minecraft:flame', color: 1 } })]),
    ).toThrow(/color applies only to minecraft:dust, not minecraft:flame/);
    expect(generate([inline('p', { ...PORTAL, particles: { type: 'minecraft:item' } })])).toThrow(
      /type minecraft:item is not a particle type without options/,
    );
    expect(generate([inline('p', { ...PORTAL, igniter: true })])).toThrow(
      /igniter must be an item id, an item #tag or false/,
    );
    expect(generate([inline('p', { ...PORTAL, travel: { speed: 2 } })])).toThrow(
      /unknown travel field 'speed'/,
    );
    expect(generate([inline('p', { ...PORTAL, travel: { scale: 0 } })])).toThrow(
      /scale must be 0.00001 to 30000000/,
    );
    expect(generate([inline('p', { ...PORTAL, exit_block: 'minecraft:stone' })])).toThrow(
      /unknown top-level key 'exit_block'/,
    );
    expect(generate([inline('p', { ...PORTAL, sounds: { travel: true } })])).toThrow(
      /travel must be a sound event id or false/,
    );
    // Dust with a colour, the reverse portal particle and a mod's particle are fine.
    expect(
      generate([inline('p', { ...PORTAL, particles: { type: 'minecraft:dust', color: 1 } })]),
    ).not.toThrow();
    expect(
      generate([inline('p', { ...PORTAL, particles: { type: 'minecraft:reverse_portal' } })]),
    ).not.toThrow();
  });

  it('keeps a block named portal clear of the shared class', () => {
    const { files } = generateJavaProject(
      input([
        inline('portal', { ...PORTAL }),
        inline('gate', { ...PORTAL, frame: 'minecraft:stone' }),
      ]),
    );
    expect(text(files, '/block/PortalBlock2.java')).toContain(
      'public class PortalBlock2 extends PortalBlock {',
    );
  });

  it('writes nothing new for projects without portals', () => {
    const { files } = generateJavaProject(
      input([inline('portal', { format: 1, type: 'horizontal' })]),
    );
    expect(files.some((f) => f.path.includes('/portal/'))).toBe(false);
    expect(files.some((f) => f.path.endsWith('/block/PortalBlock.java'))).toBe(true);
    expect(text(files, '/MsmTestMod.java')).not.toContain('Portal');
  });

  it('knows the particle types with options from the vendored registry', async () => {
    const registries = JSON.parse(
      await readFile(join(here, '..', 'vendor', 'mcmeta', 'registries.json'), 'utf8'),
    ) as Record<string, string[]>;
    const particles = new Set((registries.particle_type ?? []).map((id) => `minecraft:${id}`));
    for (const id of OPTION_PARTICLES) expect(particles.has(id), id).toBe(true);
    expect(particles.has('minecraft:portal')).toBe(true);
  });
});
