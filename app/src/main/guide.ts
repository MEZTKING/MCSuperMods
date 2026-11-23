/**
 * The user guide inside the app (ADR 0124 D14, B656): main serves the guide's Markdown pages and
 * an index of their headings and first sentences. The pages are packaged beside the app as
 * `resources/guide/` (electron-builder `extraResources`, never in `app.asar` or the renderer);
 * from source they are read from the repository's `docs/guide/`.
 *
 * Only pages in the folder's own list are served: a page name is checked against the `.md` files
 * the folder held when it was first listed, and the page's real path must lie inside the real
 * guide folder (a symbolic link out of it is refused). The index is built on the first call and
 * kept for the run.
 *
 * The text is served raw: the renderer's search folds and tokenises it (B660) and its reader
 * renders it (B661).
 *
 * @packageDocumentation
 */

import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import type { GuideIndex, GuidePage, GuideSection } from '../shared/platform';

/** A guide page name: a file name in the guide folder without `.md` (`vehicles`, `README`). */
export const GUIDE_PAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
/** The largest page served; the largest page today is about 140 kB. */
export const GUIDE_PAGE_MAX_BYTES = 1024 * 1024;
/** The most pages the folder may hold (38 today). */
export const GUIDE_PAGES_MAX = 200;
/** The most sections the index may carry (about 510 today with the page titles). */
export const GUIDE_SECTIONS_MAX = 5000;
/** The longest heading kept in the index. */
export const GUIDE_HEADING_MAX = 200;
/** The longest first sentence kept in the index (cut at a word). */
export const GUIDE_SENTENCE_MAX = 300;

/** Where the guide lives for this run. */
export interface GuideLocation {
  isPackaged: boolean;
  /** `process.resourcesPath`: the packaged guide is `<resourcesPath>/guide`. */
  resourcesPath: string;
  /** The repository's `docs/guide/`, read when not packaged. */
  devGuideDir: string;
}

/** The guide folder for {@link GuideLocation}. */
export function guideDirFor(location: GuideLocation): string {
  return location.isPackaged ? join(location.resourcesPath, 'guide') : location.devGuideDir;
}

/** The guide service the IPC layer serves `guide:*` from. */
export interface GuideService {
  /** Every page's headings (levels 1 to 4) with anchors and first sentences, built once. */
  index(): Promise<GuideIndex>;
  /**
   * One page's Markdown.
   *
   * @throws Error When the name is not a page of the guide folder, the page lies outside the
   * folder or is larger than {@link GUIDE_PAGE_MAX_BYTES}.
   */
  page(page: string): Promise<GuidePage>;
}

/** What the guide service needs. */
export interface GuideServiceDeps {
  /** The guide folder (see {@link guideDirFor}). */
  dir: string;
  /** Resolves symbolic links in an existing absolute path. Defaults to `fs.realpath`. */
  realpath?(path: string): Promise<string>;
}

/**
 * The anchor of a heading as the docs site and the guide's own links write it (VitePress's
 * slug): marks stripped, punctuation and spaces to one `-`, trimmed, lower case, a leading
 * digit prefixed with `_`.
 */
export function guideAnchor(heading: string): string {
  return (
    heading
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are dropped.
      .replace(/[\u0000-\u001f]/g, '')
      .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'\u201c\u201d\u2018\u2019<>,.?/]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/^(\d)/, '_$1')
      .toLowerCase()
  );
}

/**
 * The anchor GitHub gives a heading (some of the guide's links are written this way): lower
 * case, everything but letters, digits, spaces, `-` and `_` dropped, each space a `-`.
 */
export function githubAnchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** Markdown inline marks taken out of a heading or sentence: links to their text, code, bold. */
export function plainInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1$2')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The first sentence of `text`, cut at a word when longer than {@link GUIDE_SENTENCE_MAX}. */
export function firstSentence(text: string): string {
  const match = /^.*?[.!?](?=\s+[A-Z(\u201c"'`*[]|\s*$)/.exec(text);
  const sentence = (match?.[0] ?? text).trim();
  if (sentence.length <= GUIDE_SENTENCE_MAX) return sentence;
  const cut = sentence.slice(0, GUIDE_SENTENCE_MAX);
  const space = cut.lastIndexOf(' ');
  return (space > GUIDE_SENTENCE_MAX / 2 ? cut.slice(0, space) : cut).trim();
}

const HEADING = /^(#{1,4})\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s*(```|~~~)/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;

/**
 * The sections of one page: each `#` to `####` heading outside code fences with its anchor
 * (numbered `-1`, `-2` when repeated on the page, as the docs site does), its GitHub anchor when
 * that differs, and the first
 * sentence of the first paragraph or list item under it (tables, code and quotes skipped).
 */
export function guideSections(page: string, markdown: string): GuideSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: GuideSection[] = [];
  const seen = new Map<string, number>();
  const seenGithub = new Map<string, number>();
  let current: GuideSection | null = null;
  let paragraph: string[] = [];
  let inFence = false;

  const settle = (): void => {
    if (current !== null && current.sentence === '' && paragraph.length > 0) {
      current.sentence = firstSentence(plainInline(paragraph.join(' ')));
    }
    paragraph = [];
  };

  for (const line of lines) {
    if (FENCE.test(line)) {
      settle();
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = HEADING.exec(line);
    if (heading !== null) {
      settle();
      const level = (heading[1] ?? '#').length as 1 | 2 | 3 | 4;
      const text = plainInline(heading[2] ?? '').slice(0, GUIDE_HEADING_MAX);
      if (text === '') continue;
      const base = guideAnchor(text);
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      const anchor = count === 0 ? base : `${base}-${count}`;
      const github = githubAnchor(text);
      const githubCount = seenGithub.get(github) ?? 0;
      seenGithub.set(github, githubCount + 1);
      const alias = githubCount === 0 ? github : `${github}-${githubCount}`;
      current = {
        page,
        level,
        heading: text,
        anchor,
        ...(alias === anchor || alias === '' ? {} : { alias }),
        sentence: '',
      };
      sections.push(current);
      continue;
    }
    if (current === null || current.sentence !== '') continue;
    const trimmed = line.trim();
    if (trimmed === '') {
      settle();
      continue;
    }
    if (trimmed.startsWith('|') || trimmed.startsWith('>') || /^#{5,}\s/.test(trimmed)) {
      settle();
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item !== null) {
      // A list under a heading: its first item stands for the sentence.
      if (paragraph.length > 0) settle();
      if (current.sentence !== '') continue;
      paragraph = [item[1] ?? ''];
      settle();
      continue;
    }
    paragraph.push(trimmed);
  }
  settle();
  return sections;
}

/** Whether `child` lies inside `parent` (both real, absolute paths). */
function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/** Creates the guide service over one folder. */
export function createGuideService(deps: GuideServiceDeps): GuideService {
  const resolveReal = deps.realpath ?? ((path: string) => realpath(path));
  let pagesPromise: Promise<readonly string[]> | null = null;
  let indexPromise: Promise<GuideIndex> | null = null;

  /** The page names of the folder, listed once (sorted, `README` included). */
  const pages = (): Promise<readonly string[]> => {
    pagesPromise ??= (async () => {
      const entries = await readdir(deps.dir, { withFileTypes: true });
      const names = entries
        // Links are listed too, so that the real-path check below is what refuses one out.
        .filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith('.md'))
        .map((entry) => entry.name.slice(0, -3))
        .filter((name) => GUIDE_PAGE_NAME.test(name))
        .sort();
      if (names.length > GUIDE_PAGES_MAX) {
        throw new Error(`The guide folder holds more than ${GUIDE_PAGES_MAX} pages.`);
      }
      return names;
    })().catch((error: unknown) => {
      pagesPromise = null;
      throw error;
    });
    return pagesPromise;
  };

  const readPage = async (page: string): Promise<string> => {
    if (!GUIDE_PAGE_NAME.test(page) || !(await pages()).includes(page)) {
      throw new Error(`${JSON.stringify(page)} is not a page of the guide.`);
    }
    const [realDir, realFile] = await Promise.all([
      resolveReal(deps.dir),
      resolveReal(join(deps.dir, `${page}.md`)),
    ]);
    if (!isInside(realDir, realFile)) {
      throw new Error(`The guide page ${JSON.stringify(page)} is outside the guide folder.`);
    }
    const info = await stat(realFile);
    if (!info.isFile()) throw new Error(`The guide page ${JSON.stringify(page)} is not a file.`);
    if (info.size > GUIDE_PAGE_MAX_BYTES) {
      throw new Error(`The guide page ${JSON.stringify(page)} is too large.`);
    }
    return readFile(realFile, 'utf8');
  };

  return {
    index() {
      indexPromise ??= (async () => {
        const names = await pages();
        const index: GuideIndex = { pages: [], sections: [] };
        for (const page of names) {
          const sections = guideSections(page, await readPage(page));
          const title = sections.find((section) => section.level === 1)?.heading ?? page;
          index.pages.push({ page, title });
          index.sections.push(...sections);
          if (index.sections.length > GUIDE_SECTIONS_MAX) {
            throw new Error(`The guide has more than ${GUIDE_SECTIONS_MAX} sections.`);
          }
        }
        return index;
      })().catch((error: unknown) => {
        indexPromise = null;
        throw error;
      });
      return indexPromise;
    },

    async page(page) {
      return { page, markdown: await readPage(page) };
    },
  };
}
