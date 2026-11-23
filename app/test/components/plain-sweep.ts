/// <reference types="node" />
/**
 * The plain-words sweep (ADR 0130 D2, plan B703): every readable string of a rendered surface
 * (text, an input's value, placeholder, title, aria-label, alt) run through `forbiddenIn`, and a
 * library example or flow on disk as a project. Shared by `studios/plain-no-ids.test.tsx`,
 * `lists-plain.test.tsx` and the Studio split briefs.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Element, Project } from '@msm/core';
import { expect } from 'vitest';
import { forbiddenIn } from '../../src/renderer/src/components/ai/ai-words';

const ROOT = join(__dirname, '..', '..', '..');

/** The generated mirror of the library's starters and examples. */
export const EXAMPLES = join(ROOT, 'examples');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** A library example or flow on disk (`examples/<folder>`) as a project. */
export function exampleProject(folder: string): Project {
  const base = join(EXAMPLES, folder);
  const byNamespace = new Map<string, Project['namespaces'][number]>();
  const namespace = (name: string) => {
    let entry = byNamespace.get(name);
    if (entry === undefined) {
      entry = { name, elements: [], assets: [] };
      byNamespace.set(name, entry);
    }
    return entry;
  };
  for (const path of walk(join(base, 'content'))) {
    if (!path.endsWith('.json')) continue;
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Element;
    const name = relative(join(base, 'content'), path).split(sep)[0] as string;
    namespace(name).elements.push(parsed);
  }
  try {
    for (const path of walk(join(base, 'assets'))) {
      const [name, ...rest] = relative(join(base, 'assets'), path).split(sep);
      namespace(name as string).assets.push({
        path: rest.join('/'),
        mediaType: path.endsWith('.png') ? 'image/png' : 'application/octet-stream',
      });
    }
  } catch {
    // An example without assets.
  }
  return {
    formatVersion: 1,
    name: folder,
    targets: [],
    plugins: [],
    settings: {},
    namespaces: [...byNamespace.values()],
  };
}

/** One readable string and where it is (the nearest test id, for the failure message). */
export interface Readable {
  text: string;
  at: string;
}

const placeOf = (node: globalThis.Element | null): string =>
  node?.closest('[data-testid]')?.getAttribute('data-testid') ?? '?';

/** Every readable string under `root`: text nodes, input values and the readable attributes. */
export function readableStrings(root: HTMLElement): Readable[] {
  const out: Readable[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node.parentElement?.closest('style, script') != null) continue;
    // A text node inside an <option> of a closed select still reads when it opens.
    const text = node.textContent?.trim() ?? '';
    if (text !== '') out.push({ text, at: placeOf(node.parentElement) });
  }
  for (const element of root.querySelectorAll('*')) {
    for (const attribute of ['placeholder', 'title', 'aria-label', 'alt']) {
      const value = element.getAttribute(attribute);
      if (value !== null && value.trim() !== '') out.push({ text: value, at: placeOf(element) });
    }
    const typed =
      (element instanceof HTMLInputElement && ['text', 'search'].includes(element.type)) ||
      element instanceof HTMLTextAreaElement;
    if (typed && element.value.trim() !== '') {
      out.push({ text: element.value, at: placeOf(element) });
    }
  }
  return out;
}

/** A clock time or a ratio (`1:30`, `8:00`): not an id, though `ID_PATTERN` matches it. */
const DIGITS_ONLY = /^\d+:\d+$/;

/** The leaks of `root`: each string with what it holds that the plain view forbids. */
export function leaksIn(root: HTMLElement): string[] {
  return readableStrings(root)
    .map((entry) => ({
      ...entry,
      found: forbiddenIn(entry.text).filter((hit) => !DIGITS_ONLY.test(hit)),
    }))
    .filter((entry) => entry.found.length > 0)
    .map((entry) => `[${entry.at}] ${entry.found.join(', ')} in "${entry.text.slice(0, 160)}"`);
}

/** Every readable string under `root` is in plain words: no forbidden word, no id. */
export function expectPlain(root: HTMLElement): void {
  expect(leaksIn(root)).toEqual([]);
}
