/**
 * Visible context blocks for the AI helper (ADR 0041 D8): "Explain this problem" and "Ask
 * about this element" put one of these before the user's message, so the user sees exactly
 * what is sent. The chip above a block is labelled by the view mode (ADR 0125 D11): in Very
 * easy and Easy by the thing's name and the plain problem of Things to fix, with no id or code;
 * in Advanced by the code and id as before. The block itself is the same in every mode.
 *
 * @packageDocumentation
 */

import { READ_ELEMENT_MAX_BYTES } from '@msm/ai';
import type { Element, Problem, Project } from '@msm/core';
import { explainChip, type UiMode } from '../components/ai/ai-words';
import { displayNameOf, plainProblem, problemThingName } from '../session/plain-problems';

/** Element data as pretty JSON, cut at the `read_element` limit with a note. */
function dataBlock(element: Element): string {
  const json = JSON.stringify(element.data, null, 2);
  const bytes = new TextEncoder().encode(json);
  if (bytes.length <= READ_ELEMENT_MAX_BYTES) return `\`\`\`json\n${json}\n\`\`\``;
  const cut = new TextDecoder().decode(bytes.slice(0, READ_ELEMENT_MAX_BYTES)).replace(/�+$/, '');
  return `\`\`\`json\n${cut}\n\`\`\`\n(The data is ${bytes.length} bytes; only the first ${READ_ELEMENT_MAX_BYTES} are shown. Use read_element for the element.)`;
}

/**
 * The context block of a problem: "The user asked about this problem: `<code>` on `<id>` at
 * `<path>`: <message>." followed by the element's kind and data when the problem belongs to
 * an element.
 */
export function problemContextBlock(problem: Problem, element?: Element | null): string {
  let head = `The user asked about this problem: \`${problem.code}\``;
  if (problem.elementId !== undefined) head += ` on \`${problem.elementId}\``;
  if (problem.path !== undefined && problem.path !== '') head += ` at \`${problem.path}\``;
  if (problem.file !== undefined) head += ` in the file \`${problem.file}\``;
  head += ` (${problem.severity}): ${problem.message}`;
  if (!/[.!?]$/.test(head)) head += '.';
  if (element === undefined || element === null) return head;
  return `${head} The element (\`${element.kind}\`):\n${dataBlock(element)}`;
}

/** The context block of an element: its id, kind and data. */
export function elementContextBlock(element: Element): string {
  return `The user asked about this element: \`${element.id}\` (\`${element.kind}\`):\n${dataBlock(element)}`;
}

/**
 * The chip of a problem's block: "About: Ruby Sword, a rule in Ruby Sword has more than 50
 * steps" in Very easy and Easy (the plain words of Things to fix), "Problem <code> on <id>" in
 * Advanced. A sentence that starts with the thing's name says "it" instead, so the name is not
 * written twice or with a small first letter.
 */
export function problemChipLabel(problem: Problem, project: Project | null, mode: UiMode): string {
  const thing = problemThingName(project, problem);
  let plain = plainProblem(problem, thing).text;
  if (plain.startsWith(thing)) plain = plainProblem(problem, 'it').text;
  const named = thing.charAt(0).toUpperCase() + thing.slice(1);
  return explainChip(problem, named, plain, mode);
}

/** The chip of an element's block: "About: Ruby Sword", or "Element <id> (<kind>)" in Advanced. */
export function elementChipLabel(element: Element, mode: UiMode): string {
  return mode === 'advanced'
    ? `Element ${element.id} (${element.kind})`
    : `About: ${displayNameOf(element)}`;
}
