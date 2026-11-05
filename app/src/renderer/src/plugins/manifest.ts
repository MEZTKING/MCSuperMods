/**
 * Renderer-side checks of a third-party plugin (ADR 0035 D2): the API range before any code
 * runs, then the worker's description against the manifest (capabilities, reserved
 * namespaces, contribution shapes) and the schema exports against the plugin's namespace.
 * Main has already validated the manifest itself (`pluginManifestSchema`).
 *
 * @packageDocumentation
 */

import { ElementKindRegistry, PluginCompatibilityError, registerPlugin } from '@msm/core';
import type { Problem } from '@msm/plugin-api';
import { parseVanillaMcdocSymbols, type VanillaMcdocSymbols } from '@msm/schemas';
import {
  PLUGIN_CAPABILITIES,
  type PluginCapability,
  PluginProblemCodes,
  UNSUPPORTED_PLUGIN_CAPABILITIES,
} from '../../../shared/ipc-channels';
import type { PluginManifest } from '../../../shared/platform';
import type { ContributionDescription, PluginDescription } from './sandbox/protocol';

/** Namespaces no external plugin may use (ADR 0035 D2). */
export const RESERVED_NAMESPACES: readonly string[] = Object.freeze(['minecraft', 'msm']);

/** The function each supported contribution point must provide. */
export const REQUIRED_FUNCTIONS: Readonly<Record<PluginCapability, string>> = Object.freeze({
  elementKinds: 'lower',
  elementTemplates: 'data',
  projectStarters: 'build',
  examples: 'build',
  validators: 'validate',
  exporters: 'run',
  importers: 'import',
});

/** String fields each supported contribution point must have. */
const REQUIRED_STRINGS: Readonly<Record<PluginCapability, readonly string[]>> = Object.freeze({
  elementKinds: ['id', 'schema', 'folder'],
  elementTemplates: ['id', 'kind', 'title', 'description', 'category'],
  projectStarters: ['id', 'title', 'description', 'category'],
  examples: ['id', 'title', 'description', 'kind', 'category'],
  validators: ['id'],
  exporters: ['id', 'displayName'],
  importers: ['id', 'displayName'],
});

/** String-array fields each supported contribution point must have. */
const REQUIRED_STRING_ARRAYS: Readonly<Record<PluginCapability, readonly string[]>> =
  Object.freeze({
    elementKinds: [],
    elementTemplates: [],
    projectStarters: ['layers', 'requiresKinds'],
    examples: ['requiresKinds'],
    validators: ['kinds'],
    exporters: ['layers'],
    importers: ['extensions'],
  });

/** The namespace of a plugin id: its first `.`-separated segment. */
export function pluginIdNamespace(id: string): string {
  return id.split('.')[0] ?? id;
}

/**
 * The namespace a contribution id starts with: the text before the first `:`, `.`, `-`, `_`
 * or `/` (`sample:greeting`, `sample.empty-message` and `sample-greeting` are all `sample`).
 */
export function contributionNamespace(id: string): string {
  return id.split(/[:./_-]/)[0] ?? id;
}

/** Whether the host's plugin API version satisfies `range` (core's semver check). */
export function apiVersionProblem(
  manifest: Pick<PluginManifest, 'id' | 'apiVersion'>,
  apiVersion?: string,
): Problem | null {
  try {
    registerPlugin(
      new ElementKindRegistry(),
      { id: manifest.id, apiVersion: manifest.apiVersion, contributes: {} },
      apiVersion === undefined ? {} : { apiVersion },
    );
    return null;
  } catch (error) {
    return {
      severity: 'error',
      code: PluginProblemCodes.apiIncompatible,
      message:
        error instanceof PluginCompatibilityError
          ? error.message
          : `Plugin ${manifest.id}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** The outcome of {@link checkDescription}. */
export interface DescriptionCheck {
  /** Warnings (unsupported points) and the errors that refuse the plugin. */
  problems: Problem[];
  /** Whether any problem refuses the plugin. */
  refused: boolean;
  /** The supported points the plugin contributes, with their entries. */
  points: Partial<Record<PluginCapability, ContributionDescription[]>>;
}

const problem = (code: string, message: string, severity: Problem['severity'] = 'error') => ({
  severity,
  code,
  message,
});

/**
 * Checks a worker's description against its manifest: the same id; every contributed point
 * declared (`plugin.capability-missing`); `editors`, `commands` and `targets` ignored with a
 * warning (`plugin.capability-unsupported`); no id in the `minecraft` or `msm` namespace
 * (`plugin.reserved-namespace`); each entry with its data fields and function
 * (`plugin.refused`).
 */
export function checkDescription(
  description: PluginDescription,
  manifest: PluginManifest,
): DescriptionCheck {
  const problems: Problem[] = [];
  const points: DescriptionCheck['points'] = {};
  if (description.id !== manifest.id) {
    problems.push(
      problem(
        PluginProblemCodes.refused,
        `The bundle registers plugin ${JSON.stringify(description.id)}, but the manifest names ${manifest.id}.`,
      ),
    );
  }
  const declared = new Set<string>(manifest.capabilities);
  for (const [point, entries] of Object.entries(description.contributes)) {
    if (entries.length === 0) continue;
    if ((UNSUPPORTED_PLUGIN_CAPABILITIES as readonly string[]).includes(point)) {
      problems.push(
        problem(
          PluginProblemCodes.capabilityUnsupported,
          `${manifest.id} contributes ${point}, which external plugins cannot use; they are ignored.`,
          'warning',
        ),
      );
      continue;
    }
    if (!(PLUGIN_CAPABILITIES as readonly string[]).includes(point)) continue;
    const capability = point as PluginCapability;
    if (!declared.has(capability)) {
      problems.push(
        problem(
          PluginProblemCodes.capabilityMissing,
          `${manifest.id} contributes ${point}, which its msm-plugin.json does not list in "capabilities".`,
        ),
      );
      continue;
    }
    for (const entry of entries) {
      const id = entry.data.id;
      const label = typeof id === 'string' ? id : '(no id)';
      for (const field of REQUIRED_STRINGS[capability]) {
        if (typeof entry.data[field] !== 'string' || entry.data[field] === '') {
          problems.push(
            problem(
              PluginProblemCodes.refused,
              `${manifest.id}: ${point} entry ${label} has no string field "${field}".`,
            ),
          );
        }
      }
      for (const field of REQUIRED_STRING_ARRAYS[capability]) {
        const value = entry.data[field];
        if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
          problems.push(
            problem(
              PluginProblemCodes.refused,
              `${manifest.id}: ${point} entry ${label} has no string list "${field}".`,
            ),
          );
        }
      }
      if (!entry.functions.includes(REQUIRED_FUNCTIONS[capability])) {
        problems.push(
          problem(
            PluginProblemCodes.refused,
            `${manifest.id}: ${point} entry ${label} has no ${REQUIRED_FUNCTIONS[capability]} function.`,
          ),
        );
      }
      if (typeof id === 'string' && RESERVED_NAMESPACES.includes(contributionNamespace(id))) {
        problems.push(
          problem(
            PluginProblemCodes.reservedNamespace,
            `${manifest.id}: ${point} id ${id} uses the reserved ${contributionNamespace(id)} namespace.`,
          ),
        );
      }
    }
    points[capability] = entries;
  }
  return {
    problems,
    refused: problems.some((entry) => entry.severity === 'error'),
    points,
  };
}

/** The outcome of {@link parsePluginSchemas}. */
export type SchemaCheck =
  | { ok: true; symbols: VanillaMcdocSymbols[] }
  | { ok: false; problem: Problem };

/**
 * Parses a plugin's schema exports and checks that every type path lies under
 * `::<namespace>::` and every dispatcher under `<namespace>:`, where the namespace is the
 * plugin id's first segment. Anything else is `plugin.refused` (a plugin cannot replace or
 * extend vanilla or MSM types).
 */
export function parsePluginSchemas(manifest: PluginManifest, texts: readonly string[]): SchemaCheck {
  const namespace = pluginIdNamespace(manifest.id);
  const symbols: VanillaMcdocSymbols[] = [];
  for (const [index, text] of texts.entries()) {
    const file = manifest.schemas[index] ?? `schema ${index + 1}`;
    let parsed: VanillaMcdocSymbols;
    try {
      parsed = parseVanillaMcdocSymbols(JSON.parse(text) as unknown);
    } catch (error) {
      return {
        ok: false,
        problem: problem(
          PluginProblemCodes.refused,
          `${manifest.id}: ${file} is not an mcdoc symbol export: ${error instanceof Error ? error.message : String(error)}`,
        ),
      };
    }
    const outside = [
      ...Object.keys(parsed.mcdoc).filter((path) => !path.startsWith(`::${namespace}::`)),
      ...Object.keys(parsed.dispatchers).filter((name) => !name.startsWith(`${namespace}:`)),
    ];
    if (outside.length > 0) {
      return {
        ok: false,
        problem: problem(
          PluginProblemCodes.refused,
          `${manifest.id}: ${file} defines ${outside.slice(0, 3).join(', ')}${outside.length > 3 ? ' and more' : ''} outside its namespace ::${namespace}.`,
        ),
      };
    }
    symbols.push(parsed);
  }
  return { ok: true, symbols };
}
