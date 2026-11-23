/**
 * The guide reader (ADR 0124 D14, B661): one page of the user guide, read inside the app from
 * `guide:page`, opened at a heading, with a contents list, **Back** and **Open on the web**.
 * Links between guide pages and to headings move inside the reader; `https:` links open in the
 * browser. A lazy chunk: callers import it with `lazy(() => import('./GuideDialog'))`.
 *
 * Headings get the docs site's anchors. The slug functions mirror `guideAnchor`,
 * `githubAnchor` and `plainInline` in `app/src/main/guide.ts` (the guide index's `anchor` and
 * `alias`), so a link written either way finds its heading without asking for the index; a test
 * checks the two agree over the whole guide.
 *
 * @packageDocumentation
 */

import { Dialog } from 'radix-ui';
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GuidePlatform } from '../../../shared/platform';
import { Markdown, type MarkdownBlock, parseMarkdown } from './Markdown';
import { Button, buttonClass } from './ui/Button';

/** The published docs site (`docs/site/.vitepress/config.ts`, `base: '/MCSuperMods/'`). */
export const GUIDE_SITE_URL = 'https://meztking.github.io/MCSuperMods/';

/** The guide's index page (`README.md`, the site's home page). */
export const GUIDE_HOME = 'README';

/** The heading text cut, as main's index cuts it (`GUIDE_HEADING_MAX`). */
const HEADING_MAX = 200;

/** Mirrors `guideAnchor` in `app/src/main/guide.ts` (the docs site's anchor of a heading). */
export function guideAnchor(heading: string): string {
  return (
    heading
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are dropped.
      .replace(/[\u0000-\u001f]/g, '')
      .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/^(\d)/, '_$1')
      .toLowerCase()
  );
}

/** Mirrors `githubAnchor` in `app/src/main/guide.ts` (GitHub's anchor of a heading). */
export function githubAnchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

/** Mirrors `plainInline` in `app/src/main/guide.ts`: a heading without its Markdown marks. */
export function plainHeading(text: string): string {
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

/** One heading's anchors: `anchor` as the docs site writes it, `alias` as GitHub does. */
export interface HeadingAnchor {
  text: string;
  anchor: string;
  alias: string;
}

/**
 * The anchors of a page's headings in document order (numbered `-1`, `-2` when repeated, as
 * main's index numbers them); `undefined` for a heading with no text.
 */
export function headingAnchors(headings: readonly string[]): (HeadingAnchor | undefined)[] {
  const seen = new Map<string, number>();
  const seenGithub = new Map<string, number>();
  return headings.map((raw) => {
    const text = plainHeading(raw).slice(0, HEADING_MAX);
    if (text === '') return undefined;
    const base = guideAnchor(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const github = githubAnchor(text);
    const githubCount = seenGithub.get(github) ?? 0;
    seenGithub.set(github, githubCount + 1);
    return {
      text,
      anchor: count === 0 ? base : `${base}-${count}`,
      alias: githubCount === 0 ? github : `${github}-${githubCount}`,
    };
  });
}

/** The element id of a heading: anchors are prefixed so they cannot meet the app's own ids. */
export const headingElementId = (anchor: string): string => `guide-${anchor}`;

/** A place in the guide: a page, and a heading's anchor on it (none: the top). */
export interface GuidePlace {
  page: string;
  anchor?: string | undefined;
}

/**
 * Where a relative link of `from` goes (`name.md#x`, `./name.md`, `#x`, `/`), or `null` for a
 * link that is not to a guide page (another folder, a file of another type).
 */
export function guideLinkTarget(href: string, from: string): GuidePlace | null {
  const hash = href.indexOf('#');
  const path = (hash < 0 ? href : href.slice(0, hash)).replace(/^\.\//, '');
  let fragment: string | undefined;
  if (hash >= 0) {
    try {
      fragment = decodeURIComponent(href.slice(hash + 1));
    } catch {
      fragment = href.slice(hash + 1);
    }
  }
  const anchor = fragment === '' ? undefined : fragment;
  if (path === '') return { page: from, anchor };
  if (path === '/' || path === 'README.md' || path === 'index.md') {
    return { page: GUIDE_HOME, anchor };
  }
  const page = /^([A-Za-z0-9][A-Za-z0-9_-]{0,63})\.md$/.exec(path)?.[1];
  return page === undefined ? null : { page, anchor };
}

/** The docs site's address of a place in the guide. */
export function guideWebUrl(place: GuidePlace): string {
  const path = place.page === GUIDE_HOME ? '' : encodeURIComponent(place.page);
  const anchor = place.anchor === undefined ? '' : `#${encodeURIComponent(place.anchor)}`;
  return `${GUIDE_SITE_URL}${path}${anchor}`;
}

function collectHeadings(
  blocks: readonly MarkdownBlock[],
  out: { level: number; text: string }[],
): { level: number; text: string }[] {
  for (const block of blocks) {
    if (block.type === 'heading') out.push({ level: block.level, text: block.text });
    else if (block.type === 'quote') collectHeadings(block.blocks, out);
    else if (block.type === 'list') {
      for (const nested of block.children ?? []) collectHeadings(nested, out);
    }
  }
  return out;
}

/** A page's headings with their anchors, in document order. */
export function pageHeadings(
  markdown: string,
): { level: number; text: string; anchor: string; alias: string }[] {
  const headings = collectHeadings(parseMarkdown(markdown), []);
  const anchors = headingAnchors(headings.map((heading) => heading.text));
  return headings.flatMap((heading, index) => {
    const found = anchors[index];
    return found === undefined ? [] : [{ level: heading.level, ...found }];
  });
}

/** Props of {@link GuideDialog}. */
export interface GuideDialogProps {
  /** `platform.guide` (ADR 0124 D14). */
  guide: GuidePlatform;
  /** The page to open (the file name without `.md`); the guide's index page when left out. */
  page?: string | undefined;
  /** The heading to open at: its anchor as the docs site or GitHub writes it. */
  anchor?: string | undefined;
  onClose(): void;
}

type Content =
  | { state: 'loading'; page: string }
  | { state: 'ready'; page: string; markdown: string }
  | { state: 'missing'; page: string };

interface Visit extends GuidePlace {
  /** Moves the view again when the same place is visited twice. */
  visit: number;
  /** Where the page was scrolled to, restored by Back. */
  scrollTop?: number;
}

/** The guide reader. */
export function GuideDialog({ guide, page, anchor, onClose }: GuideDialogProps) {
  const [place, setPlace] = useState<Visit>(() => ({
    page: page ?? GUIDE_HOME,
    anchor,
    visit: 0,
  }));
  const [history, setHistory] = useState<Visit[]>([]);
  const [content, setContent] = useState<Content>({ state: 'loading', page: place.page });
  const cache = useRef(new Map<string, string>());
  const bodyRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const visits = useRef(0);

  useEffect(() => {
    const known = cache.current.get(place.page);
    if (known !== undefined) {
      setContent({ state: 'ready', page: place.page, markdown: known });
      return;
    }
    let live = true;
    setContent({ state: 'loading', page: place.page });
    guide.page(place.page).then(
      (answer) => {
        if (!live) return;
        cache.current.set(place.page, answer.markdown);
        setContent({ state: 'ready', page: place.page, markdown: answer.markdown });
      },
      () => {
        if (live) setContent({ state: 'missing', page: place.page });
      },
    );
    return () => {
      live = false;
    };
  }, [guide, place.page]);

  const markdown = content.state === 'ready' ? content.markdown : '';
  const headings = useMemo(() => pageHeadings(markdown), [markdown]);
  const title = headings.find((heading) => heading.level === 1)?.text ?? place.page;
  const contents = headings.filter((heading) => heading.level === 2 || heading.level === 3);

  /** The docs site's anchor for a link's fragment (an alias finds its heading's anchor). */
  const resolveAnchor = useCallback(
    (fragment: string | undefined): string | undefined => {
      if (fragment === undefined) return undefined;
      const found =
        headings.find((heading) => heading.anchor === fragment) ??
        headings.find((heading) => heading.alias === fragment);
      return found?.anchor ?? fragment;
    },
    [headings],
  );

  // Moves the view to the place once its page is shown: the heading (focused) or the top.
  useEffect(() => {
    if (content.state !== 'ready' || content.page !== place.page) return;
    const body = bodyRef.current;
    if (body === null) return;
    const wanted = resolveAnchor(place.anchor);
    const target =
      wanted === undefined
        ? undefined
        : Array.from(body.querySelectorAll<HTMLElement>('[id]')).find(
            (element) => element.id === headingElementId(wanted),
          );
    if (place.scrollTop !== undefined) {
      // Back: where the page was, focus on the heading it was opened at (or the page).
      body.scrollTop = place.scrollTop;
      (target ?? articleRef.current)?.focus({ preventScroll: true });
    } else if (target !== undefined) {
      target.scrollIntoView?.({ block: 'start' });
      target.focus({ preventScroll: true });
    } else {
      body.scrollTop = 0;
      if (place.visit > 0) articleRef.current?.focus({ preventScroll: true });
    }
  }, [content, place, resolveAnchor]);

  const go = useCallback(
    (next: GuidePlace): void => {
      const scrollTop = bodyRef.current?.scrollTop ?? 0;
      setHistory((past) => [...past, { ...place, scrollTop }]);
      visits.current += 1;
      setPlace({ page: next.page, anchor: next.anchor, visit: visits.current });
    },
    [place],
  );

  const back = useCallback((): void => {
    const previous = history[history.length - 1];
    if (previous === undefined) return;
    setHistory((past) => past.slice(0, -1));
    visits.current += 1;
    setPlace({ ...previous, visit: visits.current });
  }, [history]);

  const linkHandler = useCallback(
    (href: string): (() => void) | null => {
      const target = guideLinkTarget(href, place.page);
      if (target === null) return null;
      return () => go(target);
    },
    [go, place.page],
  );

  const headingIds = useCallback(
    (texts: readonly string[]) =>
      headingAnchors(texts).map((found) =>
        found === undefined ? undefined : headingElementId(found.anchor),
      ),
    [],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.altKey && event.key === 'ArrowLeft' && history.length > 0) {
      event.preventDefault();
      back();
    }
  };

  const webPlace: GuidePlace = { page: place.page, anchor: resolveAnchor(place.anchor) };
  const previous = history[history.length - 1];

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="guide-dialog"
          onKeyDown={onKeyDown}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[min(96vw,960px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-hidden rounded-md border border-border bg-panel p-4 text-text shadow-lg"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Dialog.Title className="min-w-0 flex-1 text-base font-semibold break-words">
              User guide: {title}
            </Dialog.Title>
            <Button
              data-testid="guide-back"
              disabled={previous === undefined}
              onClick={back}
              aria-keyshortcuts="Alt+ArrowLeft"
              title="Back (Alt+Left)"
            >
              Back
            </Button>
            <a
              href={guideWebUrl(webPlace)}
              target="_blank"
              rel="noreferrer noopener"
              className={buttonClass}
              data-testid="guide-web"
            >
              Open on the web
            </a>
            <Dialog.Close asChild>
              <Button data-testid="guide-close">Close</Button>
            </Dialog.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
            {contents.length > 0 && (
              <nav
                aria-label="Contents"
                data-testid="guide-contents"
                className="max-h-32 shrink-0 overflow-y-auto rounded border border-border p-2 text-sm md:max-h-none md:w-56"
              >
                <ul className="flex flex-col gap-1">
                  {contents.map((heading) => (
                    <li key={heading.anchor} className={heading.level === 3 ? 'pl-3' : undefined}>
                      <a
                        href={`#${heading.anchor}`}
                        className="text-accent underline-offset-2 hover:underline focus-visible:underline"
                        aria-current={
                          resolveAnchor(place.anchor) === heading.anchor ? 'location' : undefined
                        }
                        onClick={(event) => {
                          event.preventDefault();
                          go({ page: place.page, anchor: heading.anchor });
                        }}
                      >
                        {heading.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <div
              ref={bodyRef}
              className="min-h-0 min-w-0 flex-1 overflow-y-auto pr-1"
              data-testid="guide-body"
            >
              {content.state === 'loading' && <p className="text-sm text-muted">Loading…</p>}
              {content.state === 'missing' && (
                <p className="text-sm" data-testid="guide-missing">
                  The page "{content.page}" is not in this copy of the guide.
                </p>
              )}
              {content.state === 'ready' && (
                <article
                  ref={articleRef}
                  tabIndex={-1}
                  aria-label={title}
                  className="break-words outline-none"
                >
                  <Markdown
                    source={content.markdown}
                    linkHandler={linkHandler}
                    headingIds={headingIds}
                    headingBase={3}
                  />
                </article>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default GuideDialog;
