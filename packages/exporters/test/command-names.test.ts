/**
 * No command the library makes takes a vanilla command's name (ADR 0096 D1, D6; plan B444).
 * Every built-in plugin's `msm:command` kind default, element templates, starters (every
 * parameter at its default) and examples are built for each built-in target, and the `name` and
 * `aliases` of every `msm:command` element are checked against that target's
 * `TargetFacts.commands.vanillaNames`. When B444 landed no plugin registered `msm:command` yet,
 * so the scan found no command; it starts checking as soon as B456 and B461 add the kind and
 * its templates.
 */
import type {
  ContentBundle,
  ElementTemplate,
  ExampleProject,
  Json,
  Plugin,
  ProjectStarter,
  TargetFacts,
} from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import controlsPlugin from '@msm/plugin-controls';
import dataPackPlugin from '@msm/plugin-datapack';
import entitiesPlugin from '@msm/plugin-entities';
import libraryPlugin from '@msm/plugin-library';
import modelsAnimPlugin from '@msm/plugin-models-anim';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import rulesPlugin from '@msm/plugin-rules';
import scriptingPlugin from '@msm/plugin-scripting';
import structuresPlugin from '@msm/plugin-structures';
import worldgenPlugin from '@msm/plugin-worldgen';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';

const COMMAND_KIND = 'msm:command';

const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  structuresPlugin,
  worldgenPlugin,
  blocksItemsPlugin,
  entitiesPlugin,
  modelsAnimPlugin,
  scriptingPlugin,
  rulesPlugin,
  controlsPlugin,
  libraryPlugin,
];

/** A command literal found in the library, with where it came from. */
interface FoundName {
  source: string;
  name: string;
}

/** The `name` and `aliases` of one `msm:command` element's data. */
function commandNames(data: Json, source: string): FoundName[] {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return [];
  const found: FoundName[] = [];
  if (typeof data.name === 'string') found.push({ source, name: data.name });
  if (Array.isArray(data.aliases)) {
    for (const alias of data.aliases) {
      if (typeof alias === 'string') found.push({ source, name: alias });
    }
  }
  return found;
}

/** The names that are vanilla commands on the target. */
function vanillaClashes(found: readonly FoundName[], target: TargetFacts): FoundName[] {
  const vanilla = new Set(target.commands?.vanillaNames ?? []);
  return found.filter((entry) => vanilla.has(entry.name));
}

async function kindDefault(plugin: Plugin, target: TargetFacts): Promise<Json | undefined> {
  const kind = plugin.contributes.elementKinds?.find((entry) => entry.id === COMMAND_KIND);
  if (kind === undefined) return undefined;
  return kind.defaultDataFor !== undefined
    ? await kind.defaultDataFor(target)
    : (kind.defaultData as Json | undefined);
}

async function templateNames(
  plugin: Plugin,
  template: ElementTemplate,
  target: TargetFacts,
): Promise<FoundName[]> {
  if (template.kind !== COMMAND_KIND || template.supports?.(target) === false) return [];
  const path = `${template.prefix ?? ''}${template.defaultName ?? 'command'}`;
  const namespace = template.defaultNamespace ?? 'demo';
  const data = await template.data({
    id: `${namespace}:${path}`,
    namespace,
    path,
    projectNamespace: 'demo',
    namespaces: ['demo'],
    kindDefault: await kindDefault(plugin, target),
    target,
  });
  return commandNames(data, `template ${template.id}`);
}

async function bundleNames(
  entry: ProjectStarter | ExampleProject,
  target: TargetFacts,
): Promise<FoundName[]> {
  if (entry.supports?.(target) === false) return [];
  const parameters = 'parameters' in entry ? (entry.parameters ?? []) : [];
  const values = Object.fromEntries(
    parameters.map((parameter) => [parameter.id, parameter.default as Json]),
  );
  const bundle: ContentBundle = await entry.build({
    namespace: 'demo',
    projectName: 'Commands',
    target,
    values,
  });
  return bundle.elements
    .filter((element) => element.kind === COMMAND_KIND)
    .flatMap((element) => commandNames(element.data, `${entry.id} ${element.id}`));
}

async function libraryCommandNames(target: TargetFacts): Promise<FoundName[]> {
  const found: FoundName[] = [];
  for (const plugin of PLUGINS) {
    const fallback = await kindDefault(plugin, target);
    if (fallback !== undefined) found.push(...commandNames(fallback, `${plugin.id} default`));
    for (const template of plugin.contributes.elementTemplates ?? []) {
      found.push(...(await templateNames(plugin, template, target)));
    }
    for (const starter of plugin.contributes.projectStarters ?? []) {
      found.push(...(await bundleNames(starter, target)));
    }
    for (const example of plugin.contributes.examples ?? []) {
      found.push(...(await bundleNames(example, target)));
    }
  }
  return found;
}

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle.target] as const))(
  'command names on %s',
  (_id, target) => {
    it('has the vanilla command names to check against', () => {
      expect(target.commands?.vanillaNames.length ?? 0).toBeGreaterThan(50);
      // The check itself flags a vanilla name and its aliases.
      const sample = commandNames({ name: 'give', aliases: ['home', 'tp'] }, 'sample');
      expect(vanillaClashes(sample, target).map((entry) => entry.name)).toEqual(['give', 'tp']);
    });

    it('gives no library command a vanilla name or alias', async () => {
      const found = await libraryCommandNames(target);
      expect(vanillaClashes(found, target)).toEqual([]);
    });
  },
);
