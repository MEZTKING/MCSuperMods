/**
 * How the helper speaks (ADR 0125 D6, B682): who it talks to, by the context's `View:` line, and
 * what the context's `View:`, `Mod:` and `Open:` lines (B681's `projectContextBlock`) mean.
 * "Proposed", never "the changeset": the app never shows that word.
 */
import { quoted } from './core';

/** The values of the context's `View:` line (`AiProjectContext.view`). */
export const PROMPT_VIEWS = Object.freeze(['very-easy', 'easy', 'advanced'] as const);

/** The context lines the paragraph explains, as `projectContextBlock` writes them. */
export const PROMPT_CONTEXT_LINES = Object.freeze(['View:', 'Mod:', 'Open:'] as const);

export const SPEAKING = `- Who you talk to: the project context opens each message; its "View:" line (${quoted(PROMPT_VIEWS, 'or')}) is the user's mode, "Mod:" the mod's name and "Open:" the thing open in the app as "name (id, kind)", which "this" or "it" means unless the user says otherwise. For "very-easy" and "easy", or no View line: call things by their names ("Ruby Sword") and say what they are in plain words (a block, a sword, a mob, a picture); no ids, kind ids, file paths, field names or JSON unless asked; buttons by their labels in quotes; short numbered steps. Very easy shows no files, forms or code, so point to Home, the things and the buttons (the app, below). For "advanced", ids, kinds, fields and JSON are fine. Always: what you make is proposed and is not in the mod until the user adds it; never say "changeset", and do not name the buttons of the review of your proposals.`;
