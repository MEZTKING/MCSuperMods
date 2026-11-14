/**
 * The 26.3 Java generator for particles (ADR 0080 D11): goldens of the runtime's GameTest
 * particles and particle blocks (`particle-*` and `block-*` copied from
 * `engine-mod/src/gametest/resources/msm/msm_test/` into `test/fixtures/java-project/input/`),
 * the copied classes compared line by line with the runtime's (`client/particle/MsmParticle`,
 * `MsmParticleProvider`, `ParticleLook`, `events/ParticleSpecs`, `registry/AmbientParticles`),
 * `ModParticles`, the client entrypoint, the spawn forms and `animateTick`, and the stricter
 * cases that fail generation. `UPDATE_GOLDENS=1` rewrites
 * `test/fixtures/java-project/expected/particles/`.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  DefinitionInput,
  GeneratedFile,
  JavaProjectInput,
  Json,
  JsonObject,
} from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { generateJavaProject } from '../src/java-project/index';
import { PARTICLE_OPTIONS } from '../src/java-project/particles';
import { OPTION_PARTICLES } from '../src/java-project/portals';

const update = process.env.UPDATE_GOLDENS === '1';
const here = dirname(fileURLToPath(import.meta.url));
const inputRoot = join(here, 'fixtures', 'java-project', 'input');
const expectedRoot = join(here, 'fixtures', 'java-project', 'expected');
const runtimeRoot = join(here, '../../../../engine-mod/src/main/java/dev/mcsupermods/runtime');

/** The GameTest particle types and the blocks that use particles (the `*_bad_*` ones fail, below). */
const PARTICLES = ['glimmer', 'spark'];
const BLOCKS = [
  'ambient_chance',
  'ambient_machine',
  'ambient_spark',
  'particle_spawner',
  'spark_block',
];

async function fixture(kind: string, path: string): Promise<DefinitionInput> {
  const json = JSON.parse(
    await readFile(join(inputRoot, `${kind}-${path}.json`), 'utf8'),
  ) as JsonObject;
  return { id: `msm_test:${path}`, path: `msm/msm_test/${kind}/${path}.json`, definition: json };
}

function inline(kind: string, path: string, definition: JsonObject): DefinitionInput {
  return { id: `msm_test:${path}`, path: `msm/msm_test/${kind}/${path}.json`, definition };
}

function input(
  blocks: DefinitionInput[],
  particles: DefinitionInput[] = [],
  items: DefinitionInput[] = [],
): JavaProjectInput {
  return {
    modId: 'msm_test',
    javaPackage: 'msm_test',
    modClassName: 'MsmTestMod',
    blocks,
    items,
    entities: [],
    ...(particles.length > 0 ? { particles } : {}),
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
  ['MsmParticleProvider', 'ModParticleProvider'],
  ['MsmParticle', 'ModParticle'],
  ['BlockComponents.AmbientParticles', 'AmbientParticles.Spec'],
  ['MsmRuntime.', ''],
];

const OWN_LOGGER = `    private static final String MOD_ID = "msm_test";
    private static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
`;

/**
 * The deliberate differences of a copy beyond the renames, as replacements of the runtime's text
 * (each must match): the particle drops the runtime's per-type counter (kept for its client
 * GameTest) and the provider its test accessor; both shared classes log through their own logger;
 * `ParticleSpecs` gains `Spec.parse` (the generated constants) and `spawn` (the runtime's
 * `EventRunner.spawnParticle`) and drops the start check (the generator checks options objects
 * instead); `AmbientParticles` holds the component as its own record.
 */
const DIFFERENCES: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  ModParticle: [
    [
      `    private static final Map<Identifier, AtomicInteger> CREATED = new ConcurrentHashMap<>();
`,
      '',
    ],
    [
      `        CREATED.computeIfAbsent(id, key -> new AtomicInteger()).incrementAndGet();
`,
      '',
    ],
    [
      `    public static int created(Identifier id) {
        AtomicInteger count = CREATED.get(id);
        return count == null ? 0 : count.get();
    }
`,
      '',
    ],
  ],
  ModParticleProvider: [
    [
      `public final class ModParticleProvider implements ParticleProvider<SimpleParticleType> {
`,
      `public final class ModParticleProvider implements ParticleProvider<SimpleParticleType> {
${OWN_LOGGER}`,
    ],
    [
      `    static boolean warned(Identifier id) {
        return WARNED.contains(id);
    }
`,
      '',
    ],
  ],
  ParticleSpecs: [
    [
      `public final class ParticleSpecs {
`,
      `public final class ParticleSpecs {
${OWN_LOGGER}`,
    ],
    [
      `            return options.map(JsonObject::toString).orElse(type.toString());
        }
`,
      `            return options.map(JsonObject::toString).orElse(type.toString());
        }

        public static Spec parse(String json) {
            return CODEC.parse(JsonOps.INSTANCE, JsonParser.parseString(json)).getOrThrow();
        }
`,
    ],
    [
      `    // Sending
`,
      `    // Sending

    public static void spawn(String owner, ServerLevel level, Vec3 origin, Spec spec, int count, double spread, double speed,
            Optional<Vec3> motion, boolean force) {
        Optional<ParticleOptions> particle = resolve(spec, level.registryAccess(), owner + ": spawn_particle");
        if (particle.isEmpty()) {
            return;
        }
        send(level, particle.get(), origin, count, spread, speed, motion, force);
    }
`,
    ],
  ],
  AmbientParticles: [
    [
      `    public record Spawn(double x, double y, double z, double xd, double yd, double zd) {}
`,
      `    public record Spawn(double x, double y, double z, double xd, double yd, double zd) {}

    public record Spec(ParticleSpecs.Spec particle, float chance, int count, List<Double> offset, List<Double> spread,
            List<Double> velocity, Map<String, String> states) {}
`,
    ],
  ],
};

/** Runtime sections a copy leaves out whole: from the first marker up to the second. */
const CUTS: Readonly<Record<string, readonly [string, string]>> = {
  ParticleSpecs: ['    // The start check (ADR 0080 D5, limit K11)\n', '    // Sending\n'],
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
  const cut = CUTS[ejected];
  if (cut !== undefined) {
    const start = source.indexOf(cut[0]);
    const end = source.indexOf(cut[1]);
    expect(start, `${ejected}: ${cut[0]}`).toBeGreaterThan(0);
    expect(end, `${ejected}: ${cut[1]}`).toBeGreaterThan(start);
    source = source.slice(0, start) + source.slice(end);
  }
  for (const [from, to] of RENAMES) source = source.replaceAll(from, to);
  for (const [from, to] of DIFFERENCES[ejected] ?? []) {
    expect(source, `${ejected}: ${from}`).toContain(from);
    source = source.replace(from, to);
  }
  return source;
}

/** Each copied class: runtime file, eject path. */
const COPIES: readonly (readonly [string, string])[] = [
  ['client/particle/MsmParticle.java', 'client/particle/ModParticle.java'],
  ['client/particle/MsmParticleProvider.java', 'client/particle/ModParticleProvider.java'],
  ['client/particle/ParticleLook.java', 'client/particle/ParticleLook.java'],
  ['events/ParticleSpecs.java', 'particle/ParticleSpecs.java'],
  ['registry/AmbientParticles.java', 'particle/AmbientParticles.java'],
];

/**
 * The GameTest blocks fire their events from the test itself; the eject writes a block class only
 * when a component reaches an event, so these two get an `msm:on_interact`.
 */
const INTERACT: Readonly<Record<string, string>> = {
  particle_spawner: 'msm_test:dust',
  spark_block: 'msm_test:sparkle',
};

async function project(): Promise<GeneratedFile[]> {
  const particles = await Promise.all(PARTICLES.map((p) => fixture('particle', p)));
  const blocks = await Promise.all(
    BLOCKS.map(async (b) => {
      const block = await fixture('block', b);
      const event = INTERACT[b];
      if (event === undefined) return block;
      const definition = { ...block.definition, components: { 'msm:on_interact': { event } } };
      return { ...block, definition };
    }),
  );
  return generateJavaProject(input(blocks, particles)).files;
}

describe('Java generator: particles (mc-26.3)', () => {
  it('generates the particle types, the spawn forms and ambient particles (ADR 0080 D11)', async () => {
    const files = await project();
    const paths = files.map((f) => f.path);
    for (const path of [
      'ModParticles',
      'particle/ParticleSpecs',
      'particle/AmbientParticles',
      'client/MsmTestModClient',
      'client/particle/ModParticle',
      'client/particle/ModParticleProvider',
      'client/particle/ParticleLook',
    ]) {
      expect(paths).toContain(`src/main/java/msm_test/${path}.java`);
    }
    // Registration: right after the sound events (none here), before the blocks.
    const mod = text(files, '/MsmTestMod.java');
    expect(mod).toContain('        ModParticles.register();\n        ModBlocks.register();');
    const types = text(files, '/ModParticles.java');
    expect(types).toContain(
      'public static final SimpleParticleType GLIMMER = particle(Identifier.fromNamespaceAndPath("msm_test", "glimmer"), true);',
    );
    expect(types).toContain(
      'public static final SimpleParticleType SPARK = particle(Identifier.fromNamespaceAndPath("msm_test", "spark"), false);',
    );
    expect(types).toContain(
      'return Registry.register(BuiltInRegistries.PARTICLE_TYPE, id, FabricParticleTypes.simple(alwaysShow));',
    );
    // The client: one provider per type with the definition's look.
    const client = text(files, '/client/MsmTestModClient.java');
    expect(client).toContain(
      'ParticleProviderRegistry particles = ParticleProviderRegistry.getInstance();',
    );
    expect(client).toContain(
      'particles.register(ModParticles.SPARK, ModParticleProvider.pending(Identifier.fromNamespaceAndPath("msm_test", "spark"), ParticleLook.Spec.resolve(\n' +
        '                null, null, 16, 24, // animation, frame_ticks, lifetime min and max\n' +
        '                null, null, -0.02f, null, null, // size, size_end, gravity, friction, collision\n' +
        '                null, null, null, ParticleLook.Fade.OUT, // color, color_end, alpha, fade\n' +
        '                true, null, null, null))); // emissive, translucent, spin, always_show',
    );
    expect(client).toContain(
      '                ParticleLook.Animation.RANDOM, null, null, null, // animation, frame_ticks, lifetime min and max',
    );
    expect(client).toContain(
      '                11206655, null, null, null, // color, color_end, alpha, fade',
    );
    expect(client).toContain(
      '                null, null, null, true))); // emissive, translucent, spin, always_show',
    );
    expect(client).toContain('import msm_test.client.particle.ModParticleProvider;');
    // spawn_particle: the forms through ParticleSpecs, constants parsed once.
    const spawner = text(files, '/block/ParticleSpawnerBlock.java');
    expect(spawner).toContain(
      'private static final ParticleSpecs.Spec PARTICLE_1 = ParticleSpecs.Spec.parse("{\\"block_state\\":\\"minecraft:stone\\",\\"type\\":\\"minecraft:block\\"}");',
    );
    expect(spawner).toContain(
      'ParticleSpecs.Spec.parse("{\\"color\\":16744448,\\"scale\\":1,\\"type\\":\\"minecraft:dust\\"}");',
    );
    expect(spawner).toContain(
      'ParticleSpecs.Spec.parse("{\\"item\\":{\\"id\\":\\"msm_test:fuel_gem\\"},\\"type\\":\\"minecraft:item\\"}");',
    );
    expect(spawner).toContain(
      'ParticleSpecs.Spec.of(Identifier.fromNamespaceAndPath("msm_test", "spark"));',
    );
    expect(spawner).toContain(
      'ParticleSpecs.spawn(OWNER, level, origin, PARTICLE_2, 3, 0.25f, 0.0f, Optional.empty(), false);',
    );
    expect(spawner).toContain('Optional.of(new Vec3(0.0, 0.25, -0.1)), false);');
    expect(spawner).toMatch(
      /ParticleSpecs\.spawn\(OWNER, level, origin, PARTICLE_\d+, 2, 0\.0f, 0\.0f, Optional\.empty\(\), true\);/,
    );
    // A plain id without motion or force keeps the Actions helper.
    expect(spawner).toContain(
      'Actions.spawnParticle(OWNER, level, origin, "minecraft:flame", 1000, 0.0f, 0.0f);',
    );
    expect(text(files, '/block/SparkBlock.java')).toContain(
      'Actions.spawnParticle(OWNER, level, origin, "msm_test:spark", 4, 0.25f, 0.0f);',
    );
    expect(text(files, '/block/SparkBlock.java')).not.toContain('ParticleSpecs');
    // msm:ambient_particles: the component as a constant, animateTick after vanilla's own.
    const ambient = text(files, '/block/AmbientSparkBlock.java');
    expect(ambient).toContain('public class AmbientSparkBlock extends Block {');
    expect(ambient).toContain(
      'private static final AmbientParticles.Spec AMBIENT = new AmbientParticles.Spec(ParticleSpecs.Spec.of(Identifier.fromNamespaceAndPath("msm_test", "spark")),\n' +
        '            1.0f, 3, List.of(0.5, 1.1, 0.5), List.of(0.25, 0.0, 0.25), List.of(0.0, 0.05, 0.0), // chance, count, offset, spread, velocity\n' +
        '            Map.of()); // states',
    );
    expect(ambient).toContain(
      '    public void animateTick(BlockState state, Level level, BlockPos pos, RandomSource random) {\n' +
        '        super.animateTick(state, level, pos, random);\n' +
        '        AmbientParticles.animate(AMBIENT_OWNER, AMBIENT, level, state, pos, random);\n' +
        '    }',
    );
    expect(text(files, '/block/AmbientChanceBlock.java')).toContain(
      '            0.3f, 2, List.of(0.5, 0.5, 0.5), List.of(0.5, 0.5, 0.5), List.of(0.0, 0.0, 0.0),',
    );
    // A machine keeps its own block entity class and gains animateTick with its lit state.
    const machine = text(files, '/block/AmbientMachineBlock.java');
    expect(machine).toContain('Map.of("lit", "true")); // states');
    expect(machine).toContain(
      'public static final BooleanProperty LIT = BlockStateProperties.LIT;',
    );
    // The ambient-only blocks register with their generated class.
    expect(text(files, '/ModBlocks.java')).toContain(
      'new AmbientSparkBlock(BlockBehaviour.Properties.of()',
    );
    await golden('particles', files);
  });

  it.each(COPIES)('copies %s line by line', async (runtimePath, ejectPath) => {
    const files = await project();
    const ejected = text(files, `/${ejectPath}`);
    const name = ejectPath.slice(ejectPath.lastIndexOf('/') + 1, -'.java'.length);
    expect(ejected.startsWith('// Generated by MCSuperMods: copied from msm_runtime')).toBe(true);
    expect(code(ejected)).toEqual(code(await runtimeAsEjected(runtimePath, name)));
  });

  it('fails where the runtime reports a load or start error, and more strictly', async () => {
    const generate =
      (blocks: DefinitionInput[], particles: DefinitionInput[] = []) =>
      () =>
        generateJavaProject(input(blocks, particles));
    const spawn = (action: JsonObject) =>
      generate([
        inline('block', 'b', {
          format: 1,
          components: { 'msm:on_interact': { event: 'msm_test:e' } },
          events: { 'msm_test:e': { actions: [{ type: 'spawn_particle', ...action }] } },
        }),
      ]);
    const ambient = (component: JsonObject) =>
      generate([
        inline('block', 'b', { format: 1, components: { 'msm:ambient_particles': component } }),
      ]);
    // The runtime's broken GameTest files.
    expect(generate([], [await fixture('particle', 'particle_bad_key')])).toThrow(
      /unknown top-level key 'velocity' cannot be ejected/,
    );
    expect(generate([], [await fixture('particle', 'particle_bad_lifetime')])).toThrow(
      /lifetime: max: 5 is below min 10/,
    );
    expect(generate([await fixture('block', 'particle_bad_options')])).toThrow(
      /color must be an integer colour or 3 numbers from 0 to 1/,
    );
    expect(generate([await fixture('block', 'particle_bad_count')])).toThrow(
      /count must be 1 to 1000/,
    );
    expect(generate([await fixture('block', 'particle_bad_ambient_portal')])).toThrow(
      /msm:ambient_particles is not allowed on type 'portal'/,
    );
    // Particle definitions.
    const particle = (definition: JsonObject) =>
      generate(
        [],
        [inline('particle', 'p', { format: 1, textures: ['minecraft:generic_0'], ...definition })],
      );
    expect(particle({ textures: [] })).toThrow(/textures must be a list of 1 to 64 sprite ids/);
    expect(particle({ animation: 'bounce' })).toThrow(/unknown animation 'bounce'/);
    expect(particle({ fade: 'in' })).toThrow(/unknown fade 'in'/);
    expect(particle({ size: 0 })).toThrow(/size must be 0.01 to 16/);
    expect(particle({ lifetime: 6001 })).toThrow(/lifetime must be 1 to 6000/);
    expect(particle({ lifetime: { min: 1, max: 2, avg: 1 } })).toThrow(
      /unknown lifetime field 'avg'/,
    );
    expect(particle({ color: 0x1000000 })).toThrow(/color must be 0 to 16777215/);
    expect(particle({ format: 2 })).toThrow(/format 2/);
    // spawn_particle.
    expect(spawn({ particle: 'minecraft:dust' })).toThrow(
      /particle: minecraft:dust is not a particle type without options/,
    );
    expect(spawn({ particle: 'block' })).toThrow(
      /particle: minecraft:block is not a particle type without options/,
    );
    expect(spawn({ particle: { color: 1, scale: 1 } })).toThrow(/type is missing/);
    expect(spawn({ particle: { type: 'minecraft:flame', speed: 1 } })).toThrow(
      /speed: unknown field \(particle type minecraft:flame takes no options\)/,
    );
    expect(spawn({ particle: { type: 'minecraft:dust', color: 1 } })).toThrow(
      /scale is missing \(particle type minecraft:dust needs it\)/,
    );
    expect(spawn({ particle: { type: 'minecraft:dust', color: 1, scale: 5 } })).toThrow(
      /scale must be 0.01 to 4/,
    );
    expect(spawn({ particle: { type: 'minecraft:dust', color: [1, 2, 0], scale: 1 } })).toThrow(
      /color must be an integer colour or 3 numbers from 0 to 1/,
    );
    expect(spawn({ particle: { type: 'minecraft:dust', colour: 1, scale: 1 } })).toThrow(
      /colour: unknown field \(particle type minecraft:dust takes color, scale\)/,
    );
    expect(
      spawn({
        particle: {
          type: 'minecraft:block',
          block_state: { Name: 'minecraft:furnace', Properties: { lit: 'true' } },
        },
      }),
    ).toThrow(/block_state must be a block id .*does not decode on 26.3/);
    expect(spawn({ particle: { type: 'minecraft:item', item: { count: 1 } } })).toThrow(
      /id is missing/,
    );
    expect(spawn({ particle: { type: 'minecraft:item', item: { id: 'x:y', size: 1 } } })).toThrow(
      /unknown item field 'size'/,
    );
    expect(spawn({ particle: 'minecraft:flame', motion: [0, 1] })).toThrow(
      /motion must be three numbers/,
    );
    expect(spawn({ particle: 'minecraft:flame', force: 'yes' })).toThrow(
      /force must be true or false/,
    );
    expect(spawn({ particle: 'minecraft:flame', spread: -1 })).toThrow(/spread must be at least 0/);
    expect(spawn({ particle: 'minecraft:flame', delay: 1 })).toThrow(
      /unknown spawn_particle field 'delay'/,
    );
    expect(spawn({ particle: 3 })).toThrow(/particle must be an object/);
    // msm:ambient_particles.
    expect(ambient({ particle: 'minecraft:flame', count: 17 })).toThrow(/count must be 1 to 16/);
    expect(ambient({ particle: 'minecraft:flame', chance: 2 })).toThrow(/chance must be 0 to 1/);
    expect(ambient({ particle: 'minecraft:flame', offset: [0, 0] })).toThrow(
      /offset must be three numbers/,
    );
    expect(ambient({ particle: 'minecraft:flame', states: { lit: true } })).toThrow(
      /lit: expected a string such as "true"/,
    );
    expect(ambient({ particle: 'minecraft:flame', speed: 1 })).toThrow(
      /unknown msm:ambient_particles field 'speed'/,
    );
    expect(ambient({ count: 1 })).toThrow(/particle is missing/);
    // The forms vanilla decodes generate.
    const forms: Json[] = [
      'flame',
      'msm_test:spark',
      { type: 'minecraft:flame' },
      { type: 'minecraft:dust', color: [1, 0.5, 0], scale: 1.5 },
      { type: 'minecraft:dust_color_transition', from_color: 1, to_color: [0, 0, 1], scale: 1 },
      { type: 'minecraft:entity_effect', color: [1, 1, 1, 0.5] },
      { type: 'minecraft:effect' },
      { type: 'minecraft:item', item: 'minecraft:diamond' },
      { type: 'minecraft:trail', target: [0, 1, 0.5], color: 255, duration: 20 },
      {
        type: 'minecraft:vibration',
        destination: { type: 'minecraft:block', pos: [0, 64, 0] },
        arrival_in_ticks: 10,
      },
    ];
    for (const particle of forms) {
      expect(spawn({ particle }), JSON.stringify(particle)).not.toThrow();
      expect(ambient({ particle }), JSON.stringify(particle)).not.toThrow();
    }
  });

  it('writes nothing new for projects without particles', () => {
    const { files } = generateJavaProject(
      input([
        inline('block', 'puff', {
          format: 1,
          components: { 'msm:on_interact': { event: 'msm_test:e' } },
          events: {
            'msm_test:e': {
              actions: [{ type: 'spawn_particle', particle: 'minecraft:flame', count: 2 }],
            },
          },
        }),
      ]),
    );
    expect(files.some((f) => /\/(client\/)?particle\//.test(f.path))).toBe(false);
    expect(files.some((f) => f.path.endsWith('/ModParticles.java'))).toBe(false);
    expect(files.some((f) => f.path.includes('/client/'))).toBe(false);
    expect(text(files, '/MsmTestMod.java')).not.toContain('Particle');
  });

  it('writes the client entrypoint for particle types alone', async () => {
    const { files, entrypoints } = generateJavaProject(
      input([], [await fixture('particle', 'spark')]),
    );
    expect(entrypoints.client).toBe('msm_test.client.MsmTestModClient');
    const client = text(files, '/client/MsmTestModClient.java');
    expect(client).toContain('/** Client entrypoint: a particle provider per particle type. */');
    expect(client).not.toContain('EntityRenderers');
    // No event or block uses ParticleSpecs: it is not written.
    expect(files.some((f) => f.path.endsWith('/particle/ParticleSpecs.java'))).toBe(false);
  });

  it('knows the options of each particle type from the vendored registry and mcdoc', async () => {
    const registries = JSON.parse(
      await readFile(join(here, '..', 'vendor', 'mcmeta', 'registries.json'), 'utf8'),
    ) as Record<string, string[]>;
    expect(Object.keys(PARTICLE_OPTIONS).sort()).toEqual([...OPTION_PARTICLES].sort());
    const particles = new Set((registries.particle_type ?? []).map((id) => `minecraft:${id}`));
    for (const id of Object.keys(PARTICLE_OPTIONS)) expect(particles.has(id), id).toBe(true);
    const symbols = JSON.parse(
      await readFile(join(here, '..', 'vendor', 'vanilla-mcdoc', 'symbols.json'), 'utf8'),
    ) as {
      mcdoc: Record<string, McdocType>;
      'mcdoc/dispatcher': Record<string, Record<string, McdocType>>;
    };
    const dispatcher = symbols['mcdoc/dispatcher']['minecraft:particle'] ?? {};
    for (const [id, fields] of Object.entries(PARTICLE_OPTIONS)) {
      const ref = dispatcher[id.slice('minecraft:'.length)];
      expect(ref?.kind, id).toBe('reference');
      const current = currentFields(symbols.mcdoc, symbols.mcdoc[ref?.path ?? '']);
      expect(current.sort(), id).toEqual(
        Object.entries(fields)
          .map(([key, field]) => [key, field.required ? 'required' : 'optional'])
          .sort(),
      );
    }
  });
});

interface McdocType {
  kind?: string;
  path?: string;
  fields?: McdocField[];
}

interface McdocField {
  kind: string;
  key?: unknown;
  optional?: boolean;
  attributes?: McdocAttribute[];
  type?: McdocType;
}

/**
 * The fields of a struct current on 26.3, as `[key, required|optional]`: fields with an `until`
 * attribute are gone (the legacy `value` until 1.20.5 and the like), spreads are followed.
 */
function currentFields(
  mcdoc: Record<string, McdocType>,
  struct: McdocType | undefined,
): [string, string][] {
  const resolved = struct?.kind === 'reference' ? mcdoc[struct.path ?? ''] : struct;
  const out: [string, string][] = [];
  for (const field of resolved?.fields ?? []) {
    if ((field.attributes ?? []).some((a) => a.name === 'until')) continue;
    if (field.kind === 'spread') out.push(...currentFields(mcdoc, field.type));
    else if (typeof field.key === 'string') {
      out.push([field.key, field.optional === true ? 'optional' : 'required']);
    }
  }
  return out;
}

interface McdocAttribute {
  name: string;
  value?: { kind: string; value?: { kind: string; value: string } };
}
