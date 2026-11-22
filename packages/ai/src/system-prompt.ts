/**
 * The system prompt and the volatile project context block (ADR 0041 D3, D6).
 *
 * `systemPrompt(mode)` is pure: no dates, no project content, no settings values, so the text is
 * byte-identical across runs and the cached prefix (tools, then system) holds. Everything that
 * changes goes into `projectContextBlock`, which the loop sends at the start of the run's user
 * message, after the cache breakpoint.
 */

import { assemblePrompt } from './prompt';
import type { AiMode } from './protocol';

// Every name this file exported before B681 still comes from here; the text lives in `prompt/`.
export * from './prompt';

/** The system prompt of a mode; identical text on every call. */
export function systemPrompt(mode: AiMode): string {
  return assemblePrompt(mode);
}

/** The volatile facts about the project sent with each run. */
export interface AiProjectContext {
  targetId: string;
  mcVersion: string;
  namespaces: string[];
  kindCounts: Record<string, number>;
  hasModElement: boolean;
  /** A one-paragraph summary of the pending changeset, or an empty string. */
  pendingSummary: string;
  /** The app's view, when known: what the user sees and how plainly the helper speaks (D6). */
  view?: 'very-easy' | 'easy' | 'advanced';
  /** The mod's display name, when known. */
  modName?: string;
  /** The element open in the editor, when there is one. */
  open?: { id: string; kind: string; name: string };
}

/** Renders the project context as the text block that opens a run's user message. */
export function projectContextBlock(context: AiProjectContext): string {
  const kinds = Object.keys(context.kindCounts)
    .sort()
    .map((k) => `${k}: ${context.kindCounts[k]}`);
  const lines = [
    '<project_context>',
    `Target: ${context.targetId} (Minecraft ${context.mcVersion})`,
    ...(context.view === undefined ? [] : [`View: ${context.view}`]),
    ...(context.modName === undefined ? [] : [`Mod: ${context.modName}`]),
    ...(context.open === undefined
      ? []
      : [`Open: ${context.open.name} (${context.open.id}, ${context.open.kind})`]),
    `Namespaces: ${context.namespaces.length > 0 ? [...context.namespaces].sort().join(', ') : '(none)'}`,
    `Elements per kind: ${kinds.length > 0 ? kinds.join(', ') : '(none)'}`,
    `msm:mod element: ${context.hasModElement ? 'present' : 'absent'}`,
    `Pending changes: ${context.pendingSummary.trim() === '' ? '(none)' : context.pendingSummary.trim()}`,
    '</project_context>',
  ];
  return lines.join('\n');
}
