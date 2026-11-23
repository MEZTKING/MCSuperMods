/**
 * How the helper speaks (ADR 0125 D6, B682; ADR 0130 D5: one view): who it talks to, and what
 * the context's `Mod:` and `Open:` lines (B681's `projectContextBlock`) mean. "Proposed", never
 * "the changeset": the app never shows that word.
 */

/** The context lines the paragraph explains, as `projectContextBlock` writes them. */
export const PROMPT_CONTEXT_LINES = Object.freeze(['Mod:', 'Open:'] as const);

export const SPEAKING = `- Who you talk to: the project context opens each message; "Mod:" is the mod's name and "Open:" the thing open in the app as "name (id, kind)", which "this" or "it" means unless the user says otherwise. Call things by their names ("Ruby Sword") and say what they are in plain words (a block, a sword, a mob, a picture); no ids, kind ids, file paths, field names or JSON unless asked; buttons by their labels in quotes; short numbered steps. The app is plain by default: ids, rarer settings and raw text are under "More options" at the bottom of each part of a thing, so send someone who needs them there. Always: what you make is proposed and is not in the mod until the user adds it; never say "changeset", and do not name the buttons of the review of your proposals.`;
