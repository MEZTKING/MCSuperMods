/**
 * The `java-project` exporter (ADR 0033): layout, `fabric.mod.json`, determinism across runs
 * and time zones, the problems (no generator, no Fabric facts, missing wrapper, scripts not
 * ejected, generator failures, entities without GeckoLib) and a blank project. Uses the
 * test-local `test:raw` kind and the real generator of each built-in target.
 */
import { utf8 } from '@msm/core';
import type { Element, JavaProjectInput, Json, Problem, Target } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  createJavaProjectExporter,
  createMemorySink,
  ExportProblemCodes,
  type GradleWrapper,
  JAVA_PROJECT_MOD_JSON,
  javaPackageFor,
  modClassNameFor,
  runExport,
} from '../src/index';
import { element, fakeAsset, indexesFor, meta, project, raw, testRegistry } from './helpers';

const codes = (problems: Problem[]): string[] => problems.map((problem) => problem.code);
const wrapper: GradleWrapper = {
  jar: utf8.encode('PK wrapper'),
  gradlew: '#!/bin/sh\n',
  gradlewBat: '@echo off\r\n',
};

const modelElement = element('test:model', 'ruby:block/ruby_block', {
  parent: 'minecraft:block/cube_all',
  textures: { all: 'ruby:block/ruby_block' },
});
const tag = raw('ruby:tag', {
  path: 'data/ruby/tags/item/gems.json',
  layer: 'datapack',
  json: { values: ['minecraft:diamond'] },
});
const packMcmeta = raw('ruby:pack', {
  path: 'pack.mcmeta',
  layer: 'datapack',
  json: { pack: { description: 'x', pack_format: 1 } },
});
const block = raw('ruby:block', {
  path: 'msm/ruby/block/ruby_block.json',
  layer: 'msm',
  json: {
    format: 1,
    components: { 'msm:on_interact': { event: 'ruby:shine' } },
    events: {
      'ruby:shine': {
        actions: [
          { type: 'play_sound', sound: 'minecraft:block.amethyst_block.chime' },
          { type: 'run_script', handler: 'ruby:glow' },
        ],
      },
    },
  },
});
const plainItem = raw('ruby:item', {
  path: 'msm/ruby/item/ruby.json',
  layer: 'msm',
  json: { format: 1, rarity: 'rare' },
});
const script = raw('ruby:script', {
  path: 'msm/ruby/script/glow.ts',
  layer: 'msm',
  language: 'typescript',
  text: 'import { msm } from "msm:runtime";\nmsm.actions.define("ruby:glow", () => {});\n',
});
const entity = raw('ruby:entity', {
  path: 'msm/ruby/entity/golem.json',
  layer: 'msm',
  json: {
    format: 1,
    category: 'creature',
    size: { width: 1, height: 2 },
    components: {
      'msm:animated_model': { model: 'ruby:entity/golem', texture: 'ruby:entity/golem' },
    },
  },
});
const modJson = raw('ruby:mod', {
  path: 'fabric.mod.json',
  layer: 'msm',
  json: {
    depends: { fabricloader: '>=0.20.1', msm_runtime: '>=0.4.0' },
    description: 'Costs $5.',
    environment: '*',
    id: 'ruby-mod',
    name: 'Ruby Mod',
    schemaVersion: 1,
    version: '2.3.0',
  },
});

async function inTimeZone<T>(zone: string, body: () => Promise<T>): Promise<T> {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return await body();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

describe('Java identifiers of the mod', () => {
  it('derives the package and the mod class', () => {
    expect(javaPackageFor('msm_sample_mod')).toBe('msm_sample_mod');
    expect(javaPackageFor('ruby-mod')).toBe('ruby_mod');
    expect(javaPackageFor('class')).toBe('mod_class');
    expect(javaPackageFor('9lives')).toBe('mod_9lives');
    expect(modClassNameFor('msm_sample_mod')).toBe('MsmSampleMod');
    expect(modClassNameFor('ruby')).toBe('RubyMod');
    expect(modClassNameFor('ruby-mod')).toBe('RubyMod');
    expect(modClassNameFor('9lives')).toBe('Mod9livesMod');
  });
});

describe.each(
  builtInTargets
    .filter((bundle) => bundle.target.javaProject !== undefined)
    .map((bundle) => [bundle.target.id, bundle] as const),
)('java project (%s)', (_id, bundle) => {
  const { target } = bundle;

  async function eject(
    elements: Element[],
    options: { wrapper?: GradleWrapper | undefined; target?: Target; name?: string } = {
      wrapper,
    },
  ) {
    const { schemaIndex, registries } = await indexesFor(bundle);
    const sink = createMemorySink();
    const report = await runExport({
      project: project(elements, [], options.name ?? 'Ruby Pack'),
      registry: testRegistry(),
      target: options.target ?? target,
      schemaIndex,
      registries,
      exporter: createJavaProjectExporter({ loadGradleWrapper: async () => options.wrapper }),
      sink,
      readAsset: fakeAsset,
      meta,
    });
    return { report, files: sink.files() };
  }
  const text = (files: Map<string, Uint8Array>, path: string): string =>
    utf8.decode(files.get(path) as Uint8Array);

  it('declares its id, name and layers and no options', () => {
    const exporter = createJavaProjectExporter();
    expect(exporter).toMatchObject({
      id: 'java-project',
      displayName: 'Fabric Java project (eject)',
      layers: ['resourcepack', 'datapack', 'msm'],
    });
    expect(exporter.options).toBeUndefined();
  });

  it('lays out the Gradle project, resources and generated sources', async () => {
    const { report, files } = await eject([modelElement, tag, packMcmeta, plainItem, modJson]);
    expect(report.ok).toBe(true);
    expect(codes(report.problems)).toEqual([ExportProblemCodes.outsideJarFolders]);
    expect([...files.keys()].sort()).toEqual(
      [
        '.gitignore',
        'LICENSE-NOTES.md',
        'README.md',
        'build.gradle.kts',
        'gradle.properties',
        'gradle/wrapper/gradle-wrapper.jar',
        'gradle/wrapper/gradle-wrapper.properties',
        'gradlew',
        'gradlew.bat',
        'msm.export.json',
        'settings.gradle.kts',
        `src/main/resources/assets/ruby/${target.folders.resource.model}/block/ruby_block.json`,
        'src/main/resources/data/ruby/tags/item/gems.json',
        JAVA_PROJECT_MOD_JSON,
        'src/main/java/ruby_mod/ModItems.java',
        'src/main/java/ruby_mod/RubyMod.java',
      ].sort(),
    );
    expect([...files.keys()]).toEqual([...files.keys()].sort());
    const fabric = target.fabric;
    if (fabric === undefined) throw new Error('no Fabric facts');
    expect(text(files, 'gradle/wrapper/gradle-wrapper.properties')).toContain(
      `gradle-${fabric.gradle}-bin.zip`,
    );
    const properties = text(files, 'gradle.properties');
    expect(properties).toContain(`minecraft_version=${target.mcVersion}`);
    expect(properties).toContain(`loader_version=${fabric.loader}`);
    expect(properties).toContain(`loom_version=${fabric.loom}`);
    expect(properties).toContain(`fabric_api_version=${fabric.api}`);
    expect(properties).toContain('mod_version=2.3.0');
    expect(properties).not.toContain('geckolib');
    expect(text(files, 'build.gradle.kts')).toContain(`options.release = ${target.java}`);
    expect(text(files, 'build.gradle.kts')).not.toContain('geckolib');
    expect(text(files, 'README.md')).toContain(`generated by MCSuperMods ${meta.msmVersion}`);
    expect(text(files, 'README.md')).toContain('edits do not flow back');
    expect(text(files, 'LICENSE-NOTES.md')).toContain('Gradle wrapper');
    const manifest = JSON.parse(text(files, 'msm.export.json')) as Record<string, Json>;
    expect(manifest).toMatchObject({
      exporter: 'java-project',
      target: target.id,
      fileCount: files.size - 1,
    });
  });

  it('writes fabric.mod.json without msm_runtime, with entrypoints and the version placeholder', async () => {
    const { files } = await eject([plainItem, modJson]);
    const raw = text(files, JAVA_PROJECT_MOD_JSON);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Gradle's placeholder
    expect(raw).toContain('"version": "${version}"');
    expect(raw).toContain('Costs \\u00245.'); // every other "$" escaped from Gradle's expand()
    const json = JSON.parse(raw) as Record<string, Json>;
    expect(json.depends).toEqual({ fabricloader: '>=0.20.1' });
    expect(json.entrypoints).toEqual({ main: ['ruby_mod.RubyMod'] });
    expect(json.description).toBe('Costs $5.');
  });

  it('is deterministic across runs and time zones', async () => {
    const elements = [modelElement, tag, block, plainItem, modJson];
    const runs: Map<string, Uint8Array>[] = [];
    for (const zone of ['Pacific/Kiritimati', 'America/Los_Angeles']) {
      runs.push((await inTimeZone(zone, () => eject(elements))).files);
    }
    runs.push((await eject(elements)).files);
    const [first, ...others] = runs as [Map<string, Uint8Array>, ...Map<string, Uint8Array>[]];
    for (const other of others) expect(other).toEqual(first);
  });

  it('reports a missing generator or missing Fabric facts and writes nothing', async () => {
    const { javaProject: _ignored, ...withoutGenerator } = target;
    const missing = await eject([plainItem], { wrapper, target: withoutGenerator });
    expect(missing.report.ok).toBe(false);
    expect(codes(missing.report.problems)).toEqual([ExportProblemCodes.noJavaProjectTarget]);
    expect(missing.files.size).toBe(0);
    const { fabric: _fabric, ...withoutFabric } = target;
    const noFabric = await eject([plainItem], { wrapper, target: withoutFabric });
    expect(codes(noFabric.report.problems)).toEqual([ExportProblemCodes.noFabricTarget]);
    expect(noFabric.files.size).toBe(0);
  });

  it('writes the project without the wrapper and says how to add it', async () => {
    const { report, files } = await eject([plainItem], { wrapper: undefined });
    expect(report.ok).toBe(true);
    expect(codes(report.problems)).toEqual([ExportProblemCodes.gradleWrapperMissing]);
    expect(files.has('gradlew')).toBe(false);
    expect(files.has('gradle/wrapper/gradle-wrapper.jar')).toBe(false);
    expect(files.has('gradle/wrapper/gradle-wrapper.properties')).toBe(true);
    expect(text(files, 'README.md')).toContain(
      `gradle wrapper --gradle-version ${target.fabric?.gradle}`,
    );
  });

  it('leaves scripts and run_script actions out with warnings', async () => {
    const { report, files } = await eject([block, script]);
    expect(report.ok).toBe(true);
    const warnings = report.problems.filter((problem) => problem.severity === 'warning');
    expect(warnings.map((problem) => [problem.code, problem.file])).toEqual([
      [ExportProblemCodes.scriptsNotEjected, 'msm/ruby/block/ruby_block.json'],
      [ExportProblemCodes.scriptsNotEjected, 'msm/ruby/script/glow.ts'],
    ]);
    expect(warnings[0]?.message).toContain('ruby:shine');
    expect(warnings[0]?.message).toContain('ruby:glow');
    expect([...files.keys()].some((path) => path.endsWith('.ts') || path.endsWith('.js'))).toBe(
      false,
    );
    expect(text(files, 'README.md')).toContain('## Scripts');
    expect(text(files, 'README.md')).toContain('`ruby:glow`');
    const blockClass = text(files, 'src/main/java/ruby_pack/block/RubyBlock.java');
    expect(blockClass).toContain('Actions.playSound(');
    expect(blockClass).not.toContain('run_script');
  });

  it('exports a blank project as a buildable skeleton', async () => {
    const { report, files } = await eject([], { wrapper, name: 'Empty Mod' });
    expect(report.ok).toBe(true);
    expect(report.problems).toEqual([]);
    const javaFiles = [...files.keys()].filter((path) => path.startsWith('src/'));
    expect(javaFiles).toEqual(
      [JAVA_PROJECT_MOD_JSON, 'src/main/java/empty_mod/EmptyMod.java'].sort(),
    );
    expect(JSON.parse(text(files, JAVA_PROJECT_MOD_JSON))).toMatchObject({ id: 'empty_mod' });
  });

  it('reports generator failures and writes nothing', async () => {
    const broken = raw('ruby:broken', {
      path: 'msm/ruby/block/broken.json',
      layer: 'msm',
      json: { format: 1, components: { 'msm:sparkle': {} } },
    });
    const { report, files } = await eject([broken]);
    expect(report.ok).toBe(false);
    expect(codes(report.problems)).toEqual([ExportProblemCodes.javaGenerationFailed]);
    expect(report.problems[0]?.message).toContain('msm/ruby/block/broken.json');
    expect(files.size).toBe(0);
  });

  it('routes effect definitions to effects and unknown folders to a warning, not entities', async () => {
    let captured: JavaProjectInput | undefined;
    const spy: Target = {
      ...target,
      javaProject: {
        generate(input) {
          captured = input;
          return [];
        },
      },
    };
    const effect = raw('ruby:effect', {
      path: 'msm/ruby/effect/ruby_rush.json',
      layer: 'msm',
      json: { format: 1, category: 'beneficial' },
    });
    const unknown = raw('ruby:mystery', {
      path: 'msm/ruby/mystery/thing.json',
      layer: 'msm',
      json: { format: 1 },
    });
    const { report } = await eject([effect, unknown, plainItem], { wrapper, target: spy });
    expect(report.ok).toBe(true);
    expect(captured?.effects?.map((entry) => entry.id)).toEqual(['ruby:ruby_rush']);
    expect(captured?.effects?.[0]?.path).toBe('msm/ruby/effect/ruby_rush.json');
    expect(captured?.entities).toEqual([]);
    expect(captured?.items.map((entry) => entry.id)).toEqual(['ruby:ruby']);
    expect(captured?.geckolib).toBe(false);
    const unknownProblems = report.problems.filter(
      (problem) => problem.code === ExportProblemCodes.javaGenerationFailed,
    );
    expect(unknownProblems).toHaveLength(1);
    expect(unknownProblems[0]?.severity).toBe('warning');
    expect(unknownProblems[0]?.file).toBe('msm/ruby/mystery/thing.json');
  });

  it('collects sorted, namespaced sound events from every sounds.json, without minecraft', async () => {
    let captured: JavaProjectInput | undefined;
    const spy: Target = {
      ...target,
      javaProject: {
        generate(input) {
          captured = input;
          return [];
        },
      },
    };
    const sounds = (ns: string, json: Json) =>
      raw(`${ns}:sounds`, { path: `assets/${ns}/sounds.json`, layer: 'resourcepack', json });
    const { report } = await eject(
      [
        sounds('ruby', { 'chime.ring': { sounds: ['ruby:chime'] }, alpha: { sounds: [] } }),
        sounds('amber', { zap: { sounds: [] } }),
        sounds('minecraft', { 'block.stone.break': { sounds: [] } }),
      ],
      { wrapper, target: spy },
    );
    expect(report.ok).toBe(true);
    expect(captured?.soundEvents).toEqual(['amber:zap', 'ruby:alpha', 'ruby:chime.ring']);
    expect(report.problems.filter((p) => p.severity === 'warning')).toEqual([]);
  });

  it('passes an empty soundEvents list for a silent project', async () => {
    let captured: JavaProjectInput | undefined;
    const spy: Target = {
      ...target,
      javaProject: {
        generate(input) {
          captured = input;
          return [];
        },
      },
    };
    await eject([plainItem], { wrapper, target: spy });
    expect(captured?.soundEvents).toEqual([]);
  });

  it('warns about a malformed sounds.json or key and keeps the rest', async () => {
    let captured: JavaProjectInput | undefined;
    const spy: Target = {
      ...target,
      javaProject: {
        generate(input) {
          captured = input;
          return [];
        },
      },
    };
    const bad = raw('amber:sounds', {
      path: 'assets/amber/sounds.json',
      layer: 'resourcepack',
      json: [1, 2],
    });
    const badKey = raw('ruby:sounds', {
      path: 'assets/ruby/sounds.json',
      layer: 'resourcepack',
      json: { Bad_Key: { sounds: [] }, good: { sounds: [] } },
    });
    const { report } = await eject([bad, badKey], { wrapper, target: spy });
    expect(report.ok).toBe(true);
    expect(captured?.soundEvents).toEqual(['ruby:good']);
    const warnings = report.problems.filter(
      (p) => p.code === ExportProblemCodes.javaGenerationFailed,
    );
    expect(warnings.map((p) => [p.severity, p.file])).toEqual([
      ['warning', 'assets/amber/sounds.json'],
      ['warning', 'assets/ruby/sounds.json'],
    ]);
  });

  it('needs GeckoLib facts for entities and adds GeckoLib to the build', async () => {
    const { geckolib: _geckolib, ...withoutGeckolib } = target;
    const missing = await eject([entity], { wrapper, target: withoutGeckolib });
    expect(codes(missing.report.problems)).toEqual([ExportProblemCodes.noGeckolibTarget]);
    expect(missing.files.size).toBe(0);
    const { report, files } = await eject([entity]);
    expect(report.ok).toBe(true);
    const geckolib = target.geckolib;
    if (geckolib === undefined) throw new Error('no GeckoLib facts');
    const json = JSON.parse(text(files, JAVA_PROJECT_MOD_JSON)) as {
      depends: Record<string, string>;
      entrypoints: Record<string, string[]>;
    };
    expect(json.depends[geckolib.modId]).toBe(geckolib.dependency);
    expect(json.entrypoints.client).toEqual(['ruby_pack.client.RubyPackModClient']);
    expect(text(files, 'build.gradle.kts')).toContain('include(geckolib)');
    expect(text(files, 'LICENSE-NOTES.md')).toContain('GeckoLib');
  });
});

// A target without a Java generator (its Java would not compile there, ADR 0037 D2) refuses
// the eject with export.no-java-project-target and writes nothing.
describe.each(
  builtInTargets
    .filter((bundle) => bundle.target.javaProject === undefined)
    .map((bundle) => [bundle.target.id, bundle] as const),
)('java project without a generator (%s)', (_id, bundle) => {
  it('reports export.no-java-project-target and writes nothing', async () => {
    const { schemaIndex, registries } = await indexesFor(bundle);
    const sink = createMemorySink();
    const report = await runExport({
      project: project([plainItem, modJson], [], 'Ruby Pack'),
      registry: testRegistry(),
      target: bundle.target,
      schemaIndex,
      registries,
      exporter: createJavaProjectExporter({ loadGradleWrapper: async () => wrapper }),
      sink,
      readAsset: fakeAsset,
      meta,
    });
    expect(report.ok).toBe(false);
    expect(codes(report.problems)).toEqual([ExportProblemCodes.noJavaProjectTarget]);
    expect(sink.files().size).toBe(0);
  });
});

it('at least one built-in target can eject a Java project', () => {
  expect(builtInTargets.some((bundle) => bundle.target.javaProject !== undefined)).toBe(true);
});
