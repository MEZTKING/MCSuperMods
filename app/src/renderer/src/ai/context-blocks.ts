/**
 * Visible context blocks for the AI helper (ADR 0041 D8): "Explain this problem" and "Ask
 * about this element" put one of these before the user's message, so the user sees exactly
 * what is sent. The chip above a block is labelled in plain words (ADR 0125 D11, ADR 0130 D5):
 * the thing's name and the plain problem of Things to fix, with no id or code. The block itself
 * holds the ids and is shown only when asked for.
 *
 * @packageDocumentation
 */

import { READ_ELEMENT_MAX_BYTES } from '@msm/ai';
import type { Element, Problem, Project } from '@msm/core';
import { explainChip } from '../components/ai/ai-words';
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
 * steps" (the plain words of Things to fix). A sentence that starts with the thing's name says "it" instead, so the name is not
 * written twice or with a small first letter.
 */
export function problemChipLabel(problem: Problem, project: Project | null): string {
  const thing = problemThingName(project, problem);
  let plain = plainProblem(problem, thing).text;
  if (plain.startsWith(thing)) plain = plainProblem(problem, 'it').text;
  const named = thing.charAt(0).toUpperCase() + thing.slice(1);
  return explainChip(named, plain);
}

/** The chip of an element's block: "About: Ruby Sword". */
export function elementChipLabel(element: Element): string {
  return `About: ${displayNameOf(element)}`;
}
