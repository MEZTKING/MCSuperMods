/**
 * The AI helper's tool executor (ADR 0041 D3-D5): runs every tool of the `@msm/ai` catalogue
 * against the open project session and the conversation's pending changeset, and answers with
 * JSON text.
 *
 * - Read tools see the project **with the pending changeset applied** (the scratch project),
 *   so the model sees its own proposals; `list_problems` reports the live project's problems.
 * - Proposal tools check first (kind, id, reserved namespaces, duplicates, schema errors,
 *   texture paths and patterns, starter values) and answer `isError` with the reasons; what
 *   passes becomes change items. Nothing touches the project until the user applies.
 * - `run_checks` runs the session's full check over the scratch project.
 * - `propose_plan` and `checkpoint` wait for the user through the {@link DecisionHost}.
 *
 * Every tool obeys the run's abort signal: a cancelled run answers `cancelled`. Calls run one
 * at a time in the order they arrive, so the parallel `tool_use` blocks of one assistant turn see
 * each other's proposals (three starters in one namespace share their `msm:mod` element, and an
 * `update_element` may follow the `add_starter` that proposed the element).
 *
 * @packageDocumentation
 */

import {
  type AiToolInputs,
  type AiToolName,
  type AiToolRequest,
  type AiToolResult,
  type CheckpointInput,
  LIST_PAGE_SIZE,
  type NoteMissingFeatureInput,
  type PlanDecision,
  type ProposePlanInput,
  parseToolInput,
  READ_ELEMENT_MAX_BYTES,
} from '@msm/ai';
import {
  type Element,
  isValidNamespace,
  type Json,
  type Problem,
  type Project,
  type ResourceLocation,
} from '@msm/core';
import type { StarterParameter } from '@msm/plugin-api';
import { PLACEHOLDER_PATTERNS, type PlaceholderPattern, placeholderPng } from '@msm/plugin-library';
import {
  bundleToNewItems,
  type ChangeItem,
  type ChangesetPlanOptions,
  type PendingChangeset,
  planChangeItems,
} from '../changeset/changeset';
import { creatorValues, stampItems } from '../changeset/creator-sets';
import { defaultRawValues, toValues, validateParameter } from '../components/wizard/wizard-model';
import { assetImportError } from '../session/asset-files';
import { assertElementIdAllowed, presentSingletonKinds } from '../session/element-defaults';
import type { ProjectSession } from '../session/project-session';
import { templateContext, templatesFor } from '../studios/templates';
import { addWish } from '../wishlist/wishlist';
import { projectContextOf } from './project-context';
import { KIND_SCHEMA_SUMMARY_OPTIONS, kindSchemaSummary } from './schema-summary';

/** What the executor asks the user (the panel answers; ADR 0041 D4 user-decision tools). */
export interface DecisionHost {
  /** Shows the plan and resolves with the user's decision; no deadline. */
  proposePlan(plan: ProposePlanInput, signal?: AbortSignal): Promise<PlanDecision>;
  /** Pauses in step mode until the user continues or stops; answers `continue` otherwise. */
  checkpoint(input: CheckpointInput, signal?: AbortSignal): Promise<'continue' | 'stop'>;
  /**
   * Adds a missing feature to the project's Wishlist (ADR 0053); resolves with the number of
   * open wishes. Without it the executor writes the Wishlist through the session.
   */
  noteMissingFeature?(input: NoteMissingFeatureInput): Promise<number>;
}

/** The error codes tool results carry in `{ error: { code, message } }`. */
export const ToolErrorCodes = {
  /** The run was cancelled while the tool ran. */
  cancelled: 'cancelled',
  /** No project is open. */
  noProject: 'no_project',
  /** The input failed the tool's schema, or a cursor is not one this tool returned. */
  invalidInput: 'invalid_input',
  /** The tool name is not in the catalogue. */
  unknownTool: 'unknown_tool',
  /** The kind is not registered. */
  unknownKind: 'unknown_kind',
  /** The id breaks a kind rule or is malformed. */
  invalidId: 'invalid_id',
  /** The id is in `msm` (always) or `minecraft` (for a kind that is not a vanilla kind). */
  reservedNamespace: 'reserved_namespace',
  /** The id is taken in the project or by a pending change. */
  duplicateId: 'duplicate_id',
  /** The asset path is taken in the project or by a pending change. */
  duplicateAsset: 'duplicate_asset',
  /** The element does not exist (with the pending changes applied). */
  notFound: 'not_found',
  /** The data has schema errors (listed in `problems`). */
  schemaErrors: 'schema_errors',
  /** The schemas could not be loaded. */
  schemasUnavailable: 'schemas_unavailable',
  /** A `create_texture` path that is not a safe path under `textures/`. */
  invalidTexturePath: 'invalid_texture_path',
  /** A `create_texture` pattern the library does not know. */
  unknownPattern: 'unknown_pattern',
  /** The starter id is not in `list_starters`. */
  unknownStarter: 'unknown_starter',
  /** The starter does not support the project's target. */
  unsupportedStarter: 'unsupported_starter',
  /** `add_starter` values that fail the starter's parameters (listed in `values`). */
  invalidValues: 'invalid_values',
  /** The starter's bundle failed to build or holds something the project cannot hold. */
  starterFailed: 'starter_failed',
  /** The template id is not in `list_templates`. */
  unknownTemplate: 'unknown_template',
  /** The template's data function failed. */
  templateFailed: 'template_failed',
  /** Some elements of a `create_elements` call were rejected (see `results`). */
  rejected: 'rejected',
  /** Anything else; the message says what. */
  internal: 'internal_error',
} as const;

/** One of {@link ToolErrorCodes}. */
export type ToolErrorCode = (typeof ToolErrorCodes)[keyof typeof ToolErrorCodes];

/** A tool failure with a code and optional details, answered as an `isError` result. */
export class ToolError extends Error {
  readonly code: ToolErrorCode;
  readonly details: Record<string, unknown>;
  constructor(code: ToolErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.details = details;
  }
}

/** A handler's answer: the JSON value and whether it is an error. */
interface ToolOutcome {
  value: unknown;
  isError?: boolean;
}

/** A problem as tool results show it. */
interface ProblemView {
  severity: Problem['severity'];
  code: string;
  message: string;
  elementId?: string;
  path?: string;
}

function problemView(problem: Problem, withElement = false): ProblemView {
  const view: ProblemView = {
    severity: problem.severity,
    code: problem.code,
    message: problem.message,
  };
  if (withElement && problem.elementId !== undefined) view.elementId = problem.elementId;
  if (problem.path !== undefined && problem.path !== '') view.path = problem.path;
  return view;
}

/** Most problems listed per element in a `run_checks` result. */
const MAX_PROBLEMS_PER_ELEMENT = 50;

/** Namespaces no proposal may create elements or textures in. */
const RESERVED_NAMESPACE = 'msm';
const VANILLA_NAMESPACE = 'minecraft';

function elementsOf(project: Project): Element[] {
  return project.namespaces.flatMap((namespace) => namespace.elements);
}

function findElement(project: Project, id: string): Element | undefined {
  for (const namespace of project.namespaces) {
    const found = namespace.elements.find((element) => element.id === id);
    if (found !== undefined) return found;
  }
  return undefined;
}

function namespaceOf(id: string): string {
  return id.slice(0, id.indexOf(':'));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One page of `items` from `cursor` (an offset this tool returned). */
function page<T>(
  items: readonly T[],
  cursor: string | undefined,
): { items: T[]; nextCursor?: string } {
  let start = 0;
  if (cursor !== undefined) {
    if (!/^\d+$/.test(cursor) || Number(cursor) > items.length) {
      throw new ToolError(
        ToolErrorCodes.invalidInput,
        `The cursor ${JSON.stringify(cursor)} is not one this tool returned.`,
      );
    }
    start = Number(cursor);
  }
  const end = start + LIST_PAGE_SIZE;
  const out: { items: T[]; nextCursor?: string } = { items: items.slice(start, end) };
  if (end < items.length) out.nextCursor = String(end);
  return out;
}

/** The `#rrggbb` colour as RGB. */
function rgbOf(colour: string): [number, number, number] {
  return [1, 3, 5].map((at) => Number.parseInt(colour.slice(at, at + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** The wizard's editing value of one parameter (text, a boolean, or ticked values). */
type RawParameterValue = NonNullable<Parameters<typeof validateParameter>[1]>;

/** The wizard's editing value for a model-supplied parameter value, or `undefined`. */
function rawParameterValue(
  parameter: StarterParameter,
  value: unknown,
): RawParameterValue | undefined {
  const type: string = parameter.type;
  if (type === 'boolean') return typeof value === 'boolean' ? value : undefined;
  if (type === 'number') {
    if (typeof value === 'number') return String(value);
    return typeof value === 'string' ? value : undefined;
  }
  if (type === 'set') {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
      ? (value as unknown as RawParameterValue)
      : undefined;
  }
  return typeof value === 'string' ? value : undefined;
}

/** Rejects with `cancelled` when `signal` aborts first. */
function withSignal<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new ToolError(ToolErrorCodes.cancelled, 'cancelled'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new ToolError(ToolErrorCodes.cancelled, 'cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });
    work().then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        if (signal.aborted) onAbort();
        else resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(signal.aborted ? new ToolError(ToolErrorCodes.cancelled, 'cancelled') : error);
      },
    );
  });
}

/**
 * Builds the executor of one conversation's tool requests.
 *
 * @param session - The open project session.
 * @param changeset - The conversation's pending changeset; proposals add items to it.
 * @param decisions - Asks the user about plans and checkpoints.
 * @returns A function answering each request; it never throws (failures are `isError`
 *   results).
 */
export function createToolExecutor(
  session: ProjectSession,
  changeset: PendingChangeset,
  decisions: DecisionHost,
): (request: AiToolRequest, signal: AbortSignal) => Promise<AiToolResult> {
  const planOptions: ChangesetPlanOptions = {
    renameReferences: (state, from) => session.referencesForRename(state, from),
  };
  let cache: { project: Project; version: number; state: Project } | null = null;
  /** Settles when the call before the newest one has finished. */
  let queue: Promise<void> = Promise.resolve();

  const live = (): Project => {
    const project = session.snapshot.project;
    if (project === null) throw new ToolError(ToolErrorCodes.noProject, 'No project is open.');
    return project;
  };

  /** The live project with the accepted pending items applied (memoised). */
  const scratch = (): Project => {
    const project = live();
    if (cache !== null && cache.project === project && cache.version === changeset.version) {
      return cache.state;
    }
    const state = changeset.scratchProject(project, planOptions);
    cache = { project, version: changeset.version, state };
    return state;
  };

  /** The newest accepted, non-conflicting element item per element id. */
  const pendingItems = (): Map<string, ChangeItem> => {
    const map = new Map<string, ChangeItem>();
    for (const item of changeset.items) {
      if (!item.accepted || item.conflict !== undefined || item.elementId === undefined) continue;
      if (item.op === 'delete') map.delete(item.elementId);
      else if (item.op !== 'asset') map.set(item.elementId, item);
    }
    return map;
  };

  const requireKind = (kind: string): void => {
    if (session.registry.get(kind) === undefined) {
      throw new ToolError(
        ToolErrorCodes.unknownKind,
        `Unknown element kind ${JSON.stringify(kind)}. Call list_kinds for the kinds this project can hold.`,
      );
    }
  };

  /** Checks a new id for `kind`: namespace, reserved namespaces, kind rules. */
  const checkNewId = (id: string, kind: string): void => {
    const namespace = namespaceOf(id);
    if (!isValidNamespace(namespace)) {
      throw new ToolError(ToolErrorCodes.invalidId, `${id} does not have a valid namespace.`);
    }
    if (namespace === RESERVED_NAMESPACE) {
      throw new ToolError(
        ToolErrorCodes.reservedNamespace,
        `The "msm" namespace is reserved for MSM's runtime; use the project's namespace for ${id}.`,
      );
    }
    if (namespace === VANILLA_NAMESPACE && !kind.startsWith(`${VANILLA_NAMESPACE}:`)) {
      throw new ToolError(
        ToolErrorCodes.reservedNamespace,
        `A ${kind} element cannot use the "minecraft" namespace (only vanilla pack kinds may override vanilla ids); use the project's namespace for ${id}.`,
      );
    }
    try {
      assertElementIdAllowed(kind, id as ResourceLocation);
    } catch (error) {
      throw new ToolError(ToolErrorCodes.invalidId, messageOf(error));
    }
  };

  const validate = async (
    kind: string,
    id: string,
    data: Json,
    project: Project,
  ): Promise<Problem[]> => {
    try {
      return await session.validateElementData(kind, id as ResourceLocation, data, project);
    } catch (error) {
      throw new ToolError(
        ToolErrorCodes.schemasUnavailable,
        `The schemas could not be loaded, so ${id} cannot be checked: ${messageOf(error)}`,
      );
    }
  };

  const errorsOf = (problems: readonly Problem[]) =>
    problems
      .filter((problem) => problem.severity === 'error')
      .map((problem) => problemView(problem));
  const notesOf = (problems: readonly Problem[]) =>
    problems
      .filter((problem) => problem.severity !== 'error')
      .map((problem) => problemView(problem));

  const handlers: {
    [N in AiToolName]: (input: AiToolInputs[N], signal: AbortSignal) => Promise<ToolOutcome>;
  } = {
    // Read-only ---------------------------------------------------------------------------
    project_summary: async () => {
      live();
      const summary = changeset.summary();
      return {
        value: {
          ...projectContextOf(session, changeset),
          pending: {
            total: summary.total,
            accepted: summary.accepted,
            conflicts: summary.conflicts,
            byOp: summary.byOp,
            byKind: summary.byKind,
          },
        },
      };
    },

    list_kinds: async () => {
      const templates = new Set(session.library.templates.map((template) => template.kind));
      const items = [...session.registry.all()]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((kind) => {
          const plugin = session.kindPlugins.get(kind.id) ?? '';
          const mod = kind.id.startsWith('msm:');
          return {
            id: kind.id,
            category: plugin.startsWith('msm.') ? plugin.slice('msm.'.length) : plugin,
            registry: session.registry.registryFor(kind.id) ?? null,
            exportsTo: mod
              ? 'fabric-mod-jar'
              : plugin === 'msm.resourcepack'
                ? 'resource-pack'
                : 'data-pack',
            fabricJar: mod,
            hasTemplates: templates.has(kind.id),
          };
        });
      return { value: { items } };
    },

    kind_schema: async ({ kind }) => {
      requireKind(kind);
      const registered = session.registry.get(kind);
      let text: string;
      try {
        const context = await session.schemas();
        text = kindSchemaSummary(
          context.schemaIndex.resolveSchemaRef(registered?.schema ?? ''),
          KIND_SCHEMA_SUMMARY_OPTIONS,
        );
      } catch (error) {
        throw new ToolError(
          ToolErrorCodes.schemasUnavailable,
          `The schema of ${kind} is not available: ${messageOf(error)}`,
        );
      }
      const hidden = registered?.hiddenPaths ?? [];
      return {
        value: {
          kind,
          schema: text,
          ...(hidden.length === 0 ? {} : { hostManagedPaths: hidden }),
        },
      };
    },

    list_elements: async ({ kind, namespace, filter, cursor }) => {
      const state = scratch();
      const pending = pendingItems();
      const needle = filter?.toLowerCase();
      const all = elementsOf(state)
        .filter((element) => kind === undefined || element.kind === kind)
        .filter((element) => namespace === undefined || namespaceOf(element.id) === namespace)
        .filter((element) => needle === undefined || element.id.toLowerCase().includes(needle))
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((element) => {
          const item = pending.get(element.id);
          return {
            id: element.id,
            kind: element.kind,
            problems:
              item === undefined ? session.problemsFor(element.id).length : item.problems.length,
            ...(item === undefined ? {} : { pending: item.op }),
          };
        });
      return { value: page(all, cursor) };
    },

    read_element: async ({ id }) => {
      const element = findElement(scratch(), id);
      if (element === undefined) {
        throw new ToolError(ToolErrorCodes.notFound, `There is no element ${id}.`);
      }
      const item = pendingItems().get(id);
      const problems = (item === undefined ? session.problemsFor(element.id) : item.problems).map(
        (problem) => problemView(problem),
      );
      const json = JSON.stringify(element.data);
      const bytes = new TextEncoder().encode(json);
      const base = {
        id,
        kind: element.kind,
        problems,
        ...(item === undefined ? {} : { pending: item.op }),
      };
      if (bytes.length <= READ_ELEMENT_MAX_BYTES) {
        return { value: { ...base, data: element.data } };
      }
      const cut = new TextDecoder()
        .decode(bytes.slice(0, READ_ELEMENT_MAX_BYTES))
        .replace(/�+$/, '');
      return {
        value: {
          ...base,
          truncated: true,
          note: `The data is ${bytes.length} bytes of JSON; only the first ${READ_ELEMENT_MAX_BYTES} are shown as text.`,
          dataText: cut,
        },
      };
    },

    list_problems: async ({ elementId, severity, cursor }) => {
      live();
      const all = session.snapshot.problems
        .filter((problem) => elementId === undefined || problem.elementId === elementId)
        .filter((problem) => severity === undefined || problem.severity === severity)
        .map((problem) => problemView(problem, true));
      return { value: page(all, cursor) };
    },

    list_templates: async ({ kind, category, cursor }) => {
      const kinds = session.registry.all().map((entry) => entry.id);
      const all = templatesFor(kinds, session.library.templates)
        .filter((template) => kind === undefined || template.kind === kind)
        .filter((template) => category === undefined || template.category === category)
        .map((template) => ({
          id: template.id,
          kind: template.kind,
          category: template.category,
          title: template.title,
          description: template.description,
          ...(template.prefix === undefined ? {} : { pathPrefix: template.prefix }),
          ...(template.defaultNamespace === undefined
            ? {}
            : { namespace: template.defaultNamespace }),
        }));
      return { value: page(all, cursor) };
    },

    template_data: async ({ templateId, id }) => {
      const state = scratch();
      const kinds = session.registry.all().map((entry) => entry.id);
      const template = templatesFor(kinds, session.library.templates).find(
        (entry) => entry.id === templateId,
      );
      if (template === undefined) {
        throw new ToolError(
          ToolErrorCodes.unknownTemplate,
          `Unknown template ${JSON.stringify(templateId)}. Call list_templates for the ids.`,
        );
      }
      let data: Json;
      try {
        data = await template.data(
          templateContext(
            id as ResourceLocation,
            state.namespaces.map((namespace) => namespace.name),
            session.kindDefault(template.kind),
            session.target,
          ),
        );
      } catch (error) {
        throw new ToolError(
          ToolErrorCodes.templateFailed,
          `The template ${templateId} failed: ${messageOf(error)}`,
        );
      }
      return { value: { templateId, kind: template.kind, id, data } };
    },

    list_starters: async () => {
      const target = session.target;
      const items = session.library.starters.map((starter) => ({
        id: starter.id,
        title: starter.title,
        description: starter.description,
        category: starter.category,
        layers: [...starter.layers],
        requiresKinds: [...starter.requiresKinds],
        ...(starter.creator === undefined
          ? {}
          : { creator: { group: starter.creator.group, blurb: starter.creator.blurb } }),
        parameters: structuredClone(starter.parameters ?? []),
        supported: starter.supports?.(target) ?? true,
      }));
      return { value: { items } };
    },

    target_facts: async () => {
      const target = session.target;
      let registries: string[] = [];
      try {
        registries = Object.keys((await session.schemas()).vanillaRegistries).sort();
      } catch {
        // Facts without the registry names.
      }
      const facts: Record<string, unknown> = {
        id: target.id,
        mcVersion: target.mcVersion,
        channel: target.channel,
        java: target.java,
        dataVersion: target.dataVersion,
        packFormats: target.packFormats,
        folders: target.folders,
        worldgen: target.worldgen,
        registries,
      };
      if (target.fabric !== undefined) facts.fabric = target.fabric;
      if (target.geckolib !== undefined) facts.geckolib = target.geckolib;
      if (target.items !== undefined) facts.items = target.items;
      if (target.blocks !== undefined) facts.blocks = target.blocks;
      if (target.entities !== undefined) facts.entities = target.entities;
      return { value: JSON.parse(JSON.stringify(facts)) as unknown };
    },

    script_api_typings: async () => ({ value: { typings: session.scriptTypings } }),

    pending_changes: async () => {
      const items = changeset.items.map((item) => ({
        itemId: item.itemId,
        op: item.op,
        ...(item.elementId === undefined ? {} : { elementId: item.elementId }),
        ...(item.kind === undefined ? {} : { kind: item.kind }),
        ...(item.from === undefined ? {} : { from: item.from }),
        ...(item.to === undefined ? {} : { to: item.to }),
        ...(item.asset === undefined
          ? {}
          : { asset: `assets/${item.asset.namespace}/${item.asset.path}` }),
        accepted: item.accepted,
        ...(item.conflict === undefined ? {} : { conflict: item.conflict }),
        problems: item.problems.map((problem) => problemView(problem)),
      }));
      return { value: { items } };
    },

    // Proposals -------------------------------------------------------------------------
    create_elements: async ({ elements }) => {
      const state = scratch();
      const results: Record<string, unknown>[] = [];
      const candidates: { id: ResourceLocation; kind: string; data: Json; index: number }[] = [];
      const ids = new Set<string>();
      elements.forEach((entry, index) => {
        try {
          requireKind(entry.kind);
          checkNewId(entry.id, entry.kind);
          if (findElement(state, entry.id) !== undefined || ids.has(entry.id)) {
            throw new ToolError(
              ToolErrorCodes.duplicateId,
              ids.has(entry.id)
                ? `${entry.id} appears twice in this call.`
                : `An element ${entry.id} already exists (in the project or in your pending changes). Use update_element to change it, or choose another id.`,
            );
          }
          ids.add(entry.id);
          candidates.push({
            id: entry.id as ResourceLocation,
            kind: entry.kind,
            data: entry.data as Json,
            index,
          });
          results[index] = { id: entry.id };
        } catch (error) {
          if (!(error instanceof ToolError)) throw error;
          results[index] = {
            id: entry.id,
            added: false,
            error: { code: error.code, message: error.message },
          };
        }
      });
      // Check every candidate against the project with all of them in it, so references
      // between the elements of one batch resolve.
      const withCandidates = planChangeItems(
        state,
        candidates.map((entry) => ({
          itemId: entry.id,
          op: 'create',
          elementId: entry.id,
          kind: entry.kind,
          after: entry.data,
          accepted: true,
          problems: [],
        })),
      ).state;
      const accepted: typeof candidates = [];
      const notes = new Map<number, ProblemView[]>();
      for (const entry of candidates) {
        const problems = await validate(entry.kind, entry.id, entry.data, withCandidates);
        const errors = errorsOf(problems);
        if (errors.length > 0) {
          results[entry.index] = {
            id: entry.id,
            added: false,
            error: {
              code: ToolErrorCodes.schemaErrors,
              message: `The data of ${entry.id} does not match the ${entry.kind} schema.`,
            },
            problems: errors,
          };
          continue;
        }
        accepted.push(entry);
        notes.set(entry.index, notesOf(problems));
      }
      const added = changeset.add(
        ...accepted.map((entry) => ({
          op: 'create' as const,
          elementId: entry.id,
          kind: entry.kind,
          after: structuredClone(entry.data),
        })),
      );
      accepted.forEach((entry, at) => {
        const note = notes.get(entry.index) ?? [];
        results[entry.index] = {
          id: entry.id,
          added: true,
          itemId: added[at]?.itemId,
          ...(note.length === 0 ? {} : { notes: note }),
        };
      });
      const rejected = elements.length - accepted.length;
      return {
        value: {
          added: accepted.length,
          rejected,
          results,
          ...(rejected === 0
            ? {}
            : {
                error: {
                  code: ToolErrorCodes.rejected,
                  message: `${rejected} of ${elements.length} elements were rejected; the others were added to the changeset. Fix the rejected ones and call create_elements again for them only.`,
                },
              }),
        },
        isError: rejected > 0,
      };
    },

    update_element: async ({ id, data }) => {
      const state = scratch();
      const element = findElement(state, id);
      if (element === undefined) {
        throw new ToolError(
          ToolErrorCodes.notFound,
          `There is no element ${id}. Use create_elements for new elements.`,
        );
      }
      const problems = await validate(element.kind, id, data as Json, state);
      const errors = errorsOf(problems);
      if (errors.length > 0) {
        throw new ToolError(
          ToolErrorCodes.schemaErrors,
          `The data of ${id} does not match the ${element.kind} schema.`,
          { problems: errors },
        );
      }
      const item = changeset.proposeUpdate(element.id, element.kind, element.data, data as Json);
      const note = notesOf(problems);
      return {
        value: {
          itemId: item.itemId,
          op: item.op,
          id,
          ...(note.length === 0 ? {} : { notes: note }),
        },
      };
    },

    delete_element: async ({ id }) => {
      const state = scratch();
      const element = findElement(state, id);
      if (element === undefined) {
        throw new ToolError(ToolErrorCodes.notFound, `There is no element ${id}.`);
      }
      const referencedBy = [
        ...new Set(
          session
            .referencesForRename(state, element.id)
            .map((reference) => reference.from)
            .filter((from) => from !== id),
        ),
      ].sort();
      const item = changeset.proposeDelete(element.id, element.kind, element.data);
      return {
        value: {
          id,
          ...(item === undefined
            ? { itemId: null, droppedPendingCreate: true }
            : { itemId: item.itemId }),
          referencedBy,
        },
      };
    },

    rename_element: async ({ from, to }) => {
      const state = scratch();
      const element = findElement(state, from);
      if (element === undefined) {
        throw new ToolError(ToolErrorCodes.notFound, `There is no element ${from}.`);
      }
      checkNewId(to, element.kind);
      if (findElement(state, to) !== undefined) {
        throw new ToolError(ToolErrorCodes.duplicateId, `An element ${to} already exists.`);
      }
      const references = session.referencesForRename(state, element.id);
      const [item] = changeset.add({
        op: 'rename',
        elementId: to as ResourceLocation,
        kind: element.kind,
        from: element.id,
        to: to as ResourceLocation,
        before: structuredClone(element.data),
      });
      return {
        value: {
          itemId: item?.itemId,
          from,
          to,
          references: references.map((reference) => ({
            elementId: reference.from,
            path: reference.path,
          })),
        },
      };
    },

    create_texture: async ({ namespace, path, pattern, colour }) => {
      const state = scratch();
      if (!isValidNamespace(namespace)) {
        throw new ToolError(
          ToolErrorCodes.invalidId,
          `${JSON.stringify(namespace)} is not a valid namespace.`,
        );
      }
      if (namespace === RESERVED_NAMESPACE || namespace === VANILLA_NAMESPACE) {
        throw new ToolError(
          ToolErrorCodes.reservedNamespace,
          `Textures cannot be created in the "${namespace}" namespace; use the project's namespace.`,
        );
      }
      let inner = path.startsWith('textures/') ? path.slice('textures/'.length) : path;
      if (inner.endsWith('.png')) inner = inner.slice(0, -'.png'.length);
      const segments = inner.split('/');
      if (inner === '' || segments.some((part) => part === '' || part === '.' || part === '..')) {
        throw new ToolError(
          ToolErrorCodes.invalidTexturePath,
          `${JSON.stringify(path)} is not a texture path under textures/; use a path such as "block/ruby_ore" or "item/ruby".`,
        );
      }
      if (!(PLACEHOLDER_PATTERNS as readonly string[]).includes(pattern)) {
        throw new ToolError(
          ToolErrorCodes.unknownPattern,
          `Unknown pattern ${JSON.stringify(pattern)}; use one of ${PLACEHOLDER_PATTERNS.join(', ')}.`,
        );
      }
      const assetPath = `textures/${inner}.png`;
      const bytes = placeholderPng(
        pattern as PlaceholderPattern,
        colour === undefined ? {} : { colour: rgbOf(colour) },
      );
      const slash = assetPath.lastIndexOf('/');
      const reason = assetImportError(assetPath.slice(0, slash), assetPath.slice(slash + 1), bytes);
      if (reason !== undefined) {
        throw new ToolError(ToolErrorCodes.invalidTexturePath, reason);
      }
      const taken = state.namespaces
        .find((entry) => entry.name === namespace)
        ?.assets.some((asset) => asset.path === assetPath);
      if (taken === true) {
        throw new ToolError(
          ToolErrorCodes.duplicateAsset,
          `assets/${namespace}/${assetPath} already exists (in the project or in your pending changes).`,
        );
      }
      const [item] = changeset.add({ op: 'asset', asset: { namespace, path: assetPath, bytes } });
      return {
        value: {
          itemId: item?.itemId,
          file: `assets/${namespace}/${assetPath}`,
          textureId: `${namespace}:${inner}`,
        },
      };
    },

    add_starter: async ({ starterId, namespace, values }) => {
      const state = scratch();
      const starter = session.library.starters.find((entry) => entry.id === starterId);
      if (starter === undefined) {
        throw new ToolError(
          ToolErrorCodes.unknownStarter,
          `Unknown starter ${JSON.stringify(starterId)}. Call list_starters for the ids.`,
        );
      }
      const target = session.target;
      if (starter.supports !== undefined && !starter.supports(target)) {
        throw new ToolError(
          ToolErrorCodes.unsupportedStarter,
          `The starter ${starterId} does not support the project's target ${target.id}.`,
        );
      }
      if (namespace === RESERVED_NAMESPACE || namespace === VANILLA_NAMESPACE) {
        throw new ToolError(
          ToolErrorCodes.reservedNamespace,
          `A starter cannot be added in the "${namespace}" namespace; use the project's namespace.`,
        );
      }
      const parameters = starter.parameters ?? [];
      const raw: Record<string, RawParameterValue> = { ...defaultRawValues(parameters) };
      const problems: { parameter: string; message: string }[] = [];
      for (const [key, value] of Object.entries(values ?? {})) {
        const parameter = parameters.find((entry) => entry.id === key);
        if (parameter === undefined) {
          problems.push({
            parameter: key,
            message: `The starter has no parameter ${JSON.stringify(key)}.`,
          });
          continue;
        }
        const rawValue = rawParameterValue(parameter, value);
        const error =
          rawValue === undefined
            ? `Expected a ${parameter.type} value.`
            : validateParameter(parameter, rawValue);
        if (error !== null) {
          problems.push({ parameter: key, message: error });
          continue;
        }
        raw[key] = rawValue as RawParameterValue;
      }
      if (problems.length > 0) {
        throw new ToolError(
          ToolErrorCodes.invalidValues,
          `Some values do not fit the starter's parameters (see list_starters).`,
          { values: problems },
        );
      }
      let created: ReturnType<typeof bundleToNewItems>;
      const starterValues = toValues(parameters, raw);
      try {
        const bundle = await starter.build({
          namespace,
          projectName: state.name,
          target,
          values: starterValues,
        });
        for (const entry of bundle.elements) assertElementIdAllowed(entry.kind, entry.id);
        // A project has one pack.mcmeta and one mod metadata element: a starter's own are
        // dropped (and reported as conflicts) when the project or the changeset has one, in
        // any namespace, as they would clash on export.
        const singletons = presentSingletonKinds(state);
        const dropped = bundle.elements.filter((entry) => singletons.has(entry.kind));
        created = bundleToNewItems(
          { ...bundle, elements: bundle.elements.filter((entry) => !dropped.includes(entry)) },
          state,
          (kind) => session.registry.get(kind) !== undefined,
        );
        created.conflicts.push(...dropped.map((entry) => entry.id));
        // A Creator flow's elements carry `meta.creator`, so the set reopens in the Creator
        // ("Edit in Creator", ADR 0043 D5).
        if (starter.creator !== undefined) {
          created.items = stampItems(created.items, {
            flowId: starter.id,
            setId: crypto.randomUUID(),
            values: creatorValues(starterValues),
          });
        }
      } catch (error) {
        throw new ToolError(
          ToolErrorCodes.starterFailed,
          `The starter ${starterId} could not be built: ${messageOf(error)}`,
        );
      }
      const added = changeset.add(...created.items);
      return {
        value: {
          starterId,
          namespace,
          created: created.items.flatMap((item) =>
            item.elementId === undefined ? [] : [item.elementId],
          ),
          assets: created.items.flatMap((item) =>
            item.asset === undefined ? [] : [`assets/${item.asset.namespace}/${item.asset.path}`],
          ),
          itemIds: added.map((item) => item.itemId),
          conflicts: created.conflicts,
          assetConflicts: created.assetConflicts,
          ...(created.conflicts.length + created.assetConflicts.length === 0
            ? {}
            : {
                note: 'Ids and asset paths listed as conflicts already exist (or, for pack.mcmeta and mod metadata elements, the project already has one) and were not proposed again.',
              }),
        },
      };
    },

    // Checks ----------------------------------------------------------------------------
    run_checks: async ({ scope }) => {
      const project = live();
      changeset.markConflicts(project, planOptions);
      const state = scratch();
      const problems = await session.checkProject(state);
      const pending = pendingItems();
      const byElement = new Map<string, Problem[]>();
      const projectWide: Problem[] = [];
      for (const problem of problems) {
        if (problem.elementId === undefined) {
          projectWide.push(problem);
          continue;
        }
        const list = byElement.get(problem.elementId);
        if (list === undefined) byElement.set(problem.elementId, [problem]);
        else list.push(problem);
      }
      const byItem = new Map<string, Problem[]>();
      for (const [elementId, item] of pending)
        byItem.set(item.itemId, byElement.get(elementId) ?? []);
      changeset.setProblems(byItem);
      const groups = [...byElement.entries()]
        .filter(([elementId]) => scope === 'all' || pending.has(elementId))
        .map(([elementId, list]) => {
          const item = pending.get(elementId);
          return {
            elementId,
            ...(item === undefined ? {} : { itemId: item.itemId }),
            problems: list
              .slice(0, MAX_PROBLEMS_PER_ELEMENT)
              .map((problem) => problemView(problem)),
            ...(list.length > MAX_PROBLEMS_PER_ELEMENT
              ? { more: list.length - MAX_PROBLEMS_PER_ELEMENT }
              : {}),
          };
        });
      const counted = [
        ...groups.flatMap((group) => byElement.get(group.elementId) ?? []),
        ...(scope === 'all' ? projectWide : []),
      ];
      const counts = { error: 0, warning: 0, info: 0 };
      for (const problem of counted) counts[problem.severity] += 1;
      const conflicts = changeset.items.flatMap((item) =>
        item.conflict === undefined ? [] : [{ itemId: item.itemId, reason: item.conflict }],
      );
      return {
        value: {
          scope,
          counts,
          elements: groups.slice(0, LIST_PAGE_SIZE),
          ...(groups.length > LIST_PAGE_SIZE
            ? { moreElements: groups.length - LIST_PAGE_SIZE }
            : {}),
          ...(scope === 'all' && projectWide.length > 0
            ? { projectProblems: projectWide.map((problem) => problemView(problem)) }
            : {}),
          ...(conflicts.length === 0 ? {} : { conflicts }),
        },
      };
    },

    // User decisions --------------------------------------------------------------------
    propose_plan: async (input, signal) => ({ value: await decisions.proposePlan(input, signal) }),

    checkpoint: async (input, signal) => ({
      value: { decision: await decisions.checkpoint(input, signal) },
    }),

    // Notes -------------------------------------------------------------------------------
    note_missing_feature: async (input) => {
      live();
      let open: number;
      if (decisions.noteMissingFeature !== undefined) {
        open = await decisions.noteMissingFeature(input);
      } else {
        const next = addWish(await session.readWishlist(), {
          source: 'ai',
          title: input.title,
          request: input.request,
          missing: input.missing,
          ...(input.builtInstead === undefined ? {} : { builtInstead: input.builtInstead }),
        });
        await session.writeWishlist(next);
        open = next.filter((entry) => entry.status === 'open').length;
      }
      return {
        value: {
          noted: true,
          openWishes: open,
          message: 'Added to the Wishlist (Help > Wishlist…). Tell the user.',
        },
      };
    },
  };

  return async (request, signal) => {
    const answer = (value: unknown, isError: boolean): AiToolResult => ({
      requestId: request.requestId,
      content: JSON.stringify(value),
      isError,
    });
    const failure = (code: string, message: string, details: Record<string, unknown> = {}) =>
      answer({ error: { code, message, ...details } }, true);
    const parsed = parseToolInput(request.name, request.input);
    if (!parsed.ok) {
      return 'UNKNOWN_TOOL' in parsed.error
        ? failure(ToolErrorCodes.unknownTool, `Unknown tool ${JSON.stringify(request.name)}.`)
        : failure(ToolErrorCodes.invalidInput, 'The input does not match the tool schema.', {
            issues: parsed.error.INVALID_INPUT.map((issue) => ({
              path: issue.path.map(String).join('.'),
              message: issue.message,
            })),
          });
    }
    const handler = handlers[parsed.name] as (
      input: unknown,
      signal: AbortSignal,
    ) => Promise<ToolOutcome>;
    // One call at a time, in arrival order (see the module comment).
    const previous = queue;
    const work = withSignal(async () => {
      await previous;
      if (signal.aborted) throw new ToolError(ToolErrorCodes.cancelled, 'cancelled');
      return handler(parsed.input, signal);
    }, signal);
    queue = work.then(
      () => undefined,
      () => undefined,
    );
    try {
      const outcome = await work;
      return answer(outcome.value, outcome.isError === true);
    } catch (error) {
      if (error instanceof ToolError) return failure(error.code, error.message, error.details);
      return failure(ToolErrorCodes.internal, messageOf(error));
    }
  };
}
