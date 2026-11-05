/**
 * Read-only tools (ADR 0041 D4): they report on the project, the kinds, the library and the target
 * and never change anything. The host answers each with JSON text.
 */
import type { ProblemSeverity } from '@msm/plugin-api';
import { z } from 'zod';
import { cursorSchema, kindIdSchema, namespaceSchema, resourceIdSchema } from './common';

/** Problem severities, checked against the plugin API's `ProblemSeverity`. */
const SEVERITIES = ['error', 'warning', 'info'] as const satisfies readonly ProblemSeverity[];

export const projectSummaryInput = z.object({});
export const listKindsInput = z.object({});
export const kindSchemaInput = z.object({
  kind: kindIdSchema,
});
export const listElementsInput = z.object({
  kind: kindIdSchema.optional(),
  namespace: namespaceSchema.optional(),
  filter: z
    .string()
    .max(200)
    .optional()
    .describe('Keeps elements whose id contains this text (case-insensitive).'),
  cursor: cursorSchema.optional(),
});
export const readElementInput = z.object({
  id: resourceIdSchema,
});
export const listProblemsInput = z.object({
  elementId: resourceIdSchema.optional(),
  severity: z
    .enum(SEVERITIES)
    .optional()
    .describe('Only problems of this severity. An "error" blocks export.'),
  cursor: cursorSchema.optional(),
});
export const listTemplatesInput = z.object({
  kind: kindIdSchema.optional(),
  category: z.string().max(100).optional().describe('A template category as listed earlier.'),
  cursor: cursorSchema.optional(),
});
export const templateDataInput = z.object({
  templateId: z.string().min(1).max(200).describe('A template id from list_templates.'),
  id: resourceIdSchema.describe(
    'The id the new element would get; templates fill it into their data, for example in recipe results.',
  ),
});
export const listStartersInput = z.object({});
export const targetFactsInput = z.object({});
export const scriptApiTypingsInput = z.object({});
export const pendingChangesInput = z.object({});

export type ProjectSummaryInput = z.infer<typeof projectSummaryInput>;
export type ListKindsInput = z.infer<typeof listKindsInput>;
export type KindSchemaInput = z.infer<typeof kindSchemaInput>;
export type ListElementsInput = z.infer<typeof listElementsInput>;
export type ReadElementInput = z.infer<typeof readElementInput>;
export type ListProblemsInput = z.infer<typeof listProblemsInput>;
export type ListTemplatesInput = z.infer<typeof listTemplatesInput>;
export type TemplateDataInput = z.infer<typeof templateDataInput>;
export type ListStartersInput = z.infer<typeof listStartersInput>;
export type TargetFactsInput = z.infer<typeof targetFactsInput>;
export type ScriptApiTypingsInput = z.infer<typeof scriptApiTypingsInput>;
export type PendingChangesInput = z.infer<typeof pendingChangesInput>;

export const READ_TOOLS = [
  {
    name: 'project_summary',
    group: 'read',
    input: projectSummaryInput,
    description:
      'Summarises the open project: the Minecraft target and version, the namespaces, the number of elements per kind, whether the project has an "msm:mod" element (the mod metadata every Fabric mod project needs exactly once) and a summary of the changes you have proposed in this run so far. Call it first when you do not know the project yet.',
  },
  {
    name: 'list_kinds',
    group: 'read',
    input: listKindsInput,
    description:
      'Lists every element kind the project can hold, with its id, label, category and whether it exports to a resource pack, a data pack or the Fabric mod jar. "minecraft:" kinds map one to one to vanilla pack files; "msm:" kinds (msm:block, msm:item, msm:entity, msm:script and the model and animation kinds) are higher-level, are exported in a Fabric mod jar and need the "msm:mod" element.',
  },
  {
    name: 'kind_schema',
    group: 'read',
    input: kindSchemaInput,
    description:
      "Returns a compact text rendering of a kind's data schema (fields, types, enums, optional markers), bounded in depth and length. Read it, or a template's data, before you write data for a kind you have not used in this conversation; never invent fields.",
  },
  {
    name: 'list_elements',
    group: 'read',
    input: listElementsInput,
    description:
      'Lists the elements of the project as { id, kind, problems } entries, optionally filtered by kind, namespace or id text. Returns { items, nextCursor? } with at most 200 items per page; pass nextCursor to get the next page.',
  },
  {
    name: 'read_element',
    group: 'read',
    input: readElementInput,
    description:
      "Returns one element's kind, data and current problems. Data larger than 64 kB is truncated and the result says so. Includes your pending proposals: an element you proposed reads as it would be after Apply and is marked with pending and the operation (see pending_changes for the whole list).",
  },
  {
    name: 'list_problems',
    group: 'read',
    input: listProblemsInput,
    description:
      'Lists the current problems of the project (severity, code, message, element id, JSON path), optionally for one element or one severity. Returns { items, nextCursor? }. Errors block export; warnings and infos do not. To check your proposals, use run_checks instead.',
  },
  {
    name: 'list_templates',
    group: 'read',
    input: listTemplatesInput,
    description:
      'Lists the element templates (id, kind, category, title, description), optionally for one kind or category. Templates hold valid starting data for a kind; use template_data to see it. Returns { items, nextCursor? }.',
  },
  {
    name: 'template_data',
    group: 'read',
    input: templateDataInput,
    description:
      'Returns the element data a template would create for the given id, without creating anything. Use it as a valid starting point for create_elements: copy it and change what the user asked for.',
  },
  {
    name: 'list_starters',
    group: 'read',
    input: listStartersInput,
    description:
      'Lists the starters: whole bundles of elements and placeholder textures such as Custom ore (an ore block with its item, loot table, recipes and the msm:mod element), Custom sword and Custom mob (an animated entity with model, animations, spawn egg and loot), each with its parameters, their types and defaults. Use add_starter to propose one; it is often the fastest correct way to make a common piece of content.',
  },
  {
    name: 'target_facts',
    group: 'read',
    input: targetFactsInput,
    description:
      "Returns facts of the project's Minecraft target: the version, pack formats, the registries the schemas know and the Fabric versions used for the mod jar.",
  },
  {
    name: 'script_api_typings',
    group: 'read',
    input: scriptApiTypingsInput,
    description:
      'Returns the TypeScript declarations of the MSM script API that "msm:script" elements are written against. Read them before writing or changing a script.',
  },
  {
    name: 'pending_changes',
    group: 'read',
    input: pendingChangesInput,
    description:
      'Lists the changes you have proposed in this conversation that the user has not applied yet: each item with its id, operation (create, update, delete, rename, asset), element id and kind, and the problems run_checks found for it.',
  },
] as const;
